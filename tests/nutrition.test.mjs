/* Daily Ten — 營養工具卡單元測試（node --test）：資料檔與契約逐字相同、逐餐合計、換日重置、7 天平均與每週調整規則、
   舊資料預設值與壞資料清理、營養不影響 XP、文案禁用字。 */
process.env.TZ = 'Asia/Tokyo';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mealDay, weightTrend } from '../js/game/nutrition.js';
import { defaultV4, parseV4, ensureV4, parseNutrition, toggleMeal, setWeight, logStretch } from '../js/state/v4.js';
import { summarize, gameDay } from '../js/game/core.js';
import { dayNumber, dayNumberToStr } from '../js/state/time.js';

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url), 'utf8'));
const cfg = read('nutrition'), rules = read('game'), ach = read('achievements').items;
const TODAY = '2026-11-19';
const back = (n) => dayNumberToStr(dayNumber(TODAY) - n);
/* 產生體重紀錄：fn(幾天前) → kg；null 表示那天沒記 */
const series = (days, fn) => Array.from({ length: days }, (_, i) => ({ date: back(i), kg: fn(i) })).filter((w) => w.kg !== null);
/* 三個 7 天區間各給一個固定體重（區間 0＝最近 7 天） */
const weeks = (...kgs) => series(kgs.length * 7, (i) => kgs[Math.floor(i / 7)]);

test('資料檔與契約的營養指引表逐字相同', () => {
  assert.deepEqual(cfg.target, { kcal: 3400, proteinG: 175, fatG: 90, carbG: 470 });
  assert.deepEqual(cfg.meals.map((m) => [m.label, m.kcal, m.example]), [
    ['早餐', 700, '燕麥或飯、3 顆蛋、牛乳'],
    ['午餐', 800, '飯、肉或魚、納豆、湯'],
    ['16:30 點心', 500, '飯糰 2 個加牛乳'],
    ['晚餐', 900, '飯、肉或魚、蔬菜、橄欖油'],
    ['睡前', 500, '牛乳、優格、香蕉、堅果']
  ]);
  assert.equal(cfg.meals.reduce((a, m) => a + m.kcal, 0), 3400);
  assert.equal(cfg.target.proteinG * 4 + cfg.target.fatG * 9 + cfg.target.carbG * 4, 3390);
  assert.equal(cfg.weight.holdMinKg, 0.2);
  assert.equal(cfg.weight.holdMaxKg, 0.5);
  assert.equal(cfg.weight.stepKcal, 150);
  assert.equal(cfg.weight.stepCarbG, 40);
  assert.equal(cfg.weight.lowWeeksNeeded, 2);
  assert.equal(cfg.weight.minSpanDays, 14);
  assert.equal(cfg.copy.rule, '7 天平均每週 +0.2 到 +0.4 kg：不動。連續 2 週低於 +0.2 kg：每天加 150 kcal（碳水約 +40 g）。每週高於 +0.5 kg：每天減 150 kcal。');
  assert.equal(cfg.copy.tip, '吃不完時先加液體熱量（牛乳、燕麥、橄欖油）。');
  assert.match(cfg.copy.pace, /每週 0\.22–0\.43 kg/);
  assert.match(cfg.copy.disclaimer, /不是醫療建議/);
});

test('文案禁用字：資料檔與畫面程式不出現醫療、懲罰字樣', () => {
  const banned = [/診斷/, /失敗/, /懲罰/, /偷懶/, /沒做到/, /漏掉/, /扣分/, /治療/, /處方/];
  for (const f of ['../data/nutrition.json', '../js/ui/nutrition.js']) {
    const text = readFileSync(new URL(f, import.meta.url), 'utf8');
    for (const re of banned) assert.equal(re.test(text), false, `${f} 含 ${re}`);
  }
});

test('逐餐打勾：合計即時算出；再點一次取消；不認得的 id 不算', () => {
  const v4 = defaultV4();
  assert.equal(mealDay(parseNutrition(v4.nutrition), TODAY, cfg).kcal, 0);
  assert.equal(toggleMeal(v4, TODAY, 'breakfast'), true);
  assert.equal(toggleMeal(v4, TODAY, 'dinner'), true);
  let day = mealDay(parseNutrition(v4.nutrition), TODAY, cfg);
  assert.equal(day.kcal, 1600);
  assert.equal(day.count, 2);
  assert.equal(day.targetKcal, 3400);
  assert.deepEqual(day.meals.map((m) => m.done), [true, false, false, true, false]);
  assert.equal(toggleMeal(v4, TODAY, 'breakfast'), false);
  assert.equal(mealDay(parseNutrition(v4.nutrition), TODAY, cfg).kcal, 900);
  toggleMeal(v4, TODAY, 'dinner');
  assert.deepEqual(v4.nutrition.meals, {});
  for (const m of cfg.meals) toggleMeal(v4, TODAY, m.id);
  v4.nutrition.meals[TODAY].push('ghost');
  day = mealDay(parseNutrition(v4.nutrition), TODAY, cfg);
  assert.equal(day.kcal, 3400);
  assert.equal(day.count, 5);
});

