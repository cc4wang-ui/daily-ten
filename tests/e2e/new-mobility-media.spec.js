import { test, expect, readFixture, openApp, seedState, gotoTab, tick, swAssets, waitControlled, waitReady } from './helpers.js';

const GUIDES = [
  { name: '穿針式 · 左', asset: 'needle-left-storyboard.png', cue: '左手' },
  { name: '穿針式 · 右', asset: 'needle-right-storyboard.png', cue: '右手' },
  { name: '側平板 · 左', asset: 'side-plank-left-storyboard.png', cue: '左前臂' },
  { name: '側平板 · 右', asset: 'side-plank-right-storyboard.png', cue: '右前臂' },
  { name: '嬰兒式側伸展', asset: 'child-side-stretch-storyboard.png', cue: '左右各做一半時間' },
  { name: '俯臥半程雪天使', asset: 'prone-half-floor-angel-storyboard.png', cue: 'W' },
  { name: '派克伏地挺身', asset: 'pike-push-up-storyboard.png', cue: '倒 V' },
  { name: '躺姿脊椎扭轉', asset: 'supine-twist-storyboard.png', cue: '左右各做一半時間' },
  { name: '世界最強伸展 · 左', asset: 'worlds-greatest-stretch-left-storyboard.png', cue: '左腳在前' },
  { name: '世界最強伸展 · 右', asset: 'worlds-greatest-stretch-right-storyboard.png', cue: '右腳在前' },
  { name: '鴿式', asset: 'pigeon-pose-storyboard.png', cue: '左右各做一半時間' },
  { name: '下犬↔上犬流動', asset: 'down-up-dog-flow-storyboard.png', cue: '膝蓋維持離地' },
  { name: '反向雪天使', asset: 'reverse-snow-angel-storyboard.png', cue: '頭頂' },
  { name: '超人式划船（低阻力）', asset: 'superman-row-storyboard.png', cue: '胸口' }
];
const src = asset => `./media/exercises/${asset}`;
const checkpoint = page => page.evaluate(() => JSON.parse(localStorage.getItem('daily-ten-active-workout')));
function fixture(band = true) {
  const s = JSON.parse(readFixture('v3.json'));
  s.settings.band = band;
  return JSON.stringify(s);
}
async function seek(page, name) {
  for (let i = 0; i < 65; i++) {
    if (await page.locator('#t-name').textContent() === name) return;
    await page.locator('#t-skip').click();
  }
  throw new Error(`Cannot find workout step ${name}`);
}
async function openLibrary(page, guide) {
  const button = page.getByRole('button', { name: `${guide.name} 動作說明`, exact: true });
  await expect(button.locator('xpath=../..')).toContainText('16 格站內示範');
  await button.click();
  await expect(page.locator('#dm-name')).toHaveText(guide.name);
  const demo = page.locator('#dm-video');
  const frame = demo.getByRole('img', { name: `${guide.name} 16 格動作循環`, exact: true });
  await expect(frame).toBeVisible();
  await expect(frame).toHaveCSS('background-image', new RegExp(guide.asset.replaceAll('.', '\\.')));
  await expect(demo.locator('.exercise-storyboard-note')).toContainText(guide.cue);
  return { demo, frame };
}

