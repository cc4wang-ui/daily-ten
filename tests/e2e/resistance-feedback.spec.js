import { test, expect, openApp, readFixture, seedState, storedState, waitReady, gotoTab,
  clickAndDownload, confirmImportTwice, swAssets, waitControlled } from './helpers.js';

const NOW = '2026-10-19T15:30:00+09:00'; // Monday: shoulder press is in the primary block.
const SHOULDER = '彈力帶肩上推';
const row = (page, name) => page.locator('#tr-prescription-list li').filter({
  has: page.locator('.prescription-heading > span:first-child', { hasText: new RegExp(`^${name}$`) })
});
function report(date, name, set, resistance, { target = 10, effort = 'easy' } = {}) {
  return { id: `${date}-${name}-${set}`, date, name: `${name} 第${set}組`, target,
    actual: target, effort, pain: false, form: true, ...(resistance === undefined ? {} : { resistance }) };
}
function stateWith(feedback = [], dates = []) {
  const s = JSON.parse(readFixture('v3.json'));
  s.level = 2;
  s.settings.band = true;
  s.game.trainingFeedback = feedback;
  s.sessions = dates.map(date => ({ date, type: 'full', xp: 10 }));
  return JSON.stringify(s);
}
async function seek(page, name) {
  for (let i = 0; i < 45; i++) {
    if (await page.locator('#t-name').textContent() === name) return;
    await page.click('#t-skip');
  }
  throw new Error(`未找到 ${name}`);
}
async function startShoulder(page) {
  await gotoTab(page, 's-train');
  await page.click('#tr-start');
  await seek(page, `${SHOULDER} 第1組`);
  await page.click('#t-feedback-open');
  await expect(page.locator('#t-resistance-fields')).toBeVisible();
}

test('只在主要編號彈力帶工作組顯示標記；同變式前日標記預填、同日下一組沿用', async ({ page }) => {
  const prior = report('2026-10-15', SHOULDER, 1, '藍帶');
  await openApp(page, { now: NOW, seed: seedState(stateWith([prior], ['2026-10-15'])) });
  await startShoulder(page);
  await expect(page.locator('#t-resistance')).toHaveValue('藍帶');
  await page.fill('#t-actual', '10');
  await page.fill('#t-resistance', ' 紅帶／握短一格 ');
  await page.click('#t-feedback button[type=submit]');
  expect((await storedState(page)).game.trainingFeedback.at(-1).resistance).toBe('紅帶／握短一格');
  await seek(page, `${SHOULDER} 第2組`);
  await page.click('#t-feedback-open');
  await expect(page.locator('#t-resistance')).toHaveValue('紅帶／握短一格');
});

test('徒手動作不顯示阻力欄；彈力帶划船的標記不借給肩推', async ({ page }) => {
  await openApp(page, { now: NOW, seed: seedState(stateWith([
    report('2026-10-15', '彈力帶划船', 1, '綠帶')], ['2026-10-15'])) });
  await gotoTab(page, 's-train');
  await page.click('#tr-start');
  await seek(page, '伏地挺身 第1組');
  await page.click('#t-feedback-open');
  await expect(page.locator('#t-resistance-fields')).toBeHidden();
  await page.click('#t-feedback-cancel');
  await seek(page, `${SHOULDER} 第1組`);
  await page.click('#t-feedback-open');
  await expect(page.locator('#t-resistance-fields')).toBeVisible();
  await expect(page.locator('#t-resistance')).toHaveValue('');
});

