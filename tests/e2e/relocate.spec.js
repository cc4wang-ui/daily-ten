/* qa-checker：D24 搬家卡（js/ui/relocate.js）——舊網址搬家卡；新網址與其他網址不顯示；離線冷啟動；舊版 → 目前版本。
   D27（Cross 2026-10-06 放棄備份）：搬家卡拿掉「下載備份」與無紀錄提醒，只剩 ① 打開新網址 ② 加入主畫面、以後從新圖示打開、刪除舊圖示；
   新網址的「從舊網址搬資料」匯入卡整張拿掉；今日的 7 天備份提醒卡也拿掉。REMOVED_IDS 在任何網址、任何資料下都不存在（數量 0），
   今日的文字不含「備份」「匯入」；設定的資料備份卡（下載、選檔／貼上匯入、預覽、兩次確認）照舊。
   模擬網址：helpers.js 的 simulateSite（context.route 整個攔下該網址，route.fulfill 回 repo 的檔案；沒有 route.continue，不連網）。
   - 舊網址 = https://<LEGACY_HOSTS[0]>/daily-ten/（GitHub Pages 專案網址；去掉 /daily-ten/ 前綴對應 repo 根目錄，結尾 / 補 index.html）。
   - 新網址 = NEW_APP_URL；只回 .vercelignore 沒排除的檔案（模擬 Vercel 實際上線的內容，用 git 的 gitignore 比對）。
   - NEW_APP_URL／LEGACY_HOSTS 一律從 js/ui/relocate.js 讀（relocateConfig），正式網址換掉時不用改測試。
   - 這個檔案的瀏覽器不用 proxy、DNS 一律 NOTFOUND（只剩 127.0.0.1）：沒被 route 攔下的請求不可能連到外面。
   - 主畫面模式：addInitScript 設 navigator.standalone = true，或包 matchMedia('(display-mode: standalone)')
     （D27 以前匯入卡依此切換提示；現在用來確認哪一種開法都沒有匯入卡）。
   - Service Worker：模擬網址要 SW 時用 swRouting fixture，讓 SW 自己的請求（sw.js、install 的 addAll）也走 route。
     瀏覽器的 SW「更新檢查」（registration.update() 抓 sw.js）不經過 route（Playwright 1.56／Chromium 實測），所以「舊網址舊版 → 目前」
     改用本機 https 伺服器＋--host-resolver-rules 把舊網址的主機名對到 127.0.0.1（自簽憑證、--ignore-certificate-errors）。
   QA_SHOTS_DIR 有設時存截圖（報告引用的證據）。
   V1：今日最上方是頁首（日期＋右上齒輪），搬家卡緊接在頁首之後；設定由齒輪進入（分頁列亮「今日」）。
   舊版頁面（v7／v8／v9）用 M1 的判斷（waitReadyM1、expectHomeM1）。 */
import { createServer } from 'node:https';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import {
  test, expect, readFixture, fixturePath, installClock, seedOnce, seedState, waitReady, waitReadyM1, openApp, gotoTab, expectHome, expectHomeM1,
  storageSnapshot, rawMain, clickAndDownload, IMPORT_ARMED_TEXT, expectGlossaryClean, runWorkoutToEnd, tick,
  swAssets, cacheNumber, readSwCache, REPO_DIR, cacheNames, waitControlled, markDocument, sameDocument, recordSwMessages,
  swMessages, requestSwUpdate, countNavigations, realWait, contextOptions, watchContext, assertWatchClean, simulateSite,
  relocateConfig, readRepo, MAIN_KEY, NOW_ISO
} from './helpers.js';

const CFG = relocateConfig();
const LEGACY_HOST = CFG.LEGACY_HOSTS[0];
const LEGACY_PREFIX = '/daily-ten/'; // GitHub Pages 專案網址的路徑 = /<repo 名稱>/
const PORT = Number(process.env.PORT || 4173);
/* Vercel 預覽網址的樣子：<專案>-git-<分支>-<團隊>.vercel.app（一定和正式網址不同主機） */
const PREVIEW_HOST = `${CFG.NEW_HOST.split('.')[0]}-git-move-vercel-cc4wang.vercel.app`;
const SITE = {
  legacy: { origin: `https://${LEGACY_HOST}`, prefix: LEGACY_PREFIX },
  next: { origin: CFG.NEW_ORIGIN, prefix: CFG.NEW_PATH, vercel: true },
  preview: { origin: `https://${PREVIEW_HOST}`, prefix: '/', vercel: true },
  localhost: { origin: `http://localhost:${PORT}`, prefix: '/' }
};
const CUR = swAssets().cache;
const CUR_N = cacheNumber(CUR);
const UPGRADE_DIR = process.env.UPGRADE_BASE_DIR || '';
const UPGRADE_CACHE = UPGRADE_DIR ? readSwCache(UPGRADE_DIR) : null;
const BACKUP_NAME = 'daily-ten-backup-2026-10-02.json';
const V2 = () => readFixture('v2-real.json');
const SHOTS_DIR = process.env.QA_SHOTS_DIR || '';

