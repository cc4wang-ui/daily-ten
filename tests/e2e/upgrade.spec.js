/* qa-checker：舊版（main，SW v5）→ 新版（M1，SW v6）在同一個網址的更新路徑（CLAUDE.md §10「舊版 SW 快取」）。
   只在 PARITY_BASE_DIR 有設時執行。測試內自己起一個可切換根目錄的靜態伺服器（port 4477），模擬 GitHub Pages 部署新版：
   1. 舊版開 App、SW v5 控制頁面、記一次訓練（舊版寫回 version 2）。
   2. 伺服器換成新版 → 第一次重開仍是快取裡的舊版（cache-first），背景安裝 SW v6、刪掉 v5 快取。
   3. 再重開 → 新版：資料完整（含舊版剛記的那次）、不白屏、存檔後為 v3；離線再重開仍可用。
   另一個測試用「真的舊版程式」重播 D12：新版存成 v3 → 舊版讀到後記一次訓練、寫回 version 2 → 新版再開不重複計 XP。 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  test, expect, readFixture, ROOT, installClock, seedOnce, seedState, waitReady, expectHome, storedState,
  triggerSave, runWorkoutToEnd, gotoTab, openApp, contextOptions, watchContext, assertWatchClean, rawMain
} from './helpers.js';

const PORT = Number(process.env.QA_UPGRADE_PORT || 4477); // 本測試自己的伺服器；與 playwright.config 的 PORT／BASE_PORT 不同
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.png': 'image/png' };

function switchableServer(port) {
  let root = null;
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (path.endsWith('/')) path += 'index.html';
      const file = normalize(join(root, path));
      if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
      if (!(await stat(file)).isFile()) throw new Error('not a file');
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
    }
  });
  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(port, '127.0.0.1', () => ok({
      setRoot(dir) { root = resolve(dir); },
      close() { return new Promise((r) => { server.closeAllConnections(); server.close(() => r()); }); }
    }));
  });
}

const cacheNames = (page) => page.evaluate(async () => (await caches.keys()).sort());

test.skip(!process.env.PARITY_BASE_DIR, '未設定 PARITY_BASE_DIR（main 的基準目錄），略過更新路徑測試');
test.use({ serviceWorkers: 'allow', trace: 'off' });

test('main（SW v5）→ M1（SW v6）：第一次重開仍是舊版、背景換成 v6，再重開為新版且資料完整、離線可用', async ({ page, context }) => {
  test.setTimeout(120_000);
  const srv = await switchableServer(PORT);
  try {
    srv.setRoot(process.env.PARITY_BASE_DIR);
    const url = `http://127.0.0.1:${PORT}/index.html`;
    await installClock(page);
    await seedOnce(page, seedState(readFixture('v2-real.json')));
    await page.goto(url);
    await waitReady(page);
    /* 舊版：沒有「下載備份」 */
    await expect(page.locator('#bk-download')).toHaveCount(0);
    await expectHome(page, { level: 3, xp: 361, current: 9, best: 11 });
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    expect(await cacheNames(page)).toEqual(['daily-ten-v5']);

    /* 舊版記一次保底版 → 寫回 version 2 */
    await page.click('#h-minimal');
    await runWorkoutToEnd(page);
    await page.click('#d-ok');
    let s = await storedState(page);
    expect(s.version).toBe(2);
    expect(s.xp).toBe(364);

    /* 部署新版 */
    srv.setRoot(fileURLToPath(ROOT));
    await page.reload();
    await waitReady(page);
    await expect(page.locator('#bk-download'), '第一次重開：SW v5 從快取給舊版').toHaveCount(0);
    await expect.poll(() => cacheNames(page), { timeout: 20_000, message: 'SW v6 安裝並刪掉 v5 快取' }).toEqual(['daily-ten-v6']);

    /* 再重開：新版 */
    await page.reload();
    await waitReady(page);
    await expect(page.locator('#bk-download')).toHaveCount(1);
    await expect(page.locator('#err-card')).toBeHidden();
    await expectHome(page, { level: 3, xp: 364, current: 1, best: 11 });
    await expect(page.locator('#bk-reminder')).toBeVisible(); // 有紀錄、從未備份
    await triggerSave(page);
    s = await storedState(page);
    expect(s.version).toBe(3);
    expect(s.game.xp).toEqual({ move: 364, sleep: 0, explore: 0, total: 364 });
    expect(s.sessions).toHaveLength(33);
    expect(s.sessions[32]).toEqual({ date: '2026-10-02', type: 'minimal', xp: 3 });

    /* 離線重開仍是新版 */
    await context.setOffline(true);
    await page.reload();
    await waitReady(page);
    await expect(page.locator('#bk-download')).toHaveCount(1);
    await expectHome(page, { level: 3, xp: 364, current: 1, best: 11 });
    await gotoTab(page, 's-setup');
    await gotoTab(page, 's-home');
  } finally {
    await context.setOffline(false);
    await srv.close();
  }
});

test('D12 實機重播：新版存成 v3 → 舊版 App 記一次訓練並寫回 version 2 → 新版再開 XP 不重複計算', async ({ browser }) => {
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
