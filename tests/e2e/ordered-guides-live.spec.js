import { test, expect, readFixture, openApp, seedState, gotoTab, tick, swAssets, waitControlled, waitReady } from './helpers.js';

const ORDER8 = [0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1];
const ORDER16 = Array.from({ length: 16 }, (_, i) => i).concat(Array.from({ length: 14 }, (_, i) => 14 - i));
const GUIDES = [
  { name: '提踵', asset: 'calf-raise-storyboard.png', frames: 8, steps: 14, ms: 2000 },
  { name: '單腳提踵 · 左', asset: 'calf-raise-left-storyboard.png', frames: 8, steps: 14, ms: 2000 },
  { name: '單腳提踵 · 右', asset: 'calf-raise-right-storyboard.png', frames: 8, steps: 14, ms: 2000 },
  { name: '彈力帶肩外旋 · 左', asset: 'band-external-rotation-left-storyboard.png', frames: 16, steps: 30, ms: 3000 },
  { name: '彈力帶肩外旋 · 右', asset: 'band-external-rotation-right-storyboard.png', frames: 16, steps: 30, ms: 3000 }
];
const src = asset => `./media/exercises/${asset}`;
const label = guide => `${guide.frames} 張姿勢／往返播放 ${guide.steps} 步`;
const checkpoint = page => page.evaluate(() => JSON.parse(localStorage.getItem('daily-ten-active-workout')));
function fixture(band) {
  const state = JSON.parse(readFixture('v3.json'));
  state.settings.band = band;
  return JSON.stringify(state);
}
async function seek(page, name) {
  for (let i = 0; i < 100; i++) {
    if (await page.locator('#t-name').textContent() === name) return;
    await page.locator('#t-skip').click();
  }
  throw new Error(`Cannot find workout step ${name}`);
}
async function openLibrary(page, guide) {
  const button = page.getByRole('button', { name: `${guide.name} 動作說明`, exact: true });
  await expect(button.locator('xpath=../..')).toContainText(label(guide));
  await button.click();
  await expect(page.locator('#dm-name')).toHaveText(guide.name);
  const frame = page.locator('#dm-video').getByRole('img', { name: `${guide.name} ${label(guide)}`, exact: true });
  await expect(frame).toBeVisible();
  await expect(frame).toHaveCSS('background-image', new RegExp(guide.asset.replaceAll('.', '\\.')));
  return frame;
}

test('五張實圖只貼精確課表名稱，影格數、順序、完整往返節奏與文案相符', async ({ page }) => {
  await openApp(page, { seed: seedState(fixture(true)) });
  const result = await page.evaluate(async names => {
    const { getExerciseStoryboard } = await import('/js/ui/exercise-media.js');
    const { fullSeq, blockSeq } = await import('/js/ui/program.js');
    const find = name => {
      const x = getExerciseStoryboard(name);
      return x && { src: x.src, frames: x.frames, columns: x.columns, order: x.playbackOrder,
        frameMs: x.frameMs, note: x.note };
    };
    return { entries: Object.fromEntries(names.map(name => [name, find(name)])),
      unsupported: ['單腳提踵', '提踵 第1組', '彈力帶肩外旋', '彈力帶肩外旋 · 左 第1組', '死蟲式 第1組', '原地跑'].map(find),
      boss: fullSeq(1, 'A').map(x => x.name), lower: blockSeq('lower', 1).map(x => x.name), pull: blockSeq('pull', 1).map(x => x.name) };
  }, GUIDES.map(g => g.name));
  for (const guide of GUIDES) {
    const entry = result.entries[guide.name];
    expect(entry.src).toBe(src(guide.asset));
    expect(entry.frames).toBe(guide.frames);
    expect(entry.columns).toBe(4);
    expect(entry.order).toEqual(guide.frames === 8 ? ORDER8 : ORDER16);
    expect(entry.frameMs).toHaveLength(guide.steps);
    expect(entry.frameMs.reduce((sum, ms) => sum + ms, 0)).toBe(guide.ms);
    expect(entry.note).toContain(guide.frames === 8 ? '2 秒' : '3 秒');
  }
  expect(result.unsupported).toEqual(Array(6).fill(null));
  expect(result.boss).toContain('提踵');
  expect(result.lower).toEqual(expect.arrayContaining(['單腳提踵 · 左', '單腳提踵 · 右']));
  expect(result.pull).toEqual(expect.arrayContaining(['彈力帶肩外旋 · 左', '彈力帶肩外旋 · 右']));
});

