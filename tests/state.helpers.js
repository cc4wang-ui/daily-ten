/* data-guardian 單元測試共用工具（不是 spec，Playwright 不會當成測試執行）。
   純 Node：localStorage／window.storage 用記憶體 shim。 */
import { readFileSync } from 'node:fs';

export const FIXTURES = new URL('./fixtures/', import.meta.url);
export const readFixture = (name) => readFileSync(new URL(name, FIXTURES), 'utf8');
export const loadFixture = (name) => JSON.parse(readFixture(name));

/* 測試用「現在」：2026-10-02 15:30:00 Asia/Tokyo */
export const NOW = new Date('2026-10-02T15:30:00+09:00');
export const DAY_MS = 86400000;

export const GOOD_FIXTURES = ['v1-minimal.json', 'v2-real.json', 'v2-missing-fields.json', 'v2-wrong-types.json',
  'empty-arrays.json', 'v3.json', 'v3-reverted-to-v2.json',
  'v3-checkin.json', 'v3-checkin-reverted-to-v2.json', 'v3-bad-sleep.json',
  'v3-v2a.json', 'v3-v2a-reverted-to-v2.json', 'v3-v2a-bad-fields.json'];

/* V2a fixture（v3-v2a.json＝v3-checkin.json 之後，V2a 第一次開啟的 10-05 一天）：
   06:40 開 App → ensureSeenInitialized(7, '2026-10-05')（只改記憶體）→ 06:41 早安打卡（01:45 熄燈、06:41:20 起床：睡不到 6 小時、
   熄燈晚於時段 90 分以上 → D6 降量）→ 按「恢復」setDeloadRestored('2026-10-05') → 晚上主課表 → Perfect Day 慶祝
   markPerfectDaySeen('2026-10-05')。Lv 7（V1 engine：總 XP 2030 → 2115；Lv 8 要 2450）當天沒有升級。 */
export const V2A_SEEN = Object.freeze({ level: 7, perfectDay: '2026-10-05' });
export const V2A_DELOAD = Object.freeze({ restoredOn: '2026-10-05' });
export const V2A_CHECKIN = Object.freeze({
  date: '2026-10-05', lightsOut: '2026-10-05T01:45:00+09:00', wake: '2026-10-05T06:41:20+09:00', lightsOutEdited: true,
  target: Object.freeze({ bedtime: '23:30', wakeTime: '07:00', windowMin: 30 })
});

/* B1 早安打卡 fixture 的 sleep log（v3-checkin.json 與 v3-checkin-reverted-to-v2.json 相同）
   10-03 晚上就寢目標從 23:00 改成 23:30：前兩筆的 target 仍是 23:00（改設定不重算過去） */
export const TARGET_2300 = Object.freeze({ bedtime: '23:00', wakeTime: '07:00', windowMin: 30 });
export const TARGET_2330 = Object.freeze({ bedtime: '23:30', wakeTime: '07:00', windowMin: 30 });
export const CHECKIN_LOG = [
  { date: '2026-10-02', lightsOut: '2026-10-01T23:00:00+09:00', wake: '2026-10-02T06:51:40+09:00', lightsOutEdited: false, target: { ...TARGET_2300 } },
  { date: '2026-10-03', lightsOut: '2026-10-03T00:40:00+09:00', wake: '2026-10-03T07:25:05+09:00', lightsOutEdited: true, target: { ...TARGET_2300 } },
  { date: '2026-10-04', lightsOut: '2026-10-03T23:30:00+09:00', wake: '2026-10-04T06:45:00+09:00', lightsOutEdited: false, wakeEdited: true, target: { ...TARGET_2330 } }
];
export const CHECKIN_STARTED_AT = '2026-10-02T06:50:10+09:00';

