import { test, expect, openApp, readFixture, readRepo, seedState, gotoTab, tick, waitReady, storedState } from './helpers.js';

const now = '2026-10-19T15:30:00+09:00'; // Monday, level 2 push day.
function evidence(date, name, target = 10, effort = 'easy') {
  return [1, 2].map(set => ({ id: `${date}-${name}-${set}`, date, name: `${name} 第${set}組`, target, actual: target, effort, pain: false, form: true }));
}
function fixture({ level = 2, feedback = true, todayReports = false, deload = false } = {}) {
  const s = JSON.parse(readFixture('v3.json'));
  s.level = level;
  s.settings.band = true;
  s.sessions = ['2026-10-12', '2026-10-15'].map(date => ({ date, type: 'full', xp: 10 }));
  s.game.trainingFeedback = feedback ? s.sessions.flatMap(({ date }) => [
    ...evidence(date, '伏地挺身'), ...evidence(date, '彈力帶肩上推', 10, 'hard')
  ]) : [];
  if (todayReports) {
    s.sessions.push({ date: '2026-10-19', type: 'full', xp: 10 });
    s.game.trainingFeedback.push(...evidence('2026-10-19', '伏地挺身', 11),
      ...evidence('2026-10-19', '伏地挺身', 11).map(f => ({ ...f, id: `${f.id}-repeat` })));
  }
  if (deload) s.habits.sleep.log.push({ date: '2026-10-19', lightsOut: '2026-10-19T02:00:00+09:00', wake: '2026-10-19T07:00:00+09:00', lightsOutEdited: true });
  return JSON.stringify(s);
}
const checkpoint = page => page.evaluate(() => JSON.parse(localStorage.getItem('daily-ten-active-workout')));
async function seek(page, name) {
  for (let i = 0; i < 40; i++) {
    if (await page.locator('#t-name').textContent() === name) return;
    await page.click('#t-skip');
  }
  throw new Error(`Cannot find workout step ${name}`);
}
const targetRow = (page, name) => page.locator('#tr-prescription-list li').filter({ has: page.locator('.prescription-heading > span:first-child', { hasText: new RegExp(`^${name}$`) }) });

test('兩日輕鬆伏地只加該動作，吃力肩推維持10；目標、節奏與預估時間同步', async ({ page }) => {
  await openApp(page, { now, seed: seedState(fixture()) });
  await gotoTab(page, 's-train');
  await expect(targetRow(page, '伏地挺身')).toContainText('基準 10 → 本次 11 下／組');
  await expect(targetRow(page, '彈力帶肩上推')).toContainText('基準 10 → 本次 10 下／組');
  const plan = await page.evaluate(async () => {
    const P = await import('/js/ui/program.js');
    const p = P.todayPlan();
    return { p, seconds: P.estSec(P.planSeq(p, p.lv)), seq: P.planSeq(p, p.lv) };
  });
  await expect(page.locator('#tr-plan-meta')).toContainText(`約 ${Math.round(plan.seconds / 60)} 分`);
  await page.click('#tr-start');
  const saved = await checkpoint(page);
  expect(saved.seq.filter(s => /^伏地挺身 第/.test(s.name)).map(s => s.reps)).toEqual([11, 11]);
  expect(saved.seq.filter(s => /^彈力帶肩上推 第/.test(s.name)).map(s => s.reps)).toEqual([10, 10]);
  expect(saved.seq.reduce((sum, s) => sum + (s.mode === 'time' ? s.secs : s.reps * s.tempo), 0)).toBe(plan.seconds);
  await seek(page, '伏地挺身 第1組');
  await expect(page.locator('#t-count')).toHaveText('0/11');
  await tick(page, 3);
  await expect(page.locator('#t-count')).toHaveText('1/11');
});

test('同日重複完整回報不再加次數，重新開啟也保持11', async ({ page }) => {
  await openApp(page, { now, seed: seedState(fixture({ todayReports: true })) });
  await gotoTab(page, 's-train');
  await expect(targetRow(page, '伏地挺身')).toContainText('本次 11 下／組');
  await expect(page.locator('#tr-start')).toHaveText('再練一次今日課表');
  await page.reload();
  await waitReady(page);
  await gotoTab(page, 's-train');
  await expect(targetRow(page, '伏地挺身')).toContainText('本次 11 下／組');
  await page.click('#tr-start');
  expect((await checkpoint(page)).seq.filter(s => /^伏地挺身 第/.test(s.name)).map(s => s.reps)).toEqual([11, 11]);
});

