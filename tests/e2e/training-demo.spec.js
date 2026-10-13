import { test, expect, readFixture, openApp, seedState, storedState, tick, runWorkoutToEnd, waitReady, gotoTab } from './helpers.js';

test('訓練中示範留在 App，暫停並返回同一步與剩餘時間', async ({ page }) => {
  await openApp(page, { seed: seedState(readFixture('v3.json')) });
  await page.click('#h-minimal');
  await expect(page.locator('#t-name')).toHaveText('預備');
  await expect(page.locator('#t-checkpoint')).toContainText('準備下一步');
  await expect(page.locator('#t-next')).toContainText('貓牛式');
  await tick(page, 3);
  await expect(page.locator('#t-count')).toHaveText('7');
  await expect(page.locator('#t-show-demo')).toBeVisible();
  await expect(page.locator('#t-demo-wrap')).toBeHidden();
  await expect(page.locator('#t-no-demo')).toBeVisible();
  await page.click('#t-show-demo');
  await expect(page.locator('#demo-modal')).toHaveClass(/active/);
  await expect(page.locator('#dm-video')).toContainText('還沒有經審核的離線影片');
  await expect(page.locator('#dm-training-note')).toBeVisible();
  await expect(page.locator('#dm-yt')).toBeHidden();
  await expect(page.locator('#dm-skip')).toBeHidden();
  await expect(page.locator('#t-pause')).toHaveText('繼續');
  await tick(page, 12);
  await expect(page.locator('#t-count')).toHaveText('7');
  await expect(page.locator('#t-name')).toHaveText('預備');
  await page.click('#dm-close');
  await expect(page.locator('#demo-modal')).not.toHaveClass(/active/);
  await expect(page.locator('#t-count')).toHaveText('7');
  await page.click('#t-pause');
  await tick(page, 8);
  await expect(page.locator('#t-name')).toHaveText('貓牛式');
  await expect(page.locator('#t-phase')).toHaveText(/^2 \/ \d+$/);
});

test('略過實際動作後可繼續，但不會記為完成或發 XP', async ({ page }) => {
  await openApp(page, { seed: seedState(readFixture('v3.json')) });
  const before = await storedState(page);
  await page.click('#h-minimal');
  await page.click('#t-skip'); // 預備
  await expect(page.locator('#t-name')).toHaveText('貓牛式');
  await page.click('#t-skip'); // 實際動作
  await runWorkoutToEnd(page);
  await expect(page.locator('#d-identity')).toHaveText('這次略過了動作');
  await expect(page.locator('#d-xp')).toHaveText('未記為完成');
  const after = await storedState(page);
  expect(after.sessions).toEqual(before.sessions);
  expect(after.xp).toBe(before.xp);
});

test('缺片求助可在原視窗安全略過當前動作，且不會記為完成', async ({ page }) => {
  await openApp(page, { seed: seedState(readFixture('v3.json')) });
  const before = await storedState(page);
  await page.click('#h-minimal');
  await page.click('#t-skip'); // 預備不算動作
  await expect(page.locator('#t-name')).toHaveText('貓牛式');
  await page.click('#t-show-demo');
  await expect(page.locator('#dm-yt')).toBeHidden();
  await expect(page.locator('#dm-skip')).toBeVisible();
  await page.click('#dm-skip');
  await expect(page.locator('#demo-modal')).not.toHaveClass(/active/);
  await expect(page.locator('#t-name')).not.toHaveText('貓牛式');
  await runWorkoutToEnd(page);
  await expect(page.locator('#d-xp')).toHaveText('未記為完成');
  const after = await storedState(page);
  expect(after.sessions).toEqual(before.sessions);
  expect(after.xp).toBe(before.xp);
});

test('重新整理後在同一步、同一計數暫停，可主動續練且完成後清掉檢查點', async ({ page }) => {
  await openApp(page, { seed: seedState(readFixture('v3.json')) });
  await page.click('#h-minimal');
  await tick(page, 3);
  await expect(page.locator('#t-count')).toHaveText('7');
  await page.reload();
  await waitReady(page);
  await expect(page.locator('#train')).toHaveClass(/active/);
  await expect(page.locator('#t-checkpoint')).toContainText('已恢復');
  await expect(page.locator('#t-name')).toHaveText('預備');
  await expect(page.locator('#t-count')).toHaveText('7');
  await expect(page.locator('#t-pause')).toHaveText('繼續');
  await tick(page, 4);
  await expect(page.locator('#t-count')).toHaveText('7');
  await page.click('#t-pause');
  await tick(page, 8);
  await expect(page.locator('#t-name')).toHaveText('貓牛式');
  await page.click('#t-skip');
  await runWorkoutToEnd(page);
  await expect(page.locator('#done')).toHaveClass(/active/);
  expect(await page.evaluate(() => localStorage.getItem('daily-ten-active-workout'))).toBeNull();
});