/* 舊版 App（ec87e03 的 v2 程式）的 recordSession：只動 legacy 欄位（D12 fixture 重播用） */
export function legacyRecordSession(state, date, type, xp) {
  const prev = new Date(`${date}T00:00:00Z`);
  prev.setUTCDate(prev.getUTCDate() - 1);
  const yesterday = prev.toISOString().slice(0, 10);
  const same = state.sessions.find((x) => x.date === date);
  if (same) {
    if (xp > same.xp) { state.xp += xp - same.xp; same.xp = xp; same.type = type; }
    return state;
  }
  state.sessions.push({ date, type, xp });
  state.xp += xp;
  if (state.streak.lastDate === yesterday) state.streak.current += 1;
  else if (state.streak.lastDate !== date) state.streak.current = 1;
  state.streak.lastDate = date;
  if (state.streak.current > state.streak.best) state.streak.best = state.streak.current;
  return state;
}
/* 舊版 App 的 migrate：保留整個物件、只補 v2 欄位、version 改回 2 */
export function legacyV2Migrate(s) {
  s.version = s.version || 1;
  s.prs = s.prs || {};
  for (const k of ['hrp', 'plank', 'run2mi', 'pushup', 'pike', 'sideplank']) if (!Array.isArray(s.prs[k])) s.prs[k] = [];
  s.body = s.body || {};
  for (const k of ['weight', 'waist', 'arm', 'shoulder', 'thigh', 'rhr', 'sleep']) if (!Array.isArray(s.body[k])) s.body[k] = [];
  s.profile = s.profile || {};
  if (!('heightCm' in s.profile)) s.profile.heightCm = null;
  if (!('age' in s.profile)) s.profile.age = null;
  s.settings = s.settings || { voice: true, beep: true };
  if (!('band' in s.settings)) s.settings.band = true;
  s.version = 2;
  return s;
}

/* CLAUDE.md §11「不用」詞 */
export const BANNED_WORDS = ['窗口', '時長', '散點', '數據', '斷線', '設置', '撤銷', '撤回', '俯臥撐', '視頻', '信息', '收下', '錨點'];
export function findBannedWords(text) {
  const hits = BANNED_WORDS.filter((w) => text.includes(w));
  if (/\d+\s*連/.test(text)) hits.push('N連');
  return hits;
}

/* localStorage shim（含 key()／length，可模擬寫入失敗） */
export class MemoryStorage {
  constructor(entries = {}) {
    this.map = new Map(Object.entries(entries));
    this.failWrites = false;
  }
  get length() { return this.map.size; }
  key(i) { return [...this.map.keys()][i] ?? null; }
  getItem(k) { return this.map.has(String(k)) ? this.map.get(String(k)) : null; }
  setItem(k, v) {
    if (this.failWrites) {
      const e = new Error('The quota has been exceeded.');
      e.name = 'QuotaExceededError';
      throw e;
    }
    this.map.set(String(k), String(v));
  }
  removeItem(k) { this.map.delete(String(k)); }
  clear() { this.map.clear(); }
  keys() { return [...this.map.keys()].sort(); }
  snapshot() { return Object.fromEntries(this.map); }
}

/* window.storage shim（Claude artifact 介面：get(key) → {value}；set(key, value)） */
export class WindowStorage {
  constructor(entries = {}) {
    this.map = new Map(Object.entries(entries));
    this.failGet = false;
  }
  async get(k) {
    if (this.failGet) throw new Error('storage unavailable');
    return this.map.has(k) ? { key: k, value: this.map.get(k) } : null;
  }
  async set(k, v) {
    this.map.set(k, v);
    return { key: k, value: v };
  }
}

export function installGlobals({ local = null, windowStorage = null } = {}) {
  if (local) globalThis.localStorage = local;
  else delete globalThis.localStorage;
  if (windowStorage) globalThis.window = { storage: windowStorage };
  else delete globalThis.window;
}
export function clearGlobals() {
  delete globalThis.localStorage;
  delete globalThis.window;
}

/* 每個測試都在 Asia/Tokyo（與 playwright.config 的 timezoneId 一致），結束後還原 */
export function useTokyoTime(test) {
  let prev;
  test.beforeEach(() => {
    prev = process.env.TZ;
    process.env.TZ = 'Asia/Tokyo';
  });
  test.afterEach(() => {
    if (prev === undefined) delete process.env.TZ;
    else process.env.TZ = prev;
  });
}

export function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

/* 決定性亂數（fuzz 用） */
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