test('十四張影格只貼精確動作；重複與靜態停留提示符合訓練劑量', async ({ page }) => {
  await openApp(page, { seed: seedState(fixture(false)) });
  const entries = await page.evaluate(async names => {
    const { getExerciseStoryboard } = await import('/js/ui/exercise-media.js');
    const item = name => {
      const x = getExerciseStoryboard(name);
      return x && { src: x.src, ms: x.frameMs.reduce((sum, n) => sum + n, 0), note: x.note, sameMotionAs: x.sameMotionAs ?? null };
    };
    return Object.fromEntries(names.map(name => [name, item(name)]));
  }, [...GUIDES.map(g => g.name), '派克伏地挺身 第1組', '派克伏地挺身 第2組',
    '反向雪天使 加練', '超人式划船 第1組', '超人式划船 第2組', '超人式划船 加練',
    '深蹲', '控制深蹲', '派克伏地挺身 第3組', '腳抬高派克伏地挺身',
    '穿針式', '側平板', '側平板 · 左 第1組', '平板支撐 · 左',
    '超人式划船', '超人式停留', '彈力帶肩外旋 · 左', 'HRP 伏地挺身 第1組', '原地跑']);
  for (const guide of GUIDES) expect(entries[guide.name]?.src).toBe(src(guide.asset));
  for (const name of ['穿針式 · 左', '穿針式 · 右', '俯臥半程雪天使', '派克伏地挺身']) {
    expect(entries[name].ms).toBe(4000);
    expect(entries[name].note).toContain('4 秒');
  }
  for (const name of ['側平板 · 左', '側平板 · 右']) {
    expect(entries[name].note).toContain('訓練計時器');
    expect(entries[name].note).toContain('靜態保持');
  }
  for (const name of ['嬰兒式側伸展', '躺姿脊椎扭轉']) expect(entries[name].note).toContain('不是實際停留的倒數速度');
  for (const name of ['世界最強伸展 · 左', '世界最強伸展 · 右']) expect(entries[name].note).toContain('訓練計時器');
  expect(entries['鴿式'].note).toContain('左右各做一半時間');
  expect(entries['下犬↔上犬流動'].ms).toBe(6000);
  for (const name of ['反向雪天使', '超人式划船（低阻力）']) expect(entries[name].ms).toBe(3000);
  expect(entries['反向雪天使 加練']?.src).toBe(src('reverse-snow-angel-storyboard.png'));
  for (const name of ['超人式划船 第1組', '超人式划船 第2組', '超人式划船 加練']) expect(entries[name]?.src).toBe(src('superman-row-storyboard.png'));
  expect(entries['深蹲']?.src).toBe(entries['控制深蹲']?.src);
  expect(entries['深蹲']?.sameMotionAs).toBe('控制深蹲');
  expect(entries['深蹲']?.ms).toBe(3000);
  expect(entries['控制深蹲']?.ms).toBe(4000);
  expect(entries['派克伏地挺身 第1組']?.src).toBe(src('pike-push-up-storyboard.png'));
  expect(entries['派克伏地挺身 第2組']?.src).toBe(src('pike-push-up-storyboard.png'));
  for (const name of ['派克伏地挺身 第3組', '腳抬高派克伏地挺身', '穿針式', '側平板', '側平板 · 左 第1組', '平板支撐 · 左', '超人式划船', '超人式停留', '彈力帶肩外旋 · 左', 'HRP 伏地挺身 第1組', '原地跑']) expect(entries[name]).toBeNull();
});

test('十四張動作庫影格可解碼、逐格、慢速、暫停與重播；375px 無溢出和遮擋', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await openApp(page, { seed: seedState(fixture(false)) });
  await gotoTab(page, 's-train');
  for (const guide of GUIDES) {
    const { demo, frame } = await openLibrary(page, guide);
    const size = await page.evaluate(async file => {
      const image = new Image(); image.src = file; await image.decode();
      return [image.naturalWidth, image.naturalHeight];
    }, src(guide.asset));
    expect(size[0]).toBeGreaterThan(500);
    expect(size[1]).toBeGreaterThan(500);
    const bounds = await frame.boundingBox();
    expect(bounds.width / bounds.height).toBeCloseTo(size[0] / size[1], 2);
    await demo.getByRole('button', { name: '暫停影格' }).click();
    const scrub = demo.getByRole('slider', { name: '逐格查看動作' });
    await expect(scrub).toHaveAttribute('max', '15');
    for (const i of [0, 5, 10, 15]) {
      await scrub.fill(String(i));
      const pos = await frame.evaluate(el => el.style.backgroundPosition.split(' ').map(parseFloat));
      expect(pos[0]).toBeCloseTo(i % 4 / 3 * 100, 2);
      expect(pos[1]).toBeCloseTo(Math.floor(i / 4) / 3 * 100, 2);
    }
    await demo.getByRole('button', { name: '慢速 0.5×' }).click();
    await expect(demo.getByRole('button', { name: '恢復 1×' })).toBeVisible();
    await demo.getByRole('button', { name: '從頭重播' }).click();
    await expect(scrub).toHaveValue('0');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const layout = await page.evaluate(() => {
      const body = document.querySelector('#demo-modal .dm-body');
      const footer = document.querySelector('#demo-modal .dm-footer');
      const modal = document.querySelector('#demo-modal .box');
      return { bodyBottom: body.getBoundingClientRect().bottom, footerTop: footer.getBoundingClientRect().top,
        footerBottom: footer.getBoundingClientRect().bottom, modalBottom: modal.getBoundingClientRect().bottom,
        viewportBottom: innerHeight, bodyScrollable: body.scrollHeight > body.clientHeight };
    });
    expect(layout.footerTop).toBeGreaterThanOrEqual(layout.bodyBottom - 1);
    expect(layout.footerBottom).toBeLessThanOrEqual(layout.viewportBottom);
    expect(layout.modalBottom).toBeLessThanOrEqual(layout.viewportBottom);
    expect(layout.bodyScrollable).toBe(true);
    const safetyClear = await page.evaluate(() => {
      const body = document.querySelector('#demo-modal .dm-body');
      body.scrollTop = body.scrollHeight;
      const safety = document.querySelector('#dm-safety').getBoundingClientRect();
      const footer = document.querySelector('#demo-modal .dm-footer').getBoundingClientRect();
      return safety.bottom <= footer.top + 1 && safety.top >= body.getBoundingClientRect().top - 1;
    });
    expect(safetyClear, `${guide.name}：捲到底後安全提示不被返回鍵遮住`).toBe(true);
    if (guide.name === '側平板 · 左') await page.screenshot({ path: testInfo.outputPath('new-media-375.png') });
    await page.locator('#dm-close').click();
  }
});

