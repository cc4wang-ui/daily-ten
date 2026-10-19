/* Four new local storyboards must work through real UI paths, including rain
   movements that intentionally have no legacy DT_DEMOS animation key. */
import { test, expect, readFixture, openApp, seedState, gotoTab, tick, storedState, swAssets, waitControlled, waitReady } from './helpers.js';

const guides = [
  { name: '彈力帶肩上推', asset: 'band-overhead-press-storyboard.png', note: /雙腳踩/ },
  { name: '彈力帶羅馬尼亞硬舉', asset: 'band-rdl-storyboard.png', note: /雙腳踩/ },
  { name: '原地快走', asset: 'march-in-place-storyboard.png', note: /左右交替/ },
  { name: '側步開合', asset: 'step-jack-storyboard.png', note: /左右輪流/ }
];

for (const guide of guides) {
  test(`動作庫：${guide.name} 載入本機 16 格，可暫停逐格並返回`, async ({ page }) => {
    await openApp(page, { seed: seedState(readFixture('v3.json')) });
    const initialUrl = page.url();
    await gotoTab(page, 's-train');
    const button = page.getByRole('button', { name: `${guide.name} 動作說明`, exact: true });
    await expect(button.locator('xpath=../..')).toContainText('16 格站內示範');
    await button.click();
    await expect(page.locator('#dm-name')).toHaveText(guide.name);
    const demo = page.locator('#dm-video');
    const frame = demo.getByRole('img', { name: `${guide.name} 16 格動作循環`, exact: true });
    await expect(frame).toBeVisible(); // The loader reveals this only after PNG decode succeeds.
    await expect(frame).toHaveCSS('background-image', new RegExp(guide.asset.replaceAll('.', '\\.')));
    // A sheet's 4×4 cells retain the same aspect ratio as the full PNG.
    // OHP is 1426×1104, so forcing the common 3:2 ratio would stretch the person.
    const sourceRatio = await page.evaluate(async asset => {
      const image = new Image();
      image.src = `./media/exercises/${asset}`;
      await image.decode();
      return image.naturalWidth / image.naturalHeight;
    }, guide.asset);
    const bounds = await frame.boundingBox();
    expect(bounds.width / bounds.height).toBeCloseTo(sourceRatio, 2);

    await expect(demo.locator('.exercise-storyboard-note')).toContainText(guide.note);
    await expect(page.locator('#dm-svg')).toBeHidden();
    await demo.getByRole('button', { name: '暫停影格', exact: true }).click();
    const scrub = demo.getByRole('slider', { name: '逐格查看動作' });
    await expect(scrub).toHaveAttribute('max', '15');
    await scrub.fill('15');
    await tick(page, 3);
    await expect(scrub).toHaveValue('15');
    await expect(frame).toHaveCSS('background-position', '100% 100%');
    await page.click('#dm-close');
    await expect(page.locator('#demo-modal')).not.toHaveClass(/active/);
    await expect(page.locator('#s-train')).toHaveClass(/active/);
    expect(page.url()).toBe(initialUrl);
  });
}

