/* qa-checker：舊版 → 目前版本在同一個網址的更新路徑（CLAUDE.md §10「舊版 SW 快取」；D23 自動更新）。
   用 helpers.js 的 deploy fixture（可切換根目錄的靜態伺服器）模擬 GitHub Pages 部署新版：
   1. ec87e03（SW v5，PARITY_BASE_DIR）→ 目前版本：舊版開 App、SW 控制頁面、記一次保底版 → 部署目前版本 → 重開一次
      （cache-first：先看到快取裡的舊版，瀏覽器在背景安裝新 SW）→ 不再人工重開：舊頁面不認得 DT_UPDATE_READY、不回 ACK，
      約 3 秒後由新 SW 的 client.navigate() 導向新版 → 資料完整（localStorage 逐字相同）、只導向一次、存檔後為 v3、離線可用。
   2. 目前線上版本（UPGRADE_BASE_DIR，origin/main 的 worktree）→ 目前版本：同上，SETUP 顯示「App 版本 vN」。
      UPGRADE_BASE_DIR 的 CACHE 與目前相同（在 main 上）或沒設時略過。
   3. D12 實機重播（維持原意）：新版存成 v3 → 真的舊版程式記一次訓練、寫回 version 2 → 新版再開 XP 不重複計算。
   導向所需時間印在 log（[qa] …）並記在測試 annotation，報告引用。 */
import {
  test, expect, readFixture, installClock, seedOnce, seedState, waitReady, expectHome, storedState, storageSnapshot,
  triggerSave, runWorkoutToEnd, gotoTab, openApp, contextOptions, watchContext, assertWatchClean, rawMain,
  swAssets, cacheNumber, readSwCache, REPO_DIR, cacheNames, waitControlled, markDocument, sameDocument,
  countNavigations, realWait
} from './helpers.js';

const CUR = swAssets().cache;
const CUR_N = cacheNumber(CUR);
const PARITY_DIR = process.env.PARITY_BASE_DIR || '';
const UPGRADE_DIR = process.env.UPGRADE_BASE_DIR || '';
const UPGRADE_CACHE = UPGRADE_DIR ? readSwCache(UPGRADE_DIR) : null;

test.use({ serviceWorkers: 'allow', trace: 'off' });

