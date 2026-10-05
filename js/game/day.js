/* Daily Ten — 遊戲日（擁有者：game-designer）
   純函式：不讀時鐘（「現在」一律由呼叫端傳入）、不碰 DOM／localStorage／網路。
   遊戲日：本地時間 rolloverHour（預設 04:00）之前算前一天。跨時區時用「當地時間」：
     - 傳入 Date／毫秒數：用這台裝置目前的時區（打卡、記錄的當下就是當地）。
     - 已存的 ISO 字串（含 offset）：用字串本身的當地時間，不受裝置之後換時區影響。
   對外：
     DEFAULT_ROLLOVER_HOUR = 4
     rolloverHour(rules)       → rules.day.rolloverHour（無效時 4）
     toDate(now)               → Date | null（接受 Date、毫秒數、可解析的字串；無效回 null，不改用現在時間）
     gameDate(now, rules)      → 'YYYY-MM-DD' | null
     parseIso(iso)             → {date, minutes, ms} | null：date／minutes 取字串裡的當地日期與分鐘（秒數不計），ms 為絕對時間
     gameDateOfIso(iso, rules) → 'YYYY-MM-DD' | null（用字串裡的當地時間判斷換日）
     dateOfStamp(v, rules)     → 'YYYY-MM-DD' 原樣；ISO 時間 → 它的遊戲日；其他 → null
     addDays(date, n)、daysBetween(a, b)（= b − a）、weekdayOf(date)（0 = 日 … 6 = 六）
     dayNumber／dayNumberToStr／isValidDateStr：轉出 js/state/time.js 的同名函式 */
import { isValidDateStr, dayNumber, dayNumberToStr } from '../state/time.js';

export { isValidDateStr, dayNumber, dayNumberToStr };

export const DEFAULT_ROLLOVER_HOUR = 4;

const pad = (n, w = 2) => String(n).padStart(w, '0');
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})?$/;

export function rolloverHour(rules) {
  const day = rules !== null && typeof rules === 'object' ? rules.day : undefined;
  const h = day !== null && typeof day === 'object' ? day.rolloverHour : undefined;
  return Number.isInteger(h) && h >= 0 && h <= 23 ? h : DEFAULT_ROLLOVER_HOUR;
}

export function toDate(now) {
  let d = null;
  if (Object.prototype.toString.call(now) === '[object Date]') d = now;
  else if (typeof now === 'number' && Number.isFinite(now)) d = new Date(now);
  else if (typeof now === 'string' && now.trim()) d = new Date(now);
  return d && Number.isFinite(d.getTime()) ? d : null;
}

export function addDays(date, n) {
  if (!isValidDateStr(date) || !Number.isFinite(n)) return null;
  return dayNumberToStr(dayNumber(date) + Math.trunc(n));
}

export function daysBetween(a, b) {
  return isValidDateStr(a) && isValidDateStr(b) ? dayNumber(b) - dayNumber(a) : NaN;
}

export function weekdayOf(date) {
  if (!isValidDateStr(date)) return null;
  return (((dayNumber(date) + 4) % 7) + 7) % 7; // 1970-01-01 是週四
}

export function gameDate(now, rules) {
  const d = toDate(now);
  if (!d) return null;
  const local = `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  if (!isValidDateStr(local)) return null;
  return d.getHours() < rolloverHour(rules) ? addDays(local, -1) : local;
}

export function parseIso(iso) {
  if (typeof iso !== 'string') return null;
  const m = ISO_RE.exec(iso.trim());
  if (!m) return null;
  const date = `${m[1]}-${m[2]}-${m[3]}`;
  if (!isValidDateStr(date)) return null;
  const y = Number(m[1]), mo = Number(m[2]) - 1, d = Number(m[3]);
  const hh = Number(m[4]), mi = Number(m[5]), ss = m[6] ? Number(m[6]) : 0;
  if (hh > 23 || mi > 59 || ss > 59) return null;
  let ms;
  if (m[7]) {
    let off = 0;
    if (m[7] !== 'Z') {
      const oh = Number(m[7].slice(1, 3)), om = Number(m[7].slice(4, 6));
      if (oh > 18 || om > 59) return null;
      off = (m[7][0] === '-' ? -1 : 1) * (oh * 60 + om);
    }
    const t = new Date(0);
    t.setUTCFullYear(y, mo, d); // 不用 Date.UTC：0–99 年不會被當成 1900 年代
    t.setUTCHours(hh, mi, ss, 0);
    ms = t.getTime() - off * 60000;
  } else {
    const t = new Date(2000, 0, 1, hh, mi, ss, 0); // 沒有 offset：當成這台裝置的當地時間
    t.setFullYear(y, mo, d);
    t.setHours(hh, mi, ss, 0);
    ms = t.getTime();
  }
  if (!Number.isFinite(ms)) return null;
  return { date, minutes: hh * 60 + mi, ms };
}

export function gameDateOfIso(iso, rules) {
  const p = parseIso(iso);
  if (!p) return null;
  return p.minutes < rolloverHour(rules) * 60 ? addDays(p.date, -1) : p.date;
}

export function dateOfStamp(v, rules) {
  if (isValidDateStr(v)) return v;
  return gameDateOfIso(v, rules);
}
