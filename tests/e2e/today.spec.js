/* redo-v1：今日頁、分頁、觸控目標、無橫向捲動、用語表、設定頁。 */
import { test, expect, openApp, gotoTab, expectTouchTargets, noHorizontalScroll, expectGlossaryClean, liveV4, readFixture, seedState } from './helpers.js';

const NOW = '2026-11-04T08:30:00+09:00';

test('全新開啟：今日頁有主行動、三個習慣列、本週三環、週條；分頁五顆', async ({ page }) => {
  await openApp(page, { now: NOW });
  await expect(page.locator('#h-date')).toHaveText('11 月 4 日 週三');
  await expect(page.locator('#h-greet')).toHaveText('早安');
  await expect(page.locator('#h-streak')).toHaveText('0');
  await expect(page.locator('#hero-go')).toBeVisible();
  await expect(page.locator('#hero-t')).toHaveText('晨間伸展 15 分鐘');
  await expect(page.locator('.habit')).toHaveCount(3);
  await expect(page.locator('.habit.stretch .name')).toHaveText('晨間伸展');
  await expect(page.locator('.habit.gym .meta')).toContainText('下一次：Upper A · 本週 0/4');
  await expect(page.locator('.rings')).toBeVisible();
  await expect(page.locator('.rings .lv')).toHaveText('1');
  await expect(page.locator('.week .day')).toHaveCount(7);
  await expect(page.locator('.week .day.today .lbl')).toHaveText('三');
  await expect(page.locator('#tabs button')).toHaveCount(5);
  await expect(page.locator('#tabs button.on')).toHaveText(/今日/);
  await noHorizontalScroll(page);
  await expectTouchTargets(page, '#s-home');
  const v4 = await liveV4(page);
  expect(v4.gym.sessions).toEqual([]);
  expect(v4.settings.gymDays).toEqual([1, 2, 4, 5]);
});

test('五個分頁都能開、都沒有橫向捲動、觸控目標 ≥ 44px；設定從齒輪進入', async ({ page }) => {
  await openApp(page, { now: NOW });
  for (const id of ['s-gym', 's-stretch', 's-explore', 's-progress', 's-home']) {
    await gotoTab(page, id);
    await noHorizontalScroll(page);
    await expectTouchTargets(page, `#${id}`);
  }
  await gotoTab(page, 's-settings');
  await expect(page.locator('#cfg-identity')).toHaveValue('我是獨立、自律、持續成長的人。');
  await expect(page.locator('#bk-download')).toBeVisible();
  await expect(page.locator('#cfg-wipe')).toBeVisible();
  await expectTouchTargets(page, '#s-settings');
  await page.click('#settings-back');
  await expect(page.locator('#s-home')).toHaveClass(/active/);
});

test('健身房日可在設定改，今日週條的橘字跟著變', async ({ page }) => {
  await openApp(page, { now: NOW });
  await gotoTab(page, 's-settings');
  await page.click('#settings-body .days button[data-d="3"]');
  await expect(page.locator('#settings-body .days button[data-d="3"]')).toHaveAttribute('aria-pressed', 'true');
  await page.click('#settings-back');
  await expect(page.locator('.week .day.plan')).toHaveCount(5);
  const v4 = await liveV4(page);
  expect(v4.settings.gymDays).toEqual([1, 2, 3, 4, 5]);
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  expect((await liveV4(page)).settings.gymDays).toEqual([1, 2, 3, 4, 5]);
});

test('所有畫面的可見文字通過台灣繁中用語表', async ({ page }) => {
  await openApp(page, { now: NOW, seed: seedState(readFixture('v3-phase1.json')) });
  const texts = [];
  for (const id of ['s-home', 's-gym', 's-stretch', 's-explore', 's-progress', 's-settings']) {
    await gotoTab(page, id);
    texts.push(await page.locator(`#${id}`).innerText());
  }
  expectGlossaryClean(texts);
});

test('今天休息：設定裡切換，今日頁不會算成漏掉', async ({ page }) => {
  await openApp(page, { now: NOW });
  await gotoTab(page, 's-settings');
  await page.click('#cfg-rest');
  await expect(page.locator('#cfg-rest')).toHaveText('休息中');
  const v4 = await liveV4(page);
  expect(v4.pauses).toEqual([{ from: '2026-11-04', to: '2026-11-04', kind: 'rest' }]);
  await page.click('#cfg-rest');
  expect((await liveV4(page)).pauses).toEqual([]);
});
