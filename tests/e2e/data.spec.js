/* redo-v1：舊資料不白屏（v3、V2a、Phase 0／1 fixture 自動搬進 v4）、壞資料修復卡、匯入壞檔不動資料、備份下載。 */
import { test, expect, openApp, gotoTab, readFixture, seedState, liveV4, storedState, rawMain, confirmImportTwice, clickAndDownload, MAIN_KEY, hideToast } from './helpers.js';

const NOW = '2026-11-04T08:30:00+09:00';

test('v3 與 V2a 舊資料：開啟正常、沒有錯誤卡、v4 建立、原欄位保留', async ({ page }) => {
  for (const name of ['v3.json', 'v3-v2a.json', 'v3-checkin.json', 'v2-real.json', 'v1-minimal.json', 'empty-arrays.json']) {
    await openApp(page, { now: NOW, seed: seedState(readFixture(name)) });
    await expect(page.locator('#err-card'), name).not.toHaveClass(/danger/);
    await expect(page.locator('#hero-go'), name).toBeVisible();
    const st = await storedState(page);
    expect(st.version, name).toBe(3);
    expect(st.v4.version, name).toBe(1);
    expect(Array.isArray(st.sessions), name).toBe(true);
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  }
});

test('Phase 0／1 舊紀錄自動搬進 v4：健身房 1 次、伸展 2 天、探索 1 件；重開不重複搬', async ({ page }) => {
  await openApp(page, { now: NOW, seed: seedState(readFixture('v3-phase1.json')) });
  const v4 = await liveV4(page);
  expect(v4.gym.sessions).toHaveLength(1);
  expect(v4.gym.sessions[0].exercises.map((e) => e.id)).toEqual(['incline-db-press', 'bench-press']);
  expect(v4.stretch.log.map((e) => e.variant)).toEqual(['full', 'short']);
  expect(v4.explore.log).toHaveLength(1);
  await gotoTab(page, 's-progress');
  await expect(page.locator('#progress-body')).toContainText('1 次');
  await expect(page.locator('#progress-body')).toContainText('2 天');
  await gotoTab(page, 's-gym');
  await expect(page.locator('#gym-body')).toContainText('下一次：Lower A');
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  expect((await liveV4(page)).gym.sessions).toHaveLength(1);
  const st = await storedState(page);
  expect(st.phase1.gymSets).toHaveLength(2);
});

test('壞資料：recovered → 錯誤卡、原字串另存、可下載；App 其他功能照常', async ({ page }) => {
  await openApp(page, { now: NOW, seed: seedState(readFixture('corrupt-state.txt')) });
  await expect(page.locator('#err-card')).toHaveClass(/danger/);
  await expect(page.locator('#err-text')).toContainText('已改用空白資料');
  const dl = await clickAndDownload(page, '#err-download');
  expect(dl.name).toMatch(/\.txt$/);
  await page.click('#err-dismiss');
  await expect(page.locator('#err-card')).not.toHaveClass(/danger/);
  await expect(page.locator('#hero-go')).toBeVisible();
  const keys = await page.evaluate(() => Object.keys(localStorage).sort());
  expect(keys).toContain('daily-ten-state.bak-v2');
});

test('匯入壞檔：只顯示錯誤、資料不動；好檔要按兩次確認才覆蓋', async ({ page }) => {
  await openApp(page, { now: NOW, seed: seedState(readFixture('v3.json')) });
  const before = await rawMain(page);
  await gotoTab(page, 's-settings');
  for (const name of ['import-bad-not-json.txt', 'import-bad-missing-fields.json', 'import-bad-wrong-types.json']) {
    await page.fill('#exp-area', readFixture(name));
    await page.click('#imp-btn');
    await expect(page.locator('#imp-error'), name).toHaveClass(/danger/);
    await expect(page.locator('#imp-preview'), name).toBeHidden();
    expect(await rawMain(page), name).toBe(before);
  }
  await page.fill('#exp-area', readFixture('v3-phase1.json'));
  await page.click('#imp-btn');
  await expect(page.locator('#imp-preview')).toBeVisible();
  expect(await rawMain(page)).toBe(before);
  await confirmImportTwice(page);
  await expect(page.locator('#s-home')).toHaveClass(/active/);
  const v4 = await liveV4(page);
  expect(v4.gym.sessions).toHaveLength(1);
  expect(await rawMain(page)).not.toBe(before);
});

test('備份下載：檔案是目前 state（含 v4）', async ({ page }) => {
  await openApp(page, { now: NOW });
  await gotoTab(page, 's-stretch');
  await page.click('#st-mark-full');
  await hideToast(page);
  await gotoTab(page, 's-settings');
  const dl = await clickAndDownload(page, '#bk-download');
  expect(dl.name).toMatch(/^daily-ten-.*\.json$/);
  const obj = JSON.parse(dl.text);
  expect(obj.state ? obj.state.v4.stretch.log : obj.v4.stretch.log).toHaveLength(1);
  await expect(page.locator('#bk-status')).toContainText('上次備份');
});

test('刪除全部資料：按兩次才刪，刪完回到全新狀態', async ({ page }) => {
  await openApp(page, { now: NOW, seed: seedState(readFixture('v3-phase1.json')) });
  await gotoTab(page, 's-settings');
  await page.click('#cfg-wipe');
  await expect(page.locator('#cfg-wipe')).toHaveText('再按一次，確定刪除');
  expect((await liveV4(page)).gym.sessions).toHaveLength(1);
  await page.click('#cfg-wipe');
  await expect(page.locator('#s-home')).toHaveClass(/active/);
  expect((await liveV4(page)).gym.sessions).toHaveLength(0);
  const st = JSON.parse(await page.evaluate((k) => localStorage.getItem(k), MAIN_KEY));
  expect(st.sessions).toEqual([]);
});
