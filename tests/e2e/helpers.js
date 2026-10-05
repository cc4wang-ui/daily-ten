/* qa-checker：e2e 共用工具（不是 spec，Playwright 不會當成測試執行）。
   原則：只透過畫面操作 App；localStorage 只在「開 App 之前寫入 fixture 原文」與「讀出來比對」時碰。
   時間一律用 page.clock 注入，並在開 App 前暫停，讓邊界值（剛好 7 天）與動畫相位可重現。 */
import { test as base, expect } from '@playwright/test';
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, mkdtempSync, rmSync, readdirSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
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
const hostnameOf = (url) => { try { return new URL(url).hostname; } catch { return ''; } };
/* allowHosts：只放 simulateSite() 用 context.route 整個攔下來的模擬網址（D24 的舊網址／新網址）。
   那些請求全部由 route.fulfill 回 repo 的檔案（沒有 route.continue），不會真的連網。 */
export function watchContext(context) {
  const w = { requests: [], external: [], pageErrors: [], consoleErrors: [], allowConsoleErrors: false, allowHosts: new Set() };
  context.on('request', (req) => {
    const url = req.url();
    w.requests.push(url);
    if (!isLocalUrl(url) && !w.allowHosts.has(hostnameOf(url))) w.external.push(url);
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
  },
  /* D24：模擬 https 網址（simulateSite）又要 Service Worker 時用。Playwright 1.56 的 Chromium 預設不攔截、也不回報
     Service Worker 自己發的請求（sw.js 本身、install 的 addAll、快取未命中的 fetch），模擬網址的 SW 會去連真的網路（註冊失敗）。
     PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1 時 context.route 與 request 事件也涵蓋 SW 的請求（在 SW 連上時讀取）。
     只在這個測試期間設定（同一個 worker 的測試依序執行），結束後還原，不影響其他 spec。 */
  swRouting: async ({}, use) => {
    const KEY = 'PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS';
    const prev = process.env[KEY];
    process.env[KEY] = '1';
    await use(true);
    if (prev === undefined) delete process.env[KEY]; else process.env[KEY] = prev;
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

/* App 開機完成：js/app.js 在 renderHome／renderSetup／renderStats、showLoadError 全部畫完後設 html[data-ready="1"]
   （啟動失敗走 showFatal，不會設；那種情境用 ready:false 自己等 #boot-error） */
export async function waitReady(page) {
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
}

/* 舊版（ec87e03、origin/main 等 V1 以前的版本）沒有 html[data-ready]：等 renderBody 畫出營養目標（M1 的判斷） */
export async function waitReadyM1(page) {
  await page.waitForFunction(() => {
    const m = document.getElementById('bd-macros');
    return !!m && m.innerHTML !== '';
  });
}

/* ready：true＝V1（html[data-ready]）；'m1'＝舊版；false＝不等（啟動失敗的情境自己等） */
export async function openApp(page, { now = NOW_ISO, seed = null, url = '/index.html', ready = true } = {}) {
  await installClock(page, now);
  if (seed) await seedOnce(page, seed);
  await page.goto(url);
  if (ready === 'm1') await waitReadyM1(page);
  else if (ready) await waitReady(page);
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
/* 畫面上的四個數字（V1 的位置）：#h-streak＝今日右上連續天數、#h-level＝訓練分頁「強度」、#h-xp／#h-best＝統計的累計 XP／最佳連續 */
export const homeValues = (page) => page.evaluate(() => {
  const t = (id) => document.getElementById(id).textContent;
  return { streak: t('h-streak'), best: t('h-best'), xp: t('h-xp'), level: t('h-level') };
});
/* App 目前的 state（與 App 同一個 module 實例）＋ engine 對它算出的今日摘要。
   rules 直接讀 data/game.json、engine 直接 import，不經過 UI 的轉接層（js/ui/game.js），所以是獨立的預期值。
   rules 讀不到時 sum = null。 */
export const appSummary = (page) => page.evaluate(async () => {
  const u = (p) => new URL(p, document.baseURI).href;
  const [{ getState }, { todaySummary }] = await Promise.all([import(u('js/state/store.js')), import(u('js/game/engine.js'))]);
  let rules = null;
  try { const r = await fetch(u('data/game.json')); rules = r.ok ? await r.json() : null; } catch (e) { rules = null; }
  const st = getState();
  return {
    legacy: { level: st.level, xp: st.xp, current: st.streak.current, best: st.streak.best },
    sum: rules ? todaySummary(st, new Date(), rules) : null
  };
});
/* V1：
   - 資料：App 載入（遷移／修補）後的 level、xp、streak.current／best 等於預期（README 的表）——同 M1 的意圖，改讀 App 的 state，
     因為 #h-xp／#h-best 在 V1 改顯示 engine 推導值。
   - 畫面：今日在前景；#h-level＝L＋level（強度）；#h-streak＝engine 的連續天數（train）；
     #h-xp＝engine 累計 XP、#h-best＝engine 最佳連續（engine 沒載入時退回 legacy 值）。 */
export async function expectHome(page, { level, xp, current, best }) {
  await expect(page.locator('#s-home')).toBeVisible();
  const { legacy, sum } = await appSummary(page);
  expect(legacy, 'App 載入後的 level／xp／連續天數').toEqual({ level, xp, current, best });
  const want = {
    streak: String(sum ? sum.streak.days : current),
    best: String(sum ? sum.streak.best : best),
    xp: String(sum ? sum.xp.total : xp),
    level: `L${level}`
  };
  expect(await homeValues(page), '畫面上的數字（強度、連續天數、累計 XP、最佳連續）').toEqual(want);
}
/* 舊版（M1 首頁）：四個數字都在 HOME，#h-streak＝streak.current（只用在 V1 以前的版本，例如 upgrade／relocate 的舊版頁面） */
export async function expectHomeM1(page, { level, xp, current, best }) {
  await expect(page.locator('#s-home')).toBeVisible();
  expect(await homeValues(page)).toEqual({ streak: String(current), best: String(best), xp: String(xp), level: `L${level}` });
}
/* 舊版的分頁列：HOME／RECORDS／BODY／SETUP 四顆 */
export async function gotoTabM1(page, screenId) {
  await page.click(`#tabs button[data-s="${screenId}"]`);
  await expect(page.locator(`#${screenId}`)).toHaveClass(/active/);
}
/* App 記憶體中的 phase.startedAt（loadState 在缺少時以載入當下補上；只改記憶體，下次存檔才寫入） */
export const liveStartedAt = (page) => page.evaluate(async () => {
  const { getState } = await import(new URL('js/state/store.js', document.baseURI).href);
  return getState().phase.startedAt;
});
/* fixture（字串或物件）加上 phase.startedAt 後的物件：存檔或匯入前另存（pre-import）的內容會帶著 loadState 補上的起點 */
export function withStartedAt(raw, startedAt) {
  const o = typeof raw === 'string' ? JSON.parse(raw) : JSON.parse(JSON.stringify(raw));
  o.phase = { ...(o.phase || {}), startedAt };
  return o;
}

/* engine 在 Node 執行（子行程、TZ=Asia/Tokyo＝瀏覽器 context 的時區）：預期值由 engine 算，不寫死。
   code：async 函式本體，可用 rules（data/game.json 原文解析）、eng（js/game/engine.js）、sleep（js/habits/sleep.js）、
   day（js/game/day.js）、args；回傳值要能 JSON 化。 */
export function nodeEngine(code, args = null) {
  const root = JSON.stringify(ROOT.href);
  const script = `
    const u = (p) => new URL(p, ${root}).href;
    const [eng, sleep, day, fs] = await Promise.all([import(u('js/game/engine.js')), import(u('js/habits/sleep.js')),
      import(u('js/game/day.js')), import('node:fs')]);
    const rules = JSON.parse(fs.readFileSync(new URL('data/game.json', ${root}), 'utf8'));
    const args = JSON.parse(process.argv[1]);
    const out = await (async () => { ${code} })();
    process.stdout.write(JSON.stringify(out === undefined ? null : out));`;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', script, JSON.stringify(args)],
    { env: { ...process.env, TZ: 'Asia/Tokyo' }, encoding: 'utf8' });
  return JSON.parse(out);
}

/* 分頁列只有今日／訓練／統計；設定＝今日右上齒輪（#h-settings）；訓練紀錄／身體指標＝統計裡的兩段；早安打卡＝今日圖例的「眠」 */
const TAB_SCREENS = new Set(['s-home', 's-train', 's-stats']);
const STATS_PANELS = { 's-hist': '#st-tab-hist', 's-body': '#st-tab-body' };
export async function gotoTab(page, screenId) {
  if (TAB_SCREENS.has(screenId)) {
    await page.click(`#tabs button[data-s="${screenId}"]`);
  } else if (STATS_PANELS[screenId]) {
    await page.click('#tabs button[data-s="s-stats"]');
    await expect(page.locator('#s-stats')).toHaveClass(/active/);
    await page.click(STATS_PANELS[screenId]);
  } else if (screenId === 's-setup' || screenId === 's-checkin') {
    await page.click('#tabs button[data-s="s-home"]');
    await expect(page.locator('#s-home')).toHaveClass(/active/);
    await page.click(screenId === 's-setup' ? '#h-settings' : '#h-legend [data-go="s-checkin"] >> nth=0');
  } else {
    throw new Error(`gotoTab：不認得的畫面 ${screenId}`);
  }
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
  const dir = mkdtempSync(join(tmpdir(), `qa-deploy-${cacheName}-`));
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

/* ---------- D24 搬家：網址設定、模擬舊網址／新網址 ---------- */
/* 一律從 js/ui/relocate.js 讀 NEW_APP_URL／LEGACY_HOSTS（正式網址換掉時不用改測試） */
export function relocateConfig() {
  const src = readRepo('js/ui/relocate.js');
  const url = (src.match(/export\s+const\s+NEW_APP_URL\s*=\s*(['"`])([^'"`]+)\1/) || [])[2];
  const list = (src.match(/export\s+const\s+LEGACY_HOSTS\s*=\s*\[([^\]]*)\]/) || [])[1];
  if (!url || list === undefined) throw new Error('js/ui/relocate.js 找不到 NEW_APP_URL 或 LEGACY_HOSTS');
  const legacyHosts = [...list.matchAll(/(['"`])([^'"`]+)\1/g)].map((m) => m[2]);
  const u = new URL(url);
  return { NEW_APP_URL: url, NEW_ORIGIN: u.origin, NEW_HOST: u.hostname, NEW_PATH: u.pathname, LEGACY_HOSTS: legacyHosts };
}

/* Vercel 會上線的檔案：repo 的檔案扣掉 .vercelignore 排除的（用 git 自己的 gitignore 比對：check-ignore --no-index，
   .vercelignore 當 core.excludesFile；用一個空的暫存 git 目錄，不管 root 是不是 git repo、也不碰 root）。
   回傳 { excluded:Set<相對路徑>, deployed(rel) }；沒有 .vercelignore → 全部上線；沒有 git → 丟例外（測試會失敗，不會默默略過）。 */
const WALK_SKIP = new Set(['.git', 'node_modules', 'test-results', 'playwright-report', 'blob-report']);
function walkFiles(root, dir = '', out = []) {
  for (const ent of readdirSync(join(root, dir), { withFileTypes: true })) {
    if (WALK_SKIP.has(ent.name)) continue;
    const rel = dir ? `${dir}/${ent.name}` : ent.name;
    if (ent.isDirectory()) walkFiles(root, rel, out);
    else if (ent.isFile()) out.push(rel);
  }
  return out;
}
export function vercelDeploySet(root) {
  const ignoreFile = join(root, '.vercelignore');
  if (!existsSync(ignoreFile)) return { excluded: new Set(), deployed: () => true };
  const files = walkFiles(root);
  const gitDir = mkdtempSync(join(tmpdir(), 'qa-vercelignore-'));
  try {
    execFileSync('git', ['init', '-q', '--bare', gitDir]);
    let out = '';
    try {
      out = execFileSync('git', [`--git-dir=${gitDir}`, `--work-tree=${root}`, '-c', `core.excludesFile=${ignoreFile}`,
        'check-ignore', '--no-index', '--stdin'], { input: files.join('\n') + '\n', encoding: 'utf8' });
    } catch (e) {
      if (e.status === 1) out = ''; // exit 1 = 沒有任何檔案被排除
      else throw e;
    }
    const excluded = new Set(out.split('\n').map((l) => l.trim()).filter(Boolean));
    return { excluded, deployed: (rel) => !excluded.has(rel) };
  } finally {
    rmSync(gitDir, { recursive: true, force: true });
  }
}

/* 用 context.route 模擬一個網址（不連網）：origin 底下的每個請求都由這裡回應——prefix 之下對應到 root 的檔案
   （結尾 / 補 index.html），其他一律 404；沒有 route.continue。guard 會把這個 hostname 視為允許。
   site = { origin, prefix='/', root, vercel=false }：vercel=true 時只回 .vercelignore 沒排除的檔案（模擬 Vercel 上線的內容）。
   回傳 { origin, host, prefix, url(path), setRoot(dir), hits[], count(path) }。 */
export async function simulateSite(context, guard, { origin, prefix = '/', root = REPO_DIR, vercel = false }) {
  const host = new URL(origin).hostname;
  if (guard) guard.allowHosts.add(host);
  let rootDir = resolve(root);
  let filter = vercel ? vercelDeploySet(rootDir) : null;
  const hits = [];
  await context.route(`${origin}/**`, async (route) => {
    const u = new URL(route.request().url());
    let p = decodeURIComponent(u.pathname);
    hits.push(p);
    if (!p.startsWith(prefix)) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' });
    let rel = p.slice(prefix.length);
    if (rel === '' || rel.endsWith('/')) rel += 'index.html';
    const file = normalize(join(rootDir, rel));
    if (!file.startsWith(rootDir + sep) || !existsSync(file) || !statSync(file).isFile() || (filter && !filter.deployed(rel))) {
      return route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' });
    }
    return route.fulfill({
      status: 200, path: file,
      contentType: SERVE_TYPES[extname(file)] || 'application/octet-stream',
      headers: { 'Cache-Control': 'no-store' }
    });
  });
  return {
    origin, host, prefix,
    url: (path = '') => `${origin}${prefix}${path}`,
    setRoot(dir) { rootDir = resolve(dir); filter = vercel ? vercelDeploySet(rootDir) : null; },
    hits,
    count: (path) => hits.filter((h) => h === path).length
  };
}