test('40 個 Unicode 字可存；41 字阻止提交且暫停，留白則省略欄位', async ({ page }) => {
  await openApp(page, { now: NOW, seed: seedState(stateWith()) });
  await startShoulder(page);
  const before = (await storedState(page)).game.trainingFeedback.length;
  await page.fill('#t-actual', '10');
  await page.fill('#t-resistance', '🏋'.repeat(41));
  await page.click('#t-feedback button[type=submit]');
  await expect(page.locator('#t-feedback-error')).toContainText('40');
  await expect(page.locator('#t-feedback')).toBeVisible();
  await expect(page.locator('#t-pause')).toHaveText('繼續');
  expect((await storedState(page)).game.trainingFeedback).toHaveLength(before);
  await page.fill('#t-resistance', '🏋'.repeat(40));
  await page.click('#t-feedback button[type=submit]');
  expect((await storedState(page)).game.trainingFeedback.at(-1).resistance).toBe('🏋'.repeat(40));
  await seek(page, `${SHOULDER} 第2組`);
  await page.click('#t-feedback-open');
  await page.fill('#t-actual', '10');
  await page.fill('#t-resistance', '   ');
  await page.click('#t-feedback button[type=submit]');
  expect((await storedState(page)).game.trainingFeedback.at(-1)).not.toHaveProperty('resistance');
});

test('前日同標記兩次輕鬆達標加一次；換標記、未記錄、混標記皆不借證據', async ({ page }) => {
  const dates = ['2026-10-12', '2026-10-15'];
  const a = dates.flatMap(date => [1, 2].map(set => report(date, SHOULDER, set, '紅帶')));
  await openApp(page, { now: NOW, seed: seedState(stateWith(a, dates)) });
  await gotoTab(page, 's-train');
  await expect(row(page, SHOULDER)).toContainText('基準 10 → 本次 11 下／組');
  await expect(row(page, SHOULDER)).toContainText('比對阻力標記：紅帶');
  // Separate visits seed independent fixtures before boot. A new context is not needed because
  // every new page has its own sessionStorage seed marker.
  await page.close();
  const scenarios = [
    { feedback: [...a, report('2026-10-18', SHOULDER, 1, '藍帶')], dates: [...dates, '2026-10-18'], label: '藍帶' },
    { feedback: [...a, report('2026-10-18', SHOULDER, 1, undefined)], dates: [...dates, '2026-10-18'], label: '未記錄' },
    { feedback: dates.flatMap(date => [report(date, SHOULDER, 1, '藍帶'), report(date, SHOULDER, 2, '紅帶')]),
      dates, label: '紅帶' }
  ];
  for (const { feedback, dates: completed, label } of scenarios) {
    const p = await page.context().newPage();
    await openApp(p, { now: NOW, seed: seedState(stateWith(feedback, completed)) });
    await gotoTab(p, 's-train');
    await expect(row(p, SHOULDER)).toContainText('基準 10 → 本次 10 下／組');
    await expect(row(p, SHOULDER)).toContainText(`比對阻力標記：${label}`);
    await p.close();
  }
});

test('今天改用另一標記不改當堂目標；重載後今日標記仍可預填', async ({ page }) => {
  const dates = ['2026-10-12', '2026-10-15'];
  const a = dates.flatMap(date => [1, 2].map(set => report(date, SHOULDER, set, '紅帶')));
  await openApp(page, { now: NOW, seed: seedState(stateWith(a, dates)) });
  await gotoTab(page, 's-train');
  await page.click('#tr-start');
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('daily-ten-active-workout')).seq);
  await seek(page, `${SHOULDER} 第1組`);
  await page.click('#t-feedback-open');
  await page.fill('#t-actual', '11');
  await page.fill('#t-resistance', '藍帶');
  await page.click('#t-feedback button[type=submit]');
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('daily-ten-active-workout')).seq);
  expect(after).toEqual(before);
  await page.reload();
  await waitReady(page);
  await seek(page, `${SHOULDER} 第2組`);
  await page.click('#t-feedback-open');
  await expect(page.locator('#t-resistance')).toHaveValue('藍帶');
  expect((await storedState(page)).sessions).toEqual(JSON.parse(stateWith(a, dates)).sessions);
});

