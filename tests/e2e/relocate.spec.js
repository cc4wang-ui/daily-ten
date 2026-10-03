/* qa-checker：D24 搬家引導（js/ui/relocate.js）——舊網址搬家卡、新網址匯入卡、其他網址不顯示；離線冷啟動；v7 → 目前版本。
   模擬網址：helpers.js 的 simulateSite（context.route 整個攔下該網址，route.fulfill 回 repo 的檔案；沒有 route.continue，不連網）。
   - 舊網址 = https://<LEGACY_HOSTS[0]>/daily-ten/（GitHub Pages 專案網址；去掉 /daily-ten/ 前綴對應 repo 根目錄，結尾 / 補 index.html）。
   - 新網址 = NEW_APP_URL；只回 .vercelignore 沒排除的檔案（模擬 Vercel 實際上線的內容，用 git 的 gitignore 比對）。
   - NEW_APP_URL／LEGACY_HOSTS 一律從 js/ui/relocate.js 讀（relocateConfig），正式網址換掉時不用改測試。
   - 這個檔案的瀏覽器不用 proxy、DNS 一律 NOTFOUND（只剩 127.0.0.1）：沒被 route 攔下的請求不可能連到外面。
   - 主畫面模式：addInitScript 設 navigator.standalone = true，或包 matchMedia('(display-mode: standalone)')。
   - Service Worker：模擬網址要 SW 時用 swRouting fixture，讓 SW 自己的請求（sw.js、install 的 addAll）也走 route。
     瀏覽器的 SW「更新檢查」（registration.update() 抓 sw.js）不經過 route（Playwright 1.56／Chromium 實測），所以「舊網址 v7 → 目前」
     改用本機 https 伺服器＋--host-resolver-rules 把舊網址的主機名對到 127.0.0.1（自簽憑證、--ignore-certificate-errors）。
   QA_SHOTS_DIR 有設時存截圖（報告引用的證據）。 */
import { createServer } from 'node:https';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import {
  test, expect, readFixture, fixturePath, installClock, seedOnce, seedState, waitReady, openApp, gotoTab, expectHome,
  storageSnapshot, storedState, rawMain, clickAndDownload, IMPORT_ARMED_TEXT, expectGlossaryClean, runWorkoutToEnd, tick,
  swAssets, cacheNumber, readSwCache, REPO_DIR, cacheNames, waitControlled, markDocument, sameDocument, recordSwMessages,
  swMessages, requestSwUpdate, countNavigations, realWait, contextOptions, watchContext, assertWatchClean, simulateSite,
  relocateConfig, readRepo, MAIN_KEY, PRE_IMPORT_KEY, NOW_ISO
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
/* 分享選單與下載的開關：__qaShare = 'none'（不支援分享 → 一般下載）| 'cancel'（使用者按取消）；__qaBlobFail = true → 產生檔案失敗 */
const SHARE_CONTROL = () => {
  window.__qaShare = 'none';
  window.__qaShareCalls = 0;
  window.__qaBlobFail = false;
  Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5, configurable: true });
  navigator.canShare = () => window.__qaShare !== 'none';
  navigator.share = () => {
    window.__qaShareCalls++;
    return Promise.reject(new DOMException('qa: share cancelled', 'AbortError'));
  };
  const orig = URL.createObjectURL.bind(URL);
  URL.createObjectURL = (b) => { if (window.__qaBlobFail) throw new Error('qa: blob blocked'); return orig(b); };
};

