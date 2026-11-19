/* 營養工具卡：今日入口、每日目標、5 餐逐餐打勾與合計、04:00 換日重置、體重與 7 天平均、每週調整建議、
   舊資料預設值、備份往返、XP 不變、用語表與禁用字、觸控目標。 */
import { test, expect, openApp, dismissCelebrations, liveV4, readFixture, seedState, storedState, clickAndDownload, confirmImportTwice, expectTouchTargets, noHorizontalScroll, expectGlossaryClean, contextOptions, watchContext, assertWatchClean, MAIN_KEY } from './helpers.js';

const NOW = '2026-11-19T08:30:00+09:00';
const DAY = 86400000;
const dateBack = (n) => new Date(new Date('2026-11-19T12:00:00+09:00').getTime() - n * DAY).toISOString().slice(0, 10);
const openNutrition = async (page) => {
  await dismissCelebrations(page);
  await page.click('#tabs button[data-s="s-home"]');
  await page.click('#nut-open');
  await expect(page.locator('#s-nutrition')).toHaveClass(/active/);
};
/* 帶體重紀錄的 state：kgOf(幾天前) → kg 或 null */
const stateWithWeights = (days, kgOf) => {
  const st = JSON.parse(readFixture('v4-no-nutrition.json'));
  const weights = [];
  for (let i = days - 1; i >= 0; i--) { const kg = kgOf(i); if (kg !== null) weights.push({ date: dateBack(i), kg, at: `${dateBack(i)}T07:00:00+09:00` }); }
  st.v4.nutrition = { meals: {}, weights };
  return seedState(JSON.stringify(st));
};

test('今日頁有營養入口：3,400 kcal、三大營養素、已打勾 kcal；三個習慣列不變', async ({ page }) => {
  await openApp(page, { now: NOW });
  await expect(page.locator('#nut-open')).toBeVisible();
  await expect(page.locator('#nut-open .name')).toHaveText('營養 · 每天 3,400 kcal');
  await expect(page.locator('#nut-open')).toContainText('蛋白質 175 g · 脂肪 90 g · 碳水 470 g');
  await expect(page.locator('#nut-home-sum')).toHaveText('今天已打勾 0 / 3,400 kcal（0/5 餐）');
  await expect(page.locator('.habit')).toHaveCount(3);
  await expect(page.locator('#tabs button')).toHaveCount(5);
  await expectTouchTargets(page, '#s-home');
  await noHorizontalScroll(page);
});

test('營養畫面：每日目標、5 餐的 kcal 與範例餐逐字正確，附一般參考說明', async ({ page }) => {
  await openApp(page, { now: NOW });
  await openNutrition(page);
  await expect(page.locator('#nut-target')).toHaveText('3,400 kcal');
  await expect(page.locator('#nut-macros')).toHaveText('蛋白質 175 g · 脂肪 90 g · 碳水 470 g');
  await expect(page.locator('.meal')).toHaveCount(5);
  const rows = await page.locator('.meal').evaluateAll((els) => els.map((e) => [e.querySelector('.name').innerText.replace(/\s+/g, ' ').trim(), e.querySelector('.meta').innerText.trim()]));
  expect(rows).toEqual([
    ['早餐 700 kcal', '燕麥或飯、3 顆蛋、牛乳'],
    ['午餐 800 kcal', '飯、肉或魚、納豆、湯'],
    ['16:30 點心 500 kcal', '飯糰 2 個加牛乳'],
    ['晚餐 900 kcal', '飯、肉或魚、蔬菜、橄欖油'],
    ['睡前 500 kcal', '牛乳、優格、香蕉、堅果']
  ]);
  await expect(page.locator('#nut-sum')).toHaveText('0 / 3,400 kcal');
  await expect(page.locator('#nutrition-body')).toContainText('7 天平均每週 +0.2 到 +0.4 kg：不動。連續 2 週低於 +0.2 kg：每天加 150 kcal（碳水約 +40 g）。每週高於 +0.5 kg：每天減 150 kcal。');
  await expect(page.locator('#nutrition-body')).toContainText('吃不完時先加液體熱量（牛乳、燕麥、橄欖油）。');
  await expect(page.locator('#nut-disclaimer')).toContainText('不是醫療建議');
  await expect(page.locator('#tabs button.on')).toHaveText(/今日/);
  await expectTouchTargets(page, '#s-nutrition');
  await noHorizontalScroll(page);
  const text = await page.locator('#s-nutrition').innerText();
  expectGlossaryClean([text, await page.locator('#s-home').evaluate((e) => e.textContent)]);
  for (const re of [/診斷/, /失敗/, /懲罰/, /漏掉/, /扣/]) expect(text, String(re)).not.toMatch(re);
});

