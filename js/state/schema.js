/* Daily Ten — state v3 schema（擁有者：data-guardian）
   純資料與純函式；import 時不碰 window / localStorage / document，可在 Node 單元測試。
   對外：
     SCHEMA_VERSION = 3、DEFAULT_IDENTITY、PR_KEYS、BODY_KEYS、PR_VALUE_FIELD、LIMITS、PHASES
     defaultState(now = new Date()) → 全新的 v3 預設 state（每次都是新物件）
     defaultGame()                  → 全新的 game 物件（M1 只建欄位；game.level = null，由 M2a engine 推導）
     validateImport(obj)            → {ok:true} | {ok:false, errors:[{code, path, message}]}
                                       匯入用的嚴格驗證：只檢查、不修補；接受遷移前的 v1／v2／v3 形狀。
                                       code：missing_field | invalid_type | out_of_range；message 為台灣繁中。
     isPlainObject(v)、deepClone(v)
   內部共用：STATE_SPEC 是欄位規格，migrate.js 的寬鬆修補與這裡的嚴格驗證共用同一份，
   保證「載入（修補）後的 state 一定能通過匯入驗證」——也就是任何備份檔都能再匯入。

   B1（早安打卡）收緊的欄位（仍是 v3：欄位形狀不變，只把 CLAUDE.md §5 已寫明的格式落實成檢查；
   上線版本從沒寫過這些欄位——sleep log 一直是空的、startedAt 一直是 null、current 一直是 P1——所以不需要升版）：
     habits.sleep.log[]  {date, lightsOut, wake, lightsOutEdited, wakeEdited?, target?}
                         date／lightsOut／wake 是識別欄位：缺少或格式錯 → 載入時整筆丟掉、匯入時報錯；
                         lightsOut、wake 必須是含時區的 ISO 時間（time.js isIsoWithOffset）；
                         lightsOutEdited 缺少補 false，'true'／1 轉成 true，其他無效值改回 false；
                         wakeEdited 選填 boolean（無效 → false）；
                         target 選填 {bedtime:'HH:MM', wakeTime:'HH:MM', windowMin:0–1440 整數} 或 null（無效 → null）。
                         同一天重複的紀錄載入與匯入都保留（怪資料不擋），寫入端（habits.js）保證不會新增重複。
     sessions[].plus     選填 boolean（加一輪；無效 → false）；type 'plus' 本來就接受（任意 1–20 字）
     phase.current       只能是 P1／P2／P3（無效 → P1）
     phase.startedAt     null 或含時區的 ISO 時間（無效 → null；載入後由 store.loadState 補上，見 migrate.js fillPhaseStartedAt） */
import { isoLocal, isValidDateStr, isIsoWithOffset } from './time.js';

export const SCHEMA_VERSION = 3;
export const DEFAULT_IDENTITY = '我是獨立、自律、持續成長的人。';
export const PR_KEYS = ['hrp', 'plank', 'run2mi', 'pushup', 'pike', 'sideplank'];
export const BODY_KEYS = ['weight', 'waist', 'arm', 'shoulder', 'thigh', 'rhr', 'sleep'];
export const PHASES = Object.freeze(['P1', 'P2', 'P3']);
/* 真實格式（ec87e03）：hrp {date,reps}；plank／run2mi {date,sec}；pushup／pike／sideplank {date,v} */
export const PR_VALUE_FIELD = Object.freeze({ hrp: 'reps', plank: 'sec', run2mi: 'sec', pushup: 'v', pike: 'v', sideplank: 'v' });

