/* qa-checker：離線重開 e2e（PLAN.md §2 #11、§5 #7；CLAUDE.md §2 原則 2）。
   允許 Service Worker → 等 SW 啟用、控制頁面，且 caches 內有 sw.js 的全部 ASSETS（CACHE 名稱也從 sw.js 讀）
   → context.setOffline(true)＋攔下所有網路請求 → reload 與「新分頁冷啟動」→ 各分頁、示範視窗、保底版跑完都可用。
   V1：分頁＝今日／訓練／統計（訓練紀錄、身體指標兩段）＋設定（今日右上齒輪）；遊戲層（data/game.json、engine、早安打卡）
   也由 Service Worker 供應：離線冷啟動後三環、階段在，早上可以早安打卡並寫入。 */
import {
  test, expect, readFixture, openApp, seedState, storedState, expectHome, gotoTab, runWorkoutToEnd,
  waitReady, swAssets, cacheNumber, appSummary
} from './helpers.js';

/* 遊戲層與 V1 新畫面的檔案（開機時載入；離線時必須由 SW 供應） */
const GAME_FILES = ['/data/game.json', '/js/game/rules.js', '/js/game/day.js', '/js/game/engine.js', '/js/habits/sleep.js',
  '/js/habits/move.js', '/js/state/habits.js', '/js/ui/game.js', '/js/ui/checkin.js', '/js/ui/rings.js', '/js/ui/toast.js'];

test.use({ serviceWorkers: 'allow' });

async function waitForPrecache(page) {
  const { cache, assets } = swAssets();
  /* CACHE 名稱直接讀 sw.js（不寫死版號，升版不必改測試）；只檢查格式 */
  expect(cache).toMatch(/^daily-ten-v\d+$/);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  const expected = assets.map((a) => new URL(a, page.url()).pathname).sort();
  await expect.poll(async () => (await page.evaluate(async (name) => {
    if (!(await caches.has(name))) return [];
    const c = await caches.open(name);
    return (await c.keys()).map((r) => new URL(r.url).pathname);
  }, cache)).sort(), { timeout: 15_000, message: `caches['${cache}'] 應含 sw.js 的全部 ASSETS` }).toEqual(expected);
  return { cache, expected };
}

async function exerciseAllScreens(page, { xp, current, best }) {
  await expectHome(page, { level: 3, xp, current, best });
  await expect(page.locator('#h-start')).not.toHaveText('—');

  await gotoTab(page, 's-hist');
  await expect(page.locator('#hist-heat i')).toHaveCount(56);
  await expect(page.locator('#pr-hrp .prline')).toHaveCount(2);

  await gotoTab(page, 's-body');
  await expect(page.locator('#bd-tiles .tile')).toHaveCount(4);
  await page.fill('#bd-weight', '68.4');
  await page.click('#bd-save');
  await expect(page.locator('#bd-msg')).toHaveText('已記錄今日（1 項）');

  await gotoTab(page, 's-setup');
  /* D23：離線時設定最下方的版本行仍顯示（版本取自 Cache Storage） */
  await expect(page.locator('#app-version')).toHaveText(`App 版本 v${cacheNumber(swAssets().cache)}`);
  await gotoTab(page, 's-train');
  await expect(page.locator('#vids .vidline').first()).toBeVisible();
  await expect(page.locator('#week-tbl .prline')).toHaveCount(7);
  /* 示範視窗：離線可看、動畫會動 */
  await page.locator('#vids button[data-demo]').first().click();
  await expect(page.locator('#demo-modal')).toHaveClass(/active/);
  await expect(page.locator('#dm-name')).not.toHaveText('—');
  const pose = () => page.locator('#dm-svg').evaluate((svg) => [...svg.querySelectorAll('polyline')].map((p) => p.getAttribute('points')).join('|'));
  const p0 = await pose();
  expect(p0.length).toBeGreaterThan(0);
  await page.clock.runFor(500);
  expect(await pose()).not.toBe(p0);
  await page.click('#dm-close');
  await expect(page.locator('#demo-modal')).not.toHaveClass(/active/);

  /* 保底版跑完 */
  await gotoTab(page, 's-home');
  await page.click('#h-minimal');
  await runWorkoutToEnd(page);
  await expect(page.locator('#done')).toHaveClass(/active/);
  await page.click('#d-ok');
}

