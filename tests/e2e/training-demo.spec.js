import { test, expect, readFixture, openApp, seedState, storedState, tick, runWorkoutToEnd, waitReady, gotoTab } from './helpers.js';

test('動作庫可在站內逐格播放伏地挺身，重播與慢速不離開頁面', async ({ page }) => {
  await openApp(page, { seed: seedState(readFixture('v3.json')) });
  await gotoTab(page, 's-train');
  await page.getByRole('button', { name: '伏地挺身 動作說明', exact: true }).click();
  await expect(page.locator('#demo-modal')).toHaveClass(/active/);
  await expect(page.locator('#dm-video .exercise-storyboard')).toBeVisible();
  await expect(page.locator('#dm-video')).toContainText('16 格循環');
  await expect(page.locator('#dm-video .exercise-storyboard-frame')).toHaveCSS('background-image', /push-up-storyboard-v2\.png/);
  const scrub = page.getByRole('slider', { name: '逐格查看動作' });
  await expect(scrub).toHaveAttribute('max', '15');
  await page.getByRole('button', { name: '暫停影格' }).click();
  await scrub.fill('8');
  await expect(scrub).toHaveValue('8');
  await page.getByRole('button', { name: '從頭重播' }).click();
  await expect(scrub).toHaveValue('0');
  await page.getByRole('button', { name: '慢速 0.5×' }).click();
  await expect(page.getByRole('button', { name: '恢復 1×' })).toBeVisible();
  await expect(page.locator('#dm-yt')).toBeVisible();
  await page.click('#dm-close');
  await expect(page.locator('#demo-modal')).not.toHaveClass(/active/);
  await expect(page.locator('#s-train')).toHaveClass(/active/);
});

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
  await expect(page.locator('#dm-video')).toContainText('16 格循環');
  await expect(page.locator('#dm-close')).toBeInViewport();
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

test('影格載入失敗可原址重試，求助全程暫停並返回同一訓練檢查點', async ({ page, guard }) => {
  // 刻意中止圖片會產生瀏覽器資源錯誤；仍檢查沒有其他 console error。
  guard.allowConsoleErrors = true;
  const requests = [];
  let pendingImage;
  await page.route('**/media/exercises/cat-cow-storyboard.png', route => {
    requests.push(route.request().url());
    if (requests.length === 1) { pendingImage = route; return; }
    return route.continue();
  });
  await openApp(page, { seed: seedState(readFixture('v3.json')) });
  await page.click('#h-minimal');
  await tick(page, 3);
  await expect(page.locator('#t-count')).toHaveText('7');
  const checkpoint = await page.locator('#t-checkpoint').textContent();
  await page.click('#t-show-demo');
  await expect.poll(() => requests.length).toBe(1);
  const demo = page.locator('#dm-video');
  await expect(demo.getByRole('status')).toHaveText('正在載入動作影格…');
  await expect(demo.getByRole('img')).toBeHidden();
  await expect(demo.getByRole('slider')).toBeHidden();
  await expect(demo.getByRole('button', { name: '從頭重播' })).toBeHidden();
  await expect(demo.getByRole('button', { name: '慢速 0.5×' })).toBeHidden();
  await tick(page, 3);
  await expect(page.locator('#t-count')).toHaveText('7');
  await pendingImage.abort('failed');
  await expect(demo).toContainText('本機動作影格無法載入');
  const retry = demo.getByRole('button', { name: '重試載入影格', exact: true });
  await expect(retry).toBeVisible();
  await expect(demo.getByRole('img')).toBeHidden();
  await expect(demo.getByRole('slider')).toBeHidden();
  await expect(page.locator('#t-pause')).toHaveText('繼續');
  await tick(page, 3);
  await expect(page.locator('#t-count')).toHaveText('7');
  await retry.click();
  await expect(demo.getByRole('img', { name: '貓牛式 16 格動作循環', exact: true })).toBeVisible();
  await expect(demo.getByRole('slider', { name: '逐格查看動作' })).toBeVisible();
  await expect(demo.getByRole('button', { name: '從頭重播' })).toBeVisible();
  await expect(demo.getByRole('button', { name: '慢速 0.5×' })).toBeVisible();
  await expect(retry).toBeHidden();
  expect(requests.length).toBeGreaterThanOrEqual(2);
  expect(new Set(requests).size, '重試使用相同離線資源網址').toBe(1);
  await tick(page, 3);
  await expect(page.locator('#t-count')).toHaveText('7');
  await page.click('#dm-close');
  await expect(page.locator('#demo-modal')).not.toHaveClass(/active/);
  await expect(page.locator('#t-name')).toHaveText('預備');
  await expect(page.locator('#t-count')).toHaveText('7');
  await expect(page.locator('#t-checkpoint')).toHaveText(checkpoint);
  await expect(page.locator('#t-pause')).toHaveText('繼續');
  await tick(page, 3);
  await expect(page.locator('#t-count')).toHaveText('7');
  expect(guard.consoleErrors.filter(message => !/^Failed to load resource: net::ERR_FAILED$/.test(message))).toEqual([]);
});