test('隔天自動重置：以遊戲日為 key，04:00 換日', () => {
  const v4 = defaultV4();
  const d1 = gameDay(new Date('2026-11-20T03:59:00+09:00'), rules);
  const d2 = gameDay(new Date('2026-11-20T04:00:00+09:00'), rules);
  assert.equal(d1, '2026-11-19');
  assert.equal(d2, '2026-11-20');
  toggleMeal(v4, d1, 'breakfast');
  assert.equal(mealDay(parseNutrition(v4.nutrition), d1, cfg).kcal, 700);
  assert.equal(mealDay(parseNutrition(v4.nutrition), d2, cfg).kcal, 0);
  assert.deepEqual(v4.nutrition.meals[d1], ['breakfast']); // 前一天的紀錄還在，只是不算進今天
});

test('體重：一天一筆、重記覆蓋、null 刪除；7 天平均', () => {
  const v4 = defaultV4();
  setWeight(v4, { date: back(1), kg: 86.0, now: new Date('2026-11-18T07:00:00+09:00') });
  setWeight(v4, { date: TODAY, kg: 86.7, now: new Date('2026-11-19T07:00:00+09:00') });
  setWeight(v4, { date: TODAY, kg: 87.0, now: new Date('2026-11-19T07:05:00+09:00') });
  assert.deepEqual(v4.nutrition.weights.map((w) => [w.date, w.kg]), [[back(1), 86.0], [TODAY, 87.0]]);
  assert.equal(v4.nutrition.weights[1].at, '2026-11-19T07:05:00+09:00');
  const tr = weightTrend(parseNutrition(v4.nutrition).weights, TODAY, cfg);
  assert.equal(tr.avg7, 86.5);
  assert.equal(tr.today, 87.0);
  assert.equal(tr.advice, 'more-data');
  assert.equal(tr.change, null);
  assert.equal(tr.daysNeeded, 12);
  setWeight(v4, { date: TODAY, kg: null });
  assert.deepEqual(v4.nutrition.weights.map((w) => w.date), [back(1)]);
});

test('資料不足 14 天：只說再記幾天，不給加減建議', () => {
  assert.equal(weightTrend([], TODAY, cfg).advice, 'more-data');
  assert.equal(weightTrend([], TODAY, cfg).avg7, null);
  const d13 = weightTrend(series(13, (i) => 86 + i * -0.2), TODAY, cfg);
  assert.equal(d13.advice, 'more-data');
  assert.equal(d13.change, null);
  assert.equal(d13.daysNeeded, 1);
  assert.equal(weightTrend(series(14, (i) => (i < 7 ? 87 : 86)), TODAY, cfg).advice, 'down'); // 滿 14 天才開始判斷
  /* 滿 14 天但上一個區間只有 3 筆 → 仍然資料不足 */
  const sparse = weightTrend(series(14, (i) => (i < 7 ? 87 : i >= 11 ? 86 : null)), TODAY, cfg);
  assert.equal(sparse.advice, 'more-data');
  assert.equal(sparse.daysNeeded, 0);
  /* 未來日期的紀錄不算 */
  assert.equal(weightTrend([{ date: dayNumberToStr(dayNumber(TODAY) + 1), kg: 90 }], TODAY, cfg).entries, 0);
});