/* 舊版（baseDir）→ 目前版本：重開一次後，不再人工重開，舊頁面被自動導向新版 */
async function oldPageIsReplaced({ page, context, deploy }, testInfo, baseDir, { oldCache, oldHasBackup, label }) {
  test.setTimeout(150_000);
  const navs = countNavigations(page);
  deploy.setRoot(baseDir);
  await installClock(page);
  await seedOnce(page, seedState(readFixture('v2-real.json')));
  await page.goto(deploy.url());
  await waitReady(page);
  /* 舊版：沒有版本行與「已更新」提示（v5 也沒有「下載備份」） */
  await expect(page.locator('#app-version')).toHaveCount(0);
  await expect(page.locator('#upd-note')).toHaveCount(0);
  await expect(page.locator('#bk-download')).toHaveCount(oldHasBackup ? 1 : 0);
  await expectHome(page, { level: 3, xp: 361, current: 9, best: 11 });
  await waitControlled(page, oldCache);

  /* 舊版記一次保底版 */
  await page.click('#h-minimal');
  await runWorkoutToEnd(page);
  await page.click('#d-ok');
  let s = await storedState(page);
  expect(s.version).toBe(oldHasBackup ? 3 : 2);
  expect(s.xp).toBe(364);
  const before = await storageSnapshot(page);

  /* 部署目前版本 → 重開一次：cache-first 先給快取裡的舊版 */
  deploy.setRoot(REPO_DIR);
  await page.reload();
  await waitReady(page);
  const t0 = Date.now();
  const token = await markDocument(page);
  await expect(page.locator('#app-version'), '重開：先看到快取裡的舊版').toHaveCount(0);
  const navsAtReopen = navs.length;

  /* 不再人工重開：等舊頁面被自動導向 */
  await expect.poll(() => sameDocument(page, token), { timeout: 30_000, message: `${label}：舊頁面應被自動導向新版` }).toBe(false);
  await waitReady(page);
  const ms = Date.now() - t0;
  /* 時間拆解：重開後瀏覽器何時抓新 sw.js（更新檢查）、新版何時被導向 */
  const swAt = deploy.times.filter(([t, p]) => p === '/sw.js' && t >= t0 - 2_000).map(([t]) => t - t0);
  const navAt = navs.slice(navsAtReopen).map((n) => n.at - t0);
  const detail = `重開（舊版就緒）後 ${ms} ms 自動換成新版；抓 sw.js 於 ${swAt.join('、')} ms，導向於 ${navAt.join('、')} ms`;
  testInfo.annotations.push({ type: 'qa', description: `${label}：${detail}` });
  console.log(`[qa] ${label}：${detail}`);
  expect(ms, '約 3 秒 ACK 逾時＋安裝時間').toBeLessThan(15_000);

  await expect(page.locator('#app-version')).toHaveCount(1);
  await expect(page.locator('#bk-download')).toHaveCount(1);
  await expect(page.locator('#err-card')).toBeHidden();
  await expect(page.locator('#upd-note'), '舊頁面沒有寫提示旗標 → 不提示').toBeHidden();
  expect(await cacheNames(page)).toEqual([CUR]);
  await expectHome(page, { level: 3, xp: 364, current: 1, best: 11 });
  await expect(page.locator('#bk-reminder')).toBeVisible(); // 有紀錄、從未備份
  expect(await storageSnapshot(page), '自動導向不改 localStorage').toEqual(before);
  await gotoTab(page, 's-setup');
  await expect(page.locator('#app-version')).toHaveText(`App 版本 v${CUR_N}`);
  await gotoTab(page, 's-home');

  /* 只導向一次：再等 5 秒（真實時間）沒有第二次 */
  await realWait(5_000);
  expect(navs.length - navsAtReopen, '自動導向次數').toBe(1);

  /* 新版存檔 → v3，資料完整 */
  await triggerSave(page);
  s = await storedState(page);
  expect(s.version).toBe(3);
  expect(s.game.xp).toEqual({ move: 364, sleep: 0, explore: 0, total: 364 });
  expect(s.sessions).toHaveLength(33);
  expect(s.sessions[32]).toEqual({ date: '2026-10-02', type: 'minimal', xp: 3 });

  /* 離線重開仍是新版 */
  await context.setOffline(true);
  const networkHits = [];
  await context.route('**/*', (route) => { networkHits.push(route.request().url()); return route.abort('internetdisconnected'); });
  try {
    await page.reload();
    await waitReady(page);
    await expect(page.locator('#app-version')).toHaveCount(1);
    await expectHome(page, { level: 3, xp: 364, current: 1, best: 11 });
    await gotoTab(page, 's-setup');
    await expect(page.locator('#app-version')).toHaveText(`App 版本 v${CUR_N}`);
    await gotoTab(page, 's-hist');
    await gotoTab(page, 's-body');
    await gotoTab(page, 's-home');
    expect(networkHits, '離線期間不應有請求真的打到網路').toEqual([]);
  } finally {
    await context.unroute('**/*');
    await context.setOffline(false);
  }
}

test('ec87e03（SW v5）→ 目前版本：重開一次後不用再人工重開，舊頁面幾秒內自動換成新版；資料完整、只導向一次、離線可用', async ({ page, context, deploy }, testInfo) => {
  test.skip(!PARITY_DIR, '未設定 PARITY_BASE_DIR（ec87e03 的基準目錄）');
  await oldPageIsReplaced({ page, context, deploy }, testInfo, PARITY_DIR, { oldCache: 'daily-ten-v5', oldHasBackup: false, label: 'v5 → 目前' });
});

