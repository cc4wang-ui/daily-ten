/* Daily Ten — 時間工具（擁有者：data-guardian）
   純函式；import 時不碰 window / localStorage / document，可在 Node 單元測試。
     isoLocal(date)        → '2026-10-02T15:30:00+09:00'（本地時區 offset，到秒）
     localDateStr(date)    → '2026-10-02'（本地日期）
     compactStamp(date)    → '20261002153000'（備份 key 用，本地時間）
     isValidDateStr(s)     → 是否為真實存在的 'YYYY-MM-DD'
     dayNumber(s)          → 'YYYY-MM-DD' 轉成日序整數（以 UTC 計算，與時區、夏令時間無關）
     dayNumberToStr(n)     → dayNumber 的反向
   無效的 date 參數一律改用「現在」，避免把 'NaN-NaN' 寫進資料。 */

const DAY_MS = 86400000;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (n, width = 2) => String(n).padStart(width, '0');

function toDate(date) {
  const d = date instanceof Date ? date : new Date(date ?? Date.now());
  return Number.isFinite(d.getTime()) ? d : new Date();
}

export function isoLocal(date = new Date()) {
  const d = toDate(date);
  const offset = -Math.round(d.getTimezoneOffset());
  const abs = Math.abs(offset);
  return `${localDateStr(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    + `${offset >= 0 ? '+' : '-'}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

export function localDateStr(date = new Date()) {
  const d = toDate(date);
  return `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function compactStamp(date = new Date()) {
  const d = toDate(date);
  return `${pad(d.getFullYear(), 4)}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
    + `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/* setUTCFullYear 不會把 0–99 年誤判成 1900 年代（Date.UTC 會） */
function utcDate(y, monthIndex, day) {
  const d = new Date(0);
  d.setUTCFullYear(y, monthIndex, day);
  return d;
}

export function isValidDateStr(s) {
  if (typeof s !== 'string') return false;
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), day = Number(m[3]);
  if (mo < 1 || mo > 12 || day < 1) return false;
  return day <= utcDate(y, mo, 0).getUTCDate();
}

export function dayNumber(s) {
  const m = DATE_RE.exec(s);
  if (!m) return NaN;
  return Math.round(utcDate(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime() / DAY_MS);
}

export function dayNumberToStr(n) {
  const d = new Date(n * DAY_MS);
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
