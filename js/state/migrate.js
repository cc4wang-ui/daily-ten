/* Daily Ten — state 遷移與載入修補（擁有者：data-guardian）
   純函式；import 時不碰 window / localStorage / document，可在 Node 單元測試。
   對外：
     migrate(raw, {now = new Date()} = {})
       → {state, repaired, issues:[{path, action}], fromVersion, alreadyMigrated}
       先 deep clone，絕不改動傳入物件。只有 raw 不是 plain object 時丟 MigrationError。
       action：coerced（可無損轉換，例 "120"→120）／reset（無效 → 預設值）／derived（由 sessions 推導）／
               clamped（level 夾回 1–5）／dropped（陣列內形狀錯的項目丟掉）／truncated（過長截斷）／
               downgraded（version 大於 3）。任何一筆 issue 都讓 repaired = true。
       「缺少」的欄位補預設值不算修補（v1／v2 本來就沒有 v3 欄位）；xp、streak 缺少時由 sessions 推導。
       B1：habits.sleep.log 的項目缺 date／lightsOut／wake 或格式錯（例如時間沒有時區）→ dropped；
           phase.current 不是 P1–P3、phase.startedAt 不是含時區的時間 → reset（規格見 schema.js）。
       冪等：同一個 now 下 migrate(migrate(x).state) 與 migrate(x).state 完全相同，第二次 repaired = false。
     mirrorLegacyToGame(state) → 同一個 state（就地更新 game；M1 專用語意，M2a 會改）
     fillPhaseStartedAt(state, now) → boolean：phase.startedAt 沒有（null 或不是含時區的時間）才寫入 isoLocal(now)，
       已有值不覆寫；就地更新、冪等。由 store.loadState（載入後）與 habits.ensurePhaseStarted 呼叫——
       刻意不放進 migrate()，遷移結果與匯入預覽才不會隨時間改變。
     streakFromSessions(sessions) → {current, best, lastDate}（只看出席日期，不依賴「今天」）
     MigrationError

   D12：只要 game 物件存在（version 是 3，或被舊版 App 改回 2）就視為已遷移——
   只補缺欄位、保留 game 既有的 sleep／explore 等數值，絕不把 legacy xp 加總進 game；
   最後一律用 mirrorLegacyToGame「複製」legacy 欄位，所以不會重複計 XP。
   V2a 的 game.seen／game.deload（schema.js）一樣只修補、不重建：舊版 App（ec87e03）的 migrate／saveState
   原樣保留整個物件、只改 version，所以來回之後兩個欄位都還在，也不會被重設（不補發升級卡與慶祝）。

   V2a 契約第 15 條「D12 反向雙寫」（把 engine 推導的 XP／連續天數寫回 legacy xp／streak）：不需要，理由——
   1. 新版 App 的 XP、等級、連續天數每次都由紀錄（sessions＋habits.sleep.log）重算（game.json d6），不讀 legacy
      xp／streak，也不讀 game.xp／game.streaks。舊版 App 改寫 legacy 欄位不會影響新版畫面；舊版補記的訓練寫在
      sessions，新版下次推導就自動算進去——真正需要「雙寫」的是紀錄本身，而兩版本來就寫同一個 sessions。
   2. legacy xp 是舊表（full 10、boss 20…）的累加值，新版 recordSession 仍照舊表更新它，舊版 App 打開時看到的數字
      和它自己的計分一致。若把新表的推導值寫回去，舊版會在新表的總數上再加舊表的分數，兩種尺度混在一起，
      legacy xp 對兩個版本都失去意義。
   3. 推導值寫回 state 等於多一個會過期的真實來源（復原打卡、匯入、規則調整後就對不上），而且要在載入時寫入，
      違反「開 App 不寫入」。game.xp／game.streaks 照舊由 mirrorLegacyToGame 複製 legacy（M1 語意、沒有人讀），
      維持不變，避免改動所有人的存檔內容。 */
