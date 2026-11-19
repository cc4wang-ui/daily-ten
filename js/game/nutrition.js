/* Daily Ten — 營養工具卡的計算（純函式、決定性：不讀時鐘、不碰 DOM／localStorage／網路、不改動輸入）。
   所有數字來自 data/nutrition.json（cfg）。營養不計 XP、不算連續、不進成就（不經過 core.js）。
   輸入 nutrition 的形狀見 js/state/v4.js 的 parseV4().nutrition：{ meals: { 'YYYY-MM-DD': [mealId] }, weights: [{ date, kg }] }（date 都是遊戲日）。
   對外：mealDay(nutrition, date, cfg)、weightTrend(weights, today, cfg) */
import { dayNumber } from '../state/time.js';

const round = (n, digits) => { const f = 10 ** digits; return Math.round(n * f) / f; };

/* 當天 5 餐的打勾狀態與已打勾 kcal 合計。別天的打勾不算（＝隔天自動重置）。 */
export function mealDay(nutrition, date, cfg) {
  const checked = new Set(Array.isArray(nutrition?.meals?.[date]) ? nutrition.meals[date] : []);
  const meals = (cfg?.meals || []).map((m) => ({ ...m, done: checked.has(m.id) }));
  const kcal = meals.reduce((a, m) => a + (m.done ? m.kcal : 0), 0);
  return { date, meals, kcal, count: meals.filter((m) => m.done).length, targetKcal: cfg?.target?.kcal ?? 0 };
}

/* 7 天平均與每週調整建議。
   區間 0＝today 往回 7 天、區間 1＝再往前 7 天、區間 2＝再往前 7 天。每週變化＝相鄰兩個區間平均的差（四捨五入到 0.01 kg 再比較）。
   advice：
     'more-data' 資料不足（第一筆到今天未滿 minSpanDays 天，或最近兩個區間有一個少於 minEntriesPerWindow 筆）→ 只請使用者再記幾天
     'hold'      每週變化在 holdMinKg–holdMaxKg（含）之間 → 不動
     'watch'     這週低於 holdMinKg，但上一週不低或還看不出來 → 不動，再觀察 1 週
     'up'        連續 lowWeeksNeeded 週低於 holdMinKg → 每天 +stepKcal
     'down'      這週高於 holdMaxKg → 每天 −stepKcal */
export function weightTrend(weights, today, cfg) {
  const W = cfg?.weight || {};
  const win = W.windowDays || 7, need = W.minEntriesPerWindow || 4, span = W.minSpanDays || 14;
  const t = dayNumber(today);
  const list = (Array.isArray(weights) ? weights : []).map((w) => ({ n: dayNumber(w.date), kg: w.kg })).filter((w) => Number.isFinite(w.n) && w.n <= t);
  const windowAvg = (i) => {
    const hi = t - i * win, lo = hi - win + 1;
    const xs = list.filter((w) => w.n >= lo && w.n <= hi);
    return { count: xs.length, avg: xs.length ? xs.reduce((a, w) => a + w.kg, 0) / xs.length : null };
  };
  const w0 = windowAvg(0), w1 = windowAvg(1), w2 = windowAvg(2);
  const first = list.length ? Math.min(...list.map((w) => w.n)) : null;
  const daysCovered = first === null ? 0 : t - first + 1;
  const todayEntry = list.find((w) => w.n === t) || null;
  const base = { today: todayEntry ? todayEntry.kg : null, avg7: w0.avg === null ? null : round(w0.avg, 1), entries: list.length, daysCovered, daysNeeded: Math.max(0, span - daysCovered), change: null, stepKcal: W.stepKcal || 0, stepCarbG: W.stepCarbG || 0 };
  if (daysCovered < span || w0.count < need || w1.count < need) return { ...base, advice: 'more-data' };
  const change = round(w0.avg - w1.avg, 2);
  const out = { ...base, daysNeeded: 0, change };
  if (change > W.holdMaxKg) return { ...out, advice: 'down' };
  if (change >= W.holdMinKg) return { ...out, advice: 'hold' };
  const prevLow = w2.count >= need && round(w1.avg - w2.avg, 2) < W.holdMinKg;
  return { ...out, advice: prevLow || (W.lowWeeksNeeded || 2) <= 1 ? 'up' : 'watch' };
}
