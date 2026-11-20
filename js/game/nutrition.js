/* Daily Ten — 營養工具卡的計算（純函式、決定性：不讀時鐘、不碰 DOM／localStorage／網路、不改動輸入）。
   所有數字來自 data/nutrition.json（cfg）。營養不計 XP、不算連續、不進成就（不經過 core.js）。
   輸入 nutrition 的形狀見 js/state/v4.js 的 parseV4().nutrition：{ meals: { 'YYYY-MM-DD': [mealId] }, weights: [{ date, kg }], entries?: { 'YYYY-MM-DD': [Entry] } }（date 都是遊戲日）。
   Entry＝{ id, at, slot: 餐 id 或 null, name, kcal, proteinG|null, fatG|null, carbG|null, source: 'photo'|'manual' }（契約 runs/photo-kcal/contract.md）。
   對外：mealDay(nutrition, date, cfg)、scaleEstimate(est, factor)、weightTrend(weights, today, cfg) */
import { dayNumber } from '../state/time.js';

const round = (n, digits) => { const f = 10 ** digits; return Math.round(n * f) / f; };

const MACROS = ['proteinG', 'fatG', 'carbG'];
/* 非負整數；不是有限數字（含 null、字串）→ 0 */
const nonNegInt = (n) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n) : 0);

/* 當天的實際攝取＝打勾的建議餐＋所有實際紀錄（拍照估算、手動輸入）。別天的不算（＝隔天自動重置）。
   - 一餐有實際紀錄 → 用實際紀錄合計，忽略打勾；沒有實際紀錄且打勾 → 用建議 kcal。
   - logged＝有實際紀錄或打勾；count＝logged 的餐數。done 仍然只代表「打勾」。
   - 打勾的建議餐：三大營養素＝每日目標 ×（該餐 kcal ÷ 5 餐 kcal 合計），四捨五入（估算）。
   - 實際紀錄沒填的營養素當 0，macrosPartial＝true。
   - slot 是 null 或不認得的餐 id → 放進 extras，照樣計入。
   - left 不小於 0。nutrition.entries 不存在（舊資料）時，結果與只算打勾相同。 */
export function mealDay(nutrition, date, cfg) {
  const target = cfg?.target || {};
  const cfgMeals = Array.isArray(cfg?.meals) ? cfg.meals : [];
  const checked = new Set(Array.isArray(nutrition?.meals?.[date]) ? nutrition.meals[date] : []);
  const raw = nutrition?.entries?.[date];
  const all = (Array.isArray(raw) ? raw : []).filter((e) => e && typeof e === 'object');
  const ids = new Set(cfgMeals.map((m) => m.id));
  const planKcal = cfgMeals.reduce((a, m) => a + nonNegInt(m.kcal), 0);
  const macros = { proteinG: 0, fatG: 0, carbG: 0 };
  let macrosPartial = false;
  const addEntries = (list) => {
    let kcal = 0;
    for (const e of list) {
      kcal += nonNegInt(e.kcal);
      for (const k of MACROS) {
        if (e[k] === null || e[k] === undefined) macrosPartial = true;
        else macros[k] += nonNegInt(e[k]);
      }
    }
    return kcal;
  };
  const meals = cfgMeals.map((m) => {
    const done = checked.has(m.id);
    const entries = all.filter((e) => e.slot === m.id);
    let kcalActual = 0;
    if (entries.length) kcalActual = addEntries(entries);
    else if (done) {
      kcalActual = nonNegInt(m.kcal);
      if (planKcal > 0) for (const k of MACROS) macros[k] += Math.round((nonNegInt(target[k]) * nonNegInt(m.kcal)) / planKcal);
    }
    return { ...m, done, entries, kcalActual, logged: done || entries.length > 0 };
  });
  const extras = all.filter((e) => !ids.has(e.slot));
  const kcal = meals.reduce((a, m) => a + m.kcalActual, 0) + addEntries(extras);
  const targetKcal = target.kcal ?? 0;
  return {
    date, targetKcal, kcal, count: meals.filter((m) => m.logged).length, meals, extras, macros, macrosPartial,
    left: { kcal: Math.max(0, targetKcal - kcal), proteinG: Math.max(0, nonNegInt(target.proteinG) - macros.proteinG) }
  };
}

/* 把伺服器估算 { items: [{ name, grams, kcal, proteinG, fatG, carbG }], kcal, proteinG, fatG, carbG } 依份量倍率換算。
   每個品項各自乘倍率後四捨五入成非負整數；合計＝換算後各品項相加（畫面上的明細加起來一定等於合計）。
   沒有品項但有合計 → 直接換算合計。倍率不是正的有限數字 → 當 1。輸入不是物件 → 回傳空的估算。不改動輸入。 */
export function scaleEstimate(est, factor) {
  const f = typeof factor === 'number' && Number.isFinite(factor) && factor > 0 ? factor : 1;
  const s = (n) => nonNegInt(nonNegInt(n) * f);
  const out = { items: [], kcal: 0, proteinG: 0, fatG: 0, carbG: 0 };
  if (!est || typeof est !== 'object' || Array.isArray(est)) return out;
  const items = (Array.isArray(est.items) ? est.items : []).filter((it) => it && typeof it === 'object' && !Array.isArray(it));
  out.items = items.map((it) => ({ name: typeof it.name === 'string' ? it.name : '', grams: s(it.grams), kcal: s(it.kcal), proteinG: s(it.proteinG), fatG: s(it.fatG), carbG: s(it.carbG) }));
  for (const k of ['kcal', ...MACROS]) out[k] = out.items.length ? out.items.reduce((a, it) => a + it[k], 0) : s(est[k]);
  return out;
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