import {
  SCHEMA_VERSION, STATE_SPEC, LIMITS, TIME_RE,
  defaultState, defaultGame, isPlainObject, deepClone, numInRange, isTooLong, truncateText
} from './schema.js';
import { isoLocal, isValidDateStr, isIsoWithOffset, dayNumber, dayNumberToStr } from './time.js';

export class MigrationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MigrationError';
  }
}

/* ---------- 由出席回推 streak（決定性：只看 sessions 的日期） ---------- */
export function streakFromSessions(sessions) {
  const days = [];
  if (Array.isArray(sessions)) {
    for (const s of sessions) if (s && isValidDateStr(s.date)) days.push(dayNumber(s.date));
  }
  if (!days.length) return { current: 0, best: 0, lastDate: null };
  days.sort((a, b) => a - b);
  let run = 1;
  let best = 1;
  for (let i = 1; i < days.length; i++) {
    const gap = days[i] - days[i - 1];
    if (gap === 0) continue; // 同一天多筆只算一天
    run = gap === 1 ? run + 1 : 1;
    if (run > best) best = run;
  }
  return { current: run, best, lastDate: dayNumberToStr(days[days.length - 1]) };
}

function xpFromSessions(sessions) {
  let sum = 0;
  if (Array.isArray(sessions)) {
    for (const s of sessions) {
      if (s && typeof s.xp === 'number' && Number.isFinite(s.xp) && s.xp >= 0) sum += s.xp;
    }
  }
  return Math.min(sum, LIMITS.xp);
}

const nonNegative = (v, max) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(v, max) : 0);
const nonNegativeInt = (v, max) => (Number.isInteger(v) && v >= 0 ? Math.min(v, max) : 0);

/* M1：legacy 欄位（xp、streak）是真實來源（既有畫面仍顯示它們），這裡把它「複製」到 game（不是累加）。
   M2a 會改成以 game 為來源。冪等；在 saveState 與備份前呼叫。 */
export function mirrorLegacyToGame(state) {
  if (!isPlainObject(state)) return state;
  if (!isPlainObject(state.game)) state.game = defaultGame();
  const g = state.game;
  if (!isPlainObject(g.xp)) g.xp = defaultGame().xp;
  const move = nonNegative(state.xp, LIMITS.xp);
  const sleep = nonNegative(g.xp.sleep, LIMITS.xp);
  const explore = nonNegative(g.xp.explore, LIMITS.xp);
  g.xp.move = move;
  g.xp.sleep = sleep;
  g.xp.explore = explore;
  g.xp.total = move + sleep + explore;
  if (!isPlainObject(g.streaks)) g.streaks = defaultGame().streaks;
  const st = isPlainObject(state.streak) ? state.streak : {};
  g.streaks.train = {
    current: nonNegativeInt(st.current, LIMITS.streak),
    best: nonNegativeInt(st.best, LIMITS.streak),
    lastDate: isValidDateStr(st.lastDate) ? st.lastDate : null
  };
  g.streaks.life = streakFromSessions(state.sessions);
  return state;
}

export function fillPhaseStartedAt(state, now = new Date()) {
  if (!isPlainObject(state) || !isPlainObject(state.phase)) return false;
  if (isIsoWithOffset(state.phase.startedAt)) return false;
  state.phase.startedAt = isoLocal(now);
  return true;
}

/* ---------- 寬鬆修補（規格見 schema.js 的 STATE_SPEC，與匯入驗證共用） ---------- */
const BAD = Symbol('bad');
const NUM_TEXT = /^\s*-?\d+(?:\.\d+)?\s*$/;

function issueLog() {
  const issues = [];
  return { issues, add(path, action) { issues.push({ path, action }); } };
}

function defaultFor(spec, def) {
  if (def !== undefined) return deepClone(def);
  if ('def' in spec) return deepClone(spec.def);
  if (spec.k === 'arr') return [];
  if (spec.k === 'map') return {};
  if (spec.k === 'obj') {
    const o = {};
    for (const key of Object.keys(spec.fields)) if (!spec.fields[key].key) o[key] = defaultFor(spec.fields[key], undefined);
    return o;
  }
  return null;
}