for (const guide of guides.slice(2)) {
  test(`雨天訓練：${guide.name} 無舊動畫 key 也有示範，關閉保留同一步與秒數`, async ({ page, context }) => {
    await openApp(page, { seed: seedState(readFixture('v3.json')) });
    const before = await storedState(page);
    expect(await page.evaluate(name => window.DT_DEMOS.keyFor(name), guide.name)).toBeNull();
    await gotoTab(page, 's-train');
    await page.click('#h-rain');
    await page.click('#t-skip'); // Preparation.
    if (guide.name === '側步開合') {
      await page.click('#t-skip'); // First march.
      await page.click('#t-skip'); // Intervening rest.
    }
    const exactName = `${guide.name} R1`;
    await expect(page.locator('#t-name')).toHaveText(exactName);
    await tick(page, 3);
    await expect(page.locator('#t-count')).toHaveText('37');
    const phase = await page.locator('#t-phase').textContent();
    const checkpoint = await page.locator('#t-checkpoint').textContent();
    await expect(page.locator('#t-show-demo')).toHaveText('查看 16 格動作影格 · 計時會暫停');
    await page.click('#t-show-demo');
    await expect(page.locator('#dm-name')).toHaveText(exactName);
    const frame = page.locator('#dm-video').getByRole('img', { name: `${exactName} 16 格動作循環`, exact: true });
    await expect(frame).toBeVisible();
    await expect(frame).toHaveCSS('background-image', new RegExp(guide.asset.replaceAll('.', '\\.')));
    await expect(page.locator('#dm-cue')).not.toBeEmpty();
    await expect(page.locator('#dm-yt')).toBeHidden();
    await expect(page.locator('#dm-close')).toHaveText('返回訓練');
    await expect(page.locator('#dm-close')).toBeInViewport();
    await tick(page, 12);
    await expect(page.locator('#t-count')).toHaveText('37');
    await page.click('#dm-close');
    await expect(page.locator('#t-name')).toHaveText(exactName);
    await expect(page.locator('#t-count')).toHaveText('37');
    await expect(page.locator('#t-phase')).toHaveText(phase);
    await expect(page.locator('#t-checkpoint')).toHaveText(checkpoint);
    await expect(page.locator('#t-pause')).toHaveText('繼續');
    await tick(page, 3);
    await expect(page.locator('#t-count')).toHaveText('37');
    await page.click('#t-pause');
    await tick(page, 3);
    await expect(page.locator('#t-count')).toHaveText('34');
    expect(context.pages()).toHaveLength(1);
    const after = await storedState(page);
    expect(after.sessions).toEqual(before.sessions);
    expect(after.xp).toBe(before.xp);
  });
}

test('新增影格只對應明確名稱，兩組彈力帶與五輪雨天皆對應且不誤套其他動作', async ({ page }) => {
  await openApp(page, { seed: seedState(readFixture('v3.json')) });
  const result = await page.evaluate(async () => {
    const { getExerciseStoryboard } = await import('/js/ui/exercise-media.js');
    const resolve = name => getExerciseStoryboard(name)?.src ?? null;
    const band = ['彈力帶肩上推', '彈力帶羅馬尼亞硬舉'].map(name => [resolve(name), resolve(`${name} 第1組`), resolve(`${name} 第2組`)]);
    const rain = ['原地快走', '側步開合'].map(name => [resolve(name), ...Array.from({ length: 5 }, (_, i) => resolve(`${name} R${i + 1}`))]);
    const unknown = ['彈力帶肩上推 第3組', '彈力帶羅馬尼亞硬舉 第3組', '彈力帶側平舉 第1組', '羅馬尼亞硬舉', '原地快走 R6', '側步開合 R6', '開合跳'].map(resolve);
    return { band, rain, unknown };
  });
  expect(result.band).toEqual(guides.slice(0, 2).map(g => Array(3).fill(`./media/exercises/${g.asset}`)));
  expect(result.rain).toEqual(guides.slice(2).map(g => Array(6).fill(`./media/exercises/${g.asset}`)));
  expect(result.unknown).toEqual(Array(7).fill(null));
});


test.describe('新增影格離線預快取', () => {
  test.use({ serviceWorkers: 'allow' });
  test('離線重開後四個新動作皆可解碼並逐格查看', async ({ page, context }) => {
    await openApp(page, { seed: seedState(readFixture('v3.json')) });
    const { cache, assets } = swAssets();
    for (const guide of guides) expect(assets).toContain(`./media/exercises/${guide.asset}`);
    await waitControlled(page, cache);
    await expect.poll(() => page.evaluate(async ({ cache, files }) => {
      const stored = await caches.open(cache);
      return Promise.all(files.map(async file => !!(await stored.match(file))));
    }, { cache, files: guides.map(g => `./media/exercises/${g.asset}`) })).toEqual([true, true, true, true]);
    await context.setOffline(true);
    await page.reload();
    await waitReady(page);
    await gotoTab(page, 's-train');
    for (const guide of guides) {
      await page.getByRole('button', { name: `${guide.name} 動作說明`, exact: true }).click();
      const demo = page.locator('#dm-video');
      await expect(demo.getByRole('img', { name: `${guide.name} 16 格動作循環`, exact: true })).toBeVisible();
      const scrub = demo.getByRole('slider', { name: '逐格查看動作' });
      await scrub.fill('8');
      await expect(scrub).toHaveValue('8');
      await expect(demo.getByRole('button', { name: '重試載入影格', exact: true })).toBeHidden();
      await page.click('#dm-close');
    }
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);
  });
});
