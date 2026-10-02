/* qa-checker：e2e 共用工具（不是 spec，Playwright 不會當成測試執行）。
   原則：只透過畫面操作 App；localStorage 只在「開 App 之前寫入 fixture 原文」與「讀出來比對」時碰。
   時間一律用 page.clock 注入，並在開 App 前暫停，讓邊界值（剛好 7 天）與動畫相位可重現。 */
import { test as base, expect } from '@playwright/test';
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export { expect };

export const ROOT = new URL('../../', import.meta.url);
export const FIXTURES = new URL('../fixtures/', import.meta.url);
export const fixturePath = (name) => new URL(name, FIXTURES).pathname;
export const readFixture = (name) => readFileSync(new URL(name, FIXTURES), 'utf8');
export const readRepo = (rel) => readFileSync(new URL(rel, ROOT), 'utf8');

export const MAIN_KEY = 'daily-ten-state';
export const BAK_V2 = 'daily-ten-state.bak-v2';
export const PRE_IMPORT_KEY = 'daily-ten-state.pre-import';
/* fixtures README 的「現在」：2026-10-02（週五）15:30 Asia/Tokyo */
export const NOW_ISO = '2026-10-02T15:30:00+09:00';
export const toMs = (iso) => new Date(iso).getTime();

/* 與 playwright.config.js 相同的 context 設定（自己開 context 時用，例如「同一份資料跑第二次」與等價比對） */
export function contextOptions(extra = {}) {
  return {
    viewport: { width: 375, height: 667 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
    locale: 'zh-TW',
    timezoneId: 'Asia/Tokyo',
    serviceWorkers: 'block',
    acceptDownloads: true,
    ...extra
  };
}

/* ---------- 網路與頁面錯誤守門：每個 context 的所有請求只能到 127.0.0.1（data:／blob: 除外） ---------- */
export function isLocalUrl(url) {
  if (/^(data|blob|about):/.test(url)) return true;
  try { return new URL(url).hostname === '127.0.0.1'; } catch { return false; }
}
export function watchContext(context) {
  const w = { requests: [], external: [], pageErrors: [], consoleErrors: [], allowConsoleErrors: false };
  context.on('request', (req) => {
    const url = req.url();
    w.requests.push(url);
    if (!isLocalUrl(url)) w.external.push(url);
  });
  const hook = (p) => {
    p.on('pageerror', (e) => w.pageErrors.push(`${p.url()} → ${e.message}`));
    p.on('console', (m) => { if (m.type() === 'error') w.consoleErrors.push(m.text()); });
  };
  context.pages().forEach(hook);
  context.on('page', hook);
  return w;
}
export function assertWatchClean(w, label = '') {
  expect(w.external, `${label} 外部網路請求`).toEqual([]);
  expect(w.pageErrors, `${label} 未捕捉的頁面錯誤`).toEqual([]);
  if (!w.allowConsoleErrors) expect(w.consoleErrors, `${label} console.error`).toEqual([]);
}

/* 每個 e2e 測試自動套用守門（測試內可設 guard.allowConsoleErrors = true，例如刻意讓 module 載入失敗） */
export const test = base.extend({
  guard: [async ({ context }, use) => {
    const w = watchContext(context);
    await use(w);
    assertWatchClean(w);
  }, { auto: true }],
  /* 可切換根目錄的靜態伺服器（模擬 GitHub Pages 部署新版）。只有用到的測試才會啟動；測試結束（含逾時）一定關掉 */
  deploy: async ({}, use, testInfo) => {
    const srv = await switchableServer(upgradePort(testInfo));
    await use(srv);
    await srv.close();
  }
});

/* ---------- 開 App ---------- */
/* 寫入 localStorage 只做一次（同一分頁 reload 不會再覆蓋）：用 sessionStorage 旗標 */
export async function seedOnce(page, entries) {
  await page.addInitScript((entries) => {
    try {
      if (sessionStorage.getItem('__qa_seeded') === '1') return;
      for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v);
      sessionStorage.setItem('__qa_seeded', '1');
    } catch (e) { /* about:blank 等沒有 storage 的文件 */ }
  }, entries);
}

