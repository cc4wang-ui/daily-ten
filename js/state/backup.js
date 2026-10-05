/* Daily Ten — 備份下載、匯入（驗證 → 差異預覽 → 確認後才覆蓋）、備份提醒（擁有者：data-guardian）
   import 時不碰 window / localStorage / document / navigator。任何函式都不丟例外到 UI。
   對外：
     isoLocal(date)、localDateStr(date)          （re-export 自 time.js）
     BACKUP_REMINDER_DAYS = 7、IMPORT_MAX_CHARS = 5,000,000、PRE_IMPORT_KEY
     backupFilename(now)                          → 'daily-ten-backup-YYYY-MM-DD.json'
     buildBackup(state, now)                      → {filename, text, stamped}
                                                    stamped = migrate(state)（複製＋正規化＋mirrorLegacyToGame）→ meta.lastBackupAt = isoLocal(now)
                                                    正規化 = 下次載入時的修補結果；正常資料完全不變（遷移冪等）。
                                                    畫面若在記憶體寫進格式不對的值（例如清空的就寢時間 ''），
                                                    備份檔仍一定能通過 parseImport 的嚴格驗證。
                                                    text = JSON.stringify(stamped, null, 2)；備份檔內容 = 儲存後的 state
     downloadBackup({now}={})                     → Promise<{ok:true, method:'download'|'share', filename}
                                                    | {ok:false, reason:'cancelled'|'error', message}>
                                                    觸控裝置且可分享檔案 → navigator.share（iPhone 可「儲存到檔案」）；
                                                    否則 Blob + <a download>。成功才寫入 meta.lastBackupAt 並儲存。
     needsBackupReminder(state, now)              → boolean：有紀錄且（從未備份或距上次備份超過 7 天）
                                                    state 省略時用 getState()；也接受 needsBackupReminder(now)
     parseImport(text, {now}={})                  → {ok:true, incoming, summary} | {ok:false, errors:[{code,path,message}]}（最多 10 筆）
                                                    code：too_large | not_json | missing_field | invalid_type | out_of_range
                                                    不改動目前 state、不寫 storage。
     diffSummary(current, incoming, {fromVersion}={}) → {rows:[{key,label,current,incoming,changed}], warnings:[string]}
     applyImport(incoming)                        → Promise<boolean>：覆蓋前先把目前資料存到 PRE_IMPORT_KEY，
                                                    再 setState ＋ saveState；儲存失敗時記憶體中的資料不變。
     downloadRawBackup(backupKey, {now}={})       → {ok, filename?, message?}：把 localStorage 該 key 的原始字串
                                                    下載成 'daily-ten-raw-YYYY-MM-DD.txt'（原資料可能不是合法 JSON） */
import { getState, setState, saveState, STORAGE_KEY } from './store.js';
import { isPlainObject, validateImport } from './schema.js';
import { migrate } from './migrate.js';
import { isoLocal, localDateStr, isValidDateStr } from './time.js';

export { isoLocal, localDateStr };

export const BACKUP_REMINDER_DAYS = 7;
export const IMPORT_MAX_CHARS = 5000000;
export const PRE_IMPORT_KEY = `${STORAGE_KEY}.pre-import`;

const DAY_MS = 86400000;
const MAX_IMPORT_ERRORS = 10;
const REVOKE_DELAY_MS = 30000; // iOS Safari 下載較慢，延後釋放 blob URL
const JSON_MIME = 'application/json';
const TEXT_MIME = 'text/plain;charset=utf-8';

function local() {
  try { return typeof localStorage !== 'undefined' && localStorage ? localStorage : null; } catch (e) { return null; }
}
function toTime(now) {
  const t = now instanceof Date ? now.getTime() : new Date(now ?? Date.now()).getTime();
  return Number.isFinite(t) ? t : Date.now();
}

/* ---------- 備份檔 ---------- */
export function backupFilename(now = new Date()) {
  return `daily-ten-backup-${localDateStr(now)}.json`;
}

export function buildBackup(state, now = new Date()) {
  if (!isPlainObject(state)) throw new TypeError('buildBackup 需要 state 物件');
  const stamped = migrate(state, { now }).state; // 新物件；不改動傳入的 state
  if (!isPlainObject(stamped.meta)) stamped.meta = { lastBackupAt: null };
  stamped.meta.lastBackupAt = isoLocal(now);
  return { filename: backupFilename(now), text: JSON.stringify(stamped, null, 2), stamped };
}

