/* New upper-body storyboards: exact movement identity, different T tempos,
   actual workout help, and offline precache. Generic image-loader failures
   remain covered by training-demo.spec.js. */
import { test, expect, readFixture, openApp, seedState, gotoTab, tick, swAssets, waitControlled, waitReady } from './helpers.js';

const guides = [
  { name: '彈力帶開肩', asset: 'band-pull-apart-storyboard.png' },
  { name: '彈力帶側平舉', asset: 'band-lateral-raise-storyboard.png' },
  { name: '俯臥 Y 舉', asset: 'prone-y-raise-storyboard.png' },
  { name: '俯臥 T 舉', asset: 'prone-t-raise-storyboard.png' }
];
const src = asset => `./media/exercises/${asset}`;
const checkpoint = page => page.evaluate(() => JSON.parse(localStorage.getItem('daily-ten-active-workout')));
const fixture = band => {
  const state = JSON.parse(readFixture('v3.json'));
  state.settings.band = band;
  return JSON.stringify(state);
};

async function seek(page, name) {
  for (let i = 0; i < 55; i++) {
    if (await page.locator('#t-name').textContent() === name) return;
    await page.click('#t-skip');
  }
  throw new Error(`Cannot find workout step ${name}`);
}

async function activeHelp(page, name, asset, tempo) {
  await seek(page, name);
  const before = await checkpoint(page);
  expect(before.seq[before.idx]).toMatchObject({ name, mode: 'reps', tempo });
  const phase = await page.locator('#t-phase').textContent();
  await tick(page, tempo);
  const progressed = await checkpoint(page);
  expect(progressed.done).toBe(before.done + 1);
  const count = await page.locator('#t-count').textContent();
  await expect(page.locator('#t-show-demo')).toHaveText('查看 16 格動作影格 · 計時會暫停');
  await page.click('#t-show-demo');
  await expect(page.locator('#dm-name')).toHaveText(name);
  await expect(page.locator('#dm-yt')).toBeHidden();
  await expect(page.locator('#dm-close')).toHaveText('返回訓練');
  const frame = page.locator('#dm-video').getByRole('img', { name: `${name} 16 格動作循環`, exact: true });
  await expect(frame).toBeVisible();
  await expect(frame).toHaveCSS('background-image', new RegExp(asset.replaceAll('.', '\\.')));
  await tick(page, 12);
  await expect(page.locator('#t-count')).toHaveText(count);
  await page.click('#dm-close');
  await expect(page.locator('#t-name')).toHaveText(name);
  await expect(page.locator('#t-phase')).toHaveText(phase);
  await expect(page.locator('#t-count')).toHaveText(count);
  await expect(page.locator('#t-pause')).toHaveText('繼續');
  const after = await checkpoint(page);
  expect(after.seq).toEqual(before.seq);
  expect(after.idx).toBe(before.idx);
  expect(after.done).toBe(progressed.done);
  await tick(page, tempo);
  await expect(page.locator('#t-count')).toHaveText(count);
}

test('動作庫四種動作顯示各自圖，來源比例與 16 格逐格定位正確', async ({ page }) => {
  await openApp(page, { seed: seedState(readFixture('v3.json')) });
  await gotoTab(page, 's-train');
  for (const guide of guides) {
    const button = page.getByRole('button', { name: `${guide.name} 動作說明`, exact: true });
    await expect(button.locator('xpath=../..')).toContainText('16 格站內示範');
    await button.click();
    await expect(page.locator('#dm-name')).toHaveText(guide.name);
    const frame = page.locator('#dm-video').getByRole('img', { name: `${guide.name} 16 格動作循環`, exact: true });
    await expect(frame).toBeVisible();
    await expect(frame).toHaveCSS('background-image', new RegExp(guide.asset.replaceAll('.', '\\.')));
    const dimensions = await page.evaluate(async file => {
      const image = new Image();
      image.src = file;
      await image.decode();
      return [image.naturalWidth, image.naturalHeight];
    }, src(guide.asset));
    expect(dimensions[0]).toBeGreaterThan(500);
    expect(dimensions[1]).toBeGreaterThan(500);
    const bounds = await frame.boundingBox();
    expect(bounds.width / bounds.height).toBeCloseTo(dimensions[0] / dimensions[1], 2);
    const scrub = page.getByRole('slider', { name: '逐格查看動作' });
    await expect(scrub).toHaveAttribute('max', '15');
    for (let i = 0; i < 16; i++) {
      await scrub.fill(String(i));
      await expect(scrub).toHaveValue(String(i));
      const pos = await frame.evaluate(el => el.style.backgroundPosition.split(' ').map(parseFloat));
      expect(pos[0]).toBeCloseTo((i % 4) / 3 * 100, 2);
      expect(pos[1]).toBeCloseTo(Math.floor(i / 4) / 3 * 100, 2);
    }
    await page.click('#dm-close');
  }
});