test('逐餐打勾 1 次點擊：合計即時更新、可取消、重開還在；XP 與連續天數不變', async ({ page }) => {
  await openApp(page, { now: NOW });
  const xpBefore = await page.locator('.xp-line .num').first().innerText();
  await openNutrition(page);
  await page.click('.meal[data-meal="breakfast"]');
  await expect(page.locator('.meal[data-meal="breakfast"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#nut-sum')).toHaveText('700 / 3,400 kcal');
  await page.click('.meal[data-meal="dinner"]');
  await expect(page.locator('#nut-sum')).toHaveText('1,600 / 3,400 kcal');
  await expect(page.locator('#nut-count')).toHaveText('2/5');
  await page.click('.meal[data-meal="breakfast"]');
  await expect(page.locator('.meal[data-meal="breakfast"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#nut-sum')).toHaveText('900 / 3,400 kcal');
  expect((await liveV4(page)).nutrition.meals).toEqual({ '2026-11-19': ['dinner'] });
  expect((await storedState(page)).v4.nutrition.meals).toEqual({ '2026-11-19': ['dinner'] });
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  await expect(page.locator('#nut-home-sum')).toHaveText('今天已打勾 900 / 3,400 kcal（1/5 餐）');
  await expect(page.locator('.xp-line .num').first()).toHaveText(xpBefore);
  await expect(page.locator('#h-streak')).toHaveText('0');
  await expect(page.locator('#cele')).toBeHidden();
  await openNutrition(page);
  for (const id of ['breakfast', 'lunch', 'snack', 'bedtime']) await page.click(`.meal[data-meal="${id}"]`);
  await expect(page.locator('#nut-sum')).toHaveText('3,400 / 3,400 kcal');
  await expect(page.locator('#cele')).toBeHidden();
  await page.click('#nutrition-back');
  await expect(page.locator('#s-home')).toHaveClass(/active/);
  await expect(page.locator('.xp-line .num').first()).toHaveText(xpBefore);
});

test('隔天自動重置：03:59 還算當天，04:00 之後是新的一天；前一天的紀錄保留', async ({ page }) => {
  await openApp(page, { now: '2026-11-19T21:00:00+09:00' });
  await openNutrition(page);
  await page.click('.meal[data-meal="breakfast"]');
  await page.click('.meal[data-meal="lunch"]');
  await expect(page.locator('#nut-sum')).toHaveText('1,500 / 3,400 kcal');
  await page.clock.pauseAt(new Date('2026-11-20T03:59:00+09:00'));
  await page.click('#nutrition-back');
  await expect(page.locator('#nut-home-sum')).toContainText('今天已打勾 1,500 / 3,400 kcal');
  await page.clock.pauseAt(new Date('2026-11-20T04:00:30+09:00'));
  await page.click('#tabs button[data-s="s-gym"]');
  await page.click('#tabs button[data-s="s-home"]');
  await expect(page.locator('#nut-home-sum')).toHaveText('今天已打勾 0 / 3,400 kcal（0/5 餐）');
  await page.click('#nut-open');
  await expect(page.locator('.meal.done')).toHaveCount(0);
  await expect(page.locator('#nut-sum')).toHaveText('0 / 3,400 kcal');
  expect((await liveV4(page)).nutrition.meals).toEqual({ '2026-11-19': ['breakfast', 'lunch'] });
});

test('畫面開著跨過 04:00：打勾第一次點擊只重畫成新的一天，不寫進前一天', async ({ page }) => {
  await openApp(page, { now: '2026-11-19T23:00:00+09:00' });
  await openNutrition(page);
  await page.click('.meal[data-meal="breakfast"]');
  await page.clock.pauseAt(new Date('2026-11-20T07:00:00+09:00'));
  await page.click('.meal[data-meal="lunch"]');
  expect((await liveV4(page)).nutrition.meals).toEqual({ '2026-11-19': ['breakfast'] });
  await expect(page.locator('.meal.done')).toHaveCount(0);
  await expect(page.locator('#nut-sum')).toHaveText('0 / 3,400 kcal');
  await page.click('.meal[data-meal="lunch"]');
  expect((await liveV4(page)).nutrition.meals).toEqual({ '2026-11-19': ['breakfast'], '2026-11-20': ['lunch'] });
});

test('畫面開著跨過 04:00：早上體重存到新的一天，前一天的體重不被蓋掉', async ({ page }) => {
  await openApp(page, { now: '2026-11-19T23:00:00+09:00' });
  await openNutrition(page);
  await page.fill('#nut-weight', '78.5');
  await page.click('#nut-weight-save');
  await page.clock.pauseAt(new Date('2026-11-20T07:00:00+09:00'));
  await page.fill('#nut-weight', '79.0');
  await page.click('#nut-weight-save');
  const n = (await liveV4(page)).nutrition;
  expect(n.weights.map((w) => [w.date, w.kg])).toEqual([['2026-11-19', 78.5], ['2026-11-20', 79]]);
});