async function pausedHelp(page, name, asset, mode, tempo) {
  await seek(page, name);
  const before = await checkpoint(page);
  expect(before.seq[before.idx]).toMatchObject({ name, mode, ...(tempo ? { tempo } : {}) });
  const count = await page.locator('#t-count').textContent();
  await page.locator('#t-show-demo').click();
  const frame = page.locator('#dm-video').getByRole('img', { name: `${name} 16 格動作循環`, exact: true });
  await expect(frame).toBeVisible();
  await expect(frame).toHaveCSS('background-image', new RegExp(asset.replaceAll('.', '\\.')));
  await tick(page, 12);
  await page.locator('#dm-close').click();
  await expect(page.locator('#t-name')).toHaveText(name);
  await expect(page.locator('#t-count')).toHaveText(count);
  await expect(page.locator('#t-pause')).toHaveText('繼續');
  const after = await checkpoint(page);
  expect(after.seq).toEqual(before.seq);
  expect(after.idx).toBe(before.idx);
  expect(after.done).toBe(before.done);
  expect(after.left).toBe(before.left);
}

test('C 全身流動三個新步驟求助返回後，計時與 checkpoint 不流失', async ({ page }) => {
  await openApp(page, { now: '2026-10-21T15:30:00+09:00', seed: seedState(fixture(false)) });
  await gotoTab(page, 's-train');
  await page.locator('#tr-start').click();
  for (const [name, asset] of [
    ['世界最強伸展 · 左', 'worlds-greatest-stretch-left-storyboard.png'],
    ['世界最強伸展 · 右', 'worlds-greatest-stretch-right-storyboard.png'],
    ['下犬↔上犬流動', 'down-up-dog-flow-storyboard.png']
  ]) await pausedHelp(page, name, asset, 'time');
});

test('A 鴿式求助返回後維持原訓練', async ({ page }) => {
  await openApp(page, { now: '2026-10-19T15:30:00+09:00', seed: seedState(fixture(false)) });
  await gotoTab(page, 's-train');
  await page.locator('#tr-start').click();
  await pausedHelp(page, '鴿式', 'pigeon-pose-storyboard.png', 'time');
});

test('無帶上背三組划船與反向雪天使求助後保留 checkpoint', async ({ page }) => {
  await openApp(page, { now: '2026-10-21T15:30:00+09:00', seed: seedState(fixture(false)) });
  await gotoTab(page, 's-train');
  await page.locator('#tr-start').click();
  for (const name of ['超人式划船 第1組', '超人式划船 第2組', '超人式划船 加練'])
    await pausedHelp(page, name, 'superman-row-storyboard.png', 'reps', 3);
  await pausedHelp(page, '反向雪天使 加練', 'reverse-snow-angel-storyboard.png', 'reps', 3);
});

