import { test, expect, readFixture, openApp, seedState, storedState, rawMain, gotoTab, tick, waitReady } from './helpers.js';

const NOW = '2026-10-02T15:30:00+09:00'; // Friday: none of the three is today's rotating Boss item.
const BOSS_KEY = 'daily-ten-active-boss';
const WORKOUT_KEY = 'daily-ten-active-workout';

const checkpoint = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), BOSS_KEY);
const rawCheckpoint = page => page.evaluate(key => localStorage.getItem(key), BOSS_KEY);
const rawWorkout = page => page.evaluate(key => localStorage.getItem(key), WORKOUT_KEY);

async function enter(page, item) {
  await gotoTab(page, 's-train');
  const practice = page.locator('#tr-practice');
  await expect(practice).toBeVisible();
  await practice.locator(`#tr-practice-${item}`).click();
}

function expectOnlyPrChanged(before, after, item, entry) {
  expect(after.prs[item]).toEqual([...before.prs[item], entry]);
  for (const other of ['hrp', 'plank', 'run2mi'].filter(x => x !== item)) expect(after.prs[other]).toEqual(before.prs[other]);
  expect(after.sessions).toEqual(before.sessions);
  expect(after.xp).toEqual(before.xp);
  expect(after.streak).toEqual(before.streak);
  expect(after.game.xp).toEqual(before.game.xp);
  expect(after.game.streaks).toEqual(before.game.streaks);
  expect(after.game.freezeTokens).toEqual(before.game.freezeTokens);
  expect(after.game.perfectDays).toEqual(before.game.perfectDays);
}

async function savePractice(page, before, item, entry) {
  const weeklyBossBefore = await page.locator('#tr-boss-item').textContent();
  await page.locator('#bi-save').evaluate(button => { button.click(); button.click(); });
  await expect(page.locator('#done')).toHaveClass(/active/);
  await expect(page.locator('#d-identity')).toHaveText('加練完成，成績已記錄。');
  await expect(page.locator('#d-xp')).toContainText('僅記錄 PR');
  const after = await storedState(page);
  expectOnlyPrChanged(before, after, item, entry);
  expect(await rawCheckpoint(page)).toBeNull();
  await page.locator('#d-ok').click();
  await expect(page.locator('#s-train')).toHaveClass(/active/);
  await expect(page.locator('#tr-day')).not.toContainText('已完成');
  await expect(page.locator('#tr-boss-item')).toHaveText(weeklyBossBefore);
  await page.reload();
  await waitReady(page);
  expect(await storedState(page)).toEqual(after);
}

test('平日 HRP 可直接開始 2 分鐘計時；動作說明與重載暫停，明確儲存只新增 PR', async ({ page }) => {
  await openApp(page, { now: NOW, seed: seedState(readFixture('v3.json')) });
  const before = await storedState(page);
  await enter(page, 'hrp');
  await expect(page.locator('#train')).toHaveClass(/active/);
  await expect(page.locator('#t-phase')).toHaveText('加練 · HRP');
  await expect(page.locator('#t-name')).toHaveText('HRP 伏地挺身加練');
  await expect(page.locator('#t-count')).toHaveText('2:00');
  expect(await checkpoint(page)).toMatchObject({ item: 'hrp', practice: true, stage: 'timer', seconds: 120 });
  expect(await rawWorkout(page), '直接加練不啟動暖身課表').toBeNull();
  await tick(page, 7);
  await page.locator('#t-show-demo').click();
  await expect(page.locator('#demo-modal')).toHaveClass(/active/);
  await tick(page, 20);
  await page.locator('#dm-close').click();
  await expect(page.locator('#t-count')).toHaveText('1:53');
  await expect(page.locator('#t-pause')).toHaveText('繼續');
  await page.reload();
  await waitReady(page);
  await expect(page.locator('#t-count')).toHaveText('1:53');
  await expect(page.locator('#t-pause')).toHaveText('繼續');
  expect(await checkpoint(page)).toMatchObject({ item: 'hrp', practice: true, stage: 'timer', seconds: 113 });
  await page.locator('#t-pause').click();
  await tick(page, 113);
  await expect(page.locator('#b-title')).toHaveText('HRP 成績輸入');
  await expect(page.locator('#bi-status')).toContainText('尚未儲存');
  expect(await storedState(page)).toEqual(before);
  await page.locator('#bi-1').fill('23');
  await savePractice(page, before, 'hrp', { date: '2026-10-02', reps: 23 });
});