test('體重：1 欄輸入、同一天重記覆蓋、範圍外不存；資料不足只說再記幾天', async ({ page }) => {
  await openApp(page, { now: NOW });
  await openNutrition(page);
  await expect(page.locator('#nut-advice-tag')).toHaveText('再記幾天');
  await expect(page.locator('#nut-avg')).toHaveText('—');
  await page.fill('#nut-weight', '86.7');
  await page.click('#nut-weight-save');
  await expect(page.locator('#nut-weight-msg')).toHaveText('已記錄 86.7 kg。');
  await expect(page.locator('#nut-avg')).toHaveText('86.7 kg');
  await expect(page.locator('#nut-change')).toHaveText('—');
  await expect(page.locator('#nut-advice')).toHaveText('再記幾天就能看每週變化（滿 14 天後開始，還有 13 天）。');
  await expect(page.locator('#nut-advice')).not.toContainText('150');
  await page.fill('#nut-weight', '87.04');
  await page.press('#nut-weight', 'Enter');
  await expect(page.locator('#nut-weight')).toHaveValue('87.0');
  expect((await liveV4(page)).nutrition.weights).toEqual([{ date: '2026-11-19', kg: 87, at: '2026-11-19T08:30:00+09:00' }]);
  for (const bad of ['', '5', '999']) {
    await page.fill('#nut-weight', bad);
    await page.click('#nut-weight-save');
    await expect(page.locator('#nut-weight-msg'), bad).toHaveText('請輸入 30–250 之間的數字。');
  }
  expect((await storedState(page)).v4.nutrition.weights).toHaveLength(1);
});

test('每週調整建議：不動／再觀察／每天 +150／每天 −150', async ({ browser, baseURL }) => {
  const cases = [
    { name: 'hold', days: 14, kg: (i) => (i < 7 ? 86.3 : 86.0), tag: '不動', change: '+0.30 kg', text: /在範圍內/ },
    { name: 'gap', days: 14, kg: (i) => (i < 7 ? 86.45 : 86.0), tag: '不動', change: '+0.45 kg', text: /在範圍內/ },
    { name: 'down', days: 14, kg: (i) => (i < 7 ? 86.8 : 86.0), tag: '每天 −150 kcal', change: '+0.80 kg', text: /高於 \+0\.5 kg。建議每天減 150 kcal。/ },
    { name: 'watch', days: 14, kg: (i) => (i < 7 ? 86.1 : 86.0), tag: '不動', change: '+0.10 kg', text: /先不動，再觀察 1 週。/ },
    { name: 'up', days: 21, kg: (i) => (i < 7 ? 86.1 : i < 14 ? 86.0 : 85.9), tag: '每天 +150 kcal', change: '+0.10 kg', text: /連續 2 週低於 \+0\.2 kg。建議每天加 150 kcal（碳水約 \+40 g）。/ },
    { name: 'loss', days: 21, kg: (i) => (i < 7 ? 85.8 : i < 14 ? 86.0 : 86.1), tag: '每天 +150 kcal', change: '−0.20 kg', text: /建議每天加 150 kcal/ },
    { name: '13days', days: 13, kg: (i) => (i < 7 ? 87 : 86), tag: '再記幾天', change: '—', text: /還有 1 天/ }
  ];
  for (const c of cases) {
    const context = await browser.newContext(contextOptions());
    const w = watchContext(context);
    const page = await context.newPage();
    await openApp(page, { now: NOW, seed: stateWithWeights(c.days, c.kg), url: `${baseURL}/index.html` });
    await openNutrition(page);
    await expect(page.locator('#nut-advice-tag'), c.name).toHaveText(c.tag);
    await expect(page.locator('#nut-change'), c.name).toHaveText(c.change);
    await expect(page.locator('#nut-advice'), c.name).toHaveText(c.text);
    if (c.tag === '再記幾天') await expect(page.locator('#nut-advice'), c.name).not.toContainText('150');
    assertWatchClean(w, c.name);
    await context.close();
  }
});

