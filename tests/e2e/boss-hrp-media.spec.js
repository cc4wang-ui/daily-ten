import { test, expect, openApp, readFixture, seedState, gotoTab, tick, waitReady, swAssets, waitControlled, storedState } from './helpers.js';

const NOW = '2026-10-18T08:00:00+09:00';
const NAME = 'HRP 伏地挺身';
const TEST_NAME = 'HRP 伏地挺身測驗';
const ASSET = './media/exercises/hrp-push-up-storyboard.png';
const BOSS_KEY = 'daily-ten-active-boss';

async function openLibrary(page) {
  const button = page.getByRole('button', { name: `${NAME} 動作說明`, exact: true });
  await expect(button.locator('xpath=../..')).toContainText('16 格站內示範');
  await button.click();
  await expect(page.locator('#dm-name')).toHaveText(NAME);
  const frame = page.locator('#dm-video').getByRole('img', { name: `${NAME} 16 格動作循環`, exact: true });
  await expect(frame).toBeVisible();
  return frame;
}

test('HRP 僅精確 library 與 Boss 測驗名稱可用；6 秒影格不充當配速', async ({ page }) => {
  await openApp(page, { now: NOW, seed: seedState(readFixture('v3.json')) });
  const entries = await page.evaluate(async names => {
    const { getExerciseStoryboard } = await import('/js/ui/exercise-media.js');
    return Object.fromEntries(names.map(name => {
      const e = getExerciseStoryboard(name);
      return [name, e && { src: e.src, ms: e.frameMs?.reduce((sum, x) => sum + x, 0) ?? null, note: e.note }];
    }));
  }, [NAME, TEST_NAME, 'HRP 伏地挺身 第1組', '伏地挺身 第1組', '伏地挺身 · 跪姿', '派克伏地挺身', '2 英里跑 第1組']);
  expect(entries[NAME]?.src).toBe(ASSET);
  expect(entries[TEST_NAME]?.src).toBe(ASSET);
  expect(entries[NAME].ms).toBe(6000);
  expect(entries[TEST_NAME].note).toContain('非測驗配速或自動計次');
  expect(entries[TEST_NAME].note).toContain('2 分鐘');
  expect(entries['HRP 伏地挺身 第1組']).toBeNull();
  for (const name of ['伏地挺身 第1組', '伏地挺身 · 跪姿', '派克伏地挺身']) expect(entries[name]?.src).not.toBe(ASSET);
  expect(entries['2 英里跑 第1組']).toBeNull();
});

test('HRP 動作庫影格原比例解碼，暫停、逐格、慢速、重播及 375px 視窗可用', async ({ page }, testInfo) => {
  await openApp(page, { now: NOW, seed: seedState(readFixture('v3.json')) });
  await gotoTab(page, 's-train');
  const frame = await openLibrary(page);
  await expect(frame).toHaveCSS('background-image', /hrp-push-up-storyboard\.png/);
  const image = await page.evaluate(async () => {
    const img = new Image(); img.src = './media/exercises/hrp-push-up-storyboard.png';
    await img.decode(); return [img.naturalWidth, img.naturalHeight];
  });
  expect(image).toEqual([1448, 1086]);
  const bounds = await frame.boundingBox();
  expect(bounds.width / bounds.height).toBeCloseTo(image[0] / image[1], 2);
  const demo = page.locator('#dm-video');
  await expect(demo.locator('.exercise-storyboard-note')).toContainText('雙臂向兩側伸直成 T');
  await demo.getByRole('button', { name: '暫停影格' }).click();
  const scrub = demo.getByRole('slider', { name: '逐格查看動作' });
  await expect(scrub).toHaveAttribute('max', '15');
  for (const i of [0, 4, 8, 12, 15]) {
    await scrub.fill(String(i));
    const pos = await frame.evaluate(el => el.style.backgroundPosition.split(' ').map(parseFloat));
    expect(pos[0]).toBeCloseTo(i % 4 / 3 * 100, 2);
    expect(pos[1]).toBeCloseTo(Math.floor(i / 4) / 3 * 100, 2);
  }
  await demo.getByRole('button', { name: '慢速 0.5×' }).click();
  await expect(demo.getByRole('button', { name: '恢復 1×' })).toBeVisible();
  await demo.getByRole('button', { name: '從頭重播' }).click();
  await expect(scrub).toHaveValue('0');
  const mobile = await page.evaluate(() => {
    const body = document.querySelector('#demo-modal .dm-body');
    body.scrollTop = body.scrollHeight;
    const footer = document.querySelector('#demo-modal .dm-footer').getBoundingClientRect();
    const safety = document.querySelector('#dm-safety').getBoundingClientRect();
    return { overflow: document.documentElement.scrollWidth > innerWidth,
      footerBelow: footer.bottom > innerHeight, safetyOverlapped: safety.bottom > footer.top + 1 };
  });
  expect(mobile).toEqual({ overflow: false, footerBelow: false, safetyOverlapped: false });
  await page.screenshot({ path: testInfo.outputPath('hrp-guide-375.png') });
  await page.locator('#dm-close').click();
});