function triggerDownload(text, filename, mime) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    (document.body || document.documentElement).appendChild(a);
    a.click();
    a.remove();
  } finally {
    const timer = setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
    if (timer && typeof timer.unref === 'function') timer.unref(); // 只在 Node 有：不讓計時器卡住測試程序
  }
}

/* → 'share' | 'download' | 'cancelled'；下載本身失敗時丟出，由呼叫端轉成 {ok:false} */
async function deliver(text, filename, mime) {
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  let file = null;
  let share = false;
  try {
    file = typeof File === 'function' ? new File([text], filename, { type: mime }) : null;
    share = !!(file && nav && typeof nav.share === 'function' && typeof nav.canShare === 'function'
      && nav.canShare({ files: [file] }) && nav.maxTouchPoints > 0);
  } catch (e) {
    share = false;
  }
  if (share) {
    try {
      await nav.share({ files: [file] });
      return 'share';
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
      /* 其他錯誤（例如權限）→ 改用一般下載 */
    }
  }
  triggerDownload(text, filename, mime);
  return 'download';
}

export async function downloadBackup({ now = new Date() } = {}) {
  try {
    const current = getState();
    if (!isPlainObject(current)) return { ok: false, reason: 'error', message: '目前沒有可備份的資料' };
    const { filename, text, stamped } = buildBackup(current, now);
    const method = await deliver(text, filename, JSON_MIME);
    if (method === 'cancelled') return { ok: false, reason: 'cancelled', message: '已取消備份' };
    setState(stamped);
    await saveState();
    return { ok: true, method, filename };
  } catch (e) {
    return { ok: false, reason: 'error', message: '備份檔產生失敗，請再試一次' };
  }
}

export function downloadRawBackup(backupKey, { now = new Date() } = {}) {
  try {
    const ls = local();
    const raw = ls && typeof backupKey === 'string' && backupKey ? ls.getItem(backupKey) : null;
    if (raw === null) return { ok: false, message: '找不到另存的原始資料' };
    const filename = `daily-ten-raw-${localDateStr(now)}.txt`;
    triggerDownload(raw, filename, TEXT_MIME);
    return { ok: true, filename };
  } catch (e) {
    return { ok: false, message: '原始資料下載失敗，請再試一次' };
  }
}

/* ---------- 備份提醒 ---------- */
const nonEmpty = (a) => Array.isArray(a) && a.length > 0;
const anyBucket = (o) => isPlainObject(o) && Object.values(o).some(nonEmpty);

function hasRecords(state) {
  if (nonEmpty(state.sessions) || anyBucket(state.prs) || anyBucket(state.body)) return true;
  if (isPlainObject(state.habits)) {
    for (const h of Object.values(state.habits)) if (isPlainObject(h) && nonEmpty(h.log)) return true;
  }
  return false;
}

export function needsBackupReminder(state = getState(), now = new Date()) {
  if (state instanceof Date) return needsBackupReminder(getState(), state); // 也接受 needsBackupReminder(now)
  if (!isPlainObject(state) || !hasRecords(state)) return false;
  const last = isPlainObject(state.meta) ? state.meta.lastBackupAt : null;
  const t = typeof last === 'string' ? Date.parse(last) : NaN;
  if (!Number.isFinite(t)) return true;
  return toTime(now) - t > BACKUP_REMINDER_DAYS * DAY_MS;
}

/* ---------- 匯入 ---------- */
const importError = (code, message) => ({ ok: false, errors: [{ code, path: '', message }] });

export function parseImport(text, { now = new Date() } = {}) {
  try {
    if (typeof text !== 'string') return importError('not_json', '讀不到檔案內容，請確認選的是 Daily Ten 的備份檔（.json）');
    if (text.length > IMPORT_MAX_CHARS) return importError('too_large', '檔案太大（超過 5,000,000 字元），不是 Daily Ten 的備份檔');
    let obj;
    try {
      obj = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
    } catch (e) {
      return importError('not_json', '檔案不是有效的 JSON 格式，可能已損壞或不是 Daily Ten 的備份檔');
    }
    const checked = validateImport(obj);
    if (!checked.ok) return { ok: false, errors: checked.errors.slice(0, MAX_IMPORT_ERRORS) };
    const { state: incoming, fromVersion } = migrate(obj, { now });
    return { ok: true, incoming, summary: diffSummary(getState(), incoming, { fromVersion }) };
  } catch (e) {
    return importError('migrate', '無法轉換這份資料的格式，目前的資料沒有任何變更');
  }
}