/* 在某個（模擬）網址開 App：假時鐘暫停在 now（同一個 context 只裝一次）、寫入 fixture 原文、掛上腳本 */
async function openOn(page, site, { seed = null, now = NOW_ISO, init = [], clock = true } = {}) {
  if (clock) await installClock(page, now);
  if (seed !== null) await seedOnce(page, seedState(seed));
  for (const fn of [].concat(init)) await page.addInitScript(fn);
  await page.goto(site.url());
  await waitReady(page);
}
const cardIds = ['mv-legacy', 'mv-import'];
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
  test('有紀錄：搬家卡在 HOME 最上方、不能關閉；3 個步驟；連結 href／target／rel；新網址主機名；沒有無紀錄提醒；匯入卡不顯示；其他功能照常', async ({ page, context, guard }) => {
    const legacy = await simulateSite(context, guard, SITE.legacy);
    await openOn(page, legacy, { seed: V2() });
    expect(await page.evaluate(() => [location.hostname, location.pathname])).toEqual([LEGACY_HOST, LEGACY_PREFIX]);
    const card = page.locator('#mv-legacy');
    await expect(card).toBeVisible();
    await expect(page.locator('#mv-import')).toBeHidden();
    await expect(page.locator('#mv-legacy-empty')).toBeHidden();
    await expect(page.locator('#mv-legacy-title')).toHaveText('App 搬到新網址了');
    /* 位置：眉標、日期之後第一個看得到的區塊 */
    const order = await page.evaluate(() => [...document.getElementById('s-home').children]
      .filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).position !== 'fixed')
      .map((el) => el.id || el.className));
    expect(order.slice(0, 3)).toEqual(['eyebrow', 'h-date', 'mv-legacy']);
    /* 不能關閉：卡片裡能操作的只有「下載備份」與「打開新網址」 */
    const controls = await card.evaluate((el) => [...el.querySelectorAll('button, a, input, select, textarea, [role="button"], [tabindex]')].map((c) => c.id));
    expect(controls).toEqual(['mv-backup', 'mv-open']);
    /* 3 個步驟 */
    const steps = card.locator('.mv-steps > li');
    await expect(steps).toHaveCount(3);
    await expect(card.locator('.mv-num')).toHaveText(['1', '2', '3']);
    await expect(steps.nth(0)).toContainText('下載備份');
    await expect(steps.nth(1)).toContainText('打開新網址');
    await expect(steps.nth(2)).toContainText('加入主畫面');
    await expect(steps.nth(2)).toContainText('備份檔');
    /* 連結：新分頁、noopener、href = NEW_APP_URL；下方顯示新網址主機名 */
    const link = await page.locator('#mv-open').evaluate((a) => ({ href: a.getAttribute('href'), target: a.target, rel: [...a.relList] }));
    expect(link).toEqual({ href: CFG.NEW_APP_URL, target: '_blank', rel: expect.arrayContaining(['noopener']) });
    await expect(page.locator('#mv-open-host')).toHaveText(CFG.NEW_HOST);
    await expect(page.locator('#mv-backup-msg')).toHaveText('');
    /* 觸控 ≥ 44px（CLAUDE.md §7） */
    for (const sel of ['#mv-backup', '#mv-open']) {
      const b = await page.locator(sel).boundingBox();
      expect(b.height, `${sel} 高度`).toBeGreaterThanOrEqual(44);
      expect(b.width, `${sel} 寬度`).toBeGreaterThanOrEqual(44);
    }
    /* 其他功能照常：7 天提醒卡（從未備份）、HOME 數值、開始按鈕 */
    await expect(page.locator('#bk-reminder')).toBeVisible();
    await expectHome(page, { level: 3, xp: 361, current: 9, best: 11 });
    await expect(page.locator('#h-start')).not.toHaveText('—');
    expectGlossaryClean([await card.innerText()]);
    await shot(page, 'd24-legacy-card');
    /* 每次 renderHome 重新判斷：切分頁回來、重新整理後仍在 */
    await gotoTab(page, 's-hist');
    await gotoTab(page, 's-home');
    await expect(card).toBeVisible();
    await page.reload();
    await waitReady(page);
    await expect(card).toBeVisible();
    await expect(page.locator('#mv-open')).toHaveAttribute('href', CFG.NEW_APP_URL);
  });

  test('按「打開新網址」：新分頁開在 NEW_APP_URL、沒有 opener；新網址的資料和舊網址分開 → 新分頁顯示匯入卡，舊分頁不受影響', async ({ page, context, guard }) => {
    const legacy = await simulateSite(context, guard, SITE.legacy);
    await simulateSite(context, guard, SITE.next);
    await openOn(page, legacy, { seed: V2() });
    const [popup] = await Promise.all([context.waitForEvent('page'), page.click('#mv-open')]);
    await popup.waitForLoadState('domcontentloaded');
    await waitReady(popup);
    expect(popup.url()).toBe(CFG.NEW_APP_URL);
    expect(await popup.evaluate(() => window.opener)).toBeNull();
    await expect(popup.locator('#mv-import')).toBeVisible();
    await expect(popup.locator('#mv-legacy')).toBeHidden();
    expect(await rawMain(popup), '新網址的 localStorage 是空的（和舊網址分開）').toBeNull();
    expect(page.url()).toBe(legacy.url());
    await expect(page.locator('#mv-legacy')).toBeVisible();
    await expectHome(page, { level: 3, xp: 361, current: 9, best: 11 });
  });

  test('下載備份成功：顯示檔名、7 天提醒卡收起、SETUP「上次備份」同步；切分頁回來檔名仍在；檔案＝存好的 state；搬家卡仍在', async ({ page, context, guard }) => {
    const legacy = await simulateSite(context, guard, SITE.legacy);
    await openOn(page, legacy, { seed: V2() });
    await expect(page.locator('#bk-reminder')).toBeVisible();
    const dl = await clickAndDownload(page, '#mv-backup');
    expect(dl.name).toBe(BACKUP_NAME);
    const msg = page.locator('#mv-backup-msg');
    await expect(msg).toHaveText(`已存好：${BACKUP_NAME}`);
    await expect(msg).toHaveClass(/\bmv-ok\b/);
    await expect(page.locator('#mv-backup')).toBeEnabled();
    await expect(page.locator('#bk-reminder')).toBeHidden();
    await expect(page.locator('#mv-legacy')).toBeVisible();
    const stored = await storedState(page);
    expect(JSON.parse(dl.text), '備份檔內容＝下載後存好的 state').toEqual(stored);
    expect(stored.meta.lastBackupAt).toBe(NOW_ISO);
    expect(stored.sessions).toHaveLength(32);
    expect(Object.keys(await storageSnapshot(page))).toEqual([MAIN_KEY]);
    await gotoTab(page, 's-setup');
    await expect(page.locator('#bk-status')).toHaveText('上次備份：2026-10-02 15:30');
    await gotoTab(page, 's-home');
    await expect(msg).toHaveText(`已存好：${BACKUP_NAME}`);
    await expect(page.locator('#bk-reminder')).toBeHidden();
    expectGlossaryClean([await msg.textContent()]);
    await shot(page, 'd24-legacy-saved');
    /* 重開：備份時間有存（提醒卡不再出現）、搬家卡照常；檔名只記在這次開 App 的記憶體 */
    await page.reload();
    await waitReady(page);
    await expect(page.locator('#bk-reminder')).toBeHidden();
    await expect(page.locator('#mv-legacy')).toBeVisible();
    await expect(msg).toHaveText('');
  });

  test('取消（分享選單按取消）：不顯示訊息、沒有下載、資料不變；先存好再取消 → 之前的檔名照常顯示', async ({ page, context, guard }) => {
    const legacy = await simulateSite(context, guard, SITE.legacy);
    await openOn(page, legacy, { seed: V2(), init: SHARE_CONTROL });
    const downloads = [];
    page.on('download', (d) => downloads.push(d.suggestedFilename()));
    const shares = () => page.evaluate(() => window.__qaShareCalls);
    const msg = page.locator('#mv-backup-msg');
    const before = await storageSnapshot(page);
    await page.evaluate(() => { window.__qaShare = 'cancel'; });
    await page.click('#mv-backup');
    await expect.poll(shares).toBe(1);
    await expect(page.locator('#mv-backup')).toBeEnabled();
    await expect(msg).toHaveText('');
    expect(downloads).toEqual([]);
    expect(await storageSnapshot(page), '取消不寫入').toEqual(before);
    await expect(page.locator('#bk-reminder')).toBeVisible();
    /* 先存好（不支援分享 → 一般下載） */
    await page.evaluate(() => { window.__qaShare = 'none'; });
    const dl = await clickAndDownload(page, '#mv-backup');
    await expect(msg).toHaveText(`已存好：${dl.name}`);
    const afterSave = await storageSnapshot(page);
    /* 再取消：之前的檔名照常顯示，資料不變 */
    await page.evaluate(() => { window.__qaShare = 'cancel'; });
    await page.click('#mv-backup');
    await expect.poll(shares).toBe(2);
    await expect(page.locator('#mv-backup')).toBeEnabled();
    await expect(msg).toHaveText(`已存好：${dl.name}`);
    await expect(msg).toHaveClass(/\bmv-ok\b/);
    expect(await storageSnapshot(page)).toEqual(afterSave);
    expect(downloads).toEqual([dl.name]);
  });

  test('下載失敗：顯示錯誤訊息（不是檔名）、資料不變、提醒卡仍在；再試成功 → 改顯示檔名', async ({ page, context, guard }) => {
    const legacy = await simulateSite(context, guard, SITE.legacy);
    await openOn(page, legacy, { seed: V2(), init: SHARE_CONTROL });
    const msg = page.locator('#mv-backup-msg');
    const before = await storageSnapshot(page);
    await page.evaluate(() => { window.__qaBlobFail = true; });
    await page.click('#mv-backup');
    await expect(msg).toHaveText('備份檔產生失敗，請再試一次');
    await expect(msg).toHaveClass(/\bmv-err\b/);
    await expect(page.locator('#mv-backup')).toBeEnabled();
    expect(await storageSnapshot(page), '失敗不寫入').toEqual(before);
    await expect(page.locator('#bk-reminder')).toBeVisible();
    expectGlossaryClean([await msg.textContent()]);
    await shot(page, 'd24-legacy-error');
    await page.evaluate(() => { window.__qaBlobFail = false; });
    const dl = await clickAndDownload(page, '#mv-backup');
    await expect(msg).toHaveText(`已存好：${dl.name}`);
    await expect(msg).not.toHaveClass(/\bmv-err\b/);
    await expect(page.locator('#bk-reminder')).toBeHidden();
  });

  test('沒有紀錄（第一次開，或用 Safari 開、紀錄在主畫面的舊圖示裡）：搬家卡＋無紀錄提醒；下載後提醒仍在', async ({ page, context, guard }) => {
    const legacy = await simulateSite(context, guard, SITE.legacy);
    await openOn(page, legacy);
    await expect(page.locator('#mv-legacy')).toBeVisible();
    const hint = page.locator('#mv-legacy-empty');
    await expect(hint).toBeVisible();
    await expect(hint).toContainText('舊圖示');
    await expect(page.locator('#bk-reminder')).toBeHidden(); // 沒有紀錄不提醒（既有規則）
    expectGlossaryClean([await hint.innerText()]);
    await shot(page, 'd24-legacy-no-records');
    const dl = await clickAndDownload(page, '#mv-backup');
    await expect(page.locator('#mv-backup-msg')).toHaveText(`已存好：${dl.name}`);
    await expect(hint, '備份過但仍沒有紀錄 → 照樣提醒').toBeVisible();
  });

  for (const [fixture, empty] of [['empty-arrays.json', true], ['v1-minimal.json', false], ['v2-missing-fields.json', false],
    ['v2-wrong-types.json', false], ['v3.json', false], ['v3-reverted-to-v2.json', false]]) {
    test(`無紀錄提醒依資料判斷：${fixture} → ${empty ? '顯示' : '不顯示'}（搬家卡都顯示）`, async ({ page, context, guard }) => {
      const legacy = await simulateSite(context, guard, SITE.legacy);
      await openOn(page, legacy, { seed: readFixture(fixture) });
      await expect(page.locator('#mv-legacy')).toBeVisible();
      await expect(page.locator('#mv-import')).toBeHidden();
      if (empty) await expect(page.locator('#mv-legacy-empty')).toBeVisible();
      else await expect(page.locator('#mv-legacy-empty')).toBeHidden();
    });
  }
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
    return sels.map((sel) => {
      const el = document.querySelector(sel);
      const fg = parse(getComputedStyle(el).color).slice(0, 3);
      const [a, b] = [lum(fg), lum(bgOf(el))].sort((x, y) => y - x);
      return { sel, ratio: Math.round(((a + 0.05) / (b + 0.05)) * 100) / 100, size: getComputedStyle(el).fontSize, text: el.textContent.trim().slice(0, 16) };
    });
  }, selectors);
}

