/* Daily Ten — state store（M1 介面契約；擁有者：data-guardian）
   v3：載入時遷移／修補，失敗不白屏；原始字串另存備份 key。import 時不碰 window / localStorage。
   對外 API（ui-engineer 依賴，名稱與回傳形狀不可改）：
     STORAGE_KEY        localStorage key（不變：'daily-ten-state'）
     loadState({now}={}) → Promise<{status:'fresh'|'ok'|'migrated'|'repaired'|'recovered',
                                    error:null|{code:'repaired'|'parse'|'migrate', message, backupKey}}>
                          fresh：沒有資料；ok：v3 正常；migrated：從 v1／v2 遷移（含被舊版改回 2 的 v3）；
                          repaired：部分資料修補過；recovered：讀不出來，改用空白資料。
                          repaired／recovered 會先把「原始字串」存到 backupKey（daily-ten-state.bak-v{N}），
                          message 是給使用者看的繁中；UI 可用 backup.js 的 downloadRawBackup(backupKey) 下載。
                          loadState 不覆寫主 key：遷移結果在下次 saveState 才寫入。
     getState()         → 目前的 state 物件。每次用到都重新呼叫，不要快取參照（匯入會換成新物件）
     setState(next)     → 換掉記憶體中的 state
     saveState()        → Promise<boolean>：先 mirrorLegacyToGame，再寫入 window.storage（若有）與 localStorage
     migrateState(raw)  → 遷移後的 state（新物件，不改動 raw），失敗回 null（不丟例外）
   另外提供：BACKUP_KEY_PREFIX（'daily-ten-state.bak-v'） */
import { SCHEMA_VERSION, defaultState, isPlainObject } from './schema.js';
import { migrate, mirrorLegacyToGame } from './migrate.js';
import { compactStamp } from './time.js';

export const STORAGE_KEY = 'daily-ten-state';
export const BACKUP_KEY_PREFIX = `${STORAGE_KEY}.bak-v`;

const MSG = {
  repaired: '部分資料格式異常，已自動修復。原始資料已另存，可下載保存。',
  recovered: '讀取資料時發生問題，已改用空白資料。原始資料已另存，可下載保存。',
  repairedUnsaved: '部分資料格式異常，已自動修復。原始資料另存失敗，請先下載保存再繼續記錄。',
  recoveredUnsaved: '讀取資料時發生問題，已改用空白資料。原始資料另存失敗，請先下載保存再繼續記錄。'
};

let state = null;

function windowStorage() {
  try { return typeof window !== 'undefined' && window && window.storage ? window.storage : null; } catch (e) { return null; }
}
function local() {
  try { return typeof localStorage !== 'undefined' && localStorage ? localStorage : null; } catch (e) { return null; }
}

/* 讀取順序與原本相同：window.storage 有值先用，否則（或讀不出來時）用 localStorage */
async function readCandidates() {
  const out = [];
  const ws = windowStorage();
  if (ws) {
    try {
      const r = await ws.get(STORAGE_KEY);
      if (r && r.value) out.push({ raw: String(r.value), source: 'window.storage' });
    } catch (e) { /* 讀不到就換下一個來源 */ }
  }
  const ls = local();
  if (ls) {
    try {
      const s = ls.getItem(STORAGE_KEY);
      if (s && !(out.length && out[0].raw === s)) out.push({ raw: s, source: 'localStorage' });
    } catch (e) { /* 同上 */ }
  }
  return out;
}

/* 原資料可辨識的 version（1–99）；JSON 壞掉時從字串裡找 "version": N */
function versionOf(parsed) {
  const v = parsed && parsed.version;
  return Number.isInteger(v) && v >= 1 && v <= 99 ? v : null;
}
function sniffVersion(raw) {
  const m = /"version"\s*:\s*(\d{1,2})(?!\d)/.exec(raw);
  return m ? Number(m[1]) : null;
}

function tryLoad(raw, now) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { ok: false, code: 'parse', version: sniffVersion(raw) };
  }
  if (!isPlainObject(parsed)) return { ok: false, code: 'migrate', version: null };
  try {
    return { ok: true, result: migrate(parsed, { now }) };
  } catch (e) {
    return { ok: false, code: 'migrate', version: versionOf(parsed) };
  }
}

