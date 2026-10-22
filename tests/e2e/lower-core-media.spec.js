/* Three local lower-body/core storyboards: exact variants, actual training help,
   static plank timing and offline decode. Visual review of all 4×4 sheets remains
   part of QA because pixel checks cannot judge movement form. */
import { test, expect, readFixture, openApp, seedState, gotoTab, tick, storedState, swAssets, waitControlled, waitReady } from './helpers.js';

const guides = [
  { name: '分腿蹲 · 左', asset: 'split-squat-left-storyboard.png', note: '左腳在前' },
  { name: '分腿蹲 · 右', asset: 'split-squat-right-storyboard.png', note: '右腳在前' },
  { name: '平板支撐', asset: 'forearm-plank-storyboard.png', note: '靜態保持' }
];
const assetPath = asset => `./media/exercises/${asset}`;
const checkpoint = page => page.evaluate(() => JSON.parse(localStorage.getItem('daily-ten-active-workout')));

async function seek(page, name) {
  for (let i = 0; i < 50; i++) {
    if (await page.locator('#t-name').textContent() === name) return;
    await page.click('#t-skip');
  }
  throw new Error(`Cannot find workout step ${name}`);
}

async function assertGuide(page, name, asset, note) {
  await expect(page.locator('#dm-name')).toHaveText(name);
  const demo = page.locator('#dm-video');
  const frame = demo.getByRole('img', { name: `${name} 16 格動作循環`, exact: true });
  await expect(frame).toBeVisible(); // The UI reveals the sheet only after successful decode.
  await expect(frame).toHaveCSS('background-image', new RegExp(asset.replaceAll('.', '\\.')));
  await expect(demo.locator('.exercise-storyboard-note')).toContainText(note);
  await expect(page.locator('#dm-svg')).toBeHidden();
  const dimensions = await page.evaluate(async src => {
    const image = new Image();
    image.src = src;
    await image.decode();
    const canvas = document.createElement('canvas');
    // A square source can have half-pixel grid boundaries (e.g. 1254 px).
    // Scale only the QA sampling canvas to a multiple of four.
    const size = Math.floor(image.naturalWidth / 4) * 4;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, size, size);
    const cell = size / 4;
    const contrast = [];
    for (let row = 0; row < 4; row++) for (let col = 0; col < 4; col++) {
      const data = ctx.getImageData(col * cell, row * cell, cell, cell).data;
      let min = 255, max = 0;
      for (let y = 0; y < cell; y += 8) for (let x = 0; x < cell; x += 8) {
        const p = (y * cell + x) * 4;
        const light = (data[p] + data[p + 1] + data[p + 2]) / 3;
        min = Math.min(min, light);
        max = Math.max(max, light);
      }
      contrast.push(max - min);
    }
    return { width: image.naturalWidth, height: image.naturalHeight, contrast };
  }, assetPath(asset));
  expect(dimensions.width).toBe(dimensions.height);
  expect(dimensions.contrast).toHaveLength(16);
  for (const [index, contrast] of dimensions.contrast.entries()) {
    expect(contrast, `${name} 第 ${index + 1} 格需要有實際內容`).toBeGreaterThan(60);
  }
  const bounds = await frame.boundingBox();
  expect(bounds.width / bounds.height).toBeCloseTo(1, 2);
  const scrub = demo.getByRole('slider', { name: '逐格查看動作' });
  await expect(scrub).toHaveAttribute('max', '15');
  for (let i = 0; i < 16; i++) {
    await scrub.fill(String(i));
    await expect(scrub).toHaveValue(String(i));
    const position = await frame.evaluate(el => el.style.backgroundPosition.split(' ').map(parseFloat));
    expect(position[0]).toBeCloseTo((i % 4) / 3 * 100, 2);
    expect(position[1]).toBeCloseTo(Math.floor(i / 4) / 3 * 100, 2);
    await expect(frame).toBeVisible();
  }
}