test('每週調整規則：不動／再觀察／+150／−150，含邊界', () => {
  const adv = (...kgs) => weightTrend(weeks(...kgs), TODAY, cfg);
  assert.equal(adv(86.3, 86.0).advice, 'hold');
  assert.equal(adv(86.3, 86.0).change, 0.3);
  assert.equal(adv(86.2, 86.0).advice, 'hold'); // 剛好 +0.2：不動
  assert.equal(adv(86.4, 86.0).advice, 'hold');
  assert.equal(adv(86.45, 86.0).advice, 'hold'); // +0.4 到 +0.5 之間：不動（⚠️ 假設）
  assert.equal(adv(86.5, 86.0).advice, 'hold'); // 剛好 +0.5：不動（「高於」才減）
  assert.equal(adv(86.51, 86.0).advice, 'down');
  assert.equal(adv(87.0, 86.0).advice, 'down');
  assert.equal(adv(87.0, 86.0).stepKcal, 150);
  assert.equal(adv(86.1, 86.0).advice, 'watch'); // 只看得到 1 週偏低：不加，再觀察
  assert.equal(adv(86.19, 86.0).advice, 'watch');
  assert.equal(adv(86.1, 86.0, 85.5).advice, 'watch'); // 上一週 +0.5 不算低 → 還不到連續 2 週
  assert.equal(adv(86.1, 86.0, 85.9).advice, 'up'); // 連續 2 週低於 +0.2
  assert.equal(adv(85.8, 86.0, 86.1).advice, 'up'); // 體重下降也算低於 +0.2
  assert.equal(adv(86.1, 86.0, 85.9).stepCarbG, 40);
  assert.equal(adv(86.3, 86.0, 85.9).advice, 'hold'); // 這週回到範圍內就不動
});

test('舊資料：v4 沒有 nutrition 欄 → 補預設值，其他欄位不動；重跑不變（冪等）', () => {
  const v4 = defaultV4();
  delete v4.nutrition;
  logStretch(v4, { date: TODAY, variant: 'full', now: new Date(`${TODAY}T08:00:00+09:00`), seconds: 900 });
  const state = { version: 3, v4 };
  const before = JSON.stringify(v4.stretch);
  const r = ensureV4(state);
  assert.equal(r.created, false);
  assert.deepEqual(state.v4.nutrition, { meals: {}, weights: [] });
  assert.equal(JSON.stringify(state.v4.stretch), before);
  const snap = JSON.stringify(state);
  ensureV4(state);
  assert.equal(JSON.stringify(state), snap);
  assert.deepEqual(parseV4({ v4: { ...defaultV4(), nutrition: undefined } }).nutrition, { meals: {}, weights: [] });
  assert.deepEqual(parseV4({}).nutrition, { meals: {}, weights: [] });
});

test('壞資料清理：型別錯、日期錯、超出範圍的體重都過濾，不丟例外', () => {
  for (const bad of [null, 5, 'x', [], { meals: 'x', weights: 'y' }, { meals: [], weights: {} }]) assert.deepEqual(parseNutrition(bad), { meals: {}, weights: [] });
  const out = parseNutrition({
    meals: { '2026-11-19': ['breakfast', 'breakfast', 7, null, 'lunch'], '2026-13-40': ['dinner'], '2026-11-18': 'breakfast', '2026-11-17': [] },
    weights: [{ date: '2026-11-19', kg: 86.7 }, { date: '2026-11-18', kg: '86' }, { date: 'x', kg: 80 }, { date: '2026-11-17', kg: 5 }, { date: '2026-11-16', kg: NaN }, null, { date: '2026-11-15', kg: 85 }, { date: '2026-11-19', kg: 87.1 }]
  });
  assert.deepEqual(out.meals, { '2026-11-19': ['breakfast', 'lunch'] });
  assert.deepEqual(out.weights.map((w) => [w.date, w.kg]), [['2026-11-15', 85], ['2026-11-19', 87.1]]);
  /* 壞資料上也能寫入 */
  const v4 = { ...defaultV4(), nutrition: 'broken' };
  toggleMeal(v4, TODAY, 'lunch');
  setWeight(v4, { date: TODAY, kg: 86.7 });
  assert.deepEqual(v4.nutrition.meals, { [TODAY]: ['lunch'] });
});

test('營養是工具卡：打勾與體重不改變 XP、連續天數、成就', () => {
  const now = new Date(`${TODAY}T20:00:00+09:00`);
  const a = defaultV4(), b = defaultV4();
  for (const v of [a, b]) logStretch(v, { date: TODAY, variant: 'full', now: new Date(`${TODAY}T08:00:00+09:00`), seconds: 900 });
  for (const m of cfg.meals) toggleMeal(b, TODAY, m.id);
  setWeight(b, { date: TODAY, kg: 86.7 });
  const sa = summarize(parseV4({ v4: a }), { rules, achievements: ach, now });
  const sb = summarize(parseV4({ v4: b }), { rules, achievements: ach, now });
  assert.deepEqual(sb, sa);
});