test('搬家卡、匯入卡的文字對比 ≥ 4.5:1（WCAG AA；含無紀錄提醒、成功／失敗訊息、Safari 提示）', async ({ page, context, guard }, testInfo) => {
  const legacy = await simulateSite(context, guard, SITE.legacy);
  const next = await simulateSite(context, guard, SITE.next);
  await openOn(page, legacy, { init: SHARE_CONTROL }); // 沒有紀錄 → 無紀錄提醒也顯示
  const base = ['#mv-legacy-title', '#mv-legacy > p:not(.mv-hint)', '#mv-legacy-empty', '#mv-backup', '#mv-open', '#mv-open-host',
    '#mv-legacy .mv-text p', '#mv-legacy .mv-num'];
  const results = await contrastRatios(page, base);
  await page.evaluate(() => { window.__qaBlobFail = true; });
  await page.click('#mv-backup');
  await expect(page.locator('#mv-backup-msg')).toHaveClass(/\bmv-err\b/);
  results.push(...await contrastRatios(page, ['#mv-backup-msg']));
  await page.evaluate(() => { window.__qaBlobFail = false; });
  await clickAndDownload(page, '#mv-backup');
  await expect(page.locator('#mv-backup-msg')).toHaveClass(/\bmv-ok\b/);
  results.push(...(await contrastRatios(page, ['#mv-backup-msg'])).map((r) => ({ ...r, sel: `${r.sel}（成功）` })));
  results[base.length].sel += '（失敗）';
  const p = await context.newPage();
  await openOn(p, next, { clock: false }); // Safari 分頁 → 提示也顯示
  results.push(...await contrastRatios(p, ['#mv-import-title', '#mv-import > p:not(.mv-hint)', '#mv-import-hint', '#mv-import-btn']));
  const line = results.map((r) => `${r.sel} ${r.ratio}（${r.size}）`).join('；');
  testInfo.annotations.push({ type: 'qa', description: `對比：${line}` });
  console.log(`[qa] 對比：${line}`);
  expect(results.filter((r) => !(r.ratio >= 4.5)).map((r) => `${r.sel} ${r.ratio}`)).toEqual([]);
});