test('惡意文字以原樣顯示，不執行 HTML；備份和匯入保留原標記', async ({ page }) => {
  const unsafe = '<img src=x onerror=alert(1)>🏋';
  const s = stateWith([report('2026-10-15', SHOULDER, 1, unsafe)], ['2026-10-15']);
  await openApp(page, { now: NOW, seed: seedState(s) });
  await gotoTab(page, 's-train');
  await expect(row(page, SHOULDER)).toContainText(unsafe);
  await expect(row(page, SHOULDER).locator('img')).toHaveCount(0);
  await gotoTab(page, 's-setup');
  const file = await clickAndDownload(page, '#bk-download');
  expect(JSON.parse(file.text).game.trainingFeedback[0].resistance).toBe(unsafe);
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#imp-file-btn')]);
  await chooser.setFiles({ name: file.name, mimeType: 'application/json', buffer: Buffer.from(file.text) });
  await expect(page.locator('#imp-preview')).toBeVisible();
  await confirmImportTwice(page);
  expect((await storedState(page)).game.trainingFeedback[0].resistance).toBe(unsafe);
});

test('儲存失敗時停在回報表單；重試同組只保留一筆且不製造 XP', async ({ page, guard }) => {
  guard.allowConsoleErrors = true; // The intentional quota failure emits the app's expected diagnostic.
  await openApp(page, { now: NOW, seed: seedState(stateWith()) });
  const before = await storedState(page);
  await startShoulder(page);
  await page.fill('#t-actual', '10');
  await page.fill('#t-resistance', '紅帶');
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    window.__qaSetItem = original;
    Storage.prototype.setItem = function (...args) {
      if (args[0] === 'daily-ten-state') throw new DOMException('Storage full', 'QuotaExceededError');
      return original.apply(this, args);
    };
  });
  await page.click('#t-feedback button[type=submit]');
  await expect(page.locator('#t-feedback-error')).toContainText('儲存失敗');
  await expect(page.locator('#t-feedback')).toBeVisible();
  expect((await storedState(page)).game.trainingFeedback).toEqual(before.game.trainingFeedback);
  await page.evaluate(() => { Storage.prototype.setItem = window.__qaSetItem; });
  await page.click('#t-feedback button[type=submit]');
  const after = await storedState(page);
  expect(after.game.trainingFeedback.filter(f => f.date === '2026-10-19' && f.name === `${SHOULDER} 第1組`)).toHaveLength(1);
  expect(after.sessions).toEqual(before.sessions);
  expect(after.xp).toBe(before.xp);
  expect(guard.consoleErrors).toEqual(['儲存失敗：資料僅存在記憶體中']);
});

test.describe('離線彈力帶回報', () => {
  test.use({ serviceWorkers: 'allow' });
  test('快取控制後離線儲存，重載仍保留標記與當堂目標', async ({ page }) => {
    const dates = ['2026-10-12', '2026-10-15'];
    const prior = dates.flatMap(date => [1, 2].map(set => report(date, SHOULDER, set, '紅帶')));
    await openApp(page, { now: NOW, seed: seedState(stateWith(prior, dates)) });
    await waitControlled(page, swAssets().cache);
    await page.context().setOffline(true);
    await gotoTab(page, 's-train');
    await page.click('#tr-start');
    const snapshot = await page.evaluate(() => JSON.parse(localStorage.getItem('daily-ten-active-workout')).seq);
    await seek(page, `${SHOULDER} 第1組`);
    await page.click('#t-feedback-open');
    await page.fill('#t-actual', '11');
    await page.fill('#t-resistance', '藍帶');
    await page.click('#t-feedback button[type=submit]');
    await page.reload();
    await waitReady(page);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('daily-ten-active-workout')).seq)).toEqual(snapshot);
    await seek(page, `${SHOULDER} 第2組`);
    await page.click('#t-feedback-open');
    await expect(page.locator('#t-resistance')).toHaveValue('藍帶');
    expect((await storedState(page)).game.trainingFeedback.at(-1).resistance).toBe('藍帶');
  });
});