test('動作庫左右分腿蹲與平板分別顯示正確圖、文字、16 格及 1:1 比例', async ({ page }) => {
  await openApp(page, { seed: seedState(readFixture('v3.json')) });
  await gotoTab(page, 's-train');
  for (const guide of guides) {
    const button = page.getByRole('button', { name: `${guide.name} 動作說明`, exact: true });
    await expect(button.locator('xpath=../..')).toContainText('16 格站內示範');
    await button.click();
    await assertGuide(page, guide.name, guide.asset, guide.note);
    await page.click('#dm-close');
    await expect(page.locator('#demo-modal')).not.toHaveClass(/active/);
  }
});

test('媒體只接受完全相同的動作名稱及工作組，不會誤貼第三組、弓步或側平板', async ({ page }) => {
  await openApp(page, { seed: seedState(readFixture('v3.json')) });
  const resolved = await page.evaluate(async () => {
    const { getExerciseStoryboard } = await import('/js/ui/exercise-media.js');
    const src = name => getExerciseStoryboard(name)?.src ?? null;
    return {
      left: ['分腿蹲 · 左', '分腿蹲 第1組 · 左', '分腿蹲 第2組 · 左'].map(src),
      right: ['分腿蹲 · 右', '分腿蹲 第1組 · 右', '分腿蹲 第2組 · 右'].map(src),
      plank: ['平板支撐', '平板支撐測驗'].map(src),
      sides: ['側平板 · 左', '側平板 · 右'].map(src),
      unknown: ['分腿蹲 第3組 · 左', '分腿蹲 第3組 · 右', '分腿蹲', '弓步蹲', '弓箭步 · 左', '弓箭步 · 右', '側平板', '高平板支撐', '平板支撐測驗 第1組'].map(src)
    };
  });
  expect(resolved.left).toEqual(Array(3).fill(assetPath(guides[0].asset)));
  expect(resolved.right).toEqual(Array(3).fill(assetPath(guides[1].asset)));
  expect(resolved.plank).toEqual(Array(2).fill(assetPath(guides[2].asset)));
  expect(resolved.sides).toEqual(['side-plank-left-storyboard.png', 'side-plank-right-storyboard.png'].map(assetPath));
  expect(resolved.unknown).toEqual(Array(9).fill(null));
});

test('週二主課表左右分腿蹲在同一步開說明，返回後組數與已完成次數保持', async ({ page }) => {
  await openApp(page, { now: '2026-10-20T15:30:00+09:00', seed: seedState(readFixture('v3.json')) });
  await gotoTab(page, 's-train');
  await page.click('#tr-start');
  for (const [name, asset, note] of [
    ['分腿蹲 第1組 · 左', guides[0].asset, guides[0].note],
    ['分腿蹲 第1組 · 右', guides[1].asset, guides[1].note]
  ]) {
    await seek(page, name);
    const before = await checkpoint(page);
    expect(before.seq[before.idx]).toMatchObject({ name, mode: 'reps' });
    await tick(page, 3);
    const count = await page.locator('#t-count').textContent();
    const phase = await page.locator('#t-phase').textContent();
    const checkText = await page.locator('#t-checkpoint').textContent();
    await page.click('#t-show-demo');
    await expect(page.locator('#dm-close')).toHaveText('返回訓練');
    await expect(page.locator('#dm-name')).toHaveText(name);
    await expect(page.locator('#dm-video').getByRole('img', { name: `${name} 16 格動作循環`, exact: true })).toHaveCSS('background-image', new RegExp(asset.replaceAll('.', '\\.')));
    await expect(page.locator('#dm-video .exercise-storyboard-note')).toContainText(note);
    await tick(page, 12);
    await expect(page.locator('#t-count')).toHaveText(count);
    await page.click('#dm-close');
    await expect(page.locator('#t-name')).toHaveText(name);
    await expect(page.locator('#t-count')).toHaveText(count);
    await expect(page.locator('#t-phase')).toHaveText(phase);
    await expect(page.locator('#t-checkpoint')).toHaveText(checkText);
    await expect(page.locator('#t-pause')).toHaveText('繼續');
    const after = await checkpoint(page);
    expect(after.seq).toEqual(before.seq);
    expect(after.idx).toBe(before.idx);
    expect(after.done).toBe(before.done + 1); // Three elapsed seconds complete one 3-second rep before help.
  }
});