function repairNum(spec, v, path, log) {
  let n = v;
  let coerced = false;
  if (typeof n === 'string' && NUM_TEXT.test(n)) { n = Number(n); coerced = true; }
  if (typeof n !== 'number' || !Number.isFinite(n)) return BAD;
  if (!numInRange(spec, n)) {
    if (spec.clamp && Number.isInteger(n)) {
      log.add(path, 'clamped');
      return Math.min(spec.max, Math.max(spec.min, n));
    }
    return BAD;
  }
  if (coerced) log.add(path, 'coerced');
  return n;
}

function repairText(spec, v, path, log) {
  if (typeof v !== 'string') return BAD;
  if (spec.minLen && v.length < spec.minLen) return BAD;
  if (spec.oneOf && !spec.oneOf.includes(v)) return BAD;
  if (isTooLong(spec, v)) {
    if (!spec.truncate) return BAD;
    log.add(path, 'truncated');
    return truncateText(v, spec.maxLen);
  }
  return v;
}

function repairBool(v, path, log) {
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === 1) { log.add(path, 'coerced'); return true; }
  if (v === 'false' || v === 0) { log.add(path, 'coerced'); return false; }
  return BAD;
}

function repairTime(v, path, log) {
  if (typeof v !== 'string') return BAD;
  if (TIME_RE.test(v)) return v;
  if (/^\d:[0-5]\d$/.test(v)) { log.add(path, 'coerced'); return `0${v}`; }
  return BAD;
}

/* 物件就地修補；陣列項目缺少或無效的識別欄位（key）→ 回傳 BAD，整筆由 repairList 丟掉 */
function repairObj(spec, o, def, path, log) {
  for (const key of Object.keys(spec.fields)) {
    const fs = spec.fields[key];
    if (fs.mirror) continue; // 由 mirrorLegacyToGame 覆寫
    const p = path ? `${path}.${key}` : key;
    const d = isPlainObject(def) ? def[key] : undefined;
    const cur = o[key];
    if (cur === undefined) {
      if (fs.key) return BAD;
      if (fs.fill !== false) o[key] = defaultFor(fs, d);
      continue;
    }
    const r = repairNode(fs, cur, d, p, log);
    if (r === BAD) {
      if (fs.key) return BAD;
      o[key] = defaultFor(fs, d);
      log.add(p, 'reset');
    } else if (r !== cur) {
      o[key] = r;
    }
  }
  return o;
}

function repairList(spec, a, path, log) {
  const out = [];
  for (let i = 0; i < a.length; i++) {
    const p = `${path}[${i}]`;
    const sub = issueLog(); // 整筆被丟掉時，不留下這一筆內部的修補紀錄
    const r = a[i] === undefined ? BAD : repairNode(spec.item, a[i], spec.item.def, p, sub);
    if (r === BAD) {
      log.add(p, 'dropped');
    } else {
      for (const x of sub.issues) log.issues.push(x);
      out.push(r);
    }
  }
  if (out.length > spec.maxLen) {
    log.add(path, 'truncated');
    return out.slice(out.length - spec.maxLen); // 保留最新的
  }
  return out;
}

function repairNode(spec, v, def, path, log) {
  if (v === null) return spec.nullable || spec.k === 'any' ? null : BAD;
  switch (spec.k) {
    case 'any': return v;
    case 'map': return isPlainObject(v) ? v : BAD;
    case 'numOrObj': return (typeof v === 'number' && Number.isFinite(v)) || isPlainObject(v) ? v : BAD;
    case 'num': return repairNum(spec, v, path, log);
    case 'str': return repairText(spec, v, path, log);
    case 'bool': return repairBool(v, path, log);
    case 'date': return isValidDateStr(v) ? v : BAD;
    case 'time': return repairTime(v, path, log);
    case 'iso': return isIsoWithOffset(v) ? v : BAD; // 不猜時區：沒有 offset 的時間無法還原成當地時間
    case 'obj': return isPlainObject(v) ? repairObj(spec, v, def, path, log) : BAD;
    case 'arr': return Array.isArray(v) ? repairList(spec, v, path, log) : BAD;
    default: return v;
  }
}