test('舊資料（v4 沒有營養欄、以及更舊的 v3）：開啟正常、營養用預設值、原有欄位不變', async ({ page }) => {
  const raw = readFixture('v4-no-nutrition.json');
  await openApp(page, { now: NOW, seed: seedState(raw) });
  await expect(page.locator('#err-card')).not.toHaveClass(/danger/);
  await expect(page.locator('#boot-error')).toHaveCount(0);
  const before = JSON.parse(raw).v4;
  const v4 = await liveV4(page);
  expect(v4.nutrition).toEqual({ meals: {}, weights: [] });
  const rest = { ...v4 };
  delete rest.nutrition;
  expect(rest).toEqual(before);
  await expect(page.locator('#nut-home-sum')).toHaveText('今天已打勾 0 / 3,400 kcal（0/5 餐）');
  /* 只開 App 不寫入（沿用既有慣例）；第一次打勾後才存，原有欄位照舊 */
  expect(await page.evaluate((k) => localStorage.getItem(k), MAIN_KEY)).toBe(raw);
  await openNutrition(page);
  await page.click('.meal[data-meal="lunch"]');
  const st = await storedState(page);
  expect(st.v4.nutrition).toEqual({ meals: { '2026-11-19': ['lunch'] }, weights: [] });
  expect(st.v4.stretch).toEqual(before.stretch);
  expect(st.v4.settings).toEqual(before.settings);
  expect(st.sessions).toEqual(JSON.parse(raw).sessions);
});

test('v3、V2a、Phase 1 舊 fixture：營養卡照常顯示、沒有錯誤卡', async ({ browser, baseURL }) => {
  for (const name of ['v3.json', 'v3-v2a.json', 'v3-phase1.json']) {
    const context = await browser.newContext(contextOptions());
    const w = watchContext(context);
    const page = await context.newPage();
    await openApp(page, { now: NOW, seed: seedState(readFixture(name)), url: `${baseURL}/index.html` });
    await dismissCelebrations(page);
    await expect(page.locator('#err-card'), name).not.toHaveClass(/danger/);
    expect((await liveV4(page)).nutrition, name).toEqual({ meals: {}, weights: [] });
    await expect(page.locator('#nut-open'), name).toBeVisible();
    assertWatchClean(w, name);
    await context.close();
  }
});

test('備份往返：下載的備份含營養欄；刪除全部資料後匯入，打勾與體重都回來', async ({ page }) => {
  await openApp(page, { now: NOW });
  await openNutrition(page);
  await page.click('.meal[data-meal="breakfast"]');
  await page.click('.meal[data-meal="snack"]');
  await page.fill('#nut-weight', '86.7');
  await page.click('#nut-weight-save');
  const expected = { meals: { '2026-11-19': ['breakfast', 'snack'] }, weights: [{ date: '2026-11-19', kg: 86.7, at: '2026-11-19T08:30:00+09:00' }] };
  await page.click('#nutrition-back');
  await page.click('#h-settings');
  const dl = await clickAndDownload(page, '#bk-download');
  const obj = JSON.parse(dl.text);
  expect((obj.state || obj).v4.nutrition).toEqual(expected);
  await page.click('#cfg-wipe');
  await page.clock.runFor(1500);
  await page.click('#cfg-wipe');
  await expect(page.locator('#s-home')).toHaveClass(/active/);
  expect((await liveV4(page)).nutrition).toEqual({ meals: {}, weights: [] });
  await expect(page.locator('#nut-home-sum')).toHaveText('今天已打勾 0 / 3,400 kcal（0/5 餐）');
  await page.click('#h-settings');
  await page.fill('#exp-area', dl.text);
  await page.click('#imp-btn');
  await expect(page.locator('#imp-preview')).toBeVisible();
  await confirmImportTwice(page);
  await expect(page.locator('#s-home')).toHaveClass(/active/);
  expect((await liveV4(page)).nutrition).toEqual(expected);
  expect((await storedState(page)).v4.nutrition).toEqual(expected);
  await expect(page.locator('#nut-home-sum')).toHaveText('今天已打勾 1,200 / 3,400 kcal（2/5 餐）');
  await page.click('#nut-open');
  await expect(page.locator('#nut-weight')).toHaveValue('86.7');
  await expect(page.locator('.meal.done')).toHaveCount(2);
});

test('匯入的營養欄是壞資料：不白屏、畫面當成空的', async ({ page }) => {
  const st = JSON.parse(readFixture('v4-no-nutrition.json'));
  st.v4.nutrition = { meals: 'x', weights: [{ date: 'bad', kg: 'heavy' }, null, { date: '2026-11-19', kg: 9999 }] };
  await openApp(page, { now: NOW, seed: seedState(JSON.stringify(st)) });
  await expect(page.locator('#nut-home-sum')).toHaveText('今天已打勾 0 / 3,400 kcal（0/5 餐）');
  await openNutrition(page);
  await expect(page.locator('#nut-avg')).toHaveText('—');
  await page.click('.meal[data-meal="breakfast"]');
  await expect(page.locator('#nut-sum')).toHaveText('700 / 3,400 kcal');
});
