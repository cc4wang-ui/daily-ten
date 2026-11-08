/* 組間休息倒數（2026-11-08 修復）：按鈕／離開／重新整理都不能讓倒數消失。
   迴歸測試——修復前的兩個根因：
   R1：「加一組」觸發 paintSession() 整頁重繪，摧毀身為 #session 子元素的 #rest，
       計時在背景空轉、顯示消失。
   R2：「先離開」直接 stopRest()，回來開課時休息狀態已死。
   只透過畫面操作；時間用 page.clock（helpers 的 tick）。 */
import { test, expect, openApp, gotoTab, tick, liveV4, NOW_ISO } from './helpers.js';

const NOW = NOW_ISO;

async function startSession(page) {
  await openApp(page, { now: NOW });
  await gotoTab(page, 's-gym');
  await page.click('#gym-start');
  await expect(page.locator('#session')).toBeVisible();
}

/* 勾第一個動作第一組（複合動作 → 休息 2:30） */
async function checkFirstSet(page) {
  const row = page.locator('#session tr[data-si]').first();
  await row.locator('input[data-k=weight]').fill('20');
  await row.locator('input[data-k=reps]').fill('8');
  await row.locator('.ok').click();
  await expect(page.locator('#rest')).toBeVisible();
}

test('休息中按「加一組」：倒數不消失，繼續按真實時間走', async ({ page }) => {
  await startSession(page);
  await checkFirstSet(page);
  const t = page.locator('#rest-t');
  await expect(t).toHaveText('2:30');
  await tick(page, 5);
  await expect(t).toHaveText('2:25');
  await page.locator('#session [data-add]').first().click();
  await expect(page.locator('#rest')).toBeVisible();
  await expect(t).toHaveText('2:25');
  await tick(page, 5);
  await expect(t).toHaveText('2:20');
  // 休息狀態有寫進 draft（期限制），不是只存在畫面上
  const v4 = await liveV4(page);
  expect(v4.gym.draft.rest).toMatchObject({ total: 150 });
  expect(Number.isFinite(v4.gym.draft.rest.deadline)).toBe(true);
});

test('先離開再回來：倒數按離開期間經過的真實時間續跑', async ({ page }) => {
  await startSession(page);
  await checkFirstSet(page);
  await tick(page, 5);
  await expect(page.locator('#rest-t')).toHaveText('2:25');
  await page.click('#ss-exit');
  await expect(page.locator('#rest')).toHaveCount(0);
  await tick(page, 10);
  await page.click('#gym-resume');
  await expect(page.locator('#rest')).toBeVisible();
  await expect(page.locator('#rest-t')).toHaveText('2:15');
  await tick(page, 5);
  await expect(page.locator('#rest-t')).toHaveText('2:10');
});

test('離開期間期限到了：回來不再顯示休息，draft 的 rest 已清掉', async ({ page }) => {
  await startSession(page);
  await checkFirstSet(page);
  await tick(page, 5);
  await page.click('#ss-exit');
  await tick(page, 150);
  await page.click('#gym-resume');
  await expect(page.locator('#rest')).toHaveCount(0);
  expect((await liveV4(page)).gym.draft.rest).toBeUndefined();
});

test('重新整理頁面：休息倒數從 draft 恢復，剩餘時間正確', async ({ page }) => {
  await startSession(page);
  await checkFirstSet(page);
  await tick(page, 5);
  await expect(page.locator('#rest-t')).toHaveText('2:25');
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  await expect(page.locator('#s-gym')).toHaveClass(/active/);
  await page.click('#gym-resume');
  await expect(page.locator('#rest')).toBeVisible();
  await expect(page.locator('#rest-t')).toHaveText('2:25');
  await tick(page, 5);
  await expect(page.locator('#rest-t')).toHaveText('2:20');
});

test('+30 秒與略過仍正常；第二組勾選重啟倒數', async ({ page }) => {
  await startSession(page);
  await checkFirstSet(page);
  const t = page.locator('#rest-t');
  await tick(page, 5);
  await expect(t).toHaveText('2:25');
  await page.click('#rest-add');
  await expect(t).toHaveText('2:55');
  await tick(page, 5);
  await expect(t).toHaveText('2:50');
  await page.click('#rest-skip');
  await expect(page.locator('#rest')).toHaveCount(0);
  expect((await liveV4(page)).gym.draft.rest).toBeUndefined();
  // 第二組勾選：新的休息 2:30
  const row2 = page.locator('#session tr[data-si]').nth(1);
  await row2.locator('input[data-k=weight]').fill('20');
  await row2.locator('input[data-k=reps]').fill('8');
  await row2.locator('.ok').click();
  await expect(page.locator('#rest')).toBeVisible();
  await expect(page.locator('#rest-t')).toHaveText('2:30');
});

test('休息中按完成訓練：已完成的課不帶 rest，#rest 不殘留', async ({ page }) => {
  await startSession(page);
  // 勾滿 7 組（14 組的一半，達 partial 門檻；只勾 1 組時 finish 會拒絕）
  const rows = page.locator('#session tr[data-si]');
  for (let i = 0; i < 7; i++) {
    const r = rows.nth(i);
    await r.locator('input[data-k=weight]').fill('20');
    await r.locator('input[data-k=reps]').fill('8');
    await r.locator('.ok').click();
  }
  await expect(page.locator('#rest')).toBeVisible();
  await page.click('#ss-finish');
  await expect(page.locator('#sheet')).toBeVisible();
  await expect(page.locator('#rest')).toHaveCount(0);
  const v4 = await liveV4(page);
  expect(v4.gym.draft).toBeNull();
  expect(v4.gym.sessions).toHaveLength(1);
  expect(v4.gym.sessions[0].rest).toBeUndefined();
});
