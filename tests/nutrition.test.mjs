/* Daily Ten — 營養工具卡單元測試（node --test）：資料檔與契約逐字相同、逐餐合計、換日重置、7 天平均與每週調整規則、
   舊資料預設值與壞資料清理、營養不影響 XP、文案禁用字。 */
process.env.TZ = 'Asia/Tokyo';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mealDay, weightTrend, scaleEstimate } from '../js/game/nutrition.js';
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
/* 只比打勾與體重兩欄（entries 欄由 js/state/v4.js 另外補，見 tests 的 state 測試） */
const mw = (n) => ({ meals: n.meals, weights: n.weights });
let seq = 0;
const entry = (slot, kcal, macros = {}, extra = {}) => ({ id: `e${++seq}`, at: `${TODAY}T12:00:00+09:00`, slot, name: '測試餐', kcal, proteinG: 30, fatG: 10, carbG: 50, source: 'manual', ...macros, ...extra });

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
  /* 新增的照片估算文案：逐條檢查，另外不出現責備字樣；估算的說明要寫出「估算」 */
  const keys = ['photoPrivacy', 'photoAccuracy', 'offline', 'cap', 'notFood', 'failed', 'macrosPartial', 'planMacros'];
  const blame = [...banned, /錯誤/, /不合格/, /超標/, /吃太多/, /吃太少/, /過量/, /病/, /症/, /警告/, /必須/];
  for (const k of keys) {
    assert.equal(typeof cfg.copy[k], 'string', `copy.${k} 要有`);
    assert.ok(cfg.copy[k].length > 0 && cfg.copy[k].length <= 40, `copy.${k} 長度`);
    for (const re of blame) assert.equal(re.test(cfg.copy[k]), false, `copy.${k} 含 ${re}`);
  }
  for (const k of ['photoPrivacy', 'photoAccuracy', 'cap', 'planMacros']) assert.match(cfg.copy[k], /估算/);
  for (const k of ['offline', 'cap', 'notFood', 'failed']) assert.match(cfg.copy[k], /手動記/); // 每個失敗狀況都給手動輸入這條路
  for (const p of cfg.photo.portions) assert.equal(blame.some((re) => re.test(p.label)), false);
});

test('照片估算設定與契約逐字相同；版本 2', () => {
  assert.equal(cfg.version, 2);
  assert.deepEqual(cfg.photo, {
    endpoint: '/api/meal', maxEdgePx: 1024, jpegQuality: 0.8, timeoutMs: 60000,
    portions: [{ id: 'less', label: '少一點', factor: 0.75 }, { id: 'same', label: '剛好', factor: 1 }, { id: 'more', label: '多一點', factor: 1.25 }]
  });
});

test('實際紀錄蓋過打勾：該餐用實際紀錄合計，不重複計算', () => {
  const n = { meals: { [TODAY]: ['breakfast', 'lunch'] }, weights: [], entries: { [TODAY]: [entry('lunch', 650), entry('lunch', 120, { proteinG: 5, fatG: 2, carbG: 20 })] } };
  const snap = JSON.stringify(n);
  const day = mealDay(n, TODAY, cfg);
  assert.equal(JSON.stringify(n), snap); // 不改動輸入
  const lunch = day.meals.find((m) => m.id === 'lunch'), bf = day.meals.find((m) => m.id === 'breakfast');
  assert.equal(lunch.kcalActual, 770); // 不是建議的 800，也不是 800 + 770
  assert.equal(lunch.done, true);
  assert.equal(lunch.logged, true);
  assert.equal(lunch.entries.length, 2);
  assert.equal(bf.kcalActual, 700);
  assert.deepEqual(bf.entries, []);
  assert.equal(day.kcal, 1470);
  assert.equal(day.count, 2);
  /* 早餐按比例：175×700/3400＝36、90×700/3400＝19、470×700/3400＝97；午餐用實際紀錄 */
  assert.deepEqual(day.macros, { proteinG: 36 + 35, fatG: 19 + 12, carbG: 97 + 70 });
  assert.equal(day.macrosPartial, false);
  assert.deepEqual(day.left, { kcal: 3400 - 1470, proteinG: 175 - 71 });
  /* 沒打勾但有實際紀錄：也算記過 */
  const d2 = mealDay({ meals: {}, weights: [], entries: { [TODAY]: [entry('dinner', 1000)] } }, TODAY, cfg);
  const dinner = d2.meals.find((m) => m.id === 'dinner');
  assert.deepEqual([dinner.done, dinner.logged, dinner.kcalActual], [false, true, 1000]);
  assert.deepEqual([d2.kcal, d2.count], [1000, 1]);
  /* 沒記的餐 */
  assert.deepEqual(d2.meals.filter((m) => !m.logged).map((m) => m.kcalActual), [0, 0, 0, 0]);
});