test('保底版 30 秒平板：靜態影格不帶倒數，求助期間與返回後計時凍結、沒有完成紀錄', async ({ page }) => {
  const raw = JSON.parse(readFixture('v3.json'));
  raw.level = 2;
  await openApp(page, { now: '2026-10-19T15:30:00+09:00', seed: seedState(JSON.stringify(raw)) });
  const beforeState = await storedState(page);
  await page.click('#h-minimal');
  await seek(page, '平板支撐');
  const initial = await checkpoint(page);
  expect(initial.seq[initial.idx]).toMatchObject({ name: '平板支撐', mode: 'time', secs: 30 });
  await tick(page, 3);
  await expect(page.locator('#t-count')).toHaveText('27');
  const phase = await page.locator('#t-phase').textContent();
  await page.click('#t-show-demo');
  await expect(page.locator('#dm-video .exercise-storyboard-note')).toContainText('訓練／測驗時間以目前計時器為準');
  const frame = page.locator('#dm-video').getByRole('img', { name: '平板支撐 16 格動作循環', exact: true });
  await expect(frame).toBeVisible();
  const scrub = page.getByRole('slider', { name: '逐格查看動作' });
  await scrub.fill('8'); // A static hold frame is a posture reference, not the workout clock.
  await expect(scrub).toHaveValue('8');
  await tick(page, 12);
  await expect(page.locator('#t-count')).toHaveText('27');
  await expect(scrub).toHaveValue('8');
  await page.click('#dm-close');
  await expect(page.locator('#t-name')).toHaveText('平板支撐');
  await expect(page.locator('#t-count')).toHaveText('27');
  await expect(page.locator('#t-phase')).toHaveText(phase);
  await expect(page.locator('#t-pause')).toHaveText('繼續');
  expect((await checkpoint(page)).left).toBe(27);
  const afterState = await storedState(page);
  expect(afterState.sessions).toEqual(beforeState.sessions);
  expect(afterState.xp).toBe(beforeState.xp);
  await tick(page, 3);
  await expect(page.locator('#t-count')).toHaveText('27');
  await page.click('#t-pause');
  await tick(page, 3);
  await expect(page.locator('#t-count')).toHaveText('24');
});

test.describe('三張新影格離線預快取', () => {
  test.use({ serviceWorkers: 'allow' });
  test('SW 升版後離線重開可解碼左右分腿蹲及平板', async ({ page, context }) => {
    await openApp(page, { seed: seedState(readFixture('v3.json')) });
    const { cache, assets } = swAssets();
    expect(cache).toMatch(/^daily-ten-v\d+$/);
    const files = guides.map(guide => assetPath(guide.asset));
    for (const file of files) expect(assets).toContain(file);
    await waitControlled(page, cache);
    await expect.poll(() => page.evaluate(async ({ cache, files }) => {
      const stored = await caches.open(cache);
      return Promise.all(files.map(async file => !!(await stored.match(file))));
    }, { cache, files })).toEqual([true, true, true]);
    await context.setOffline(true);
    await page.reload();
    await waitReady(page);
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);
    await gotoTab(page, 's-train');
    for (const guide of guides) {
      await page.getByRole('button', { name: `${guide.name} 動作說明`, exact: true }).click();
      await expect(page.locator('#dm-video').getByRole('img', { name: `${guide.name} 16 格動作循環`, exact: true })).toBeVisible();
      const decoded = await page.evaluate(async src => {
        const image = new Image();
        image.src = src;
        await image.decode();
        return [image.naturalWidth, image.naturalHeight];
      }, assetPath(guide.asset));
      expect(decoded[0]).toBe(decoded[1]);
      await page.click('#dm-close');
    }
  });
});
