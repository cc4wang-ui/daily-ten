import { test, expect, readFixture, openApp, seedState, storedState, tick, waitReady } from './helpers.js';

const BOSS_KEY = 'daily-ten-active-boss';
const NOW = '2026-10-18T08:00:00+09:00';

async function startTest(page, item) {
  // 暖身已有完整流程測試；直接接續測驗，集中驗證中斷與恢復。
  await page.evaluate(async item => {
    const boss = await import(new URL('js/ui/boss.js', document.baseURI).href);
    boss.continueBossWarmup(item);
  }, item);
}

async function reloadReady(page) {
  await page.reload();
  await waitReady(page);
}

async function visibility(page, state) {
  await page.evaluate(state => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => state === 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  }, state);
}

async function expectUnrecorded(page, before) {
  const after = await storedState(page);
  expect(after.prs).toEqual(before.prs);
  expect(after.sessions).toEqual(before.sessions);
  expect(after.xp).toBe(before.xp);
  expect(after.game.xp).toEqual(before.game.xp);
}

async function blockMainWrites(page) {
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem;
    const storage = window.storage;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'daily-ten-state') throw new Error('測試：無法儲存主要資料');
      return setItem.call(this, key, value);
    };
    window.storage = { set: async () => { throw new Error('測試：儲存失敗'); } };
    window.__restoreBossStorage = () => { Storage.prototype.setItem = setItem; window.storage = storage; };
  });
}

async function saveOnce(page, before, item, score) {
  // 同一顆按鈕連按兩次，包含第一個存檔尚未完成的情況。
  await page.locator('#bi-save').evaluate(button => { button.click(); button.click(); });
  await expect(page.locator('#done')).toHaveClass(/active/);
  const after = await storedState(page);
  expect(after.prs[item]).toHaveLength(before.prs[item].length + 1);
  expect(after.prs[item].at(-1)).toEqual({ date: '2026-10-18', ...score });
  expect(after.sessions).toHaveLength(before.sessions.length + 1);
  expect(after.sessions.at(-1)).toMatchObject({ date: '2026-10-18', type: 'boss' });
  expect(after.xp).toBeGreaterThan(before.xp);
  expect(await page.evaluate(key => localStorage.getItem(key), BOSS_KEY)).toBeNull();
  await reloadReady(page);
  const reloaded = await storedState(page);
  expect(reloaded.prs).toEqual(after.prs);
  expect(reloaded.sessions).toEqual(after.sessions);
  expect(reloaded.xp).toBe(after.xp);
  await expect(page.locator('#train')).not.toHaveClass(/active/);
  await expect(page.locator('#s-boss')).not.toHaveClass(/active/);
}

test('HRP 重載保留秒數並暫停，背景時間不計入，成績草稿只在明確儲存後記錄一次', async ({ page }) => {
  await openApp(page, { now: NOW, seed: seedState(readFixture('v3.json')) });
  const before = await storedState(page);
  await startTest(page, 'hrp');
  await tick(page, 17);
  await expect(page.locator('#t-count')).toHaveText('1:43');
  await reloadReady(page);
  await expect(page.locator('#t-name')).toHaveText('HRP 伏地挺身測驗');
  await expect(page.locator('#t-count')).toHaveText('1:43');
  await expect(page.locator('#t-pause')).toHaveText('繼續');
  await expect(page.locator('#t-checkpoint')).toContainText('已恢復');
  await tick(page, 20);
  await expect(page.locator('#t-count')).toHaveText('1:43');
  await page.click('#t-pause');
  await tick(page, 3);
  await expect(page.locator('#t-count')).toHaveText('1:40');
  await visibility(page, 'hidden');
  await expect(page.locator('#t-pause')).toHaveText('繼續');
  await tick(page, 30);
  await visibility(page, 'visible');
  await tick(page, 5);
  await expect(page.locator('#t-count')).toHaveText('1:40');
  await page.click('#t-pause');
  await tick(page, 100);
  await expect(page.locator('#b-title')).toHaveText('HRP 成績輸入');
  await expect(page.locator('#bi-interrupted')).toBeVisible();
  await expect(page.locator('#bi-interrupted')).toContainText('分段計時');
  await page.fill('#bi-1', '22');
  await reloadReady(page);
  await expect(page.locator('#s-boss')).toHaveClass(/active/);
  await expect(page.locator('#bi-1')).toHaveValue('22');
  await expect(page.locator('#bi-status')).toContainText('尚未儲存');
  await expect(page.locator('#bi-interrupted')).toBeVisible();
  await expect(page.locator('#bi-interrupted')).toContainText('分段計時');
  await expectUnrecorded(page, before);
  await saveOnce(page, before, 'hrp', { reps: 22 });
});