/* 安裝假時鐘並暫停在 now（開 App 前）：之後只有 tick／runFor 會讓時間前進 */
export async function installClock(page, now = NOW_ISO) {
  const t = typeof now === 'number' ? now : toMs(now);
  await page.clock.install({ time: t - 5000 });
  await page.clock.pauseAt(t);
}

/* App 開機完成：renderBody 已執行（它在 renderHome、renderSetup 之後；showLoadError 在同一個同步區段緊接著執行） */
export async function waitReady(page) {
  await page.waitForFunction(() => {
    const m = document.getElementById('bd-macros');
    return !!m && m.innerHTML !== '';
  });
}

export async function openApp(page, { now = NOW_ISO, seed = null, url = '/index.html', ready = true } = {}) {
  await installClock(page, now);
  if (seed) await seedOnce(page, seed);
  await page.goto(url);
  if (ready) await waitReady(page);
}

export const seedState = (raw) => ({ [MAIN_KEY]: raw });

/* ---------- 讀畫面與 storage ---------- */
export const storageSnapshot = (page) => page.evaluate(() => {
  const o = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    o[k] = localStorage.getItem(k);
  }
  return o;
});
export const rawMain = (page) => page.evaluate((k) => localStorage.getItem(k), MAIN_KEY);
export async function storedState(page) {
  const raw = await rawMain(page);
  return raw === null ? null : JSON.parse(raw);
}
export const homeValues = (page) => page.evaluate(() => {
  const t = (id) => document.getElementById(id).textContent;
  return { streak: t('h-streak'), best: t('h-best'), xp: t('h-xp'), level: t('h-level') };
});
export async function expectHome(page, { level, xp, current, best }) {
  await expect(page.locator('#s-home')).toBeVisible();
  expect(await homeValues(page)).toEqual({ streak: String(current), best: String(best), xp: String(xp), level: `L${level}` });
}
export async function gotoTab(page, screenId) {
  await page.click(`#tabs button[data-s="${screenId}"]`);
  await expect(page.locator(`#${screenId}`)).toHaveClass(/active/);
}
/* 觸發一次存檔但不改資料：SETUP 的「語音導引」切換兩次（每次 onchange 都會 saveState） */
export async function triggerSave(page) {
  await gotoTab(page, 's-setup');
  const before = await page.isChecked('#cfg-voice');
  await page.click('#cfg-voice');
  await page.click('#cfg-voice');
  expect(await page.isChecked('#cfg-voice')).toBe(before);
}

/* ---------- 推進假時間 ----------
   fastForward 每次最多觸發一次到期的 timer：以 1 秒為一步＝訓練計時器的節拍（每秒一次 setInterval），
   不必逐一跑 60fps 的示範動畫影格（runFor 每個 timer 都要等一次真實 setTimeout，30 分鐘課表會跑好幾分鐘）。 */
export async function tick(page, seconds) {
  for (let i = 0; i < seconds; i++) await page.clock.fastForward(1000);
}
export async function tickUntil(page, fn, { arg, maxSeconds = 3600, every = 5, label = '條件' } = {}) {
  for (let s = 0; s <= maxSeconds; s += every) {
    if (await page.evaluate(fn, arg)) return s;
    await tick(page, every);
  }
  throw new Error(`tickUntil：${maxSeconds} 秒內沒有達成 ${label}`);
}
export const isActive = (id) => document.getElementById(id).classList.contains('active');
/* 跑完一段訓練直到完成畫面（或 #train 關閉） */
export async function runWorkoutToEnd(page, maxSeconds = 3600) {
  return tickUntil(page, () => !document.getElementById('train').classList.contains('active'),
    { maxSeconds, every: 5, label: '訓練結束' });
}

/* ---------- 匯入的二次確認 ----------
   第一次按「確認匯入」進入待確認；js/ui/backup.js 在進入待確認後 1 秒內的點擊一律忽略（連點保護），
   10 秒內再按才套用。時鐘是暫停的，兩次 click 之間的假時間是 0 ms，所以第二下之前要推進時間：
   這裡用 1.5 秒，模擬看完「再按一次，確認覆蓋」才按的真人（邊界值由 import.spec.js 的連點保護測試專門驗）。 */