/* 寬鬆上限：擋壞檔，不擋怪資料（例如睡眠誤填 30） */
export const LIMITS = Object.freeze({
  xp: 10000000,
  levelMin: 1,
  levelMax: 5,
  streak: 100000,
  reps: 10000,
  sec: 86400,
  body: 100000,
  arrayLength: 50000,
  text: 500,
  shortText: 20,
  isoText: 40,
  minutesPerDay: 1440,
  heightCm: 300,
  age: 150
});
const PR_MAX = { hrp: LIMITS.reps, plank: LIMITS.sec, run2mi: LIMITS.sec, pushup: LIMITS.reps, pike: LIMITS.reps, sideplank: LIMITS.sec };

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isPlainObject(v) {
  if (v === null || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/* state 一律是 JSON 相容資料：用 JSON 來回複製，結果與「存進 storage 再讀回」完全一致 */
export function deepClone(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}

export function defaultGame() {
  return {
    xp: { move: 0, sleep: 0, explore: 0, total: 0 },
    level: null,
    streaks: {
      train: { current: 0, best: 0, lastDate: null },
      life: { current: 0, best: 0, lastDate: null }
    },
    freezeTokens: 0,
    achievements: {},
    perfectDays: []
  };
}

export function defaultState(now = new Date()) {
  return {
    version: SCHEMA_VERSION,
    level: 2,
    xp: 0,
    streak: { current: 0, best: 0, lastDate: null },
    sessions: [],
    prs: { hrp: [], plank: [], run2mi: [], pushup: [], pike: [], sideplank: [] },
    body: { weight: [], waist: [], arm: [], shoulder: [], thigh: [], rhr: [], sleep: [] },
    profile: { heightCm: null, age: null },
    settings: { voice: true, beep: true, band: true, bedtime: '23:00', wakeTime: '07:00', windowMin: 30, phoneDownMin: 30 },
    habits: {
      sleep: { log: [] },
      explore: {
        items: [{ id: 'dj', name: 'DJ', minimalAction: '練 1 個 transition', createdAt: isoLocal(now), status: 'trying' }],
        log: []
      }
    },
    goals: { identity: DEFAULT_IDENTITY, weekly: [], season: [] },
    phase: { current: 'P1', startedAt: null, history: [] },
    game: defaultGame(),
    meta: { lastBackupAt: null }
  };
}

/* ---------- 欄位規格 ----------
   k:        num | str | bool | date | time | iso | obj | arr | map | any | numOrObj
             iso = 含時區的 ISO 8601 時間（time.js isIsoWithOffset）
   oneOf:    str 的允許值清單（列舉）
   req:      匯入時必要（缺少 → top 層為 missing_field，其餘為 invalid_type）
   key:      陣列項目的識別欄位；匯入時必要，載入時無效 → 整筆丟掉
   nullable: 允許 null
   fill:false 載入時缺少就維持缺少（不補預設值）
   def:      陣列項目內非識別欄位的預設值（其餘欄位的預設值取自 defaultState）
   clamp:    載入時超出範圍的整數夾回範圍內（只有 level）
   truncate: 載入時過長的文字截斷（只有使用者可編輯的長文字）
   mirror:   M1 由 mirrorLegacyToGame 從舊欄位複製的欄位；載入時不檢查（會被覆寫），匯入時照常檢查 */
const num = (o) => ({ k: 'num', ...o });
const int = (o) => ({ k: 'num', int: true, ...o });
const text = (o) => ({ k: 'str', ...o });
const bool = (o) => ({ k: 'bool', ...o });
const date = (o) => ({ k: 'date', ...o });
const clock = (o) => ({ k: 'time', ...o });
const iso = (o) => ({ k: 'iso', ...o });
const obj = (fields, o) => ({ k: 'obj', fields, ...o });
const list = (item, o) => ({ k: 'arr', item, maxLen: LIMITS.arrayLength, ...o });
const dict = (o) => ({ k: 'map', ...o });
const any = (o) => ({ k: 'any', ...o });

const streakSpec = (o) => obj({
  current: int({ min: 0, max: LIMITS.streak, req: true }),
  best: int({ min: 0, max: LIMITS.streak, req: true }),
  lastDate: date({ nullable: true })
}, o);

const prEntry = (key) => obj({ date: date({ key: true }), [PR_VALUE_FIELD[key]]: num({ min: 0, max: PR_MAX[key], key: true }) });
const bodyEntry = obj({ date: date({ key: true }), v: num({ gt: 0, max: LIMITS.body, key: true }) });
/* B1：date 從此以遊戲日記錄（04:00 換日，00:00–03:59 算前一天）——日期欄位只檢查格式，不假設午夜換日；
   type 是任意短文字（含新的 'plus'）；plus = 加一輪（選填 boolean，舊版 App 不認得但會原樣保留） */
const sessionEntry = obj({
  date: date({ key: true }),
  type: text({ key: true, minLen: 1, maxLen: LIMITS.shortText }),
  xp: num({ min: 0, max: LIMITS.xp, fill: false, def: 0 }),
  plus: bool({ fill: false, def: false })
});
/* 打卡當時的目標（之後改設定不會重算過去）；三個欄位缺一或格式錯 → 整個 target 改成 null（不捏造歷史） */
const sleepTarget = obj({
  bedtime: clock({ key: true }),
  wakeTime: clock({ key: true }),
  windowMin: int({ min: 0, max: LIMITS.minutesPerDay, key: true })
}, { nullable: true, fill: false, def: null });
/* 早安打卡（D17）：date = 遊戲日；lightsOut = 昨晚熄燈；wake = 起床時間（只能比點擊時間早）
   wakeEdited 只在起床時間被往前改時寫入（選填）；target 由 game-designer 每次寫入（選填，舊紀錄沒有） */
const sleepEntry = obj({
  date: date({ key: true }),
  lightsOut: iso({ key: true }),
  wake: iso({ key: true }),
  lightsOutEdited: bool({ def: false }),
  wakeEdited: bool({ fill: false, def: false }),
  target: sleepTarget
});
const exploreItem = obj({
  id: text({ key: true, minLen: 1, maxLen: LIMITS.text }),
  name: text({ key: true, minLen: 1, maxLen: LIMITS.text }),
  minimalAction: text({ maxLen: LIMITS.text, truncate: true, def: '' }),
  createdAt: text({ nullable: true, maxLen: LIMITS.isoText, def: null }),
  status: text({ minLen: 1, maxLen: LIMITS.shortText, def: 'trying' })
});
const exploreEntry = obj({
  date: date({ key: true }),
  itemId: text({ key: true, minLen: 1, maxLen: LIMITS.text }),
  interest: num({ nullable: true, min: 1, max: 5, fill: false, def: null })
});

/* version 不在規格內：由 validateImport／migrate 各自處理 */
export const STATE_SPEC = obj({
  level: int({ min: LIMITS.levelMin, max: LIMITS.levelMax, clamp: true }),
  xp: num({ min: 0, max: LIMITS.xp }),
  streak: streakSpec({ req: true, top: true }),
  sessions: list(sessionEntry, { req: true, top: true }),
  prs: obj(Object.fromEntries(PR_KEYS.map((k) => [k, list(prEntry(k))]))),
  body: obj(Object.fromEntries(BODY_KEYS.map((k) => [k, list(bodyEntry)]))),
  profile: obj({
    heightCm: num({ nullable: true, gt: 0, max: LIMITS.heightCm }),
    age: num({ nullable: true, min: 0, max: LIMITS.age })
  }),
  settings: obj({
    voice: bool(), beep: bool(), band: bool(),
    bedtime: clock(), wakeTime: clock(),
    windowMin: int({ min: 0, max: LIMITS.minutesPerDay }),
    phoneDownMin: int({ min: 0, max: LIMITS.minutesPerDay })
  }),
  habits: obj({
    sleep: obj({ log: list(sleepEntry) }),
    explore: obj({ items: list(exploreItem), log: list(exploreEntry) })
  }),
  goals: obj({
    identity: text({ maxLen: LIMITS.text, truncate: true }),
    weekly: list(obj({})),
    season: list(obj({}))
  }),
  phase: obj({
    current: text({ minLen: 1, maxLen: LIMITS.shortText, oneOf: PHASES }),
    startedAt: iso({ nullable: true }),
    history: list(any())
  }),
  game: obj({
    xp: obj({
      move: num({ min: 0, max: LIMITS.xp, mirror: true }),
      sleep: num({ min: 0, max: LIMITS.xp }),
      explore: num({ min: 0, max: LIMITS.xp }),
      total: num({ min: 0, max: LIMITS.xp * 3, mirror: true })
    }),
    level: { k: 'numOrObj', nullable: true },
    streaks: obj({ train: streakSpec({ mirror: true }), life: streakSpec({ mirror: true }) }),
    freezeTokens: int({ min: 0, max: LIMITS.streak }),
    achievements: dict(),
    perfectDays: list(any())
  }),
  meta: obj({ lastBackupAt: text({ nullable: true, maxLen: LIMITS.isoText }) })
});

/* ---------- 嚴格驗證與修補共用的判斷 ---------- */
export function numInRange(spec, n) {
  if (spec.int && !Number.isInteger(n)) return false;
  if (spec.min !== undefined && n < spec.min) return false;
  if (spec.gt !== undefined && n <= spec.gt) return false;
  if (spec.max !== undefined && n > spec.max) return false;
  return true;
}

/* 以「字」（code point）計算長度，中文、emoji 都算 1 字 */
export function textLength(s) {
  let n = 0;
  for (const _ of s) n++;
  return n;
}
export function isTooLong(spec, s) {
  return spec.maxLen !== undefined && s.length > spec.maxLen && textLength(s) > spec.maxLen;
}
export function truncateText(s, max) {
  return Array.from(s).slice(0, max).join('');
}

/* ---------- 錯誤訊息（給使用者看，台灣繁中） ---------- */
const LABELS = {
  version: '版本', level: '等級', xp: 'XP', streak: '連續天數', sessions: '訓練紀錄', prs: 'PR 紀錄',
  body: '身體指標', profile: '個人資料', settings: '設定', habits: '習慣紀錄', goals: '目標',
  phase: '階段', game: '遊戲進度', meta: '備份資訊'
};
/* 比 top 層更具體的名稱（先比對） */
const SUB_LABELS = [['habits.sleep', '睡眠紀錄'], ['habits.explore', '探索紀錄']];
const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

function where(path) {
  if (!path) return '檔案內容';
  for (const [prefix, label] of SUB_LABELS) {
    if (path === prefix || path.startsWith(`${prefix}.`) || path.startsWith(`${prefix}[`)) return `${label}（${path}）`;
  }
  const top = /^[^.[]+/.exec(path)[0];
  return LABELS[top] ? `${LABELS[top]}（${path}）` : path;
}
function typeText(spec) {
  switch (spec.k) {
    case 'num': return spec.int ? '整數' : '數字';
    case 'str': return '文字';
    case 'bool': return 'true 或 false';
    case 'date': return 'YYYY-MM-DD 格式的日期';
    case 'time': return 'HH:MM 格式的時間';
    case 'iso': return '含時區的時間（例 2026-10-04T06:58:00+09:00）';
    case 'arr': return '清單';
    case 'numOrObj': return '數字或物件';
    default: return '物件';
  }
}
/* 中文與英數字之間留一個空格（「應為 YYYY-MM-DD 格式的日期」） */
const shouldBe = (spec) => {
  const t = typeText(spec);
  return /^[A-Za-z]/.test(t) ? `應為 ${t}` : `應為${t}`;
};
function rangeText(spec) {
  if (spec.gt !== undefined) return `應大於 ${fmt(spec.gt)}，且不超過 ${fmt(spec.max)}`;
  if (spec.int) return `應為 ${fmt(spec.min)}–${fmt(spec.max)} 的整數`;
  return `應介於 ${fmt(spec.min)}–${fmt(spec.max)}`;
}
const err = (code, path, message) => ({ code, path, message });
const missingField = (path) => err('missing_field', path, `缺少必要欄位：${where(path)}`);
const missingValue = (spec, path) => err('invalid_type', path, `${where(path)}缺少必要的值，${shouldBe(spec)}`);
const wrongType = (spec, path) => err('invalid_type', path, `${where(path)}${shouldBe(spec)}`);
const emptyText = (path) => err('invalid_type', path, `${where(path)}不可為空白`);
const badFormat = (spec, path) => err('out_of_range', path, `${where(path)}${shouldBe(spec)}`);
const outOfRange = (spec, path) => err('out_of_range', path, `${where(path)}數值超出合理範圍（${rangeText(spec)}）`);
const tooLong = (spec, path) => err('out_of_range', path, `${where(path)}文字過長（上限 ${fmt(spec.maxLen)} 字）`);
const notOneOf = (spec, path) => err('out_of_range', path, `${where(path)}應為 ${spec.oneOf.join('、')} 其中之一`);
const tooMany = (spec, path) => err('out_of_range', path, `${where(path)}筆數過多（上限 ${fmt(spec.maxLen)} 筆）`);

const MAX_ERRORS = 100;
const join = (path, key) => (path ? `${path}.${key}` : key);

function check(spec, v, path, errors) {
  if (errors.length >= MAX_ERRORS) return;
  if (v === undefined) {
    if (spec.req || spec.key) errors.push(spec.top ? missingField(path) : missingValue(spec, path));
    return;
  }
  if (v === null) {
    if (!spec.nullable && spec.k !== 'any') errors.push(wrongType(spec, path));
    return;
  }
  switch (spec.k) {
    case 'any':
      return;
    case 'num':
      if (typeof v !== 'number' || !Number.isFinite(v)) errors.push(wrongType(spec, path));
      else if (!numInRange(spec, v)) errors.push(outOfRange(spec, path));
      return;
    case 'str':
      if (typeof v !== 'string') errors.push(wrongType(spec, path));
      else if (spec.minLen && v.length < spec.minLen) errors.push(emptyText(path));
      else if (isTooLong(spec, v)) errors.push(tooLong(spec, path));
      else if (spec.oneOf && !spec.oneOf.includes(v)) errors.push(notOneOf(spec, path));
      return;
    case 'bool':
      if (typeof v !== 'boolean') errors.push(wrongType(spec, path));
      return;
    case 'date':
      if (typeof v !== 'string') errors.push(wrongType(spec, path));
      else if (!isValidDateStr(v)) errors.push(badFormat(spec, path));
      return;
    case 'time':
      if (typeof v !== 'string') errors.push(wrongType(spec, path));
      else if (!TIME_RE.test(v)) errors.push(badFormat(spec, path));
      return;
    case 'iso':
      if (typeof v !== 'string') errors.push(wrongType(spec, path));
      else if (!isIsoWithOffset(v)) errors.push(badFormat(spec, path));
      return;
    case 'map':
      if (!isPlainObject(v)) errors.push(wrongType(spec, path));
      return;
    case 'numOrObj':
      if (!((typeof v === 'number' && Number.isFinite(v)) || isPlainObject(v))) errors.push(wrongType(spec, path));
      return;
    case 'obj':
      if (!isPlainObject(v)) { errors.push(wrongType(spec, path)); return; }
      for (const key of Object.keys(spec.fields)) check(spec.fields[key], v[key], join(path, key), errors);
      return;
    case 'arr':
      if (!Array.isArray(v)) { errors.push(wrongType(spec, path)); return; }
      if (v.length > spec.maxLen) { errors.push(tooMany(spec, path)); return; }
      for (let i = 0; i < v.length && errors.length < MAX_ERRORS; i++) check(spec.item, v[i], `${path}[${i}]`, errors);
      return;
    default:
      return;
  }
}

function checkVersion(v, errors) {
  if (v === undefined) return; // v1 可能沒有 version
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    errors.push(err('invalid_type', 'version', '版本（version）應為數字'));
  } else if (!Number.isInteger(v) || v < 1) {
    errors.push(err('out_of_range', 'version', `版本（version）應為 1–${SCHEMA_VERSION} 的整數`));
  } else if (v > SCHEMA_VERSION) {
    errors.push(err('out_of_range', 'version', `這份資料來自較新版本的 App（v${v}），請先更新 App 再匯入`));
  }
}

export function validateImport(obj) {
  if (!isPlainObject(obj)) {
    return { ok: false, errors: [err('invalid_type', '', '檔案內容不是 Daily Ten 的資料格式')] };
  }
  const errors = [];
  checkVersion(obj.version, errors);
  check(STATE_SPEC, obj, '', errors);
  return errors.length ? { ok: false, errors } : { ok: true };
}