test('目前線上版本（UPGRADE_BASE_DIR）→ 目前版本：自動換成新版，SETUP 顯示「App 版本 vN」，只導向一次', async ({ page, context, deploy }, testInfo) => {
  test.skip(!UPGRADE_DIR, '未設定 UPGRADE_BASE_DIR（origin/main 的 worktree）');
  test.skip(UPGRADE_CACHE === CUR, `UPGRADE_BASE_DIR 的 CACHE 與目前相同（${CUR}），沒有可測的更新`);
  expect(cacheNumber(UPGRADE_CACHE), `UPGRADE_BASE_DIR 的 CACHE（${UPGRADE_CACHE}）應小於目前（${CUR}）`).toBeLessThan(CUR_N);
  await oldPageIsReplaced({ page, context, deploy }, testInfo, UPGRADE_DIR, { oldCache: UPGRADE_CACHE, oldHasBackup: true, label: `${UPGRADE_CACHE.replace('daily-ten-', '')} → 目前` });
});

test('D12 實機重播：新版存成 v3 → 舊版 App 記一次訓練並寫回 version 2 → 新版再開 XP 不重複計算', async ({ browser }) => {
  test.skip(!PARITY_DIR, '未設定 PARITY_BASE_DIR（ec87e03 的基準目錄）');
  const portB = Number(process.env.PORT || 4173);
  const portA = Number(process.env.BASE_PORT || portB + 1);
  const ctxB = await browser.newContext(contextOptions({ baseURL: `http://127.0.0.1:${portB}` }));
  const ctxA = await browser.newContext(contextOptions({ baseURL: `http://127.0.0.1:${portA}` }));
  const wA = watchContext(ctxA);
  const wB = watchContext(ctxB);
  try {
    /* 1. 新版：v2 真實資料存成 v3 */
    const pB = await ctxB.newPage();
    await openApp(pB, { seed: seedState(readFixture('v2-real.json')) });
    await triggerSave(pB);
    const v3raw = await rawMain(pB);
    expect(JSON.parse(v3raw).game.xp.move).toBe(361);

    /* 2. 舊版（main）讀這份 v3：畫面正常，記一次保底版 → 寫回 version 2，game 沒動 */
    const pA = await ctxA.newPage();
    await openApp(pA, { seed: seedState(v3raw) });
    await expect(pA.locator('#bk-download')).toHaveCount(0); // 確認是舊版
    await expectHome(pA, { level: 3, xp: 361, current: 9, best: 11 });
    await pA.click('#h-minimal');
    await runWorkoutToEnd(pA);
    await pA.click('#d-ok');
    const revertedRaw = await rawMain(pA);
    const reverted = JSON.parse(revertedRaw);
    expect(reverted.version).toBe(2);
    expect(reverted.xp).toBe(364);
    expect(reverted.game.xp.move).toBe(361);
    expect(reverted.habits.explore.items[0].id).toBe('dj'); // 舊版保留不認得的欄位

    /* 3. 新版再開：XP 364（不是 361＋364，也不是 361），連續天數、session 正確 */
    await pB.evaluate((raw) => localStorage.setItem('daily-ten-state', raw), revertedRaw);
    await pB.reload();
    await waitReady(pB);
    await expectHome(pB, { level: 3, xp: 364, current: 1, best: 11 });
    await expect(pB.locator('#err-card')).toBeHidden();
    await triggerSave(pB);
    const s = await storedState(pB);
    expect(s.version).toBe(3);
    expect(s.game.xp).toEqual({ move: 364, sleep: 0, explore: 0, total: 364 });
    expect(s.game.streaks.train).toEqual({ current: 1, best: 11, lastDate: '2026-10-02' });
    expect(s.sessions).toHaveLength(33);
  } finally {
    await ctxA.close();
    await ctxB.close();
  }
  assertWatchClean(wA, '舊版');
  assertWatchClean(wB, '新版');
});
