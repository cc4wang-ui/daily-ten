import { test, expect, readFixture, openApp, seedState, gotoTab, tick, storedState, swAssets, waitControlled, waitReady } from './helpers.js';

const DEAD = '死蟲式';
const RUN = '2 英里跑';
const DEAD_LABEL = '16 張姿勢／依序播放 30 步';
const DEAD_ORDER = [0, 1, 2, 3, 4, 5, 6, 7, 6, 5, 4, 3, 2, 1, 0,
  8, 9, 10, 11, 12, 13, 14, 15, 14, 13, 12, 11, 10, 9, 8];
const ASSETS = [
  { name: DEAD, file: 'dead-bug-storyboard.png', label: DEAD_LABEL },
  { name: RUN, file: 'running-storyboard.png', label: '16 格' }
];
const src = file => `./media/exercises/${file}`;
const checkpoint = page => page.evaluate(() => JSON.parse(localStorage.getItem('daily-ten-active-workout')));
function fixture() {
  const state = JSON.parse(readFixture('v3.json'));
  state.settings.band = false;
  return JSON.stringify(state);
}
async function openLibrary(page, guide) {
  const button = page.getByRole('button', { name: `${guide.name} 動作說明`, exact: true });
  await expect(button.locator('xpath=../..')).toContainText(guide.label);
  await button.click();
  await expect(page.locator('#dm-name')).toHaveText(guide.name);
  const accessible = guide.name === DEAD ? `${DEAD} ${DEAD_LABEL}` : `${RUN} 16 格動作循環`;
  const frame = page.locator('#dm-video').getByRole('img', { name: accessible, exact: true });
  await expect(frame).toBeVisible();
  await expect(frame).toHaveCSS('background-image', new RegExp(guide.file.replaceAll('.', '\\.')));
  return frame;
}

test('死蟲式與 2 英里跑只貼精確名稱；兩側30步與跑姿16格標示不誇大', async ({ page }) => {
  await openApp(page, { seed: seedState(fixture()) });
  const entries = await page.evaluate(async names => {
    const { getExerciseStoryboard, getStoryboardLabel } = await import('/js/ui/exercise-media.js');
    return Object.fromEntries(names.map(name => {
      const x = getExerciseStoryboard(name);
      return [name, x && { src: x.src, frames: x.frames, columns: x.columns, order: x.playbackOrder ?? null,
        frameMs: x.frameMs, label: getStoryboardLabel(x), note: x.note }];
    }));
  }, [DEAD, RUN, '死蟲式 第1組', '原地跑', '2 英里跑 第1組', 'HRP 伏地挺身測驗']);
  expect(entries[DEAD]).toMatchObject({ src: src(ASSETS[0].file), frames: 16, columns: 4, order: DEAD_ORDER, label: DEAD_LABEL });
  expect(entries[DEAD].frameMs).toEqual(Array(30).fill(200));
  expect(entries[DEAD].note).toContain('訓練時間仍依計時器');
  expect(entries[RUN]).toMatchObject({ src: src(ASSETS[1].file), frames: 16, columns: 4, order: null, label: '16 格' });
  expect(entries[RUN].frameMs).toEqual(Array(16).fill(200));
  expect(entries[RUN].note).toContain('不是測驗配速');
  expect(entries[RUN].note).toContain('自行完成距離');
  for (const name of ['死蟲式 第1組', '原地跑', '2 英里跑 第1組']) expect(entries[name]).toBeNull();
  expect(entries['HRP 伏地挺身測驗']?.src).not.toBe(entries[RUN].src);
});

test('兩張1254正方原圖可解碼、逐格操作；死蟲式實際30步6秒正確換側', async ({ page }) => {
  await openApp(page, { seed: seedState(fixture()) });
  await gotoTab(page, 's-train');
  for (const guide of ASSETS) {
    const frame = await openLibrary(page, guide);
    const dimensions = await page.evaluate(async file => {
      const img = new Image(); img.src = file; await img.decode();
      return [img.naturalWidth, img.naturalHeight];
    }, src(guide.file));
    expect(dimensions).toEqual([1254, 1254]);
    const bounds = await frame.boundingBox();
    expect(bounds.width / bounds.height).toBeCloseTo(1, 2);
    const demo = page.locator('#dm-video');
    const scrub = demo.getByRole('slider', { name: '逐格查看動作' });
    await expect(scrub).toHaveAttribute('max', '15');
    if (guide.name === DEAD) {
      await expect(scrub).toHaveValue('0');
      for (const source of DEAD_ORDER) {
        await expect(scrub).toHaveValue(String(source));
        await page.clock.runFor(200);
      }
      await expect(scrub).toHaveValue('0');
    }
    await demo.getByRole('button', { name: '暫停影格' }).click();
    await scrub.fill('15');
    await expect(frame).toHaveCSS('background-position', '100% 100%');
    await demo.getByRole('button', { name: '慢速 0.5×' }).click();
    await expect(demo.getByRole('button', { name: '恢復 1×' })).toBeVisible();
    await demo.getByRole('button', { name: '從頭重播' }).click();
    await expect(scrub).toHaveValue('0');
    await page.locator('#dm-close').click();
  }
});