function findSameContent(ls, base, raw) {
  if (ls.getItem(base) === raw) return base;
  for (let i = 0; i < ls.length; i++) {
    const key = ls.key(i);
    if (key && key.startsWith(`${base}-`) && ls.getItem(key) === raw) return key;
  }
  return null;
}

/* 原始字串存到 daily-ten-state.bak-v{N}；已存在且內容不同 → bak-v{N}-{YYYYMMDDHHmmss}；
   內容相同（包含先前另開的 key）就沿用，重複開 App 不會一直複製。失敗回 null。 */
function writeBackup(raw, version, now) {
  const ls = local();
  if (!ls) return null;
  const n = Number.isInteger(version) && version >= 1 && version <= 99 ? version : 2;
  const base = `${BACKUP_KEY_PREFIX}${n}`;
  try {
    const same = findSameContent(ls, base, raw);
    if (same) return same;
    if (ls.getItem(base) === null) {
      ls.setItem(base, raw);
      return base;
    }
    const stamped = `${base}-${compactStamp(now)}`;
    for (let i = 1; i <= 100; i++) {
      const key = i === 1 ? stamped : `${stamped}-${i}`;
      if (ls.getItem(key) === null) {
        ls.setItem(key, raw);
        return key;
      }
    }
  } catch (e) { /* 容量不足等 */ }
  return null;
}

function backupError(code, kind, candidate, key) {
  if (key) return { code, message: MSG[kind], backupKey: key };
  /* 另存失敗：原始字串仍在主 key（loadState 不覆寫），在下次儲存前還能下載 */
  return { code, message: MSG[`${kind}Unsaved`], backupKey: candidate.source === 'localStorage' ? STORAGE_KEY : null };
}

export async function loadState({ now = new Date() } = {}) {
  const candidates = await readCandidates();
  if (!candidates.length) {
    state = defaultState(now);
    return { status: 'fresh', error: null };
  }
  const failures = [];
  for (const c of candidates) {
    const r = tryLoad(c.raw, now);
    if (!r.ok) {
      failures.push({ ...c, code: r.code, version: r.version });
      continue;
    }
    state = r.result.state;
    /* 前一個來源讀不出來（通常不會發生）：一樣另存，視為修補 */
    const failedKeys = failures.map((f) => writeBackup(f.raw, f.version, now));
    if (r.result.repaired) {
      const key = writeBackup(c.raw, r.result.fromVersion, now);
      return { status: 'repaired', error: backupError('repaired', 'repaired', c, key) };
    }
    if (failures.length) {
      return { status: 'repaired', error: backupError('repaired', 'repaired', failures[0], failedKeys[0]) };
    }
    return { status: r.result.fromVersion === SCHEMA_VERSION ? 'ok' : 'migrated', error: null };
  }
  const first = failures[0];
  const key = writeBackup(first.raw, first.version, now);
  for (const f of failures.slice(1)) writeBackup(f.raw, f.version, now);
  state = defaultState(now);
  return { status: 'recovered', error: backupError(first.code, 'recovered', first, key) };
}

export function getState() { return state; }
export function setState(next) { state = next; }

export async function saveState() {
  if (!isPlainObject(state)) {
    console.error('儲存略過：尚未載入資料');
    return false;
  }
  let s;
  try {
    mirrorLegacyToGame(state);
    s = JSON.stringify(state);
  } catch (e) {
    console.error('儲存失敗：資料僅存在記憶體中');
    return false;
  }
  let ok = false;
  const ws = windowStorage();
  try { if (ws) { await ws.set(STORAGE_KEY, s); ok = true; } } catch (e) {}
  const ls = local();
  try { if (ls) { ls.setItem(STORAGE_KEY, s); ok = true; } } catch (e) {}
  if (!ok) console.error('儲存失敗：資料僅存在記憶體中');
  return ok;
}

export function migrateState(raw) {
  try { return migrate(raw).state; } catch (e) { return null; }
}