/* 不用 proxy、DNS 一律 NOTFOUND（127.0.0.1 除外）；--disable-partial-raster：逐像素比對（同 parity.spec） */
const NO_PROXY_ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/^(https?|all)_proxy$/i.test(k)));
const EXEC = process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {};
test.use({
  launchOptions: {
    args: ['--disable-partial-raster', '--no-proxy-server', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'],
    env: NO_PROXY_ENV,
    ...EXEC
  }
});

async function shot(page, name) {
  if (!SHOTS_DIR) return;
  mkdirSync(SHOTS_DIR, { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: join(SHOTS_DIR, `${name}.png`) });
}

/* ---------- 開 App 前掛上的腳本 ---------- */
const STANDALONE = () => Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true, configurable: true });
const DISPLAY_MODE_STANDALONE = () => {
  const orig = window.matchMedia.bind(window);
  window.matchMedia = (q) => (/display-mode:\s*standalone/.test(q)
    ? { matches: true, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } }
    : orig(q));
};
/* 在某個（模擬）網址開 App：假時鐘暫停在 now（同一個 context 只裝一次）、寫入 fixture 原文、掛上腳本 */
async function openOn(page, site, { seed = null, now = NOW_ISO, init = [], clock = true, old = false } = {}) {
  if (clock) await installClock(page, now);
  if (seed !== null) await seedOnce(page, seedState(seed));
  for (const fn of [].concat(init)) await page.addInitScript(fn);
  await page.goto(site.url());
  if (old) await waitReadyM1(page); // V1 以前的版本沒有 html[data-ready]
  else await waitReady(page);
}
/* 今日最上方看得到的區塊（不含固定定位的提示列）：V1＝頁首（.top，含日期）→ 卡片 */
const homeTopOrder = (page) => page.evaluate(() => [...document.getElementById('s-home').children]
  .filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).position !== 'fixed')
  .map((el) => el.id || el.className));
const cardIds = ['mv-legacy'];
/* D27 拿掉的元素：搬家卡的下載備份與無紀錄提醒、新網址的匯入卡、今日的 7 天備份提醒卡。任何網址、任何資料下都不能出現在 DOM 裡 */
const REMOVED_IDS = ['mv-backup', 'mv-backup-msg', 'mv-legacy-empty', 'mv-import', 'mv-import-title', 'mv-import-hint', 'mv-import-btn',
  'bk-reminder', 'bk-reminder-text', 'bk-reminder-msg', 'bk-reminder-btn'];
async function expectRemovedAbsent(page, label) {
  expect(await page.evaluate((ids) => ids.filter((id) => document.getElementById(id) !== null), REMOVED_IDS), `${label}：D27 拿掉的元素仍在 DOM 裡`).toEqual([]);
}
/* 今日看得到的文字不提備份、匯入（D27） */
async function expectHomeNoBackupText(page, label) {
  await expect(page.locator('#s-home'), label).toHaveClass(/active/);
  expect(await page.locator('#s-home').innerText(), `${label}：今日的文字`).not.toMatch(/備份|匯入/);
}
/* hidden 屬性在、而且不佔版面 */
const hiddenNoLayout = (page, id) => page.evaluate((id) => {
  const el = document.getElementById(id);
  return { exists: !!el, hidden: !!el && el.hidden, rects: el ? el.getClientRects().length : -1 };
}, id);

