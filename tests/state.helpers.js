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
  'empty-arrays.json', 'v3.json', 'v3-reverted-to-v2.json'];

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