const count = (a) => (Array.isArray(a) ? a.length : 0);
const countBuckets = (o) => (isPlainObject(o) ? Object.values(o).reduce((n, a) => n + count(a), 0) : 0);
const pad = (n) => String(n).padStart(2, '0');

function lastSessionDate(state) {
  let last = null;
  if (Array.isArray(state.sessions)) {
    for (const s of state.sessions) if (s && isValidDateStr(s.date) && (last === null || s.date > last)) last = s.date;
  }
  return last;
}

/* 預覽只列「存起來的事實」：XP 與連續天數由 engine 從紀錄推導（畫面上的數字），
   legacy 的 xp／streak 只為舊版 App 保留（D12），列出來會和畫面矛盾，所以不列（QA V1 BUG-1） */
function summarize(state) {
  if (!isPlainObject(state)) return null;
  const habits = isPlainObject(state.habits) ? state.habits : {};
  const sleep = isPlainObject(habits.sleep) ? habits.sleep : {};
  return {
    version: state.version,
    level: state.level,
    lastSession: lastSessionDate(state),
    sessions: count(state.sessions),
    prs: countBuckets(state.prs),
    body: countBuckets(state.body),
    sleepLog: count(sleep.log),
    lastBackupAt: isPlainObject(state.meta) ? state.meta.lastBackupAt : null
  };
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
function backupText(v) {
  if (v === null || v === undefined) return '從未備份';
  const t = typeof v === 'string' ? Date.parse(v) : NaN;
  if (!Number.isFinite(t)) return '無法辨識';
  const d = new Date(t);
  return `${localDateStr(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const ROWS = [
  ['version', '版本', (s, o) => (isNum(s.version) ? (o.fromVersion && o.fromVersion !== s.version ? `v${o.fromVersion} → v${s.version}` : `v${s.version}`) : '—')],
  ['level', '課表強度', (s) => (isNum(s.level) ? `L${s.level}` : '—')], // 不叫「等級」：遊戲等級是 Lv N
  ['lastSession', '最後訓練日', (s) => s.lastSession || '—'],
  ['sessions', '訓練紀錄筆數', (s) => `${s.sessions} 筆`],
  ['prs', 'PR 筆數', (s) => `${s.prs} 筆`],
  ['body', '身體指標筆數', (s) => `${s.body} 筆`],
  ['sleepLog', '睡眠紀錄筆數', (s) => `${s.sleepLog} 筆`],
  ['lastBackup', '最後備份', (s) => backupText(s.lastBackupAt)]
];
const COUNT_WARNINGS = [['sessions', '訓練紀錄'], ['prs', 'PR 紀錄'], ['body', '身體指標紀錄'], ['sleepLog', '睡眠紀錄']];

export function diffSummary(current, incoming, { fromVersion } = {}) {
  const cur = summarize(current);
  const inc = summarize(incoming);
  const rows = ROWS.map(([key, label, show]) => {
    const a = cur ? show(cur, {}) : '—';
    const b = inc ? show(inc, { fromVersion }) : '—';
    return { key, label, current: a, incoming: b, changed: a !== b };
  });
  const warnings = [];
  if (cur && inc) {
    for (const [key, name] of COUNT_WARNINGS) {
      if (inc[key] < cur[key]) warnings.push(`${name}會從 ${cur[key]} 筆變成 ${inc[key]} 筆`);
    }
    if (cur.lastSession && inc.lastSession && inc.lastSession < cur.lastSession) {
      warnings.push(`匯入檔的最後訓練日（${inc.lastSession}）比目前（${cur.lastSession}）舊`);
    }
  }
  return { rows, warnings };
}

export async function applyImport(incoming) {
  try {
    if (!isPlainObject(incoming)) return false;
    const next = migrate(incoming).state; // 冪等；確保寫入的一定是完整 v3
    const prev = getState();
    try {
      const ls = local();
      if (ls && isPlainObject(prev)) ls.setItem(PRE_IMPORT_KEY, JSON.stringify(prev));
    } catch (e) { /* 盡力而為：空間不足時仍照常匯入 */ }
    setState(next);
    const ok = await saveState();
    if (!ok) setState(prev);
    return ok;
  } catch (e) {
    return false;
  }
}