test.describe('HRP 離線影格', () => {
  test.use({ serviceWorkers: 'allow' });
  test('預快取後離線重開仍可解碼及逐格查看', async ({ page, context }) => {
    await openApp(page, { now: NOW, seed: seedState(readFixture('v3.json')) });
    const { cache, assets } = swAssets();
    expect(assets).toContain(ASSET);
    await waitControlled(page, cache);
    await expect.poll(() => page.evaluate(async ({ cache, asset }) => !!(await (await caches.open(cache)).match(asset)), { cache, asset: ASSET })).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await waitReady(page);
    await gotoTab(page, 's-train');
    const frame = await openLibrary(page);
    await expect(frame).toHaveCSS('background-image', /hrp-push-up-storyboard\.png/);
    await page.locator('#dm-video').getByRole('slider', { name: '逐格查看動作' }).fill('8');
    await expect(frame).toBeVisible();
  });
});

test('Boss HRP 求助凍結兩分鐘計時，重載仍停在同秒；成績仍須自行輸入', async ({ page }) => {
  await openApp(page, { now: NOW, seed: seedState(readFixture('v3.json')) });
  const before = await storedState(page);
  await page.evaluate(async () => (await import('/js/ui/boss.js')).continueBossWarmup('hrp'));
  await expect(page.locator('#t-name')).toHaveText(TEST_NAME);
  await expect(page.locator('#t-show-demo')).toHaveText('查看 16 格動作影格 · 計時會暫停');
  await tick(page, 7);
  await expect(page.locator('#t-count')).toHaveText('1:53');
  await page.locator('#t-show-demo').click();
  await expect(page.locator('#dm-name')).toHaveText(TEST_NAME);
  await expect(page.locator('#dm-video').getByRole('img', { name: `${TEST_NAME} 16 格動作循環`, exact: true })).toBeVisible();
  await tick(page, 12);
  await expect(page.locator('#t-count')).toHaveText('1:53');
  await page.locator('#dm-close').click();
  await expect(page.locator('#t-pause')).toHaveText('繼續');
  await page.reload();
  await waitReady(page);
  await expect(page.locator('#t-name')).toHaveText(TEST_NAME);
  await expect(page.locator('#t-count')).toHaveText('1:53');
  await expect(page.locator('#t-pause')).toHaveText('繼續');
  expect((await page.evaluate(key => JSON.parse(localStorage.getItem(key)), BOSS_KEY)).seconds).toBe(113);
  await tick(page, 12);
  await expect(page.locator('#t-count')).toHaveText('1:53');
  expect((await storedState(page)).prs.hrp).toEqual(before.prs.hrp);
  await page.locator('#t-pause').click();
  await tick(page, 113);
  await expect(page.locator('#b-title')).toHaveText('HRP 成績輸入');
  await expect(page.locator('#bi-1')).toHaveValue('');
  await expect(page.locator('#t-show-demo')).toBeHidden();
  await expect(page.locator('#demo-modal')).not.toHaveClass(/active/);
  expect((await storedState(page)).prs.hrp).toEqual(before.prs.hrp);
});

test('Boss Plank 求助凍結碼表，結果頁清掉求助入口；一般訓練重新接回自己的說明', async ({ page }) => {
  await openApp(page, { now: NOW, seed: seedState(readFixture('v3.json')) });
  await page.evaluate(async () => (await import('/js/ui/boss.js')).continueBossWarmup('plank'));
  await expect(page.locator('#t-name')).toHaveText('平板支撐測驗');
  await expect(page.locator('#t-show-demo')).toHaveText('查看 16 格動作影格 · 計時會暫停');
  await tick(page, 7);
  await expect(page.locator('#t-count')).toHaveText('0:07');
  await page.locator('#t-show-demo').click();
  await expect(page.locator('#dm-name')).toHaveText('平板支撐測驗');
  await expect(page.locator('#dm-video').getByRole('img', { name: '平板支撐測驗 16 格動作循環', exact: true })).toBeVisible();
  await tick(page, 12);
  await expect(page.locator('#t-count')).toHaveText('0:07');
  await page.locator('#dm-close').click();
  await expect(page.locator('#t-pause')).toHaveText('繼續');
  await page.reload();
  await waitReady(page);
  await expect(page.locator('#t-count')).toHaveText('0:07');
  await expect(page.locator('#t-pause')).toHaveText('繼續');
  await page.locator('#t-abort').click();
  await expect(page.locator('#b-title')).toHaveText('Plank 成績確認');
  await expect(page.locator('#b-card .boss-result')).toHaveText('0:07');
  await expect(page.locator('#t-show-demo')).toBeHidden();
  await expect(page.locator('#demo-modal')).not.toHaveClass(/active/);
  await page.getByRole('button', { name: '取消測驗', exact: true }).click();
  await page.locator('#h-minimal').click();
  await expect(page.locator('#t-name')).toHaveText('預備');
  await page.locator('#t-show-demo').click();
  await expect(page.locator('#dm-name')).toHaveText('貓牛式');
  await expect(page.locator('#dm-video').getByRole('img', { name: '貓牛式 16 格動作循環', exact: true })).toBeVisible();
});