test('平日 Plank 可直接計時；結束後草稿重載保留，儲存不完成今日課表', async ({ page }) => {
  await openApp(page, { now: NOW, seed: seedState(readFixture('v3.json')) });
  const before = await storedState(page);
  await enter(page, 'plank');
  await expect(page.locator('#t-phase')).toHaveText('加練 · PLANK');
  await expect(page.locator('#t-count')).toHaveText('0:00');
  expect(await checkpoint(page)).toMatchObject({ item: 'plank', practice: true, stage: 'timer' });
  expect(await rawWorkout(page)).toBeNull();
  await tick(page, 21);
  await page.locator('#t-abort').click();
  await expect(page.locator('#b-title')).toHaveText('Plank 成績確認');
  await expect(page.locator('#b-card .boss-result')).toHaveText('0:21');
  expect(await storedState(page)).toEqual(before);
  await page.reload();
  await waitReady(page);
  await expect(page.locator('#b-card .boss-result')).toHaveText('0:21');
  expect(await checkpoint(page)).toMatchObject({ item: 'plank', practice: true, stage: 'input', seconds: 21 });
  await savePractice(page, before, 'plank', { date: '2026-10-02', sec: 21 });
});

test('平日 2 英里跑直接輸入外部計時成績；草稿與明確儲存有界線', async ({ page }) => {
  await openApp(page, { now: NOW, seed: seedState(readFixture('v3.json')) });
  const before = await storedState(page);
  await enter(page, 'run2mi');
  await expect(page.locator('#s-boss')).toHaveClass(/active/);
  await expect(page.locator('#b-title')).toHaveText('2 英里跑 成績輸入');
  expect(await checkpoint(page)).toMatchObject({ item: 'run2mi', practice: true, stage: 'input' });
  expect(await rawWorkout(page)).toBeNull();
  await page.locator('#bi-m').fill('18');
  await page.locator('#bi-save').click();
  await expect(page.locator('#bi-status')).toContainText('請輸入完整時間');
  expect(await storedState(page)).toEqual(before);
  await page.locator('#bi-s').fill('34');
  await page.reload();
  await waitReady(page);
  await expect(page.locator('#bi-m')).toHaveValue('18');
  await expect(page.locator('#bi-s')).toHaveValue('34');
  expect(await storedState(page)).toEqual(before);
  await savePractice(page, before, 'run2mi', { date: '2026-10-02', sec: 1114 });
});

test('今日課表已完成時，加練仍可開始且不改完成狀態、XP 或連續天數', async ({ page }) => {
  const state = JSON.parse(readFixture('v3.json'));
  state.sessions.push({ date: '2026-10-02', type: 'full', xp: 10 });
  state.streak = { current: 13, best: 13, lastDate: '2026-10-02' };
  state.game.streaks.train = { ...state.streak };
  state.game.streaks.life = { ...state.streak };
  await openApp(page, { now: NOW, seed: seedState(JSON.stringify(state)) });
  const before = await storedState(page);
  await gotoTab(page, 's-train');
  await expect(page.locator('#tr-day')).toContainText('已完成');
  await page.locator('#tr-practice-run2mi').click();
  await page.locator('#bi-m').fill('19');
  await page.locator('#bi-s').fill('01');
  await page.locator('#bi-save').click();
  await expect(page.locator('#done')).toHaveClass(/active/);
  const after = await storedState(page);
  expectOnlyPrChanged(before, after, 'run2mi', { date: '2026-10-02', sec: 1141 });
  await page.locator('#d-ok').click();
  await expect(page.locator('#tr-day')).toContainText('已完成');
});

test('取消加練清除草稿；進行中的一般訓練和 Boss 檢查點不被覆蓋', async ({ page }) => {
  await openApp(page, { now: NOW, seed: seedState(readFixture('v3.json')) });
  const before = await rawMain(page);
  await enter(page, 'run2mi');
  await page.locator('#bi-m').fill('20');
  await page.locator('#bi-abort').click();
  await expect(page.locator('#s-train')).toHaveClass(/active/);
  expect(await rawCheckpoint(page)).toBeNull();
  expect(await rawMain(page)).toBe(before);
  await page.reload();
  await waitReady(page);
  await expect(page.locator('#s-boss')).not.toHaveClass(/active/);

  await gotoTab(page, 's-train');
  await page.locator('#tr-start').click();
  await expect(page.locator('#train')).toHaveClass(/active/);
  const workoutBefore = await rawWorkout(page);
  expect(workoutBefore).not.toBeNull();
  const blockedWorkout = await page.evaluate(async () => (await import(new URL('js/ui/boss.js', document.baseURI).href)).startPractice('plank'));
  expect(blockedWorkout).toBe(false);
  expect(await rawWorkout(page)).toBe(workoutBefore);
  expect(await rawCheckpoint(page)).toBeNull();
  await page.locator('#t-abort').click();
  await expect(page.locator('#train')).not.toHaveClass(/active/);

  await page.evaluate(async () => (await import(new URL('js/ui/boss.js', document.baseURI).href)).continueBossWarmup('hrp'));
  const bossBefore = await rawCheckpoint(page);
  expect(JSON.parse(bossBefore)).toMatchObject({ item: 'hrp', stage: 'timer' });
  const blockedBoss = await page.evaluate(async () => (await import(new URL('js/ui/boss.js', document.baseURI).href)).startPractice('run2mi'));
  expect(blockedBoss).toBe(false);
  expect(await rawCheckpoint(page)).toBe(bossBefore);
  await page.reload();
  await waitReady(page);
  await expect(page.locator('#t-name')).toHaveText('HRP 伏地挺身測驗');
  await page.locator('#t-abort').click();
  expect(await rawMain(page)).toBe(before);
});