test('Plank 重載與背景都暫停碼表，結束後的成績確認可再恢復', async ({ page }) => {
  await openApp(page, { now: NOW, seed: seedState(readFixture('v3.json')) });
  const before = await storedState(page);
  await startTest(page, 'plank');
  await tick(page, 13);
  await expect(page.locator('#t-count')).toHaveText('0:13');
  await reloadReady(page);
  await expect(page.locator('#t-name')).toHaveText('平板支撐測驗');
  await expect(page.locator('#t-count')).toHaveText('0:13');
  await expect(page.locator('#t-pause')).toHaveText('繼續');
  await tick(page, 20);
  await expect(page.locator('#t-count')).toHaveText('0:13');
  await page.click('#t-pause');
  await tick(page, 4);
  await expect(page.locator('#t-count')).toHaveText('0:17');
  await visibility(page, 'hidden');
  await tick(page, 30);
  await visibility(page, 'visible');
  await tick(page, 5);
  await expect(page.locator('#t-count')).toHaveText('0:17');
  await expect(page.locator('#t-pause')).toHaveText('繼續');
  await page.click('#t-pause');
  await tick(page, 3);
  await page.click('#t-abort');
  await expect(page.locator('#b-title')).toHaveText('Plank 成績確認');
  await expect(page.locator('#b-card .boss-result')).toHaveText('0:20');
  await expect(page.locator('#bi-interrupted')).toBeVisible();
  await expect(page.locator('#bi-interrupted')).toContainText('分段計時');
  await reloadReady(page);
  await expect(page.locator('#b-title')).toHaveText('Plank 成績確認');
  await expect(page.locator('#b-card .boss-result')).toHaveText('0:20');
  await expect(page.locator('#bi-interrupted')).toBeVisible();
  await expect(page.locator('#bi-interrupted')).toContainText('分段計時');
  await expectUnrecorded(page, before);
  await saveOnce(page, before, 'plank', { sec: 20 });
});

test('戶外跑成績的分秒草稿重載後保留，尚未儲存不發 XP', async ({ page }) => {
  await openApp(page, { now: NOW, seed: seedState(readFixture('v3.json')) });
  const before = await storedState(page);
  await startTest(page, 'run2mi');
  await page.fill('#bi-m', '18');
  await page.fill('#bi-s', '34');
  await reloadReady(page);
  await expect(page.locator('#b-title')).toHaveText('2 英里跑 成績輸入');
  await expect(page.locator('#bi-m')).toHaveValue('18');
  await expect(page.locator('#bi-s')).toHaveValue('34');
  await expectUnrecorded(page, before);
  await saveOnce(page, before, 'run2mi', { sec: 1114 });
});

test('放棄 HRP 計時會清除檢查點，重載不恢復也不記錄成績', async ({ page }) => {
  await openApp(page, { now: NOW, seed: seedState(readFixture('v3.json')) });
  const before = await storedState(page);
  await startTest(page, 'hrp');
  await tick(page, 7);
  await page.click('#t-abort');
  await expect(page.locator('#train')).not.toHaveClass(/active/);
  expect(await page.evaluate(key => localStorage.getItem(key), BOSS_KEY)).toBeNull();
  await reloadReady(page);
  await expect(page.locator('#train')).not.toHaveClass(/active/);
  await expect(page.locator('#s-boss')).not.toHaveClass(/active/);
  await expectUnrecorded(page, before);
});