export const IMPORT_CONFIRM_TEXT = '確認匯入（覆蓋目前資料）';
export const IMPORT_ARMED_TEXT = '再按一次，確認覆蓋';
export async function confirmImportTwice(page, gapMs = 1_500) {
  await page.click('#imp-confirm');
  await expect(page.locator('#imp-confirm')).toHaveText(IMPORT_ARMED_TEXT);
  await page.clock.runFor(gapMs);
  await page.click('#imp-confirm');
}

/* ---------- 下載 ---------- */
export async function clickAndDownload(page, selector) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click(selector)]);
  const failure = await dl.failure();
  expect(failure, '下載失敗').toBeNull();
  const path = await dl.path();
  return { name: dl.suggestedFilename(), text: readFileSync(path, 'utf8') };
}

/* ---------- 用語表（CLAUDE.md §11；規則來自 tools/jev/zh-tw-glossary.json） ---------- */
let glossaryRules = null;
function rules() {
  if (!glossaryRules) glossaryRules = JSON.parse(readRepo('tools/jev/zh-tw-glossary.json')).rules;
  return glossaryRules;
}
/* 與 check-glossary.js 相同的範圍：只看含中文字的字串。錯誤訊息裡括號內的資料欄位路徑（例：「連續天數（streak.current）」）
   是識別字、不是文案，先移除再比對；移除了哪些另外回報（identifierPaths），報告會列出。 */
const HAN = /\p{Script=Han}/u;
const FIELD_PATH = /（[A-Za-z_][A-Za-z0-9_.[\]]*）/g;
export const identifierPaths = (text) => text.match(FIELD_PATH) || [];
export function glossaryViolations(rawText) {
  const hits = [];
  if (!HAN.test(rawText)) return hits;
  const text = rawText.replace(FIELD_PATH, '（）');
  for (const r of rules()) {
    if (r.unless && new RegExp(r.unless, 'iu').test(text)) continue;
    const hit = r.avoid
      ? r.avoid.some((w) => text.includes(w))
      : new RegExp(r.pattern, `u${r.flags || ''}`).test(text);
    if (hit) hits.push(`${r.id}：${text}`);
  }
  return hits;
}
export function expectGlossaryClean(texts) {
  const all = texts.filter((t) => t && t.trim()).flatMap((t) => glossaryViolations(t));
  expect(all, '畫面字串違反用語表').toEqual([]);
}

/* sw.js 的預快取清單（直接讀檔，不寫死） */
export function swAssets() {
  const sw = readRepo('sw.js');
  const cache = (sw.match(/const\s+CACHE\s*=\s*'([^']+)'/) || [])[1];
  const block = (sw.match(/const\s+ASSETS\s*=\s*\[([\s\S]*?)\]/) || [])[1] || '';
  return { cache, assets: [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]) };
}

/* ---------- Service Worker 更新（D23）：部署新版、判斷頁面有沒有重新載入 ---------- */
export const REPO_DIR = fileURLToPath(ROOT);
export const swCacheOf = (swText) => ((swText || '').match(/const\s+CACHE\s*=\s*'([^']+)'/) || [])[1] || null;
export const cacheNumber = (name) => Number(((name || '').match(/^daily-ten-v(\d+)$/) || [])[1]) || 0;
/* 某個目錄（例如 UPGRADE_BASE_DIR）的 sw.js 的 CACHE；讀不到回 null */
export function readSwCache(dir) {
  try { return swCacheOf(readFileSync(join(dir, 'sw.js'), 'utf8')); } catch { return null; }
}

/* 切換式伺服器的 port：QA_UPGRADE_PORT（預設 4477）＋ worker 的 parallelIndex。
   同時執行的 worker 的 parallelIndex 一定不同，所以並行的測試不會搶同一個 port；同一個 worker 內測試依序執行。 */
export const upgradePort = (testInfo) => Number(process.env.QA_UPGRADE_PORT || 4477) + testInfo.parallelIndex;