test('精確 catalog：開肩兩組和加練可用，普通 T 與慢速 T 同圖不同時程，近似動作不混貼', async ({ page }) => {
  await openApp(page, { seed: seedState(readFixture('v3.json')) });
  const entries = await page.evaluate(async () => {
    const { getExerciseStoryboard } = await import('/js/ui/exercise-media.js');
    const item = name => {
      const entry = getExerciseStoryboard(name);
      return entry ? { src: entry.src, ms: entry.frameMs?.reduce((a, b) => a + b, 0) ?? null, sameMotionAs: entry.sameMotionAs ?? null } : null;
    };
    return {
      pull: ['彈力帶開肩', '彈力帶開肩 第1組', '彈力帶開肩 第2組', '彈力帶開肩 加練'].map(item),
      lateral: item('彈力帶側平舉'),
      y: item('俯臥 Y 舉'),
      t: item('俯臥 T 舉'),
      slowT: item('俯臥 T 舉 · 慢速'),
      other: ['彈力帶肩上推', '彈力帶肩外旋 · 左', '彈力帶肩外旋 · 右', '俯臥半程雪天使', '彈力帶側平舉 第1組', '俯臥 Y 舉 · 慢速', '俯臥 T 舉 第1組', '俯臥 T 舉 · 左', '彈力帶開肩 第3組'].map(item)
    };
  });
  expect(entries.pull.map(x => x?.src)).toEqual(Array(4).fill(src(guides[0].asset)));
  expect(entries.lateral?.src).toBe(src(guides[1].asset));
  expect(entries.y?.src).toBe(src(guides[2].asset));
  expect(entries.t?.src).toBe(src(guides[3].asset));
  expect(entries.slowT?.src).toBe(entries.t?.src);
  expect(entries.slowT?.sameMotionAs).toBe('俯臥 T 舉');
  expect(entries.t?.sameMotionAs).toBeNull();
  expect(entries.t.ms).toBeGreaterThanOrEqual(2800);
  expect(entries.t.ms).toBeLessThanOrEqual(3200);
  expect(entries.slowT.ms).toBeGreaterThanOrEqual(3800);
  expect(entries.slowT.ms).toBeLessThanOrEqual(4200);
  expect(entries.other[0]?.src).not.toBe(entries.lateral?.src); // Existing shoulder press has its own illustration.
  expect(entries.other.slice(1)).toEqual(Array(8).fill(null));
});

test('週一有帶肩日：側平舉、Y 與普通 T 求助返回仍是原動作和次數', async ({ page }) => {
  await openApp(page, { now: '2026-10-19T15:30:00+09:00', seed: seedState(fixture(true)) });
  await gotoTab(page, 's-train');
  await page.click('#tr-start');
  for (const [name, asset] of [
    ['彈力帶側平舉', guides[1].asset],
    ['俯臥 Y 舉', guides[2].asset],
    ['俯臥 T 舉', guides[3].asset]
  ]) await activeHelp(page, name, asset, 3);
});

test('週三有帶拉日：開肩工作組及加練均開正確示範，求助不推進序列', async ({ page }) => {
  await openApp(page, { now: '2026-10-21T15:30:00+09:00', seed: seedState(fixture(true)) });
  await gotoTab(page, 's-train');
  await page.click('#tr-start');
  await activeHelp(page, '彈力帶開肩 第1組', guides[0].asset, 3);
  await activeHelp(page, '彈力帶開肩 加練', guides[0].asset, 3);
});

test('週三無帶版慢速 T：同圖但工作組是每下 4 秒，求助期間不計次數', async ({ page }) => {
  await openApp(page, { now: '2026-10-21T15:30:00+09:00', seed: seedState(fixture(false)) });
  await gotoTab(page, 's-train');
  await page.click('#tr-start');
  await seek(page, '俯臥 T 舉 · 慢速');
  const initial = await checkpoint(page);
  expect(initial.seq[initial.idx]).toMatchObject({ name: '俯臥 T 舉 · 慢速', tempo: 4, mode: 'reps' });
  await tick(page, 3);
  expect((await checkpoint(page)).done).toBe(initial.done);
  await activeHelp(page, '俯臥 T 舉 · 慢速', guides[3].asset, 4);
});

test.describe('四張新圖離線預快取', () => {
  test.use({ serviceWorkers: 'allow' });
  test('SW 升版後離線重開可逐張解碼及打開動作庫', async ({ page, context }) => {
    await openApp(page, { seed: seedState(readFixture('v3.json')) });
    const { cache, assets } = swAssets();
    expect(cache).toMatch(/^daily-ten-v\d+$/);
    const files = guides.map(guide => src(guide.asset));
    for (const file of files) expect(assets).toContain(file);
    await waitControlled(page, cache);
    await expect.poll(() => page.evaluate(async ({ cache, files }) => {
      const stored = await caches.open(cache);
      return Promise.all(files.map(async file => !!(await stored.match(file))));
    }, { cache, files })).toEqual([true, true, true, true]);
    await context.setOffline(true);
    await page.reload();
    await waitReady(page);
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);
    await gotoTab(page, 's-train');
    for (const guide of guides) {
      await page.getByRole('button', { name: `${guide.name} 動作說明`, exact: true }).click();
      await expect(page.locator('#dm-video').getByRole('img', { name: `${guide.name} 16 格動作循環`, exact: true })).toBeVisible();
      expect(await page.evaluate(async file => {
        const image = new Image();
        image.src = file;
        await image.decode();
        return image.naturalWidth > 0 && image.naturalHeight > 0;
      }, src(guide.asset))).toBe(true);
      await page.click('#dm-close');
    }
  });
});