test('其他：不屬於 5 餐的紀錄計入合計，不計入餐數；別天的不算', () => {
  const n = { meals: { [TODAY]: ['snack'] }, weights: [], entries: { [TODAY]: [entry(null, 250, {}, { source: 'photo' }), entry('ghost', 100)], [back(1)]: [entry(null, 999), entry('lunch', 999)] } };
  const day = mealDay(n, TODAY, cfg);
  assert.equal(day.extras.length, 2); // 不認得的餐 id 也歸在其他，不會憑空消失
  assert.equal(day.kcal, 500 + 250 + 100);
  assert.equal(day.count, 1);
  assert.equal(day.macros.proteinG, Math.round((175 * 500) / 3400) + 60);
  assert.equal(mealDay(n, back(1), cfg).kcal, 1998);
  assert.equal(mealDay(n, back(2), cfg).kcal, 0);
});

test('建議餐的營養素按熱量比例估算；5 餐全勾的合計與每日目標只差四捨五入', () => {
  const total = cfg.meals.reduce((a, m) => a + m.kcal, 0);
  for (const m of cfg.meals) {
    const d = mealDay({ meals: { [TODAY]: [m.id] }, weights: [] }, TODAY, cfg);
    for (const k of ['proteinG', 'fatG', 'carbG']) assert.equal(d.macros[k], Math.round((cfg.target[k] * m.kcal) / total), `${m.id} ${k}`);
    assert.equal(d.macrosPartial, false);
  }
  const all = mealDay({ meals: { [TODAY]: cfg.meals.map((m) => m.id) }, weights: [] }, TODAY, cfg);
  for (const k of ['proteinG', 'fatG', 'carbG']) assert.ok(Math.abs(all.macros[k] - cfg.target[k]) <= cfg.meals.length / 2, `${k} ${all.macros[k]}`);
  assert.equal(all.kcal, cfg.target.kcal);
  assert.equal(all.left.kcal, 0);
  assert.ok(all.left.proteinG <= 2);
  for (const k of ['proteinG', 'fatG', 'carbG']) assert.ok(Number.isInteger(all.macros[k]));
});

test('實際紀錄沒填營養素：當 0 計算，macrosPartial＝true', () => {
  const full = mealDay({ meals: {}, weights: [], entries: { [TODAY]: [entry('lunch', 800)] } }, TODAY, cfg);
  assert.equal(full.macrosPartial, false);
  const part = mealDay({ meals: {}, weights: [], entries: { [TODAY]: [entry('lunch', 800), entry(null, 300, { proteinG: null, fatG: null, carbG: null })] } }, TODAY, cfg);
  assert.equal(part.macrosPartial, true);
  assert.deepEqual(part.macros, { proteinG: 30, fatG: 10, carbG: 50 });
  assert.equal(part.kcal, 1100);
  /* 只缺一項也算 */
  assert.equal(mealDay({ meals: {}, weights: [], entries: { [TODAY]: [entry('lunch', 800, { fatG: null })] } }, TODAY, cfg).macrosPartial, true);
  /* 被實際紀錄蓋過的打勾不影響；只有打勾時不會是 partial */
  assert.equal(mealDay({ meals: { [TODAY]: ['lunch'] }, weights: [] }, TODAY, cfg).macrosPartial, false);
});