/* ======================================================================== */
test('relocate.js 的設定：NEW_APP_URL 是 https、和舊網址不同主機；執行期 module 匯出與檔案文字相同', async ({ page }) => {
  expect(CFG.NEW_APP_URL).toMatch(/^https:\/\//);
  expect(CFG.LEGACY_HOSTS.length).toBeGreaterThan(0);
  expect(CFG.LEGACY_HOSTS).not.toContain(CFG.NEW_HOST);
  expect(PREVIEW_HOST).not.toBe(CFG.NEW_HOST);
  await page.goto('/tests/fixtures/harness.html');
  const rt = await page.evaluate(async () => {
    const m = await import('/js/ui/relocate.js');
    return { url: m.NEW_APP_URL, legacy: m.LEGACY_HOSTS };
  });
  expect(rt).toEqual({ url: CFG.NEW_APP_URL, legacy: CFG.LEGACY_HOSTS });
});

/* LEGACY_HOSTS 也從 relocate.js 讀：寫錯（例如打錯字）時模擬的就是錯的主機，畫面測試抓不到 → 這裡和文件交叉比對。
   正式網址換掉時：改 relocate.js 的 NEW_APP_URL 與文件（HANDOFF 的步驟），測試不用改。 */
test('文件與 relocate.js 一致：README 寫的舊網址主機都在 LEGACY_HOSTS；README、CLAUDE.md 寫的正式網址＝NEW_APP_URL', () => {
  const readme = readRepo('README.md');
  const claude = readRepo('CLAUDE.md');
  const legacyInDocs = [...new Set([...readme.matchAll(/https:\/\/([a-z0-9-]+\.github\.io)\/daily-ten\//g)].map((m) => m[1]))];
  expect(legacyInDocs.length, 'README 有寫舊網址').toBeGreaterThan(0);
  for (const h of legacyInDocs) expect(CFG.LEGACY_HOSTS, `README 的舊網址主機 ${h}`).toContain(h);
  expect(readme, 'README 的正式網址').toContain(CFG.NEW_APP_URL);
  expect(claude, 'CLAUDE.md（D24）的正式網址').toContain(CFG.NEW_HOST);
});

/* ======================================================================== */
test.describe('舊網址（GitHub Pages）：搬家卡', () => {
  test('有紀錄：搬家卡在 HOME 最上方、不能關閉；2 個步驟（打開新網址／加入主畫面、刪除舊圖示）、不提備份與匯入；連結 href／target／rel；新網址主機名；其他功能照常', async ({ page, context, guard }) => {
    const legacy = await simulateSite(context, guard, SITE.legacy);
    await openOn(page, legacy, { seed: V2() });
    expect(await page.evaluate(() => [location.hostname, location.pathname])).toEqual([LEGACY_HOST, LEGACY_PREFIX]);
    const card = page.locator('#mv-legacy');
    await expect(card).toBeVisible();
    await expectRemovedAbsent(page, '舊網址（有紀錄）');
    await expect(page.locator('#mv-legacy-title')).toHaveText('App 搬到新網址了');
    await expect(page.locator('#mv-legacy > p')).toHaveText(['新網址更新更快，照下面 2 步換過去。']);
    /* 位置：頁首（日期）之後第一個看得到的區塊 */
    expect((await homeTopOrder(page)).slice(0, 2)).toEqual(['top', 'mv-legacy']);
    await expect(page.locator('#s-home > .top #h-date')).toBeVisible();
    /* 不能關閉：卡片裡能操作的只有「打開新網址」 */
    const controls = await card.evaluate((el) => [...el.querySelectorAll('button, a, input, select, textarea, [role="button"], [tabindex]')].map((c) => c.id));
    expect(controls).toEqual(['mv-open']);
    /* 2 個步驟：① 打開新網址　② 加入主畫面、以後從新圖示打開；刪除舊圖示 */
    const steps = card.locator('.mv-steps > li');
    await expect(steps).toHaveCount(2);
    await expect(card.locator('.mv-num')).toHaveText(['1', '2']);
    await expect(steps.nth(0)).toContainText('打開新網址');
    await expect(steps.nth(1)).toContainText('加入主畫面');
    await expect(steps.nth(1)).toContainText('刪除');
    await expect(steps.nth(1).locator('p')).toHaveText(['在 Safari 按「分享」→「加入主畫面」，以後都從新圖示打開。', '最後長按舊圖示，把它刪除。']);
    /* D27：卡片不提備份、匯入 */
    expect(await card.innerText(), '搬家卡的文字').not.toMatch(/備份|匯入/);
    /* 連結：新分頁、noopener、href = NEW_APP_URL；下方顯示新網址主機名 */
    const link = await page.locator('#mv-open').evaluate((a) => ({ href: a.getAttribute('href'), target: a.target, rel: [...a.relList] }));
    expect(link).toEqual({ href: CFG.NEW_APP_URL, target: '_blank', rel: expect.arrayContaining(['noopener']) });
    await expect(page.locator('#mv-open-host')).toHaveText(CFG.NEW_HOST);
    /* 觸控 ≥ 44px（CLAUDE.md §7） */
    const b = await page.locator('#mv-open').boundingBox();
    expect(b.height, '#mv-open 高度').toBeGreaterThanOrEqual(44);
    expect(b.width, '#mv-open 寬度').toBeGreaterThanOrEqual(44);
    /* 其他功能照常：HOME 數值、開始按鈕；D27 起今日沒有 7 天備份提醒卡（有紀錄、從未備份也沒有），今日也不提備份與匯入 */
    await expectHomeNoBackupText(page, '舊網址（有紀錄）');
    await expectHome(page, { level: 3, xp: 361, current: 9, best: 11 });
    await expect(page.locator('#h-start')).not.toHaveText('—');
    expectGlossaryClean([await card.innerText()]);
    await shot(page, 'd27-legacy-card');
    /* 每次 renderHome 重新判斷：切分頁回來、重新整理後仍在 */
    await gotoTab(page, 's-hist');
    await gotoTab(page, 's-home');
    await expect(card).toBeVisible();
    await page.reload();
    await waitReady(page);
    await expect(card).toBeVisible();
    await expect(page.locator('#mv-open')).toHaveAttribute('href', CFG.NEW_APP_URL);
    await expectRemovedAbsent(page, '舊網址（重開）');
  });

  test('按「打開新網址」：新分頁開在 NEW_APP_URL、沒有 opener；新網址的資料和舊網址分開（全新）→ 新分頁沒有搬家卡、也沒有匯入卡（D27）；舊分頁不受影響', async ({ page, context, guard }) => {
    const legacy = await simulateSite(context, guard, SITE.legacy);
    await simulateSite(context, guard, SITE.next);
    await openOn(page, legacy, { seed: V2() });
    const [popup] = await Promise.all([context.waitForEvent('page'), page.click('#mv-open')]);
    await popup.waitForLoadState('domcontentloaded');
    await waitReady(popup);
    expect(popup.url()).toBe(CFG.NEW_APP_URL);
    expect(await popup.evaluate(() => window.opener)).toBeNull();
    await expect(popup.locator('#mv-legacy')).toBeHidden();
    await expect(popup.locator('#mv-import')).toHaveCount(0);
    await expectRemovedAbsent(popup, '新分頁（新網址、全新）');
    await expectHomeNoBackupText(popup, '新分頁（新網址、全新）');
    expect(await rawMain(popup), '新網址的 localStorage 是空的（和舊網址分開）').toBeNull();
    expect(page.url()).toBe(legacy.url());
    await expect(page.locator('#mv-legacy')).toBeVisible();
    await expectHome(page, { level: 3, xp: 361, current: 9, best: 11 });
  });
});

/* 文字對比（WCAG AA：一般字級 ≥ 4.5:1）：前景色對最近一層不透明背景 */
async function contrastRatios(page, selectors) {
  return page.evaluate((sels) => {
    const parse = (c) => (c.match(/[\d.]+/g) || []).map(Number);
    const lum = (rgb) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
    };
    const bgOf = (el) => {
      for (let e = el; e; e = e.parentElement) {
        const v = parse(getComputedStyle(e).backgroundColor);
        if (v.length >= 3 && (v.length < 4 || v[3] > 0)) return v.slice(0, 3);
      }
      return [255, 255, 255];
    };
    /* 每個符合的元素都量（例：兩個步驟的編號）；選擇器一個都沒對到 → ratio NaN（算不合格，打錯選擇器不會默默通過） */
    return sels.flatMap((sel) => {
      const els = [...document.querySelectorAll(sel)];
      if (!els.length) return [{ sel, ratio: NaN, size: '-', text: '（找不到）' }];
      return els.map((el, i) => {
        const fg = parse(getComputedStyle(el).color).slice(0, 3);
        const [a, b] = [lum(fg), lum(bgOf(el))].sort((x, y) => y - x);
        return { sel: els.length > 1 ? `${sel}[${i}]` : sel, ratio: Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100, size: getComputedStyle(el).fontSize, text: el.textContent.trim().slice(0, 16) };
      });
    });
  }, selectors);
}

test('搬家卡的文字對比 ≥ 4.5:1（WCAG AA；標題、說明、按鈕、新網址主機名、兩個步驟的文字與編號）', async ({ page, context, guard }, testInfo) => {
  const legacy = await simulateSite(context, guard, SITE.legacy);
  await openOn(page, legacy); // 全新（沒有紀錄）：D27 起卡片與有紀錄時相同（沒有無紀錄提醒、沒有下載備份）
  await expect(page.locator('#mv-legacy')).toBeVisible();
  await expectRemovedAbsent(page, '舊網址（全新）');
  await expect(page.locator('#mv-legacy .mv-num')).toHaveText(['1', '2']);
  const results = await contrastRatios(page, ['#mv-legacy-title', '#mv-legacy > p', '#mv-open', '#mv-open-host', '#mv-legacy .mv-text p', '#mv-legacy .mv-num']);
  const line = results.map((r) => `${r.sel} ${r.ratio}（${r.size}）`).join('；');
  testInfo.annotations.push({ type: 'qa', description: `對比：${line}` });
  console.log(`[qa] 對比：${line}`);
  expect(results).toHaveLength(8); // 標題、說明、按鈕、主機名各 1，步驟 2 的兩段文字、兩個編號
  expect(results.filter((r) => !(r.ratio >= 4.5)).map((r) => `${r.sel} ${r.ratio}`)).toEqual([]);
});

/* ======================================================================== */
test.describe('新網址（Vercel）：D27 起沒有搬家卡、也沒有匯入卡', () => {
  /* 以前會顯示匯入卡的狀態（全新：Safari 分頁／主畫面／已安裝的 PWA；空資料）與不會顯示的狀態（備份過的空資料、有紀錄）一律沒有 */
  test('全新（Safari 分頁、主畫面、已安裝的 PWA）、空資料、備份過的空資料、有紀錄：今日沒有搬家／匯入卡、沒有「備份」「匯入」字樣；設定的資料備份卡照舊', async ({ context, guard }) => {
    const next = await simulateSite(context, guard, SITE.next);
    const backedEmpty = JSON.parse(readFixture('empty-arrays.json'));
    backedEmpty.meta = { lastBackupAt: '2026-10-01T10:00:00+09:00' };
    /* 同一個 context（同一個 origin 的 localStorage）：全新的三種開法先跑（開 App 不寫入 storage），再依序寫入 fixture */
    const STATES = [
      { label: '全新、Safari 分頁', seed: null, init: [] },
      { label: '全新、主畫面（navigator.standalone）', seed: null, init: STANDALONE },
      { label: '全新、已安裝的 PWA（display-mode: standalone）', seed: null, init: DISPLAY_MODE_STANDALONE },
      { label: 'empty-arrays（沒有紀錄、沒備份過）', seed: readFixture('empty-arrays.json'), init: STANDALONE },
      { label: 'empty-arrays＋lastBackupAt', seed: JSON.stringify(backedEmpty), init: STANDALONE },
      { label: 'v2-real（有紀錄）', seed: V2(), init: STANDALONE }
    ];
    let page = null;
    for (const [i, st] of STATES.entries()) {
      page = await context.newPage();
      await openOn(page, next, { seed: st.seed, init: st.init, clock: i === 0 }); // 假時鐘裝在 context，只裝一次
      expect(await page.evaluate(() => location.hostname), st.label).toBe(CFG.NEW_HOST);
      if (st.seed === null) expect(await rawMain(page), `${st.label}：localStorage 是空的`).toBeNull();
      for (const id of cardIds) expect(await hiddenNoLayout(page, id), `${st.label} ${id}`).toEqual({ exists: true, hidden: true, rects: 0 });
      await expectRemovedAbsent(page, st.label);
      await expectHomeNoBackupText(page, st.label);
      if (i === 0) await shot(page, 'd27-new-fresh');
      if (i < STATES.length - 1) await page.close();
    }
    await expectHome(page, { level: 3, xp: 361, current: 9, best: 11 });
    /* 要搬資料只剩設定的資料備份卡：下載與選檔／貼上匯入都在 */
    await gotoTab(page, 's-setup');
    for (const sel of ['#bk-download', '#imp-file-btn', '#imp-btn']) await expect(page.locator(sel), sel).toBeVisible();
  });

  for (const fixture of ['v1-minimal.json', 'v2-real.json', 'v2-missing-fields.json', 'v2-wrong-types.json', 'v3.json', 'v3-reverted-to-v2.json']) {
    test(`已有資料（${fixture}）：搬家卡不顯示、匯入卡不存在`, async ({ page, context, guard }) => {
      const next = await simulateSite(context, guard, SITE.next);
      await openOn(page, next, { seed: readFixture(fixture), init: STANDALONE });
      for (const id of cardIds) expect(await hiddenNoLayout(page, id), id).toEqual({ exists: true, hidden: true, rects: 0 });
      await expectRemovedAbsent(page, fixture);
    });
  }
});

/* ======================================================================== */
test.describe('其他網址：搬家卡 hidden、匯入卡不存在', () => {
  for (const fixture of [null, 'v1-minimal.json', 'v2-real.json', 'v2-wrong-types.json', 'v3.json', 'v3-reverted-to-v2.json', 'empty-arrays.json']) {
    test(`127.0.0.1（${fixture || '全新'}）：hidden、不佔版面`, async ({ page }) => {
      await openApp(page, { seed: fixture ? seedState(readFixture(fixture)) : null });
      for (const id of cardIds) expect(await hiddenNoLayout(page, id), id).toEqual({ exists: true, hidden: true, rects: 0 });
      await expectRemovedAbsent(page, `127.0.0.1（${fixture || '全新'}）`);
    });
  }

  /* 同一份 HOME 在 127.0.0.1、Vercel 預覽網址、localhost 逐屏截圖，逐像素相同（127.0.0.1 與 ec87e03 的等價另由 parity.spec 驗） */
  async function homeShots(browser, origin, seed, sim) {
    const ctx = await browser.newContext(contextOptions({ baseURL: `http://127.0.0.1:${PORT}` }));
    const w = watchContext(ctx);
    try {
      const site = sim ? await simulateSite(ctx, w, sim) : { url: () => `http://127.0.0.1:${PORT}/index.html` };
      const page = await ctx.newPage();
      await openOn(page, site, { seed });
      for (const id of cardIds) expect(await hiddenNoLayout(page, id), `${origin} ${id}`).toEqual({ exists: true, hidden: true, rects: 0 });
      await expectRemovedAbsent(page, origin);
      const { h, vh } = await page.evaluate(() => ({ h: document.documentElement.scrollHeight, vh: innerHeight }));
      const shots = [];
      for (let i = 0; i < Math.max(1, Math.ceil(h / vh)); i++) {
        await page.evaluate((y) => window.scrollTo(0, y), i * vh);
        shots.push(await page.screenshot({ animations: 'disabled' })); // 三環掃入（CSS 動畫走真實時間）一律截完成後的畫面
      }
      const text = await page.locator('#s-home').innerText();
      await ctx.close();
      assertWatchClean(w, origin);
      return { shots, text, host: new URL(site.url()).hostname };
    } catch (e) {
      await ctx.close().catch(() => {});
      throw e;
    }
  }
  for (const [label, seed] of [['全新', null], ['v2 資料', 'v2-real.json']]) {
    test(`Vercel 預覽網址、localhost（${label}）：搬家卡不顯示、匯入卡不存在；HOME 與 127.0.0.1 逐像素相同`, async ({ browser }) => {
      const raw = seed ? readFixture(seed) : null;
      const base = await homeShots(browser, '127.0.0.1', raw, null);
      for (const [name, sim] of [['Vercel 預覽網址', SITE.preview], ['localhost', SITE.localhost]]) {
        const other = await homeShots(browser, name, raw, sim);
        expect(other.host).toBe(new URL(sim.origin).hostname);
        expect(other.text, `${name} HOME 文字`).toBe(base.text);
        expect(other.shots.length, `${name} 截圖張數（捲動高度）`).toBe(base.shots.length);
        other.shots.forEach((buf, i) => expect(buf.equals(base.shots[i]), `${name} 第 ${i + 1} 屏與 127.0.0.1 逐像素相同`).toBe(true));
      }
    });
  }
});

/* ======================================================================== */
test.describe('離線冷啟動（模擬網址＋Service Worker）', () => {
  test.use({ serviceWorkers: 'allow' });
  test.describe.configure({ timeout: 120_000 });

  /* SW 控制頁面、Cache Storage 只有目前的 CACHE、內含 sw.js 的全部 ASSETS（路徑相對於該網址） */
  async function waitPrecache(page, site) {
    const { cache, assets } = swAssets();
    await waitControlled(page, cache);
    const expected = assets.map((a) => new URL(a, site.url()).pathname).sort();
    await expect.poll(async () => (await page.evaluate(async (name) => {
      const c = await caches.open(name);
      return (await c.keys()).map((r) => new URL(r.url).pathname);
    }, cache)).sort(), { timeout: 20_000, message: `caches['${cache}'] 應含 sw.js 的全部 ASSETS` }).toEqual(expected);
    return expected;
  }
  /* 斷網：拿掉模擬網址的 route、瀏覽器離線，任何真的打到網路的請求都中止並記下來 */
  async function goOffline(context, sites) {
    for (const s of sites) await context.unroute(`${s.origin}/**`);
    await context.setOffline(true);
    const hits = [];
    await context.route('**/*', (route) => { hits.push(route.request().url()); return route.abort('internetdisconnected'); });
    return hits;
  }

  test('舊網址：SW 預快取完整（含 relocate.js）→ 斷網、關掉分頁、新分頁冷啟動 → 搬家卡照常（2 步）、設定的下載備份可用、四個分頁可用；沒有請求打到網路', async ({ page, context, guard, swRouting }) => {
    expect(swRouting).toBe(true);
    const legacy = await simulateSite(context, guard, SITE.legacy);
    await openOn(page, legacy, { seed: V2() });
    const expected = await waitPrecache(page, legacy);
    expect(expected).toContain(`${LEGACY_PREFIX}js/ui/relocate.js`);
    expect(legacy.count(`${LEGACY_PREFIX}sw.js`), 'SW 腳本由模擬網址回應').toBeGreaterThan(0);
    await expect(page.locator('#mv-legacy')).toBeVisible();
    const hits = await goOffline(context, [legacy]);
    await page.close();

    const p2 = await context.newPage();
    const fromSw = [];
    p2.on('response', (r) => { if (r.fromServiceWorker()) fromSw.push(new URL(r.url()).pathname); });
    await p2.goto(legacy.url());
    await waitReady(p2);
    expect(await p2.evaluate(() => navigator.onLine)).toBe(false);
    expect(fromSw).toEqual(expect.arrayContaining([LEGACY_PREFIX, `${LEGACY_PREFIX}js/app.js`, `${LEGACY_PREFIX}js/ui/home.js`, `${LEGACY_PREFIX}js/ui/relocate.js`]));
    await expect(p2.locator('#mv-legacy')).toBeVisible();
    await expect(p2.locator('#mv-open')).toHaveAttribute('href', CFG.NEW_APP_URL);
    await expect(p2.locator('#mv-legacy .mv-num')).toHaveText(['1', '2']);
    await expectRemovedAbsent(p2, '舊網址（離線冷啟動）');
    await expectHome(p2, { level: 3, xp: 361, current: 9, best: 11 });
    /* 離線下載備份（設定的資料備份卡，D27 起搬家卡沒有下載） */
    await gotoTab(p2, 's-setup');
    const dl = await clickAndDownload(p2, '#bk-download');
    expect(dl.name).toBe(BACKUP_NAME);
    expect(JSON.parse(dl.text).meta.lastBackupAt).toBe(NOW_ISO);
    await expect(p2.locator('#bk-status')).toHaveText('上次備份：2026-10-02 15:30');
    for (const id of ['s-hist', 's-body', 's-setup', 's-home']) await gotoTab(p2, id);
    await expect(p2.locator('#mv-legacy')).toBeVisible();
    expect(hits, '離線期間不應有請求真的打到網路').toEqual([]);
  });

  test('新網址（只有 Vercel 會上線的檔案）：SW 預快取完整 → 斷網冷啟動 → 沒有搬家卡、沒有匯入卡；設定的選檔匯入可用；沒有請求打到網路', async ({ page, context, guard, swRouting }, testInfo) => {
    expect(swRouting).toBe(true);
    const next = await simulateSite(context, guard, SITE.next);
    await openOn(page, next, { init: STANDALONE });
    await waitPrecache(page, next);
    expect(next.count(`${CFG.NEW_PATH}sw.js`), 'SW 腳本由模擬網址回應').toBeGreaterThan(0);
    await expect(page.locator('#mv-legacy')).toBeHidden();
    await expectRemovedAbsent(page, '新網址');
    const hits = await goOffline(context, [next]);
    await page.close();

    const p2 = await context.newPage();
    await p2.addInitScript(STANDALONE);
    const fromSw = [];
    p2.on('response', (r) => { if (r.fromServiceWorker()) fromSw.push(new URL(r.url()).pathname); });
    await p2.goto(next.url());
    await waitReady(p2);
    expect(await p2.evaluate(() => navigator.onLine)).toBe(false);
    expect(fromSw).toEqual(expect.arrayContaining([CFG.NEW_PATH, `${CFG.NEW_PATH}js/ui/relocate.js`]));
    await expect(p2.locator('#mv-legacy')).toBeHidden();
    await expectRemovedAbsent(p2, '新網址（離線冷啟動）');
    await expectHomeNoBackupText(p2, '新網址（離線冷啟動）');
    /* 離線匯入（設定的資料備份卡「選擇備份檔匯入」）：v3 備份檔（fixture）→ 預覽 → 兩次確認 */
    await gotoTab(p2, 's-setup');
    const [chooser] = await Promise.all([p2.waitForEvent('filechooser'), p2.click('#imp-file-btn')]);
    expect(await chooser.element().evaluate((el) => el.id)).toBe('imp-file');
    await chooser.setFiles(fixturePath('v3.json'));
    await expect(p2.locator('#imp-preview')).toBeVisible();
    await p2.click('#imp-confirm');
    await expect(p2.locator('#imp-confirm')).toHaveText(IMPORT_ARMED_TEXT);
    await p2.clock.runFor(1_500);
    await p2.click('#imp-confirm');
    await expect(p2.locator('#io-msg')).toHaveText('匯入成功。');
    await gotoTab(p2, 's-home');
    await expect(p2.locator('#mv-legacy')).toBeHidden();
    await expectHome(p2, { level: 3, xp: 396, current: 12, best: 12 });
    for (const id of ['s-hist', 's-body', 's-setup', 's-home']) await gotoTab(p2, id);
    expect(hits, '離線期間不應有請求真的打到網路').toEqual([]);
    testInfo.annotations.push({ type: 'qa', description: `新網址離線冷啟動：SW 回應 ${fromSw.length} 個請求` });
  });
});

/* ======================================================================== */
/* 舊網址的 https 模擬（更新測試專用）：本機 https 伺服器（可切換根目錄）＋獨立的瀏覽器
   （--host-resolver-rules 只把舊網址對到這個伺服器、其他一律 NOTFOUND；不用 proxy；自簽憑證）。 */
let certDir = null;
function legacyCert() {
  if (!certDir) {
    certDir = mkdtempSync(join(tmpdir(), 'qa-legacy-cert-'));
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '2', '-subj', `/CN=${LEGACY_HOST}`,
      '-addext', `subjectAltName=DNS:${LEGACY_HOST}`, '-keyout', join(certDir, 'key.pem'), '-out', join(certDir, 'cert.pem')], { stdio: 'ignore' });
  }
  return { key: readFileSync(join(certDir, 'key.pem')), cert: readFileSync(join(certDir, 'cert.pem')) };
}
test.afterAll(() => { if (certDir) rmSync(certDir, { recursive: true, force: true }); certDir = null; });

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.png': 'image/png' };
async function httpsLegacy(browserType, root) {
  let rootDir = resolve(root);
  const log = [];
  const server = createServer(legacyCert(), (req, res) => {
    try {
      const path = decodeURIComponent(new URL(req.url, `https://${LEGACY_HOST}`).pathname);
      log.push(path);
      if (!path.startsWith(LEGACY_PREFIX)) throw new Error('outside');
      let rel = path.slice(LEGACY_PREFIX.length);
      if (rel === '' || rel.endsWith('/')) rel += 'index.html';
      const file = normalize(join(rootDir, rel));
      if (!file.startsWith(rootDir + sep) || !existsSync(file) || !statSync(file).isFile()) throw new Error('not found');
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(readFileSync(file));
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
    }
  });
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(0, '127.0.0.1', ok); });
  const port = server.address().port;
  let browser = null;
  try {
    browser = await browserType.launch({
      args: ['--no-proxy-server', `--host-resolver-rules=MAP ${LEGACY_HOST} 127.0.0.1:${port}, MAP * ~NOTFOUND, EXCLUDE 127.0.0.1`, '--ignore-certificate-errors'],
      env: NO_PROXY_ENV,
      ...EXEC
    });
  } catch (e) {
    server.close();
    throw e;
  }
  const context = await browser.newContext(contextOptions({ serviceWorkers: 'allow', ignoreHTTPSErrors: true }));
  const watch = watchContext(context);
  watch.allowHosts.add(LEGACY_HOST); // 由 --host-resolver-rules 對到本機伺服器，不是外部網路
  return {
    context, watch, log,
    url: (p = '') => `https://${LEGACY_HOST}${LEGACY_PREFIX}${p}`,
    setRoot(dir) { rootDir = resolve(dir); },
    async close() {
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
      await new Promise((r) => { server.closeAllConnections(); server.close(() => r()); });
    }
  };
}