test('略過動作後重載，略過標記仍在，完成也不會發 XP', async ({ page }) => {
  await openApp(page, { seed: seedState(readFixture('v3.json')) });
  const before = await storedState(page);
  await page.click('#h-minimal');
  await page.click('#t-skip'); // 預備
  await page.click('#t-skip'); // 貓牛式
  await page.reload();
  await waitReady(page);
  await expect(page.locator('#t-pause')).toHaveText('繼續');
  await page.click('#t-pause');
  await runWorkoutToEnd(page);
  await expect(page.locator('#d-xp')).toHaveText('未記為完成');
  const after = await storedState(page);
  expect(after.sessions).toEqual(before.sessions);
  expect(after.xp).toBe(before.xp);
});

test('損壞的訓練檢查點不會讓 App 啟動失敗', async ({ page }) => {
  await openApp(page, { seed: seedState(readFixture('v3.json')) });
  await page.evaluate(() => localStorage.setItem('daily-ten-active-workout', JSON.stringify({
    v: 1, savedAt: Date.now(), type: 'minimal', idx: 0, seq: [{ name: '錯誤資料', mode: 'time', secs: -9 }]
  })));
  await page.reload();
  await waitReady(page);
  await expect(page.locator('#boot-error')).toHaveCount(0);
  await expect(page.locator('#train')).not.toHaveClass(/active/);
  expect(await page.evaluate(() => localStorage.getItem('daily-ten-active-workout'))).toBeNull();
});

test('計次動作重載後保留已完成次數，等待手動續練', async ({ page }) => {
  await openApp(page, { seed: seedState(readFixture('v3.json')) });
  await page.click('#h-minimal');
  await page.click('#t-skip'); // 預備
  await expect(page.locator('#t-name')).toHaveText('貓牛式');
  await tick(page, 6); // 每下 3 秒
  const count = await page.locator('#t-count').textContent();
  expect(count).toMatch(/^2\/\d+$/);
  await page.reload();
  await waitReady(page);
  await expect(page.locator('#t-name')).toHaveText('貓牛式');
  await expect(page.locator('#t-count')).toHaveText(count);
  await expect(page.locator('#t-pause')).toHaveText('繼續');
  await tick(page, 6);
  await expect(page.locator('#t-count')).toHaveText(count);
  await page.click('#t-pause');
  await tick(page, 3);
  await expect(page.locator('#t-count')).toHaveText(/^3\/\d+$/);
});

test('切到背景時自動暫停，回到前景仍需手動續練', async ({ page }) => {
  await openApp(page, { seed: seedState(readFixture('v3.json')) });
  await page.click('#h-minimal');
  await tick(page, 2);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('#t-pause')).toHaveText('繼續');
  const left = await page.locator('#t-count').textContent();
  await tick(page, 8);
  await expect(page.locator('#t-count')).toHaveText(left);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(page.locator('#t-count')).toHaveText(left);
});

test('組間休息可加 20 秒，重新整理後保留增加的剩餘時間', async ({ page }) => {
  await openApp(page, { seed: seedState(readFixture('v3.json')) });
  await gotoTab(page, 's-train');
  await page.click('#h-rain');
  await page.click('#t-skip'); // 預備
  await expect(page.locator('#t-name')).toContainText('原地快走');
  await expect(page.locator('#t-more-rest')).toBeHidden();
  await tick(page, 42);
  await expect(page.locator('#t-name')).toHaveText('休息');
  const before = Number(await page.locator('#t-count').textContent());
  expect(before).toBeGreaterThan(0);
  await page.click('#t-more-rest');
  const extended = String(before + 20);
  await expect(page.locator('#t-count')).toHaveText(extended);
  await page.reload();
  await waitReady(page);
  await expect(page.locator('#t-name')).toHaveText('休息');
  await expect(page.locator('#t-count')).toHaveText(extended);
  await expect(page.locator('#t-pause')).toHaveText('繼續');
});
