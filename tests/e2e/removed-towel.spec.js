import { test, expect, openApp, readFixture, seedState, gotoTab, tick, waitReady, runWorkoutToEnd, storedState } from './helpers.js';

const NOW = '2026-10-21T15:30:00+09:00'; // Wednesday, pull block plus extra.
const TOWEL = '毛巾直臂下拉 第1組';
const checkpoint = page => page.evaluate(() => JSON.parse(localStorage.getItem('daily-ten-active-workout')));

function fixture(band, level = 2) {
  const state = JSON.parse(readFixture('v3.json'));
  state.level = level;
  state.settings.band = band;
  return JSON.stringify(state);
}

for (const [level, rows] of [[1, 8], [2, 10], [3, 12], [4, 12], [5, 15]]) {
test(`L${level} 新無帶拉日移除毛巾與專屬休息，估時等於實際序列`, async ({ page }) => {
  await openApp(page, { now: NOW, seed: seedState(fixture(false, level)) });
  await gotoTab(page, 's-train');
  const meta = await page.locator('#tr-plan-meta').textContent();
  expect(meta).toContain('上背低阻力');
  const plan = await page.evaluate(async () => {
    const p = await import('/js/ui/program.js');
    const today = p.todayPlan();
    const block = p.blockSeq('pull', today.lv);
    const raw = p.planSeq(today, today.lv);
    return { block, raw, timed: p.addTransitions(raw), seconds: p.estSec(raw), minutes: today.min };
  });
  expect(plan.block.map(s => [s.name, s.mode === 'time' ? s.secs : s.reps])).toEqual([
    ['超人式划船 第1組', rows], ['組間休息', 60],
    ['超人式划船 第2組', rows], ['組間休息', 60],
    ['俯臥 T 舉 · 慢速', 10], ['組間休息', 40],
    ['側平板 · 左', 20], ['側平板 · 右', 20]
  ]);
  expect(plan.raw.map(s => s.name).join(' ')).not.toContain('毛巾直臂下拉');
  expect(plan.timed.filter(s => s.name === '換器材')).toEqual([]);
  expect(plan.timed.some(s => s.prep?.includes('毛巾直臂下拉'))).toBe(false);
  expect(plan.minutes).toBe(Math.round(plan.seconds / 60));
  expect(meta).toContain(`約 ${plan.minutes} 分`);
  await page.locator('#tr-start').click();
  const running = await checkpoint(page);
  expect(running.seq).toEqual(plan.timed);
  expect(running.seq.reduce((sum, s) => sum + (s.mode === 'time' ? s.secs : s.reps * s.tempo), 0)).toBe(plan.seconds);
  expect(running.seq.map(s => s.name).join(' ')).not.toContain('毛巾直臂下拉');
});
}

test('有帶拉日保留原本的划船、開肩、外旋、側平板與休息', async ({ page }) => {
  await openApp(page, { now: NOW, seed: seedState(fixture(true)) });
  await gotoTab(page, 's-train');
  const block = await page.evaluate(async () => {
    const p = await import('/js/ui/program.js');
    return p.blockSeq('pull', 2).map(s => [s.name, s.mode === 'time' ? s.secs : s.reps]);
  });
  expect(block).toEqual([
    ['彈力帶划船 第1組', 10], ['組間休息', 60],
    ['彈力帶划船 第2組', 10], ['組間休息', 60],
    ['彈力帶開肩 第1組', 12], ['組間休息', 45],
    ['彈力帶開肩 第2組', 12], ['組間休息', 45],
    ['彈力帶肩外旋 · 左', 10], ['彈力帶肩外旋 · 右', 10],
    ['側平板 · 左', 20], ['側平板 · 右', 20]
  ]);
  await page.locator('#tr-start').click();
  const seq = (await checkpoint(page)).seq;
  expect(seq.map(s => s.name).join(' ')).not.toContain('毛巾直臂下拉');
  expect(seq.some(s => s.name === '彈力帶划船 加練')).toBe(true);
});

test('舊毛巾步驟的 checkpoint 原樣恢復；說明明示已移除，安全略過不記完成或 XP', async ({ page }) => {
  const seq = [
    { name: '預備', sub: '手機放地上 · 就位', mode: 'time', secs: 10, prep: TOWEL },
    { name: TOWEL, sub: 'Towel Pull-down ×10 · 雙手互相對抗，不固定在物體上', mode: 'reps', reps: 10, tempo: 4 },
    { name: '組間休息', sub: 'Rest', mode: 'time', secs: 45 }
  ];
  const old = { v: 1, savedAt: Date.parse(NOW), runId: 'legacy-towel-run', seq, idx: 1,
    type: 'cycle', plus: false, paused: false, skippedAction: false, pendingAdvance: false, left: null, done: 3 };
  await openApp(page, { now: NOW, seed: seedState(fixture(false)) });
  const before = await storedState(page);
  await page.evaluate(raw => localStorage.setItem('daily-ten-active-workout', raw), JSON.stringify(old));
  await page.reload();
  await waitReady(page);
  await expect(page.locator('#train')).toHaveClass(/active/);
  await expect(page.locator('#t-checkpoint')).toContainText('已恢復');
  await expect(page.locator('#t-name')).toHaveText(TOWEL);
  await expect(page.locator('#t-count')).toHaveText('3/10');
  await expect(page.locator('#t-pause')).toHaveText('繼續');
  expect((await checkpoint(page)).seq).toEqual(seq);
  expect((await checkpoint(page)).idx).toBe(1);
  await tick(page, 8);
  await expect(page.locator('#t-count')).toHaveText('3/10');
  await expect(page.locator('#t-no-demo')).toContainText('目前沒有此動作的完整示範');
  await page.locator('#t-show-demo').click();
  await expect(page.locator('#dm-name')).toHaveText('毛巾直臂下拉（舊版已移除）');
  await expect(page.locator('#dm-cue')).toContainText('舊版項目，已從新課表移除');
  await expect(page.locator('#dm-cue')).toContainText('原名稱「直臂」不準確');
  await expect(page.locator('#dm-video')).toContainText('還沒有經審核的離線影片');
  await expect(page.locator('#dm-video').getByRole('img')).toHaveCount(0);
  await expect(page.locator('#dm-skip')).toBeVisible();
  await page.locator('#dm-skip').click();
  await expect(page.locator('#t-name')).toHaveText('組間休息');
  await runWorkoutToEnd(page, 90);
  await expect(page.locator('#d-xp')).toHaveText('未記為完成');
  const after = await storedState(page);
  expect(after.sessions).toEqual(before.sessions);
  expect(after.xp).toBe(before.xp);
  expect(after.game.xp).toEqual(before.game.xp);
});
