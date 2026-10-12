import { test, expect, readFixture, openApp, seedState, storedState, tick, runWorkoutToEnd } from './helpers.js';

test('訓練中示範留在 App，暫停並返回同一步與剩餘時間', async ({ page }) => {
  await openApp(page, { seed: seedState(readFixture('v3.json')) });
  await page.click('#h-minimal');
  await expect(page.locator('#t-name')).toHaveText('預備');
  await expect(page.locator('#t-checkpoint')).toContainText('準備下一步');
  await expect(page.locator('#t-next')).toContainText('貓牛式');
  await tick(page, 3);
  await expect(page.locator('#t-count')).toHaveText('7');
  await expect(page.locator('#t-show-demo')).toBeVisible();
  await page.click('#t-show-demo');
  await expect(page.locator('#demo-modal')).toHaveClass(/active/);
  await expect(page.locator('#dm-training-note')).toBeVisible();
  await expect(page.locator('#dm-yt')).toBeHidden();
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
