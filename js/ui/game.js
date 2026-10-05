/* Daily Ten — 遊戲層轉接（B1 契約，engine 由 game-designer、寫入由 data-guardian 提供）。
   js/app.js 開機時動態載入 js/game/rules.js、js/game/day.js、js/game/engine.js、js/habits/sleep.js、js/state/habits.js，
   loadRules() 成功才交給 setGame()；任何一個載入失敗或 loadRules() 回 null → 遊戲層「未就緒」：
   畫面隱藏三環、階段、早安打卡入口，其他功能照常（不白屏）。
   engine 是純函式，不碰 localStorage：這裡每次用 getState() 取目前的 state（匯入後會換成新物件）。
   engine 丟例外時只記 console.warn 並回 null／預設值，畫面改走沒有遊戲層的版本。
   遊戲日（G 規則 1：04:00 換日）：todayKey()／todayWeekday() 是訓練紀錄、今日課表、Boss 輪替、日期標題共用的「今天」；
   遊戲層未就緒時退回日曆日（M1 行為）。 */
import { getState } from '../state/store.js';

let G = null; // { rules, day, engine, sleep, habits }

const pad = (n) => String(n).padStart(2, '0');
const calendarKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function setGame(mods) {
  const ok = !!mods && !!mods.rules && !!mods.engine && typeof mods.engine.todaySummary === 'function';
  G = ok ? mods : null;
  return ok;
}
export function gameReady() { return !!G; }
export function gameRules() { return G ? G.rules : null; }

function guard(label, fn, fallback) {
  if (!G) return fallback;
  try { return fn(); } catch (e) { console.warn(`遊戲層 ${label} 失敗`, e); return fallback; }
}

/* 今日總覽（契約 todaySummary）：失敗回 null */
export function summary(now = new Date()) {
  return guard('todaySummary', () => G.engine.todaySummary(getState(), now, G.rules) || null, null);
}

/* 早安打卡時段：{open, reason}；沒有 sleep 模組時當作關閉 */
export function checkInWindow(now = new Date()) {
  return guard('checkInWindow', () => {
    if (!G.sleep || typeof G.sleep.checkInWindow !== 'function') return { open: false, reason: '' };
    return G.sleep.checkInWindow(getState(), now, G.rules) || { open: false, reason: '' };
  }, { open: false, reason: '' });
}

/* 打卡內容與計分（還沒寫入）：{entry, score}；opts.lightsOut 'HH:MM' 可省略（＝就寢目標） */
export function buildCheckIn(now = new Date(), opts = {}) {
  return guard('buildCheckIn', () => G.sleep.buildCheckIn(getState(), now, G.rules, opts) || null, null);
}

/* 寫入（data-guardian：內部驗證＋saveState）。回傳可能是物件或 Promise，一律 await */
export async function addSleepEntry(entry) {
  if (!G || !G.habits || typeof G.habits.addSleepEntry !== 'function') return { ok: false, message: '目前無法記錄，請稍後再試。' };
  try {
    const r = await G.habits.addSleepEntry(entry);
    return r && typeof r === 'object' ? r : { ok: !!r };
  } catch (e) {
    console.warn('遊戲層 addSleepEntry 失敗', e);
    return { ok: false, message: '目前無法記錄，請稍後再試。' };
  }
}
export async function removeSleepEntry(date) {
  if (!G || !G.habits || typeof G.habits.removeSleepEntry !== 'function') return { ok: false };
  try {
    const r = await G.habits.removeSleepEntry(date);
    return r && typeof r === 'object' ? r : { ok: !!r };
  } catch (e) {
    console.warn('遊戲層 removeSleepEntry 失敗', e);
    return { ok: false };
  }
}

/* ---------- 遊戲日 ---------- */
/* 今天的日期鍵 'YYYY-MM-DD'：遊戲日（04:00 前算前一天）；遊戲層未就緒或算不出來時用日曆日 */
export function todayKey(now = new Date()) {
  if (G && G.day && typeof G.day.gameDate === 'function') {
    try {
      const k = G.day.gameDate(now, G.rules);
      if (typeof k === 'string' && KEY_RE.test(k)) return k;
    } catch (e) { console.warn('遊戲層 gameDate 失敗', e); }
  }
  return calendarKey(now instanceof Date ? now : new Date());
}
/* 日期鍵 → 當天中午的 Date（取星期、月日用；中午避開夏令時間換日） */
export function keyToDate(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}
export function todayWeekday(now = new Date()) { return keyToDate(todayKey(now)).getDay(); }

/* ---------- 其他 engine／寫入 API ---------- */
/* 累計 XP（新尺度，由紀錄推導）；遊戲層未就緒回 null */
export function totalXp(now = new Date()) {
  const s = summary(now);
  return s && s.xp && Number.isFinite(s.xp.total) ? s.xp.total : null;
}
/* AFT 自選目標差距（engine.aftGaps：歷來最佳、門檻與文案在 data/game.json）；未就緒回 null */
export function aftGaps() {
  return guard('aftGaps', () => (typeof G.engine.aftGaps === 'function' ? G.engine.aftGaps(getState(), G.rules) : null), null);
}
/* 匯入成功後補 phase.startedAt（只改記憶體，下一次 saveState 寫入；已有值不覆寫） */
export function ensurePhaseStarted(now = new Date()) {
  if (!G || !G.habits || typeof G.habits.ensurePhaseStarted !== 'function') return null;
  try { return G.habits.ensurePhaseStarted(now); } catch (e) { console.warn('遊戲層 ensurePhaseStarted 失敗', e); return null; }
}