/* ======================================================================== */
test.describe('新網址（Vercel）：從舊網址搬資料', () => {
  test('全新、從主畫面開（navigator.standalone）：匯入卡、不顯示 Safari 提示；搬家卡不顯示', async ({ page, context, guard }) => {
    const next = await simulateSite(context, guard, SITE.next);
    await openOn(page, next, { init: STANDALONE });
    expect(await page.evaluate(() => [location.hostname, navigator.standalone])).toEqual([CFG.NEW_HOST, true]);
    const card = page.locator('#mv-import');
    await expect(card).toBeVisible();
    await expect(page.locator('#mv-import-title')).toHaveText('從舊網址搬資料');
    await expect(page.locator('#mv-import-hint')).toBeHidden();
    await expect(page.locator('#mv-legacy')).toBeHidden();
    await expect(page.locator('#mv-import-btn')).toHaveText('選擇備份檔');
    const b = await page.locator('#mv-import-btn').boundingBox();
    expect(b.height).toBeGreaterThanOrEqual(44);
    expect(b.width).toBeGreaterThanOrEqual(44);
    /* 卡片在眉標、日期之後 */
    const order = await page.evaluate(() => [...document.getElementById('s-home').children]
      .filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).position !== 'fixed')
      .map((el) => el.id || el.className));
    expect(order.slice(0, 3)).toEqual(['eyebrow', 'h-date', 'mv-import']);
    expectGlossaryClean([await card.innerText()]);
    await shot(page, 'd24-new-fresh-standalone');
  });

  test('全新、Safari 分頁（非主畫面）：匯入卡＋「先加入主畫面」提示；按鈕照樣打開檔案選擇', async ({ page, context, guard }) => {
    const next = await simulateSite(context, guard, SITE.next);
    await openOn(page, next);
    expect(await page.evaluate(() => navigator.standalone)).toBeUndefined();
    await expect(page.locator('#mv-import')).toBeVisible();
    const hint = page.locator('#mv-import-hint');
    await expect(hint).toBeVisible();
    await expect(hint).toContainText('加入主畫面');
    expectGlossaryClean([await page.locator('#mv-import').innerText()]);
    await shot(page, 'd24-new-fresh-browser');
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#mv-import-btn')]);
    expect(await chooser.element().evaluate((el) => el.id)).toBe('imp-file');
    await expect(page.locator('#s-setup')).toHaveClass(/active/);
  });

  test('全新、display-mode: standalone（已安裝的 PWA）：不顯示 Safari 提示', async ({ page, context, guard }) => {
    const next = await simulateSite(context, guard, SITE.next);
    await openOn(page, next, { init: DISPLAY_MODE_STANDALONE });
    await expect(page.locator('#mv-import')).toBeVisible();
    await expect(page.locator('#mv-import-hint')).toBeHidden();
  });

  test('v2 全空資料（empty-arrays）＝沒有紀錄、沒備份過 → 顯示匯入卡', async ({ page, context, guard }) => {
    const next = await simulateSite(context, guard, SITE.next);
    await openOn(page, next, { seed: readFixture('empty-arrays.json'), init: STANDALONE });
    await expect(page.locator('#mv-import')).toBeVisible();
  });

  test('選擇備份檔：同一個點擊切到 SETUP、資料備份卡在畫面內、打開檔案選擇 → 舊網址下載的備份 → 預覽 → 兩次確認 → 回 HOME 卡片消失、資料＝舊網址；重開仍不顯示', async ({ page, context, guard }, testInfo) => {
    const legacy = await simulateSite(context, guard, SITE.legacy);
    const next = await simulateSite(context, guard, SITE.next);
    /* 1. 舊網址（有紀錄）用搬家卡下載備份 */
    await openOn(page, legacy, { seed: V2() });
    const dl = await clickAndDownload(page, '#mv-backup');
    /* 用檔案內容交給檔案選擇（setFiles 的路徑含全形字元時 Chromium 拿不到檔案，test-results 的資料夾名就有） */
    const backupFile = { name: dl.name, mimeType: 'application/json', buffer: Buffer.from(dl.text, 'utf8') };
    const legacyState = await storedState(page);
    await page.close();

    /* 2. 新網址（主畫面 App、全新） */
    const p = await context.newPage();
    await openOn(p, next, { init: STANDALONE, clock: false }); // 同一個 context 的假時鐘已裝好（暫停在 NOW）
    await expect(p.locator('#mv-import')).toBeVisible();
    const [chooser] = await Promise.all([p.waitForEvent('filechooser'), p.click('#mv-import-btn')]);
    expect(await chooser.element().evaluate((el) => el.id)).toBe('imp-file');
    expect(chooser.isMultiple()).toBe(false);
    await expect(p.locator('#s-setup')).toHaveClass(/active/);
    await expect(p.locator('#s-home')).not.toHaveClass(/active/);
    await expect(p.locator('#tabs button[data-s="s-setup"]')).toHaveClass(/\bon\b/);
    const pos = await p.evaluate(() => {
      const card = document.getElementById('bk-download').closest('.card');
      const r = card.getBoundingClientRect();
      const btn = document.getElementById('bk-download').getBoundingClientRect();
      return { title: card.querySelector('h3').textContent, top: Math.round(r.top), vh: innerHeight, y: Math.round(scrollY), btnBottom: Math.round(btn.bottom) };
    });
    testInfo.annotations.push({ type: 'qa', description: `選擇備份檔後：資料備份卡頂端 ${pos.top}px、捲動 ${pos.y}px、視窗高 ${pos.vh}px` });
    console.log(`[qa] 選擇備份檔後：資料備份卡頂端 ${pos.top}px、捲動 ${pos.y}px、視窗高 ${pos.vh}px`);
    expect(pos.title).toBe('資料備份');
    expect(pos.y, '有捲到資料備份卡（它不在 SETUP 第一屏）').toBeGreaterThan(0);
    expect(pos.top, '卡片頂端在畫面內').toBeGreaterThanOrEqual(0);
    expect(pos.top, '卡片頂端在畫面上半部').toBeLessThan(pos.vh / 2);
    expect(pos.btnBottom, '卡片的第一個按鈕整個看得到').toBeLessThanOrEqual(pos.vh);
    if (SHOTS_DIR) await p.screenshot({ path: join(SHOTS_DIR, 'd24-new-import-setup.png') }); // 不捲回頂端：選檔時背後的畫面

    await chooser.setFiles(backupFile);
    await expect(p.locator('#imp-preview')).toBeVisible();
    const row = (key) => p.locator(`#imp-rows .prline[data-key="${key}"]`).evaluate((el) => [...el.children].map((c) => c.textContent));
    expect(await row('sessions')).toEqual(['訓練紀錄筆數', '0 筆', '32 筆']);
    expect(await row('xp')).toEqual(['XP', '0', '361']);
    expect(await p.evaluate(() => document.getElementById('mv-import').hidden), '匯入前 HOME 的卡片不變').toBe(false);
    await p.click('#imp-confirm');
    await expect(p.locator('#imp-confirm')).toHaveText(IMPORT_ARMED_TEXT);
    expect(await rawMain(p), '第一次確認不寫入').toBeNull();
    await p.clock.runFor(1_500);
    await p.click('#imp-confirm');
    await expect(p.locator('#io-msg')).toHaveText('匯入成功。');
    expect(await p.evaluate(() => document.getElementById('mv-import').hidden), '匯入成功後卡片已收起').toBe(true);
    await gotoTab(p, 's-home');
    await expect(p.locator('#mv-import')).toBeHidden();
    await expect(p.locator('#mv-legacy')).toBeHidden();
    await expectHome(p, { level: 3, xp: 361, current: 9, best: 11 });
    expect(await storedState(p), '新網址的資料＝舊網址備份時的資料').toEqual(legacyState);
    expect(Object.keys(await storageSnapshot(p)).sort()).toEqual([MAIN_KEY, PRE_IMPORT_KEY].sort());
    await shot(p, 'd24-new-after-import');
    await p.reload();
    await waitReady(p);
    await expect(p.locator('#mv-import')).toBeHidden();
    await expectHome(p, { level: 3, xp: 361, current: 9, best: 11 });
  });

  test('取消選檔：停在 SETUP、沒有預覽或錯誤、沒有寫入；回 HOME 卡片仍在', async ({ page, context, guard }) => {
    const next = await simulateSite(context, guard, SITE.next);
    await openOn(page, next, { init: STANDALONE });
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#mv-import-btn')]);
    await chooser.setFiles([]);
    await expect(page.locator('#s-setup')).toHaveClass(/active/);
    await expect(page.locator('#imp-preview')).toBeHidden();
    await expect(page.locator('#imp-error')).toBeHidden();
    expect(await storageSnapshot(page)).toEqual({});
    await gotoTab(page, 's-home');
    await expect(page.locator('#mv-import')).toBeVisible();
  });

  test('選壞檔（非 JSON、缺欄位、型別錯、超大值）：錯誤卡、資料不變、回 HOME 卡片仍在', async ({ page, context, guard }) => {
    const next = await simulateSite(context, guard, SITE.next);
    await openOn(page, next, { init: STANDALONE });
    for (const f of ['import-bad-not-json.txt', 'import-bad-missing-fields.json', 'import-bad-wrong-types.json', 'import-bad-oversized.json']) {
      await gotoTab(page, 's-home');
      await expect(page.locator('#mv-import'), f).toBeVisible();
      const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#mv-import-btn')]);
      await chooser.setFiles(fixturePath(f));
      const err = page.locator('#imp-error');
      await expect(err, f).toBeVisible();
      await expect(err, f).toContainText('無法匯入，目前的資料沒有任何變更');
      await expect(page.locator('#imp-preview'), f).toBeHidden();
      expect(await storageSnapshot(page), `${f}：localStorage 不變`).toEqual({});
    }
    await gotoTab(page, 's-home');
    await expect(page.locator('#mv-import')).toBeVisible();
    await expectHome(page, { level: 2, xp: 0, current: 0, best: 0 });
  });

  for (const fixture of ['v1-minimal.json', 'v2-real.json', 'v2-missing-fields.json', 'v2-wrong-types.json', 'v3.json', 'v3-reverted-to-v2.json']) {
    test(`已有資料（${fixture}）：兩張卡都不顯示`, async ({ page, context, guard }) => {
      const next = await simulateSite(context, guard, SITE.next);
      await openOn(page, next, { seed: readFixture(fixture), init: STANDALONE });
      for (const id of cardIds) expect(await hiddenNoLayout(page, id), id).toEqual({ exists: true, hidden: true, rects: 0 });
    });
  }

  test('沒有紀錄但備份過（lastBackupAt 有值）：不顯示；全新時在 SETUP 下載備份 → 回 HOME 卡片消失', async ({ page, context, guard }) => {
    const next = await simulateSite(context, guard, SITE.next);
    const backed = JSON.parse(readFixture('empty-arrays.json'));
    backed.meta = { lastBackupAt: '2026-10-01T10:00:00+09:00' };
    await openOn(page, next, { seed: JSON.stringify(backed), init: STANDALONE });
    await expect(page.locator('#mv-import')).toBeHidden();

    const p = await context.newPage(); // 另一個全新的 origin 狀態：清空後重開
    await p.goto(next.url());
    await p.evaluate(() => localStorage.clear());
    await p.reload();
    await waitReady(p);
    await expect(p.locator('#mv-import')).toBeVisible();
    await gotoTab(p, 's-setup');
    await clickAndDownload(p, '#bk-download');
    await gotoTab(p, 's-home');
    await expect(p.locator('#mv-import')).toBeHidden();
  });

  test('第一次訓練（保底版）練完回 HOME：卡片消失；重開也不顯示', async ({ page, context, guard }) => {
    const next = await simulateSite(context, guard, SITE.next);
    await openOn(page, next, { init: STANDALONE });
    await expect(page.locator('#mv-import')).toBeVisible();
    await page.click('#h-minimal');
    await runWorkoutToEnd(page);
    await page.click('#d-ok');
    await expect(page.locator('#s-home')).toHaveClass(/active/);
    await expect(page.locator('#mv-import')).toBeHidden();
    const s = await storedState(page);
    expect(s.sessions).toEqual([{ date: '2026-10-02', type: 'minimal', xp: 3 }]);
    await page.reload();
    await waitReady(page);
    await expect(page.locator('#mv-import')).toBeHidden();
  });

  test('訓練中按「選擇備份檔」（程式觸發 click，有使用者手勢）：不切畫面、不開檔案選擇、訓練照常', async ({ page, context, guard }) => {
    const next = await simulateSite(context, guard, SITE.next);
    await openOn(page, next, { init: STANDALONE });
    await page.click('#h-minimal');
    await expect(page.locator('#train')).toHaveClass(/active/);
    const opened = [];
    page.on('filechooser', (c) => opened.push(c));
    await page.evaluate(() => document.getElementById('mv-import-btn').click());
    await realWait(1_000);
    expect(opened, '訓練中不應打開檔案選擇').toHaveLength(0);
    await expect(page.locator('#s-setup')).not.toHaveClass(/active/);
    await expect(page.locator('#s-home')).toHaveClass(/active/);
    await expect(page.locator('#train')).toHaveClass(/active/);
    await tick(page, 3);
    await expect(page.locator('#train')).toHaveClass(/active/);
    await runWorkoutToEnd(page);
    await page.click('#d-ok');
    await expect(page.locator('#mv-import')).toBeHidden();
  });
});