test('還差多少：不小於 0', () => {
  const empty = mealDay({ meals: {}, weights: [] }, TODAY, cfg);
  assert.deepEqual(empty.left, { kcal: 3400, proteinG: 175 });
  const over = mealDay({ meals: { [TODAY]: cfg.meals.map((m) => m.id) }, weights: [], entries: { [TODAY]: [entry(null, 5000, { proteinG: 500 })] } }, TODAY, cfg);
  assert.equal(over.kcal, 8400);
  assert.deepEqual(over.left, { kcal: 0, proteinG: 0 });
  /* 沒有設定檔也不丟例外、不出現負數或 NaN */
  const bare = mealDay({ meals: {}, weights: [], entries: { [TODAY]: [entry(null, 300)] } }, TODAY, undefined);
  assert.deepEqual([bare.kcal, bare.targetKcal, bare.count, bare.left.kcal, bare.left.proteinG], [300, 0, 0, 0, 0]);
});

test('舊資料沒有 entries：結果與只算打勾相同；壞的 entries 不丟例外', () => {
  const ticks = { [TODAY]: ['breakfast', 'dinner', 'ghost'] };
  const old = mealDay({ meals: ticks, weights: [] }, TODAY, cfg);
  /* 改版前的算法：打勾的建議 kcal 相加 */
  const legacyKcal = cfg.meals.reduce((a, m) => a + (ticks[TODAY].includes(m.id) ? m.kcal : 0), 0);
  assert.equal(old.kcal, legacyKcal);
  assert.equal(old.kcal, 1600);
  assert.equal(old.count, 2);
  assert.equal(old.targetKcal, 3400);
  assert.equal(old.date, TODAY);
  assert.deepEqual(old.meals.map((m) => m.done), [true, false, false, true, false]);
  assert.deepEqual(old.meals.map((m) => [m.id, m.label, m.kcal, m.example]), cfg.meals.map((m) => [m.id, m.label, m.kcal, m.example]));
  assert.deepEqual(old.extras, []);
  assert.equal(old.macrosPartial, false);
  for (const entries of [{}, { [TODAY]: [] }, null, 'x', 5, [], { [TODAY]: 'x' }, { [TODAY]: [null, 7, 'x'] }]) {
    assert.deepEqual(mealDay({ meals: ticks, weights: [], entries }, TODAY, cfg), old);
  }
  for (const n of [null, undefined, 5, 'x', {}]) assert.equal(mealDay(n, TODAY, cfg).kcal, 0);
  /* 欄位值壞掉的紀錄：當 0，不出現負數或 NaN */
  const bad = mealDay({ meals: {}, weights: [], entries: { [TODAY]: [{ slot: 'lunch', kcal: -50, proteinG: 'x', fatG: NaN, carbG: -3 }, { slot: null, kcal: '300' }] } }, TODAY, cfg);
  assert.equal(bad.kcal, 0);
  assert.deepEqual(bad.macros, { proteinG: 0, fatG: 0, carbG: 0 });
});

