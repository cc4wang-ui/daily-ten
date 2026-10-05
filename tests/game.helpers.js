/* game-designer 單元測試共用工具（不是 spec，Playwright 不會當成測試執行）。純 Node，不開瀏覽器。 */
import { readFileSync } from 'node:fs';

export const readRulesRaw = () => JSON.parse(readFileSync(new URL('../data/game.json', import.meta.url), 'utf8'));
export const loadFixture = (name) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
export const readSource = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');

export const ALL_FIXTURES = ['v1-minimal.json', 'v2-real.json', 'v2-missing-fields.json', 'v2-wrong-types.json',
  'empty-arrays.json', 'v3.json', 'v3-reverted-to-v2.json', 'import-bad-missing-fields.json',
  'import-bad-wrong-types.json', 'import-bad-oversized.json'];

/* 規則的變體：深複製後改一個欄位（path 以 . 分隔） */
export function variant(raw, path, value) {
  const r = JSON.parse(JSON.stringify(raw));
  const keys = path.split('.');
  let o = r;
  for (const k of keys.slice(0, -1)) o = o[k];
  if (value === undefined) delete o[keys[keys.length - 1]];
  else o[keys[keys.length - 1]] = value;
  return r;
}

/* 每個測試預設在 Asia/Tokyo（與 playwright.config 的 timezoneId 一致），結束後還原 */
export function useTZ(test, tz = 'Asia/Tokyo') {
  let prev;
  test.beforeEach(() => {
    prev = process.env.TZ;
    process.env.TZ = tz;
  });
  test.afterEach(() => {
    if (prev === undefined) delete process.env.TZ;
    else process.env.TZ = prev;
  });
}

/* 日期字串加減天數（UTC 計算，不依賴受測模組） */
export function plusDays(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

/* 一晚的睡眠紀錄：熄燈 ≥ 12:00 算前一天晚上，否則當天凌晨 */
export function night(date, lo, wake, { offset = '+09:00', ...extra } = {}) {
  const loDate = lo >= '12:00' ? plusDays(date, -1) : date;
  return { date, lightsOut: `${loDate}T${lo}:00${offset}`, wake: `${date}T${wake}:00${offset}`, lightsOutEdited: false, ...extra };
}

export const session = (date, type, extra = {}) => ({ date, type, xp: 10, ...extra });

export function makeState({ sessions = [], sleep = [], settings = {}, phase = {}, prs = null } = {}) {
  return {
    version: 3,
    level: 2,
    xp: 0,
    streak: { current: 0, best: 0, lastDate: null },
    sessions,
    prs: prs || { hrp: [], plank: [], run2mi: [], pushup: [], pike: [], sideplank: [] },
    settings: { voice: true, beep: true, band: true, bedtime: '23:00', wakeTime: '07:00', windowMin: 30, phoneDownMin: 30, ...settings },
    habits: { sleep: { log: sleep }, explore: { items: [], log: [] } },
    goals: { identity: '我是獨立、自律、持續成長的人。', weekly: [], season: [] },
    phase: { current: 'P1', startedAt: null, history: [], ...phase },
    game: { xp: { move: 0, sleep: 0, explore: 0, total: 0 }, level: null, streaks: {}, freezeTokens: 0, achievements: {}, perfectDays: [] },
    meta: { lastBackupAt: null }
  };
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