test('一般次數訓練中止後開始加練，不留下舊組數或回報控制', async ({ page }) => {
  await openApp(page, { now: NOW, seed: seedState(readFixture('v3.json')) });
  const before = await storedState(page);
  await page.locator('#h-minimal').click();
  await page.locator('#t-skip').click();
  await expect(page.locator('#t-feedback-open')).toBeVisible();
  await page.locator('#t-abort').click();
  await enter(page, 'hrp');
  await expect(page.locator('#t-phase')).toHaveText('加練 · HRP');
  await expect(page.locator('#t-feedback-open')).toBeHidden();
  await expect(page.locator('#t-set')).toBeHidden();
  await expect(page.locator('#t-feedback')).toBeHidden();
  expect(await page.evaluate(() => ({
    open: document.getElementById('t-feedback-open').onclick,
    submit: document.getElementById('t-feedback').onsubmit,
    cancel: document.getElementById('t-feedback-cancel').onclick
  }))).toEqual({ open: null, submit: null, cancel: null });
  await tick(page, 2);
  await expect(page.locator('#t-count')).toHaveText('1:58');
  await page.locator('#t-abort').click();
  expect(await storedState(page)).toEqual(before);
  expect(await rawCheckpoint(page)).toBeNull();
});

test('儲存失敗可重試且不重複新增 PR；連按只產生一筆', async ({ page, guard }) => {
  guard.allowConsoleErrors = true;
  await openApp(page, { now: NOW, seed: seedState(readFixture('v3.json')) });
  const before = await storedState(page);
  await enter(page, 'run2mi');
  await page.locator('#bi-m').fill('18');
  await page.locator('#bi-s').fill('34');
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem, storage = window.storage;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'daily-ten-state') throw new Error('QA save failure');
      return setItem.call(this, key, value);
    };
    window.storage = { set: async () => { throw new Error('QA save failure'); } };
    window.__qaRestoreStorage = () => { Storage.prototype.setItem = setItem; window.storage = storage; };
  });
  await page.locator('#bi-save').click();
  await expect(page.locator('#bi-status')).toContainText('儲存失敗');
  expect(await storedState(page)).toEqual(before);
  expect(await checkpoint(page)).toMatchObject({ item: 'run2mi', practice: true, stage: 'input' });
  await page.evaluate(() => window.__qaRestoreStorage());
  await page.reload();
  await waitReady(page);
  await expect(page.locator('#bi-m')).toHaveValue('18');
  await expect(page.locator('#bi-s')).toHaveValue('34');
  await expect(page.locator('#bi-status')).toContainText('尚未儲存');
  await savePractice(page, before, 'run2mi', { date: '2026-10-02', sec: 1114 });
  expect(guard.consoleErrors.length).toBeGreaterThan(0);
});

test.describe('離線', () => {
  test.use({ serviceWorkers: 'allow' });
  test('離線重開後三個直接加練入口仍可用，跑步成績可儲存', async ({ page, context }) => {
    await openApp(page, { now: NOW, seed: seedState(readFixture('v3.json')) });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await context.setOffline(true);
    const networkHits = [];
    await context.route('**/*', route => { networkHits.push(route.request().url()); return route.abort('internetdisconnected'); });
    await page.reload();
    await waitReady(page);
    const before = await storedState(page);
    await gotoTab(page, 's-train');
    for (const item of ['hrp', 'plank', 'run2mi']) await expect(page.locator(`#tr-practice-${item}`)).toBeVisible();
    await page.locator('#tr-practice-run2mi').click();
    await page.locator('#bi-m').fill('20');
    await page.locator('#bi-s').fill('12');
    await page.locator('#bi-save').click();
    await expect(page.locator('#done')).toHaveClass(/active/);
    expectOnlyPrChanged(before, await storedState(page), 'run2mi', { date: '2026-10-02', sec: 1212 });
    expect(networkHits).toEqual([]);
  });
});