/* 舊版頁面確認：三環（#h-rings）看基準版本是不是 V1 以後（有 js/ui/rings.js；v7／v8 沒有，v9 起有）；
   搬家卡看基準版本有沒有 D24（v7 沒有，v8 起有）。D27 起 origin/main（v9）就是 V1 → 舊版頁面的等待與今日數字也用 V1 的判斷 */
const OLD_HAS_MOVE = !!UPGRADE_DIR && existsSync(join(UPGRADE_DIR, 'js/ui/relocate.js'));
const OLD_IS_V1 = !!UPGRADE_DIR && existsSync(join(UPGRADE_DIR, 'js/ui/rings.js'));
const expectOldHome = OLD_IS_V1 ? expectHome : expectHomeM1;
async function expectOldVersion(page) {
  await expect(page.locator('#h-rings'), `舊版（${UPGRADE_CACHE}）${OLD_IS_V1 ? '已有' : '沒有'}三環`).toHaveCount(OLD_IS_V1 ? 1 : 0);
  await expect(page.locator('#mv-legacy'), `舊版（${UPGRADE_CACHE}）${OLD_HAS_MOVE ? '已有' : '沒有'}搬家卡`).toHaveCount(OLD_HAS_MOVE ? 1 : 0);
}

test.describe('更新：舊網址的舊版（UPGRADE_BASE_DIR，v7／v8／v9）→ 目前版本（D23 協定）', () => {
  test.skip(!UPGRADE_DIR, '未設定 UPGRADE_BASE_DIR（origin/main 的 worktree）');
  test.skip(!!UPGRADE_DIR && UPGRADE_CACHE === CUR, `UPGRADE_BASE_DIR 的 CACHE 與目前相同（${CUR}），沒有可測的更新`);
  test.describe.configure({ timeout: 150_000 });

  test('閒置：頁面回 ACK、自己重新載入一次 → 出現搬家卡與「已更新到最新版」；localStorage 逐字相同；只重新載入一次；離線重開仍是新版＋搬家卡', async ({ playwright }, testInfo) => {
    expect(cacheNumber(UPGRADE_CACHE)).toBeLessThan(CUR_N);
    const env = await httpsLegacy(playwright.chromium, UPGRADE_DIR);
    try {
      const page = await env.context.newPage();
      const navs = countNavigations(page);
      await openOn(page, env, { seed: V2(), old: !OLD_IS_V1 });
      expect(await page.evaluate(() => [location.hostname, isSecureContext])).toEqual([LEGACY_HOST, true]);
      await waitControlled(page, UPGRADE_CACHE);
      await expectOldVersion(page);
      await expectOldHome(page, { level: 3, xp: 361, current: 9, best: 11 });
      const before = await storageSnapshot(page);
      const token = await markDocument(page);
      const navsBefore = navs.length;

      /* 部署目前版本 → App 檢查更新（＝開啟或回到前景時的 checkForUpdate） */
      env.setRoot(REPO_DIR);
      const t0 = Date.now();
      await requestSwUpdate(page);
      await expect.poll(() => sameDocument(page, token), { timeout: 20_000, message: '閒置時應自動換成新版' }).toBe(false);
      await waitReady(page);
      const ms = Date.now() - t0;
      testInfo.annotations.push({ type: 'qa', description: `舊網址 ${UPGRADE_CACHE} → ${CUR}：update() 到新文件就緒 ${ms} ms` });
      console.log(`[qa] 舊網址 ${UPGRADE_CACHE} → ${CUR}：update() 到新文件就緒 ${ms} ms`);
      await expect(page.locator('#mv-legacy')).toBeVisible();
      await expect(page.locator('#mv-open')).toHaveAttribute('href', CFG.NEW_APP_URL);
      await expect(page.locator('#mv-legacy .mv-num'), '新版的搬家卡（D27：2 步）').toHaveText(['1', '2']);
      await expectRemovedAbsent(page, `舊網址 ${UPGRADE_CACHE} → ${CUR}`);
      /* 提示旗標只有頁面自己（回 ACK 後、閒置時）重新載入才會寫；SW 強制導向不會 → 有提示＝走的是 D23 協定 */
      await expect(page.locator('#upd-note')).toHaveText(`已更新到最新版（v${CUR_N}）`);
      expect(await cacheNames(page)).toEqual([CUR]);
      expect(await storageSnapshot(page), '更新不改 localStorage').toEqual(before);
      await realWait(4_000); // 超過 SW 的 3 秒 ACK 逾時：沒有第二次導向
      expect(navs.length - navsBefore, '自動重新載入次數').toBe(1);
      await gotoTab(page, 's-setup');
      await expect(page.locator('#app-version')).toHaveText(`App 版本 v${CUR_N}`);
      await gotoTab(page, 's-home');
      await shot(page, 'd24-legacy-after-v7-update');

      /* 離線重開：新版＋搬家卡 */
      await env.context.setOffline(true);
      const hits = [];
      await env.context.route('**/*', (route) => { hits.push(route.request().url()); return route.abort('internetdisconnected'); });
      await page.close();
      const p2 = await env.context.newPage();
      await p2.goto(env.url());
      await waitReady(p2);
      await expect(p2.locator('#mv-legacy')).toBeVisible();
      await expectHome(p2, { level: 3, xp: 361, current: 9, best: 11 });
      expect(hits, '離線期間不應有請求真的打到網路').toEqual([]);
      assertWatchClean(env.watch, '舊網址（https）');
    } finally {
      await env.close();
    }
  });

  test('訓練中：新版就緒不打斷；練完、完成畫面都不重新載入；按「回報完成」才重新載入 → 搬家卡出現、訓練紀錄有存', async ({ playwright }) => {
    const env = await httpsLegacy(playwright.chromium, UPGRADE_DIR);
    try {
      const page = await env.context.newPage();
      await recordSwMessages(page);
      await openOn(page, env, { seed: V2(), old: !OLD_IS_V1 });
      await waitControlled(page, UPGRADE_CACHE);
      await expectOldVersion(page);
      const before = await storageSnapshot(page);
      await page.click('#h-minimal');
      await expect(page.locator('#train')).toHaveClass(/active/);
      const token = await markDocument(page);

      env.setRoot(REPO_DIR);
      expect(await requestSwUpdate(page)).toBe('ok');
      await expect.poll(() => swMessages(page), { timeout: 20_000, message: '舊版頁面應收到新版通知' })
        .toEqual([{ type: 'DT_UPDATE_READY', version: CUR, ports: 1 }]);
      await expect.poll(() => cacheNames(page), { timeout: 20_000 }).toEqual([CUR]);
      /* 超過 SW 的 3 秒 ACK 逾時（真實時間）＋頁面閒置檢查跑 3 次（假時鐘） */
      await realWait(4_000);
      await page.clock.runFor(6_000);
      expect(await sameDocument(page, token), '訓練中不應重新載入').toBe(true);
      await expect(page.locator('#train')).toHaveClass(/active/);

      await runWorkoutToEnd(page);
      await expect(page.locator('#done')).toHaveClass(/active/);
      await tick(page, 10);
      expect(await sameDocument(page, token), '完成畫面不應重新載入').toBe(true);
      const afterSession = await storageSnapshot(page);
      const s = JSON.parse(afterSession[MAIN_KEY]);
      expect(s.sessions[s.sessions.length - 1]).toEqual({ date: '2026-10-02', type: 'minimal', xp: 3 });
      expect({ ...afterSession, [MAIN_KEY]: null }).toEqual({ ...before, [MAIN_KEY]: null });

      await page.click('#d-ok');
      await page.clock.runFor(2_000);
      await expect.poll(() => sameDocument(page, token), { timeout: 15_000, message: '回報完成後應重新載入' }).toBe(false);
      await waitReady(page);
      await expect(page.locator('#mv-legacy')).toBeVisible();
      await expect(page.locator('#upd-note')).toHaveText(`已更新到最新版（v${CUR_N}）`);
      expect(await storageSnapshot(page), '重新載入前後 localStorage 相同（訓練紀錄有存）').toEqual(afterSession);
      await expectHome(page, { level: 3, xp: 364, current: 1, best: 11 });
      assertWatchClean(env.watch, '舊網址（https）');
    } finally {
      await env.close();
    }
  });
});
