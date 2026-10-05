/* Daily Ten — 遊戲規則：載入、驗證、凍結（擁有者：game-designer）
   規則即資料（CLAUDE.md §2 第 10 條）：所有數值與文案樣板在 data/game.json，這裡只負責讀進來、檢查形狀、凍結。
   import 時不做任何 I/O；只有 loadRules() 會 fetch（離線時由 Service Worker 預快取供應）。
   對外：
     RULES_URL            data/game.json 的絕對網址（以本檔位置推算，和頁面在哪個路徑無關；等同頁面的 './data/game.json'）
     loadRules()          → Promise<rules | null>；讀不到、不是 JSON、形狀不對都回 null（UI 隱藏遊戲卡片，不白屏）
     parseRules(raw)      → rules | null：深複製＋驗證＋凍結，不改動傳入物件
     asRules(rules)       → 驗證過的 rules | null（engine 內部用；loadRules／parseRules 的結果直接通過，
                            其他物件驗證一次後快取）
     fill(template, vars) → 文案樣板：'{key}' 換成 vars.key（沒有的 key 原樣保留） */

export const RULES_URL = new URL('../../data/game.json', import.meta.url).href;

export async function loadRules() {
  try {
    if (typeof fetch !== 'function') return null;
    const res = await fetch(RULES_URL);
    if (!res || !res.ok) return null;
    const rules = parseRules(await res.json());
    if (!rules) console.warn('Daily Ten：遊戲規則格式不符，已略過遊戲卡片');
    return rules;
  } catch (e) {
    console.warn('Daily Ten：遊戲規則載入失敗', e);
    return null;
  }
}

export function fill(template, vars) {
  return String(template).replace(/\{(\w+)\}/g, (m, k) =>
    (vars && Object.prototype.hasOwnProperty.call(vars, k) && vars[k] !== undefined ? String(vars[k]) : m));
}

/* ---------- 驗證 ---------- */
const PILLARS = ['move', 'sleep', 'explore'];
const TIERS = ['minimal', 'main', 'plus'];
const PHASE_IDS = ['P1', 'P2', 'P3'];
const HM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isInt = (v, min = -Infinity, max = Infinity) => Number.isInteger(v) && v >= min && v <= max;
const isText = (v) => typeof v === 'string' && v.trim().length > 0;
const isHM = (v) => typeof v === 'string' && HM_RE.test(v);

/* 漸進計分的三段分數：full ≥ near ≥ base ≥ 0 */
const isPoints = (p, cap) => isObj(p) && isInt(p.full, 0, cap) && isInt(p.near, 0, p.full) && isInt(p.base, 0, p.near);

/* 必要的文案樣板（1 = 字串；物件 = 下一層） */
const COPY_SPEC = {
  phaseWithDay: 1, phaseWithWeek: 1, phaseNoDay: 1, level: 1, streak: 1,
  next: { checkin: 1, workout: 1, boss: 1, done: 1 },
  checkIn: { open: 1, done: 1, early: 1, late: 1, badNow: 1 },
  checkInError: { badTime: 1, wakeFuture: 1, wakeLocked: 1, badDuration: 1 },
  lines: {
    wakeFull: 1, wakeNearLate: 1, wakeNearEarly: 1, wakeBase: 1,
    lightsOutFull: 1, lightsOutNearLate: 1, lightsOutNearEarly: 1, lightsOutBase: 1,
    durationFull: 1, durationNear: 1, durationBase: 1, duration: 1
  },
  unlock: { title: 1, progress: 1, short: 1, readyTitle: 1, ready: 1, readyShort: 1 },
  aft: { title: 1, subtitle: 1, reps: 1, gapReps: 1, gapSec: 1, gapClock: 1, met: 1, none: 1 }
};
const copyOk = (spec, c) => isObj(c) && Object.keys(spec).every((k) => (spec[k] === 1 ? isText(c[k]) : copyOk(spec[k], c[k])));

function validMove(m, cap) {
  if (!isObj(m) || !isObj(m.tiers)) return false;
  if (!TIERS.every((t) => isObj(m.tiers[t]) && isInt(m.tiers[t].xp, 0, cap) && isText(m.tiers[t].label))) return false;
  if (!(m.tiers.minimal.xp <= m.tiers.main.xp && m.tiers.main.xp <= m.tiers.plus.xp)) return false;
  if (!isObj(m.tierByType) || !Object.values(m.tierByType).every((t) => TIERS.includes(t))) return false;
  if (!TIERS.includes(m.unknownTypeTier)) return false;
  if (!isObj(m.typeLabels) || !Object.values(m.typeLabels).every(isText)) return false;
  return isText(m.plusLabel) && isInt(m.bossWeekday, 0, 6);
}