test('放棄已恢復的成績草稿會清除檢查點，不會發 XP', async ({ page }) => {
  await openApp(page, { now: NOW, seed: seedState(readFixture('v3.json')) });
  const before = await storedState(page);
  await startTest(page, 'run2mi');
  await page.fill('#bi-m', '20');
  await reloadReady(page);
  await page.getByRole('button', { name: '取消測驗', exact: true }).click();
  expect(await page.evaluate(key => localStorage.getItem(key), BOSS_KEY)).toBeNull();
  await reloadReady(page);
  await expect(page.locator('#s-boss')).not.toHaveClass(/active/);
  await expectUnrecorded(page, before);
});

for (const [label, raw] of [['破損 JSON', '{broken'], ['錯誤資料', JSON.stringify({ v: 1, savedAt: 0, item: 'unknown', stage: 'timer', left: -5 })]]) {
  test(`Boss ${label}檢查點會安全清除，App 可正常啟動`, async ({ page }) => {
    await openApp(page, { now: NOW, seed: { ...seedState(readFixture('v3.json')), [BOSS_KEY]: raw } });
    await expect(page.locator('#boot-error')).toHaveCount(0);
    await expect(page.locator('#s-home')).toHaveClass(/active/);
    await expect(page.locator('#train')).not.toHaveClass(/active/);
    await expect(page.locator('#s-boss')).not.toHaveClass(/active/);
    expect(await page.evaluate(key => localStorage.getItem(key), BOSS_KEY)).toBeNull();
  });
}

test('超過一天的 Boss 成績草稿不再恢復，舊草稿不發 XP', async ({ page }) => {
  await openApp(page, { now: NOW, seed: seedState(readFixture('v3.json')) });
  const before = await storedState(page);
  await startTest(page, 'run2mi');
  await page.fill('#bi-m', '18');
  await page.fill('#bi-s', '34');
  await page.clock.fastForward(25 * 60 * 60 * 1000);
  await reloadReady(page);
  await expect(page.locator('#s-home')).toHaveClass(/active/);
  await expect(page.locator('#s-boss')).not.toHaveClass(/active/);
  await expect(page.locator('#train')).not.toHaveClass(/active/);
  expect(await page.evaluate(key => localStorage.getItem(key), BOSS_KEY)).toBeNull();
  await expectUnrecorded(page, before);
});


test('成績儲存失敗會保留草稿，恢復儲存後重試只記錄一次', async ({ page, guard }) => {
  guard.allowConsoleErrors = true;
  await openApp(page, { now: NOW, seed: seedState(readFixture('v3.json')) });
  const before = await storedState(page);
  await startTest(page, 'run2mi');
  await page.fill('#bi-m', '18');
  await page.fill('#bi-s', '34');
  await blockMainWrites(page);
  await page.click('#bi-save');
  await expect(page.locator('#bi-status')).toContainText('儲存失敗');
  await expect(page.locator('#done')).not.toHaveClass(/active/);
  await expect(page.locator('#bi-m')).toHaveValue('18');
  await expect(page.locator('#bi-s')).toHaveValue('34');
  await expectUnrecorded(page, before);
  expect(await page.evaluate(key => localStorage.getItem(key), BOSS_KEY)).not.toBeNull();
  await page.evaluate(() => window.__restoreBossStorage());
  await expect(page.locator('#bi-save')).toHaveText('重試儲存 PR');
  await saveOnce(page, before, 'run2mi', { sec: 1114 });
  expect(guard.consoleErrors.length).toBeGreaterThan(0);
  expect(guard.consoleErrors.every(message => message === '儲存失敗：資料僅存在記憶體中')).toBe(true);
});