test('離線：SW 預快取完整 → 斷網 reload 與新分頁冷啟動，四個分頁、示範視窗、保底版都可用', async ({ page, context }) => {
  /* 線上第一次開 App 時實際載入的每個同源資源（sw.js 本身除外）都必須在預快取清單內 */
  const bootRequests = new Set();
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.hostname === '127.0.0.1' && !r.serviceWorker()) bootRequests.add(u.pathname);
  });
  await openApp(page, { seed: seedState(readFixture('v2-real.json')) });
  const { expected } = await waitForPrecache(page);
  expect(expected).toContain('/js/app.js');
  expect(expected).toContain('/js/ui/backup.js');
  expect(expected).toContain('/js/state/store.js');
  const loaded = [...bootRequests].filter((p) => p !== '/sw.js').map((p) => (p === '/' ? '/index.html' : p)).sort();
  expect(loaded.length).toBeGreaterThan(20);
  expect(loaded.filter((p) => !expected.includes(p)), '開 App 載入了但沒有預快取的檔案').toEqual([]);

  /* 斷網：瀏覽器離線＋任何真的打到網路的請求都中止 */
  await context.setOffline(true);
  const networkHits = [];
  await context.route('**/*', (route) => { networkHits.push(route.request().url()); return route.abort('internetdisconnected'); });
  const servedBySw = [];
  const failed = [];
  page.on('response', (r) => { if (r.fromServiceWorker()) servedBySw.push(new URL(r.url()).pathname); });
  page.on('requestfailed', (r) => failed.push(r.url()));

  await page.reload();
  await waitReady(page);
  expect(await page.evaluate(() => navigator.onLine)).toBe(false);
  expect(servedBySw).toEqual(expect.arrayContaining(['/index.html', '/js/app.js', '/css/app.css', '/demos.js', '/js/ui/home.js', '/js/state/store.js', ...GAME_FILES]));
  await expect(page.locator('#h-rings')).toBeVisible(); // 規則檔由 SW 供應：遊戲層就緒
  await exerciseAllScreens(page, { xp: 361, current: 9, best: 11 });
  /* 保底版記錄：9/28 之後中斷 → 連續 1 天、XP +3 */
  const s = await storedState(page);
  expect(s.xp).toBe(364);
  expect(s.sessions[s.sessions.length - 1]).toEqual({ date: '2026-10-02', type: 'minimal', xp: 3 });

  /* 「重開 App」：關掉這個分頁，離線開新分頁 */
  await page.close();
  const page2 = await context.newPage();
  await page2.goto('/index.html');
  await waitReady(page2);
  await expectHome(page2, { level: 3, xp: 364, current: 1, best: 11 });
  for (const id of ['s-train', 's-stats', 's-hist', 's-body', 's-setup', 's-home']) await gotoTab(page2, id);
  await expect(page2.locator('#h-rings')).toBeVisible();

  expect(networkHits, '離線期間不應有請求真的打到網路').toEqual([]);
  expect(failed, '離線期間不應有失敗的請求').toEqual([]);
});

test('離線冷啟動（早上 07:00）：規則檔與 V1 新 module 都由 SW 供應 → 三環、階段在，早安打卡可以寫入、復原也可以', async ({ page, context }) => {
  await openApp(page, { now: '2026-10-05T07:00:00+09:00', seed: seedState(readFixture('v2-real.json')) });
  await waitForPrecache(page);
  await context.setOffline(true);
  const networkHits = [];
  await context.route('**/*', (route) => { networkHits.push(route.request().url()); return route.abort('internetdisconnected'); });
  await page.close();

  const p2 = await context.newPage();
  const fromSw = [];
  const failed = [];
  p2.on('response', (r) => { if (r.fromServiceWorker()) fromSw.push(new URL(r.url()).pathname); });
  p2.on('requestfailed', (r) => failed.push(r.url()));
  await p2.goto('/index.html');
  await waitReady(p2);
  expect(await p2.evaluate(() => navigator.onLine)).toBe(false);
  expect(fromSw, '遊戲層與 V1 新 module 由 SW 供應').toEqual(expect.arrayContaining(GAME_FILES));
  await expect(p2.locator('#h-rings')).toBeVisible();
  await expect(p2.locator('#h-phase')).toHaveText(/^P1 睡飽/);
  await expect(p2.locator('#h-start')).toHaveAttribute('data-kind', 'checkin');
  await p2.click('#h-start');
  await expect(p2.locator('#s-checkin')).toHaveClass(/active/);
  await p2.click('#ci-wake');
  await expect(p2.locator('#ci-done')).toBeVisible();
  await expect(p2.locator('#toast')).toBeVisible();
  let s = await storedState(p2);
  expect(s.habits.sleep.log).toHaveLength(1);
  expect(s.habits.sleep.log[0]).toMatchObject({ date: '2026-10-05', wake: '2026-10-05T07:00:00+09:00', lightsOutEdited: false });
  const { sum } = await appSummary(p2);
  expect(sum.pillars.sleep).toMatchObject({ checkedIn: true, xp: 60 });
  /* 復原（離線也可以） */
  await p2.click('#toast-action');
  await expect.poll(async () => (await storedState(p2)).habits.sleep.log.length).toBe(0);
  for (const id of ['s-train', 's-stats', 's-hist', 's-body', 's-setup', 's-home']) await gotoTab(p2, id);
  expect(networkHits, '離線期間不應有請求真的打到網路').toEqual([]);
  expect(failed, '離線期間不應有失敗的請求').toEqual([]);
});