function repairTop(s, key, defs, log) {
  const cur = s[key];
  if (cur === undefined) { s[key] = deepClone(defs[key]); return; }
  const r = repairNode(STATE_SPEC.fields[key], cur, defs[key], key, log);
  if (r === BAD) {
    s[key] = deepClone(defs[key]);
    log.add(key, 'reset');
  } else if (r !== cur) {
    s[key] = r;
  }
}

function repairXp(s, log) {
  if (s.xp === undefined) { s.xp = xpFromSessions(s.sessions); return; }
  const r = repairNode(STATE_SPEC.fields.xp, s.xp, undefined, 'xp', log);
  if (r === BAD) {
    s.xp = xpFromSessions(s.sessions);
    log.add('xp', 'derived');
  } else {
    s.xp = r;
  }
}

function repairStreak(s, log) {
  const derived = streakFromSessions(s.sessions);
  const cur = s.streak;
  if (cur === undefined) { s.streak = derived; return; }
  if (!isPlainObject(cur)) {
    s.streak = derived;
    log.add('streak', 'derived');
    return;
  }
  const fields = STATE_SPEC.fields.streak.fields;
  for (const k of ['current', 'best', 'lastDate']) {
    const p = `streak.${k}`;
    if (cur[k] === undefined) { cur[k] = derived[k]; continue; }
    const r = repairNode(fields[k], cur[k], undefined, p, log);
    if (r === BAD) {
      cur[k] = derived[k];
      log.add(p, 'derived');
    } else {
      cur[k] = r;
    }
  }
}

/* v1：version 缺少或 1。無效的 version 依形狀推測（有 game → 3、有 body → 2、否則 1） */
function detectVersion(s, log) {
  const v = s.version;
  if (v === undefined) return 1;
  let n = v;
  if (typeof n === 'string' && /^\s*\d+\s*$/.test(n)) {
    n = Number(n);
    log.add('version', 'coerced');
  }
  if (Number.isInteger(n) && n >= 1) {
    if (n > SCHEMA_VERSION) log.add('version', 'downgraded'); // 來自較新版本：保留不認得的欄位，原資料由 store 另存
    return n;
  }
  log.add('version', 'reset');
  if (isPlainObject(s.game)) return 3;
  return isPlainObject(s.body) ? 2 : 1;
}

/* sessions 先修（xp／streak 缺少或無效時由它推導），其餘依 defaultState 的欄位順序 */
const TOP_ORDER = ['level', 'xp', 'streak', 'prs', 'body', 'profile', 'settings', 'habits', 'goals', 'phase', 'game', 'meta'];

export function migrate(raw, { now = new Date() } = {}) {
  if (!isPlainObject(raw)) throw new MigrationError('資料不是物件，無法遷移');
  let s;
  try {
    s = deepClone(raw);
  } catch (e) {
    throw new MigrationError('資料無法複製，無法遷移');
  }
  const log = issueLog();
  const defs = defaultState(now);
  const fromVersion = detectVersion(s, log);
  const alreadyMigrated = isPlainObject(s.game);

  /* v1 → v2（ec87e03 的規則：補 prs 六桶、body 七桶、profile、settings.band）與 v2 → v3 的新欄位
     都是「缺少就補 defaultState 的值」，舊資料與不認得的欄位原樣保留。
     game：已遷移 → 只補缺欄位（保留 sleep／explore 等）；未遷移 → 建立預設 game。
     兩條路最後都由 mirrorLegacyToGame 複製 xp／streak，legacy xp 不會被加總進 game。 */
  repairTop(s, 'sessions', defs, log);
  for (const key of TOP_ORDER) {
    if (key === 'xp') repairXp(s, log);
    else if (key === 'streak') repairStreak(s, log);
    else repairTop(s, key, defs, log);
  }
  if (s.version === undefined) s = { version: SCHEMA_VERSION, ...s };
  else s.version = SCHEMA_VERSION;
  mirrorLegacyToGame(s);
  return { state: s, repaired: log.issues.length > 0, issues: log.issues, fromVersion, alreadyMigrated };
}