test('B 伸展四秒步驟求助期間不前進，返回同一步與已完成次數', async ({ page }) => {
  await openApp(page, { now: '2026-10-20T15:30:00+09:00', seed: seedState(fixture()) });
  await gotoTab(page, 's-train');
  await page.locator('#tr-start').click();
  for (const name of ['穿針式 · 左', '穿針式 · 右', '俯臥半程雪天使']) {
    await seek(page, name);
    const before = await checkpoint(page);
    expect(before.seq[before.idx]).toMatchObject({ name, mode: 'reps', tempo: 4 });
    await tick(page, 4);
    const progressed = await checkpoint(page);
    expect(progressed.done).toBe(before.done + 1);
    const count = await page.locator('#t-count').textContent();
    const phase = await page.locator('#t-phase').textContent();
    await page.locator('#t-show-demo').click();
    await expect(page.locator('#dm-video').getByRole('img', { name: `${name} 16 格動作循環`, exact: true })).toBeVisible();
    await tick(page, 12);
    await expect(page.locator('#t-count')).toHaveText(count);
    await page.locator('#dm-close').click();
    await expect(page.locator('#t-name')).toHaveText(name);
    await expect(page.locator('#t-count')).toHaveText(count);
    await expect(page.locator('#t-phase')).toHaveText(phase);
    await expect(page.locator('#t-pause')).toHaveText('繼續');
    const after = await checkpoint(page);
    expect(after.seq).toEqual(before.seq);
    expect(after.idx).toBe(before.idx);
    expect(after.done).toBe(progressed.done);
  }
});

test('側平板靜態保持求助不扣秒，影格提示不冒充倒數', async ({ page }) => {
  await openApp(page, { now: '2026-10-21T15:30:00+09:00', seed: seedState(fixture()) });
  await gotoTab(page, 's-train');
  await page.locator('#tr-start').click();
  for (const name of ['側平板 · 左', '側平板 · 右']) {
    await seek(page, name);
    const before = await checkpoint(page);
    expect(before.seq[before.idx]).toMatchObject({ name, mode: 'time', secs: 20 });
    await tick(page, 3);
    const count = await page.locator('#t-count').textContent();
    await page.locator('#t-show-demo').click();
    await expect(page.locator('#dm-video .exercise-storyboard-note')).toContainText('請依訓練計時器保持');
    await page.getByRole('slider', { name: '逐格查看動作' }).fill('8');
    await tick(page, 12);
    await page.locator('#dm-close').click();
    await expect(page.locator('#t-name')).toHaveText(name);
    await expect(page.locator('#t-count')).toHaveText(count);
    expect((await checkpoint(page)).left).toBe(before.left - 3);
  }
});

test('新圖載入失敗可重試，並保留 B 伸展的訓練 checkpoint', async ({ page, guard }) => {
  guard.allowConsoleErrors = true;
  let first = true;
  await page.route('**/media/exercises/needle-left-storyboard.png', route => {
    if (first) { first = false; return route.abort('failed'); }
    return route.continue();
  });
  await openApp(page, { now: '2026-10-20T15:30:00+09:00', seed: seedState(fixture()) });
  await gotoTab(page, 's-train');
  await page.locator('#tr-start').click();
  await seek(page, '穿針式 · 左');
  const before = await checkpoint(page);
  await page.locator('#t-show-demo').click();
  const demo = page.locator('#dm-video');
  await expect(demo).toContainText('本機動作影格無法載入');
  await expect(demo.getByRole('img')).toBeHidden();
  await demo.getByRole('button', { name: '重試載入影格' }).click();
  await expect(demo.getByRole('img', { name: '穿針式 · 左 16 格動作循環', exact: true })).toBeVisible();
  await tick(page, 10);
  await page.locator('#dm-close').click();
  const after = await checkpoint(page);
  expect(after.seq).toEqual(before.seq);
  expect(after.idx).toBe(before.idx);
  expect(after.done).toBe(before.done);
  await expect(page.locator('#t-pause')).toHaveText('繼續');
  expect(guard.consoleErrors.filter(x => !/^Failed to load resource: net::ERR_FAILED$/.test(x))).toEqual([]);
});

test.describe('新十四張影格離線快取', () => {
  test.use({ serviceWorkers: 'allow' });
  test('SW 快取全部檔案，離線重開後動作庫可解碼每張影格', async ({ page, context }) => {
    test.setTimeout(90_000);
    await openApp(page, { seed: seedState(fixture(false)) });
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
      const { frame } = await openLibrary(page, guide);
      await expect(frame).toBeVisible();
      await page.locator('#dm-close').click();
    }
  });
});