test('D6降量日即使有L2加量證據，仍採本日L2基準10', async ({ page }) => {
  await openApp(page, { now, seed: seedState(fixture({ level: 3, deload: true })) });
  await expect(page.locator('#h-deload')).toHaveAttribute('data-state', 'active');
  await gotoTab(page, 's-train');
  await expect(targetRow(page, '伏地挺身')).toContainText('基準 10 → 本次 10 下／組');
  await expect(targetRow(page, '伏地挺身')).toContainText('今天降量');
  await page.click('#tr-start');
  expect((await checkpoint(page)).seq.filter(s => /^伏地挺身 第/.test(s.name)).map(s => s.reps)).toEqual([10, 10]);
});

test('舊資料沒有feedback時維持原劑量，暖身與保底不借主課表證據', async ({ page }) => {
  await openApp(page, { now, seed: seedState(fixture({ feedback: false })) });
  await gotoTab(page, 's-train');
  await expect(targetRow(page, '伏地挺身')).toContainText('基準 10 → 本次 10 下／組');
  const result = await page.evaluate(async () => {
    const P = await import('/js/ui/program.js');
    return { warmup: P.fullSeq(2, 'A'), minimal: P.minimalSeq(2), rain: P.rainSeq() };
  });
  expect(result.warmup.find(s => s.name === '伏地挺身').reps).toBe(8);
  expect(result.minimal.find(s => s.name === '貓牛式').reps).toBe(10);
  expect(result.rain.every(s => !s.prescription)).toBe(true);
  await page.click('#tr-start');
  expect((await checkpoint(page)).seq.filter(s => /^伏地挺身 第/.test(s.name)).map(s => s.reps)).toEqual([10, 10]);
});

test('訓練途中回報不重算當次序列；重載同一步仍保留既定11下', async ({ page }) => {
  await openApp(page, { now, seed: seedState(fixture()) });
  await gotoTab(page, 's-train');
  await page.click('#tr-start');
  const initialSeq = (await checkpoint(page)).seq;
  await seek(page, '伏地挺身 第1組');
  await page.click('#t-feedback-open');
  await page.fill('#t-actual', '11');
  await page.selectOption('#t-effort', 'easy');
  await page.click('#t-feedback button[type=submit]');
  await expect(page.locator('#t-name')).not.toHaveText('伏地挺身 第1組');
  expect((await checkpoint(page)).seq).toEqual(initialSeq);
  const feedback = (await storedState(page)).game.trainingFeedback.at(-1);
  expect(feedback).toMatchObject({ name: '伏地挺身 第1組', target: 11, actual: 11, date: '2026-10-19' });
  await seek(page, '伏地挺身 第2組');
  await page.reload();
  await waitReady(page);
  await expect(page.locator('#t-name')).toHaveText('伏地挺身 第2組');
  await expect(page.locator('#t-count')).toHaveText('0/11');
  await expect(page.locator('#t-pause')).toHaveText('繼續');
  expect((await checkpoint(page)).seq).toEqual(initialSeq);
});


test('缺進階規則時保留遊戲層與基準，不靠推測增加次數', async ({ page }) => {
  const rules = JSON.parse(readRepo('data/game.json'));
  delete rules.trainingProgression;
  await page.route('**/data/game.json', route => route.fulfill({ json: rules }));
  await openApp(page, { now, seed: seedState(fixture()) });
  await expect(page.locator('#h-rings')).toBeVisible();
  await gotoTab(page, 's-train');
  await expect(targetRow(page, '伏地挺身')).toContainText('基準 10 → 本次 10 下／組');
  await page.click('#tr-start');
  expect((await checkpoint(page)).seq.filter(s => /^伏地挺身 第/.test(s.name)).map(s => s.reps)).toEqual([10, 10]);
});

test('週三主划船可加量，但獨立加練步驟保持基準；同堂加一輪不再多加一次', async ({ page }) => {
  const s = JSON.parse(fixture());
  s.game.trainingFeedback.push(...evidence('2026-10-12', '彈力帶划船'), ...evidence('2026-10-15', '彈力帶划船'));
  await openApp(page, { now: '2026-10-21T15:30:00+09:00', seed: seedState(JSON.stringify(s)) });
  await gotoTab(page, 's-train');
  await expect(targetRow(page, '彈力帶划船')).toContainText('基準 10 → 本次 11 下／組');
  await page.click('#h-plus');
  const seq = (await checkpoint(page)).seq;
  expect(seq.filter(step => /^彈力帶划船 第/.test(step.name)).map(step => step.reps)).toEqual([11, 11, 11, 11]);
  expect(seq.find(step => step.name === '彈力帶划船 加練').reps).toBe(10);
  expect(seq.find(step => step.name === '彈力帶划船 加練').prescription).toBeUndefined();
});