test('跨遊戲日恢復保留原測驗日期，已存檔但未清除的草稿不會重複記錄或發 XP', async ({ page }) => {
  await openApp(page, { now: NOW, seed: seedState(readFixture('v3.json')) });
  const before = await storedState(page);
  await startTest(page, 'run2mi');
  await page.fill('#bi-m', '18');
  await page.fill('#bi-s', '34');
  await page.clock.fastForward(21 * 60 * 60 * 1000); // 隔日 05:00，已跨 04:00 遊戲日
  await reloadReady(page);
  await expect(page.locator('#bi-m')).toHaveValue('18');
  await expect(page.locator('#bi-s')).toHaveValue('34');
  await expect(page.locator('#bi-date')).toContainText('2026-10-18');
  await expect(page.locator('#bi-save-day')).toBeVisible();
  await expect(page.locator('#bi-save-day')).toHaveText('訓練紀錄與 XP 計入儲存當日，PR 保留上述測驗日期。');
  await expectUnrecorded(page, before);
  // 模擬主要成績已存妥，但刪除草稿失敗／App 在清除草稿前中斷。
  await page.evaluate(() => {
    const removeItem = Storage.prototype.removeItem;
    Storage.prototype.removeItem = function (key) {
      if (key === 'daily-ten-active-boss') throw new Error('測試：草稿尚未清除');
      return removeItem.call(this, key);
    };
    window.__restoreBossRemove = () => { Storage.prototype.removeItem = removeItem; };
  });
  await page.click('#bi-save');
  await expect(page.locator('#done')).toHaveClass(/active/);
  const saved = await storedState(page);
  expect(saved.prs.run2mi).toHaveLength(before.prs.run2mi.length + 1);
  expect(saved.prs.run2mi.at(-1)).toEqual({ date: '2026-10-18', sec: 1114 });
  expect(saved.sessions).toHaveLength(before.sessions.length + 1);
  expect(await page.evaluate(key => localStorage.getItem(key), BOSS_KEY)).not.toBeNull();
  await page.evaluate(() => window.__restoreBossRemove());
  await reloadReady(page);
  await expect(page.locator('#s-boss')).not.toHaveClass(/active/);
  await expect(page.locator('#train')).not.toHaveClass(/active/);
  expect(await page.evaluate(key => localStorage.getItem(key), BOSS_KEY)).toBeNull();
  const recovered = await storedState(page);
  expect(recovered.prs).toEqual(saved.prs);
  expect(recovered.sessions).toEqual(saved.sessions);
  expect(recovered.xp).toBe(saved.xp);
  expect(recovered.game.xp).toEqual(saved.game.xp);
});


test('恢復草稿的存檔位置不符時，儲存失敗後重試仍只新增一筆成績', async ({ page, guard }) => {
  guard.allowConsoleErrors = true;
  await openApp(page, { now: NOW, seed: seedState(readFixture('v3.json')) });
  const before = await storedState(page);
  await startTest(page, 'run2mi');
  await page.fill('#bi-m', '18');
  await page.fill('#bi-s', '34');
  // 損壞／過期的提交位置與目前 PR 清單不同，不能在每次重試時重複 append。
  await page.addInitScript(key => {
    const raw = localStorage.getItem(key);
    if (!raw) return;
    const checkpoint = JSON.parse(raw);
    checkpoint.commit = { date: checkpoint.date, index: 100000, value: 1114 };
    localStorage.setItem(key, JSON.stringify(checkpoint));
  }, BOSS_KEY);
  await reloadReady(page);
  await expect(page.locator('#s-boss')).toHaveClass(/active/);
  await blockMainWrites(page);
  await page.click('#bi-save');
  await expect(page.locator('#bi-status')).toContainText('儲存失敗');
  await expectUnrecorded(page, before);
  await page.evaluate(() => window.__restoreBossStorage());
  await saveOnce(page, before, 'run2mi', { sec: 1114 });
  expect(guard.consoleErrors.length).toBeGreaterThan(0);
  expect(guard.consoleErrors.every(message => message === '儲存失敗：資料僅存在記憶體中')).toBe(true);
});