/* ======================================================================== */
test.describe('其他網址：兩張卡都 hidden', () => {
  for (const fixture of [null, 'v1-minimal.json', 'v2-real.json', 'v2-wrong-types.json', 'v3.json', 'v3-reverted-to-v2.json', 'empty-arrays.json']) {
    test(`127.0.0.1（${fixture || '全新'}）：hidden、不佔版面`, async ({ page }) => {
      await openApp(page, { seed: fixture ? seedState(readFixture(fixture)) : null });
      for (const id of cardIds) expect(await hiddenNoLayout(page, id), id).toEqual({ exists: true, hidden: true, rects: 0 });
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
      const { h, vh } = await page.evaluate(() => ({ h: document.documentElement.scrollHeight, vh: innerHeight }));
      const shots = [];
      for (let i = 0; i < Math.max(1, Math.ceil(h / vh)); i++) {
        await page.evaluate((y) => window.scrollTo(0, y), i * vh);
        shots.push(await page.screenshot());
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
    test(`Vercel 預覽網址、localhost（${label}）：兩張卡都不顯示；HOME 與 127.0.0.1 逐像素相同`, async ({ browser }) => {
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
test('isFreshState／hasNoRecords 規則表：每個 fixture（遷移後）與各種單一紀錄，結果與 relocate.js 註解一致', async ({ page }, testInfo) => {
  const fixtures = {};
  for (const f of ['v1-minimal.json', 'v2-real.json', 'v2-missing-fields.json', 'v2-wrong-types.json', 'empty-arrays.json', 'v3.json', 'v3-reverted-to-v2.json']) fixtures[f] = readFixture(f);
  await page.goto('/tests/fixtures/harness.html');
  const rows = await page.evaluate(async ({ fixtures, nowIso }) => {
    const { isFreshState, hasNoRecords } = await import('/js/ui/relocate.js');
    const { migrate } = await import('/js/state/migrate.js');
    const { defaultState } = await import('/js/state/schema.js');
    const now = new Date(nowIso);
    const out = [];
    const add = (group, label, st) => out.push({ group, label, fresh: isFreshState(st), noRecords: hasNoRecords(st) });
    const d = () => defaultState(now);
    const one = (group, label, fn) => { const s = d(); fn(s); add(group, label, s); };
    add('全新', 'defaultState()（全新安裝：含預設 DJ、身分宣言、P1）', d());
    for (const [name, raw] of Object.entries(fixtures)) add('fixture', `${name}（遷移後）`, migrate(JSON.parse(raw), { now }).state);
    /* 各種單一紀錄（註解：sessions、xp／game.xp、streak current／best、prs 六項、body 七項、habits 的 log） */
    one('單一紀錄', 'sessions 1 筆', (s) => s.sessions.push({ date: '2026-10-02', type: 'minimal', xp: 3 }));
    one('單一紀錄', 'xp = 1', (s) => { s.xp = 1; });
    one('單一紀錄', 'streak.current = 1', (s) => { s.streak.current = 1; });
    one('單一紀錄', 'streak.best = 1', (s) => { s.streak.best = 1; });
    for (const k of ['hrp', 'plank', 'run2mi', 'pushup', 'pike', 'sideplank']) one('單一紀錄', `prs.${k} 1 筆`, (s) => s.prs[k].push({ date: '2026-10-02', v: 1 }));
    for (const k of ['weight', 'waist', 'arm', 'shoulder', 'thigh', 'rhr', 'sleep']) one('單一紀錄', `body.${k} 1 筆`, (s) => s.body[k].push({ date: '2026-10-02', v: 1 }));
    for (const k of ['move', 'sleep', 'explore', 'total']) one('單一紀錄', `game.xp.${k} = 1`, (s) => { s.game.xp[k] = 1; });
    one('單一紀錄', 'habits.sleep.log 1 筆', (s) => s.habits.sleep.log.push({ date: '2026-10-02', lightsOut: null, wake: null, lightsOutEdited: false }));
    one('單一紀錄', 'habits.explore.log 1 筆', (s) => s.habits.explore.log.push({ date: '2026-10-02', itemId: 'dj', interest: 4 }));
    one('單一紀錄', 'habits 新支柱 foo.log 1 筆（任何 habits.*.log）', (s) => { s.habits.foo = { log: [{ date: '2026-10-02' }] }; });
    /* 備份時間：只影響 isFreshState */
    one('備份', 'meta.lastBackupAt 有值', (s) => { s.meta.lastBackupAt = '2026-10-01T10:00:00+09:00'; });
    one('備份', "meta.lastBackupAt = ''", (s) => { s.meta.lastBackupAt = ''; });
    one('備份', 'meta.lastBackupAt = null', (s) => { s.meta.lastBackupAt = null; });
    one('備份', '沒有 meta', (s) => { delete s.meta; });
    /* 不算紀錄（註解：等級、設定、身分宣言、階段、預設探索項目；其餘欄位不在判斷內） */
    one('不算紀錄', 'level = 5', (s) => { s.level = 5; });
    one('不算紀錄', 'settings 改過（語音關、起床 06:30）', (s) => { s.settings.voice = false; s.settings.wakeTime = '06:30'; });
    one('不算紀錄', '身分宣言改過', (s) => { s.goals.identity = '我每天都會動。'; });
    one('不算紀錄', 'phase = P2', (s) => { s.phase.current = 'P2'; });
    one('不算紀錄', 'explore.items 多 1 項', (s) => s.habits.explore.items.push({ id: 'x', name: 'X', minimalAction: '2 分鐘', createdAt: nowIso, status: 'trying' }));
    one('不算紀錄', 'profile 身高／年齡', (s) => { s.profile = { heightCm: 175, age: 20 }; });
    one('不算紀錄', 'game.streaks.train.best = 3', (s) => { s.game.streaks.train.best = 3; });
    one('不算紀錄', 'game.achievements 1 個', (s) => { s.game.achievements = { first: nowIso }; });
    one('不算紀錄', 'game.perfectDays 1 天', (s) => { s.game.perfectDays = ['2026-10-01']; });
    one('不算紀錄', 'game.freezeTokens = 1', (s) => { s.game.freezeTokens = 1; });
    one('不算紀錄', 'goals.weekly 1 筆', (s) => { s.goals.weekly = [{ weekStart: '2026-09-28', goalId: 'g', target: 1, result: null }]; });
    one('不算紀錄', 'goals.season 1 筆', (s) => { s.goals.season = [{ id: 's', pillar: 'sleep', startDate: '2026-09-28', metric: 'm', target: 80, status: 'active' }]; });
    /* 讀不懂（不是物件）→ 兩者都 false */
    for (const [label, v] of [['null', null], ['undefined', undefined], ['[]', []], ["'abc'", 'abc'], ['42', 42]]) add('讀不懂', label, v);
    add('空物件', '{}（物件、沒有任何欄位）', {});
    return out;
  }, { fixtures, nowIso: NOW_ISO });

  const expected = (r) => {
    if (r.group === '全新' || r.group === '不算紀錄' || r.group === '空物件') return { fresh: true, noRecords: true };
    if (r.group === 'fixture') return r.label.startsWith('empty-arrays.json') ? { fresh: true, noRecords: true } : { fresh: false, noRecords: false };
    if (r.group === '單一紀錄' || r.group === '讀不懂') return { fresh: false, noRecords: false };
    if (r.group === '備份') return r.label === 'meta.lastBackupAt 有值' ? { fresh: false, noRecords: true } : { fresh: true, noRecords: true };
    throw new Error(r.group);
  };
  const table = ['| 分組 | 資料 | isFreshState | hasNoRecords |', '|---|---|---|---|', ...rows.map((r) => `| ${r.group} | ${r.label} | ${r.fresh} | ${r.noRecords} |`)].join('\n');
  console.log(`[qa] 規則表（${rows.length} 列）\n${table}`);
  testInfo.annotations.push({ type: 'qa', description: `規則表 ${rows.length} 列` });
  const mismatches = rows.filter((r) => { const e = expected(r); return e.fresh !== r.fresh || e.noRecords !== r.noRecords; })
    .map((r) => `${r.group}／${r.label}：得到 fresh=${r.fresh} noRecords=${r.noRecords}，預期 ${JSON.stringify(expected(r))}`);
  expect(mismatches).toEqual([]);
  expect(rows.length).toBeGreaterThan(50);
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

  test('舊網址：SW 預快取完整（含 relocate.js）→ 斷網、關掉分頁、新分頁冷啟動 → 搬家卡照常、下載備份可用、四個分頁可用；沒有請求打到網路', async ({ page, context, guard, swRouting }) => {
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
    await expect(p2.locator('#mv-legacy-empty')).toBeHidden();
    await expectHome(p2, { level: 3, xp: 361, current: 9, best: 11 });
    const dl = await clickAndDownload(p2, '#mv-backup');
    await expect(p2.locator('#mv-backup-msg')).toHaveText(`已存好：${dl.name}`);
    for (const id of ['s-hist', 's-body', 's-setup', 's-home']) await gotoTab(p2, id);
    await expect(p2.locator('#mv-legacy')).toBeVisible();
    expect(hits, '離線期間不應有請求真的打到網路').toEqual([]);
  });

  test('新網址（只有 Vercel 會上線的檔案）：SW 預快取完整 → 斷網冷啟動 → 匯入卡照常、選備份檔匯入可用；沒有請求打到網路', async ({ page, context, guard, swRouting }, testInfo) => {
    expect(swRouting).toBe(true);
    const next = await simulateSite(context, guard, SITE.next);
    await openOn(page, next, { init: STANDALONE });
    await waitPrecache(page, next);
    expect(next.count(`${CFG.NEW_PATH}sw.js`), 'SW 腳本由模擬網址回應').toBeGreaterThan(0);
    await expect(page.locator('#mv-import')).toBeVisible();
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
    await expect(p2.locator('#mv-import')).toBeVisible();
    await expect(p2.locator('#mv-import-hint')).toBeHidden();
    /* 離線匯入：v2 真實資料的備份（fixture）→ 預覽 → 兩次確認 */
    const [chooser] = await Promise.all([p2.waitForEvent('filechooser'), p2.click('#mv-import-btn')]);
    await expect(p2.locator('#s-setup')).toHaveClass(/active/);
    await chooser.setFiles(fixturePath('v3.json'));
    await expect(p2.locator('#imp-preview')).toBeVisible();
    await p2.click('#imp-confirm');
    await expect(p2.locator('#imp-confirm')).toHaveText(IMPORT_ARMED_TEXT);
    await p2.clock.runFor(1_500);
    await p2.click('#imp-confirm');
    await expect(p2.locator('#io-msg')).toHaveText('匯入成功。');
    await gotoTab(p2, 's-home');
    await expect(p2.locator('#mv-import')).toBeHidden();
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

test.describe('更新：舊網址的 v7（UPGRADE_BASE_DIR）→ 目前版本（D23 協定）', () => {
  test.skip(!UPGRADE_DIR, '未設定 UPGRADE_BASE_DIR（origin/main 的 worktree）');
  test.skip(!!UPGRADE_DIR && UPGRADE_CACHE === CUR, `UPGRADE_BASE_DIR 的 CACHE 與目前相同（${CUR}），沒有可測的更新`);
  test.describe.configure({ timeout: 150_000 });

  test('閒置：頁面回 ACK、自己重新載入一次 → 出現搬家卡與「已更新到最新版」；localStorage 逐字相同；只重新載入一次；離線重開仍是新版＋搬家卡', async ({ playwright }, testInfo) => {
    expect(cacheNumber(UPGRADE_CACHE)).toBeLessThan(CUR_N);
    const env = await httpsLegacy(playwright.chromium, UPGRADE_DIR);
    try {
      const page = await env.context.newPage();
      const navs = countNavigations(page);
      await openOn(page, env, { seed: V2() });
      expect(await page.evaluate(() => [location.hostname, isSecureContext])).toEqual([LEGACY_HOST, true]);
      await waitControlled(page, UPGRADE_CACHE);
      await expect(page.locator('#mv-legacy'), `舊版（${UPGRADE_CACHE}）沒有搬家卡`).toHaveCount(0);
      await expectHome(page, { level: 3, xp: 361, current: 9, best: 11 });
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
      await openOn(page, env, { seed: V2() });
      await waitControlled(page, UPGRADE_CACHE);
      await expect(page.locator('#mv-legacy')).toHaveCount(0);
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