test('載入途中關閉後打開另一動作，舊圖片完成不會替換或重啟新示範', async ({ page }) => {
  let pendingImage;
  await page.route('**/media/exercises/push-up-storyboard-v2.png', route => { pendingImage = route; });
  await openApp(page, { seed: seedState(readFixture('v3.json')) });
  await gotoTab(page, 's-train');
  await page.getByRole('button', { name: '伏地挺身 動作說明', exact: true }).click();
  const demo = page.locator('#dm-video');
  await expect(demo.getByRole('status')).toHaveText('正在載入動作影格…');
  await expect.poll(() => !!pendingImage).toBe(true);
  // 關閉可能取消舊請求，也可能讓它繼續；兩種瀏覽器行為都要安全。
  const oldImageSettled = Promise.race([
    page.waitForEvent('requestfinished', request => request.url().endsWith('/push-up-storyboard-v2.png')),
    page.waitForEvent('requestfailed', request => request.url().endsWith('/push-up-storyboard-v2.png'))
  ]);
  await page.click('#dm-close');
  await expect(page.locator('#demo-modal')).not.toHaveClass(/active/);
  await page.getByRole('button', { name: '控制深蹲 動作說明', exact: true }).click();
  await expect(page.locator('#dm-name')).toHaveText('控制深蹲');
  const frame = demo.getByRole('img', { name: '控制深蹲 16 格動作循環', exact: true });
  await expect(frame).toBeVisible();
  await expect(frame).toHaveCSS('background-image', /controlled-squat-storyboard\.png/);
  await demo.getByRole('button', { name: '暫停影格', exact: true }).click();
  const scrub = demo.getByRole('slider', { name: '逐格查看動作' });
  await scrub.fill('8');
  // 舊請求現在才完成，必須保留新視窗的動作、影格與暫停狀態。
  await pendingImage.continue();
  await oldImageSettled;
  await tick(page, 20);
  await expect(page.locator('#demo-modal')).toHaveClass(/active/);
  await expect(page.locator('#dm-name')).toHaveText('控制深蹲');
  await expect(demo.getByRole('img')).toHaveCount(1);
  await expect(frame).toBeVisible();
  await expect(frame).toHaveCSS('background-image', /controlled-squat-storyboard\.png/);
  await expect(scrub).toHaveValue('8');
  await expect(demo.getByRole('button', { name: '播放影格', exact: true })).toBeVisible();
  await expect(demo.getByRole('button', { name: '重試載入影格', exact: true })).toBeHidden();
  await page.click('#dm-close');
  await tick(page, 20);
  await expect(page.locator('#demo-modal')).not.toHaveClass(/active/);
  await expect(demo.getByRole('img')).toHaveCount(0);
});

test('圖片解碼失敗後可重試，減少動態效果仍保持暫停影格', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const decode = HTMLImageElement.prototype.decode;
    let failed = false;
    HTMLImageElement.prototype.decode = function () {
      if (!failed && this.src.endsWith('/push-up-storyboard-v2.png')) {
        failed = true;
        return Promise.reject(new Error('測試：圖片解碼失敗'));
      }
      return decode.call(this);
    };
  });
  await openApp(page, { seed: seedState(readFixture('v3.json')) });
  await gotoTab(page, 's-train');
  await page.getByRole('button', { name: '伏地挺身 動作說明', exact: true }).click();
  const demo = page.locator('#dm-video');
  await expect(demo).toContainText('本機動作影格無法載入');
  await expect(demo.getByRole('img')).toBeHidden();
  await expect(demo.getByRole('slider')).toBeHidden();
  await demo.getByRole('button', { name: '重試載入影格', exact: true }).click();
  await expect(demo.getByRole('img', { name: '伏地挺身 16 格動作循環', exact: true })).toBeVisible();
  await expect(demo.getByRole('button', { name: '播放影格', exact: true })).toBeVisible();
  const scrub = demo.getByRole('slider', { name: '逐格查看動作' });
  await expect(scrub).toHaveValue('0');
  await tick(page, 20);
  await expect(scrub).toHaveValue('0');
  await expect(demo.getByRole('button', { name: '播放影格', exact: true })).toBeVisible();
  await page.click('#dm-close');
});

test('影格請求停住 15 秒後顯示重試，恢復後可正常逐格操作', async ({ page }) => {
  let pendingImage;
  let attempts = 0;
  await page.route('**/media/exercises/push-up-storyboard-v2.png', route => {
    attempts++;
    if (attempts === 1) { pendingImage = route; return; }
    return route.continue();
  });
  await openApp(page, { seed: seedState(readFixture('v3.json')) });
  await gotoTab(page, 's-train');
  await page.getByRole('button', { name: '伏地挺身 動作說明', exact: true }).click();
  const demo = page.locator('#dm-video');
  await expect.poll(() => !!pendingImage).toBe(true);
  await expect(demo.getByRole('status')).toHaveText('正在載入動作影格…');
  await tick(page, 14);
  await expect(demo.getByRole('status')).toHaveText('正在載入動作影格…');
  await expect(demo.getByRole('button', { name: '重試載入影格', exact: true })).toBeHidden();
  await tick(page, 1);
  await expect(demo).toContainText('本機動作影格無法載入');
  await expect(demo.getByRole('img')).toBeHidden();
  await expect(demo.getByRole('slider')).toBeHidden();
  await demo.getByRole('button', { name: '重試載入影格', exact: true }).click();
  await expect(demo.getByRole('img', { name: '伏地挺身 16 格動作循環', exact: true })).toBeVisible();
  expect(attempts).toBeGreaterThanOrEqual(2);
  const scrub = demo.getByRole('slider', { name: '逐格查看動作' });
  await scrub.fill('8');
  await expect(scrub).toHaveValue('8');
  await expect(demo.getByRole('button', { name: '播放影格', exact: true })).toBeVisible();
  await pendingImage.continue();
  await tick(page, 20);
  await expect(scrub).toHaveValue('8');
  await expect(demo.getByRole('button', { name: '重試載入影格', exact: true })).toBeHidden();
  await page.click('#dm-close');
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