test('下肢課表死蟲式求助返回仍在同一步、剩餘秒數與 checkpoint', async ({ page }) => {
  await openApp(page, { now: '2026-10-20T15:30:00+09:00', seed: seedState(fixture()) });
  await gotoTab(page, 's-train');
  await page.locator('#tr-start').click();
  for (let i = 0; i < 100 && await page.locator('#t-name').textContent() !== DEAD; i++)
    await page.locator('#t-skip').click();
  await expect(page.locator('#t-name')).toHaveText(DEAD);
  const before = await checkpoint(page);
  expect(before.seq[before.idx]).toMatchObject({ name: DEAD, mode: 'time', secs: 30 });
  const count = await page.locator('#t-count').textContent();
  await page.locator('#t-show-demo').click();
  await expect(page.locator('#dm-video').getByRole('img', { name: `${DEAD} ${DEAD_LABEL}`, exact: true })).toBeVisible();
  await tick(page, 12);
  await page.locator('#dm-close').click();
  await expect(page.locator('#t-name')).toHaveText(DEAD);
  await expect(page.locator('#t-count')).toHaveText(count);
  await expect(page.locator('#t-pause')).toHaveText('繼續');
  const after = await checkpoint(page);
  expect(after.seq).toEqual(before.seq);
  expect(after.idx).toBe(before.idx);
  expect(after.left).toBe(before.left);
});

test('Boss 跑步成績頁真實求助入口保留草稿與 checkpoint，重載可再開且取消清理', async ({ page }) => {
  await openApp(page, { now: '2026-10-18T08:00:00+09:00', seed: seedState(readFixture('v3.json')) });
  const before = await storedState(page);
  await page.evaluate(async () => (await import('/js/ui/boss.js')).continueBossWarmup('run2mi'));
  await expect(page.locator('#b-title')).toHaveText('2 英里跑 成績輸入');
  await expect(page.locator('#bi-show-demo')).toHaveText('查看跑姿影格 · 保留已填時間');
  await page.locator('#bi-m').fill('18');
  await page.locator('#bi-s').fill('42');
  const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('daily-ten-active-boss')));
  expect(draft).toMatchObject({ item: 'run2mi', stage: 'input', inputs: { m: '18', s: '42' } });
  await page.locator('#bi-show-demo').click();
  await expect(page.locator('#dm-name')).toHaveText(RUN);
  await expect(page.locator('#dm-video').getByRole('img', { name: `${RUN} 16 格動作循環`, exact: true })).toBeVisible();
  await expect(page.locator('#dm-training-note')).toBeHidden();
  await expect(page.locator('#dm-close')).toHaveText('返回成績輸入');
  await page.locator('#dm-close').click();
  await expect(page.locator('#bi-m')).toHaveValue('18');
  await expect(page.locator('#bi-s')).toHaveValue('42');
  await page.reload();
  await waitReady(page);
  await expect(page.locator('#bi-show-demo')).toBeVisible();
  await expect(page.locator('#bi-m')).toHaveValue('18');
  await expect(page.locator('#bi-s')).toHaveValue('42');
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem('daily-ten-active-boss')))).inputs).toEqual(draft.inputs);
  expect((await storedState(page)).prs.run2mi).toEqual(before.prs.run2mi);
  await page.locator('#bi-show-demo').click();
  await expect(page.locator('#dm-video').getByRole('img', { name: `${RUN} 16 格動作循環`, exact: true })).toBeVisible();
  await page.locator('#dm-close').click();
  await page.locator('#bi-abort').click();
  await expect(page.locator('#bi-show-demo')).toBeHidden();
  await expect(page.locator('#demo-modal')).not.toHaveClass(/active/);
  expect(await page.evaluate(() => localStorage.getItem('daily-ten-active-boss'))).toBeNull();
  expect((await storedState(page)).prs.run2mi).toEqual(before.prs.run2mi);
});

test.describe('最後兩張新圖離線快取', () => {
  test.use({ serviceWorkers: 'allow' });
  test('離線重開仍可解碼死蟲式與跑姿', async ({ page, context }) => {
    await openApp(page, { seed: seedState(fixture()) });
    const { cache, assets } = swAssets();
    const files = ASSETS.map(g => src(g.file));
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
    for (const guide of ASSETS) {
      await openLibrary(page, guide);
      await page.locator('#dm-close').click();
    }
  });
});