test('scaleEstimate：依份量倍率換算成整數，合計＝各品項相加', () => {
  const est = { isFood: true, confidence: 'mid', kcal: 405, proteinG: 33, fatG: 19, carbG: 22, items: [{ name: '雞胸肉', grams: 120, kcal: 198, proteinG: 31, fatG: 7, carbG: 0 }, { name: '沙拉', grams: 150, kcal: 207, proteinG: 2, fatG: 12, carbG: 22 }] };
  const snap = JSON.stringify(est);
  const same = scaleEstimate(est, 1);
  assert.deepEqual(same, { items: est.items, kcal: 405, proteinG: 33, fatG: 19, carbG: 22 });
  assert.equal(JSON.stringify(est), snap); // 不改動輸入
  assert.notEqual(same.items[0], est.items[0]);
  for (const p of cfg.photo.portions) {
    const out = scaleEstimate(est, p.factor);
    assert.deepEqual(out.items.map((it) => it.name), ['雞胸肉', '沙拉']);
    for (const k of ['kcal', 'proteinG', 'fatG', 'carbG']) {
      assert.equal(out[k], out.items.reduce((a, it) => a + it[k], 0), `${p.id} ${k}`);
      for (const [i, it] of out.items.entries()) assert.equal(it[k], Math.round(est.items[i][k] * p.factor));
    }
    for (const it of out.items) for (const v of [it.grams, it.kcal, it.proteinG, it.fatG, it.carbG]) assert.ok(Number.isInteger(v) && v >= 0);
  }
  assert.deepEqual(scaleEstimate(est, 0.75).items[0], { name: '雞胸肉', grams: 90, kcal: 149, proteinG: 23, fatG: 5, carbG: 0 });
  assert.equal(scaleEstimate(est, 0.75).kcal, 149 + 155);
  assert.equal(scaleEstimate(est, 1.25).kcal, 248 + 259);
  /* 伺服器的合計與品項不一致時，以品項相加為準 */
  assert.equal(scaleEstimate({ ...est, kcal: 9999 }, 1).kcal, 405);
  /* 沒有品項但有合計：直接換算合計 */
  assert.deepEqual(scaleEstimate({ items: [], kcal: 401, proteinG: 30, fatG: 10, carbG: 50 }, 1.25), { items: [], kcal: 501, proteinG: 38, fatG: 13, carbG: 63 });
  assert.deepEqual(scaleEstimate({ kcal: 400 }, 0.75), { items: [], kcal: 300, proteinG: 0, fatG: 0, carbG: 0 });
});

test('scaleEstimate：壞輸入回傳空的估算，不丟例外、不出現負數或 NaN', () => {
  const empty = { items: [], kcal: 0, proteinG: 0, fatG: 0, carbG: 0 };
  for (const bad of [null, undefined, 5, 'x', [], true]) assert.deepEqual(scaleEstimate(bad, 1), empty);
  assert.deepEqual(scaleEstimate({}, 1), empty);
  assert.deepEqual(scaleEstimate({ items: 'x', kcal: 'abc', proteinG: -5, fatG: NaN, carbG: Infinity }, 1), empty);
  const out = scaleEstimate({ items: [null, 7, 'x', [], { name: 9, grams: -10, kcal: -200, proteinG: 'x', fatG: NaN }, { name: '飯', kcal: 280.6 }] }, 1);
  assert.deepEqual(out.items, [{ name: '', grams: 0, kcal: 0, proteinG: 0, fatG: 0, carbG: 0 }, { name: '飯', grams: 0, kcal: 281, proteinG: 0, fatG: 0, carbG: 0 }]);
  assert.equal(out.kcal, 281);
  /* 倍率不是正的有限數字 → 當 1 */
  for (const f of [0, -1, NaN, Infinity, null, undefined, '2']) assert.equal(scaleEstimate({ items: [{ name: '飯', kcal: 280 }] }, f).kcal, 280);
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
  assert.deepEqual(mw(state.v4.nutrition), { meals: {}, weights: [] });
  assert.equal(JSON.stringify(state.v4.stretch), before);
  const snap = JSON.stringify(state);
  ensureV4(state);
  assert.equal(JSON.stringify(state), snap);
  assert.deepEqual(mw(parseV4({ v4: { ...defaultV4(), nutrition: undefined } }).nutrition), { meals: {}, weights: [] });
  assert.deepEqual(mw(parseV4({}).nutrition), { meals: {}, weights: [] });
});

test('壞資料清理：型別錯、日期錯、超出範圍的體重都過濾，不丟例外', () => {
  for (const bad of [null, 5, 'x', [], { meals: 'x', weights: 'y' }, { meals: [], weights: {} }]) assert.deepEqual(mw(parseNutrition(bad)), { meals: {}, weights: [] });
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