const SERVE_TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.png': 'image/png' };
export function switchableServer(port) {
  let root = null;
  const log = []; // 每個請求的路徑（依序）
  const times = []; // [收到請求的時間（ms）, 路徑]
  const server = createServer(async (req, res) => {
    try {
      let path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      log.push(path);
      times.push([Date.now(), path]);
      if (path.endsWith('/')) path += 'index.html';
      const file = normalize(join(root, path));
      if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
      if (!(await stat(file)).isFile()) throw new Error('not a file');
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': SERVE_TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Not found');
    }
  });
  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(port, '127.0.0.1', () => ok({
      port,
      origin: `http://127.0.0.1:${port}`,
      url: (path = '/index.html') => `http://127.0.0.1:${port}${path}`,
      log,
      times,
      count: (path) => log.filter((p) => p === path).length,
      setRoot(dir) { root = resolve(dir); },
      close() { return new Promise((r) => { server.closeAllConnections(); server.close(() => r()); }); }
    }));
  });
}

/* 把目前的樹（sw.js ASSETS 列出的 App 檔＋sw.js）複製到暫存目錄，CACHE 換成 cacheName：模擬「下一版」部署。
   回傳 { dir, remove() }。 */
export function makeDeployCopy(cacheName) {
  const dir = mkdtempSync(join(tmpdir(), `daily-ten-${cacheName}-`));
  const { assets } = swAssets();
  for (const a of assets) {
    if (a === './') continue;
    const rel = a.replace(/^\.\//, '');
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    copyFileSync(join(REPO_DIR, rel), join(dir, rel));
  }
  const sw = readRepo('sw.js');
  const next = sw.replace(/const\s+CACHE\s*=\s*'[^']+'/, `const CACHE = '${cacheName}'`);
  if (next === sw && swCacheOf(sw) !== cacheName) throw new Error('sw.js 找不到 CACHE');
  writeFileSync(join(dir, 'sw.js'), next);
  return { dir, remove() { rmSync(dir, { recursive: true, force: true }); } };
}

export const cacheNames = (page) => page.evaluate(async () => (await caches.keys()).sort());
/* SW 啟用並控制頁面，而且 Cache Storage 只剩 cacheName（舊快取已刪） */
export async function waitControlled(page, cacheName, timeout = 20_000) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await expect.poll(() => cacheNames(page), { timeout, message: `Cache Storage 應只剩 ${cacheName}` }).toEqual([cacheName]);
}

/* 在目前這份文件上做記號：重新載入或被導向之後記號就不見了 */
export async function markDocument(page) {
  const token = `qa-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await page.evaluate((t) => { window.__qaDoc = t; }, token);
  return token;
}
/* true：還是同一份文件；false：已換成新文件；null：正在換（evaluate 失敗） */
export async function sameDocument(page, token) {
  try { return await page.evaluate((t) => window.__qaDoc === t, token); } catch { return null; }
}
/* 開 App 前掛上：記錄頁面收到的 SW 訊息（不影響 App 自己的處理） */
export async function recordSwMessages(page) {
  await page.addInitScript(() => {
    window.__qaSwMsgs = [];
    try {
      navigator.serviceWorker.addEventListener('message', (e) => {
        const d = e.data || {};
        window.__qaSwMsgs.push({ type: d.type, version: d.version, ports: e.ports ? e.ports.length : 0 });
      });
    } catch (e) { /* 沒有 SW */ }
  });
}
export const swMessages = (page) => page.evaluate(() => window.__qaSwMsgs || []);
/* 請瀏覽器檢查 SW 更新（等同 App 的 checkForUpdate 或瀏覽器自己的檢查）；頁面若因此馬上重新載入，evaluate 失敗不算錯 */
export async function requestSwUpdate(page) {
  try {
    return await page.evaluate(async () => {
      const r = await navigator.serviceWorker.getRegistration();
      if (!r) return 'no-registration';
      await r.update();
      return 'ok';
    });
  } catch (e) { return `context-changed: ${String(e.message || e).split('\n')[0]}`; }
}
/* 主框架的導覽次數（重新載入、SW 導向都算） */
export function countNavigations(page) {
  const navs = [];
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) navs.push({ url: f.url(), at: Date.now() }); });
  return navs;
}
/* 真實時間等待（給 SW 的 3 秒 ACK 逾時用；頁面的計時器是假時鐘，不受影響） */
export const realWait = (ms) => new Promise((r) => setTimeout(r, ms));

