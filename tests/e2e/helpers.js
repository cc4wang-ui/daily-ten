/* qa-checker：e2e 共用工具（不是 spec，Playwright 不會當成測試執行）。
   原則：只透過畫面操作 App；localStorage 只在「開 App 之前寫入 fixture 原文」與「讀出來比對」時碰。
   時間一律用 page.clock 注入，並在開 App 前暫停，讓邊界值（剛好 7 天）與動畫相位可重現。 */
import { test as base, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

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
  }, { auto: true }]
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