test('五張實圖在動作庫可解碼，4×2/4×4 原生格比例、來源拖曳與控制正確', async ({ page }) => {
  await openApp(page, { seed: seedState(fixture(true)) });
  await gotoTab(page, 's-train');
  for (const guide of GUIDES) {
    const frame = await openLibrary(page, guide);
    const dimensions = await page.evaluate(async asset => {
      const image = new Image(); image.src = asset; await image.decode();
      return [image.naturalWidth, image.naturalHeight];
    }, src(guide.asset));
    expect(dimensions).toEqual([1536, 1024]);
    const rows = guide.frames / 4;
    const bounds = await frame.boundingBox();
    expect(bounds.width / bounds.height).toBeCloseTo(dimensions[0] * rows / (dimensions[1] * 4), 2);
    await expect(frame).toHaveCSS('background-size', `400% ${rows * 100}%`);
    const demo = page.locator('#dm-video');
    await demo.getByRole('button', { name: '暫停影格' }).click();
    const scrub = demo.getByRole('slider', { name: '逐格查看動作' });
    await expect(scrub).toHaveAttribute('max', String(guide.frames - 1));
    await scrub.fill(String(guide.frames - 1));
    await expect(frame).toHaveCSS('background-position', '100% 100%');
    await demo.getByRole('button', { name: '慢速 0.5×' }).click();
    await expect(demo.getByRole('button', { name: '恢復 1×' })).toBeVisible();
    await demo.getByRole('button', { name: '從頭重播' }).click();
    await expect(scrub).toHaveValue('0');
    await page.locator('#dm-close').click();
  }
});

test('正式圖片播放確實由第 0 格走到最高格再逆序返回，2 秒與 3 秒整圈吻合', async ({ page }) => {
  await openApp(page, { seed: seedState(fixture(true)) });
  await gotoTab(page, 's-train');
  for (const guide of [GUIDES[0], GUIDES[3]]) {
    await openLibrary(page, guide);
    const scrub = page.locator('#dm-video').getByRole('slider', { name: '逐格查看動作' });
    const order = guide.frames === 8 ? ORDER8 : ORDER16;
    const durations = guide.frames === 8 ? [...Array(12).fill(143), 142, 142] : Array(30).fill(100);
    await expect(scrub).toHaveValue('0');
    for (let i = 0; i < order.length; i++) {
      await expect(scrub).toHaveValue(String(order[i]));
      await page.clock.runFor(durations[i]);
    }
    await expect(scrub).toHaveValue('0');
    await page.locator('#dm-close').click();
  }
});

for (const scenario of [
  { label: '下肢單腳提踵', now: '2026-10-20T15:30:00+09:00', band: false, names: ['單腳提踵 · 左', '單腳提踵 · 右'] },
  { label: '有帶上背肩外旋', now: '2026-10-21T15:30:00+09:00', band: true, names: ['彈力帶肩外旋 · 左', '彈力帶肩外旋 · 右'] }
]) {
  test(`${scenario.label}實際求助返回，同一步同次數且計時暫停`, async ({ page }) => {
    await openApp(page, { now: scenario.now, seed: seedState(fixture(scenario.band)) });
    await gotoTab(page, 's-train');
    await page.locator('#tr-start').click();
    for (const name of scenario.names) {
      const guide = GUIDES.find(g => g.name === name);
      await seek(page, name);
      const before = await checkpoint(page);
      expect(before.seq[before.idx]).toMatchObject({ name, mode: 'reps', tempo: guide.ms / 1000 });
      const count = await page.locator('#t-count').textContent();
      const phase = await page.locator('#t-phase').textContent();
      await page.locator('#t-show-demo').click();
      await expect(page.locator('#dm-video').getByRole('img', { name: `${name} ${label(guide)}`, exact: true })).toBeVisible();
      await tick(page, 12);
      await page.locator('#dm-close').click();
      await expect(page.locator('#t-name')).toHaveText(name);
      await expect(page.locator('#t-count')).toHaveText(count);
      await expect(page.locator('#t-phase')).toHaveText(phase);
      await expect(page.locator('#t-pause')).toHaveText('繼續');
      const after = await checkpoint(page);
      expect(after.seq).toEqual(before.seq);
      expect(after.idx).toBe(before.idx);
      expect(after.done).toBe(before.done);
      expect(after.left).toBe(before.left);
    }
  });
}

test.describe('五張新圖離線快取', () => {
  test.use({ serviceWorkers: 'allow' });
  test('離線重開後動作庫仍可逐張解碼', async ({ page, context }) => {
    await openApp(page, { seed: seedState(fixture(true)) });
    const { cache, assets } = swAssets();
    const files = GUIDES.map(g => src(g.asset));
    for (const file of files) expect(assets).toContain(file);
    await waitControlled(page, cache);
    await expect.poll(() => page.evaluate(async ({ cache, files }) => {
      const stored = await caches.open(cache);
      return Promise.all(files.map(async file => !!(await stored.match(file))));
    }, { cache, files })).toEqual(files.map(() => true));
    await context.setOffline(true);
    await page.reload();
    await waitReady(page);
    await gotoTab(page, 's-train');
    for (const guide of GUIDES) {
      await openLibrary(page, guide);
      await page.locator('#dm-close').click();
    }
  });
});