function validSleep(s, cap, rolloverHour) {
  if (!isObj(s) || !isObj(s.defaults)) return false;
  if (!isInt(s.maxWindowMin, 0, 720)) return false;
  if (!isHM(s.defaults.bedtime) || !isHM(s.defaults.wakeTime) || !isInt(s.defaults.windowMin, 0, s.maxWindowMin)) return false;
  if (!isInt(s.nearMin, 0, 720)) return false;
  if (!isPoints(s.wake, cap) || !isPoints(s.lightsOut, cap) || !isPoints(s.duration, cap)) return false;
  if (!isInt(s.duration.targetMin, 1, 1440) || !isInt(s.maxDurationMin, s.duration.targetMin, 1440)) return false;
  const c = s.checkIn;
  return isObj(c) && isInt(c.fromHour, rolloverHour, 23) && isInt(c.untilHour, c.fromHour + 1, 24) && typeof c.wakeEditable === 'boolean';
}

function validPhases(p) {
  if (!isObj(p) || !Array.isArray(p.order) || p.order.length !== PHASE_IDS.length) return false;
  if (!p.order.every((id, i) => id === PHASE_IDS[i])) return false;
  return PHASE_IDS.every((id) => {
    const ph = p[id];
    return isObj(ph) && isText(ph.name) && (ph.unit === 'day' || ph.unit === 'week')
      && Array.isArray(ph.pillars) && ph.pillars.length > 0 && ph.pillars.every((x) => PILLARS.includes(x));
  });
}

function validAft(a) {
  if (!isObj(a) || !Array.isArray(a.items) || a.items.length === 0) return false;
  return a.items.every((it) => isObj(it) && isText(it.key) && isText(it.name) && isText(it.field)
    && (it.unit === 'reps' || it.unit === 'sec') && (it.better === 'higher' || it.better === 'lower')
    && typeof it.target === 'number' && Number.isFinite(it.target) && it.target > 0);
}

function valid(r) {
  if (!isObj(r) || !isInt(r.version, 1)) return false;
  if (!isObj(r.day) || !isInt(r.day.rolloverHour, 0, 23)) return false;
  if (!isObj(r.pillars) || !PILLARS.every((p) => isObj(r.pillars[p]) && isInt(r.pillars[p].max, 1, 1000))) return false;
  if (!validMove(r.move, r.pillars.move.max)) return false;
  if (!validSleep(r.sleep, r.pillars.sleep.max, r.day.rolloverHour)) return false;
  if (!isObj(r.level) || !isInt(r.level.base, 1, 1000000) || !isInt(r.level.step, 0, 1000000)) return false;
  if (!isObj(r.streak) || (r.streak.home !== 'train' && r.streak.home !== 'life') || !isInt(r.streak.lifeMinPillars, 1, 3)) return false;
  if (!validPhases(r.phases)) return false;
  const u = r.unlock && r.unlock.P2;
  if (!isObj(u) || u.kind !== 'wakeInWindowDays' || !isInt(u.windowDays, 1, 366) || !isInt(u.minDays, 1, u.windowDays)) return false;
  if (!isObj(r.explore) || typeof r.explore.open !== 'boolean') return false;
  if (!validAft(r.aft)) return false;
  return copyOk(COPY_SPEC, r.copy);
}

/* ---------- 解析與快取 ---------- */
const VALID = new WeakSet();   // parseRules 產生的凍結物件
const CHECKED = new WeakMap(); // 其他物件 → 驗證結果（rules 或 null）

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

export function parseRules(raw) {
  try {
    if (!isObj(raw)) return null;
    if (VALID.has(raw)) return raw;
    const r = JSON.parse(JSON.stringify(raw));
    if (!valid(r)) return null;
    deepFreeze(r);
    VALID.add(r);
    return r;
  } catch (e) {
    return null;
  }
}

export function asRules(rules) {
  if (!isObj(rules)) return null;
  if (VALID.has(rules)) return rules;
  if (CHECKED.has(rules)) return CHECKED.get(rules);
  const r = parseRules(rules);
  CHECKED.set(rules, r);
  return r;
}
