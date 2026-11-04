/* redo-v1：Service Worker 離線——預快取清單涵蓋 App 檔；安裝後斷網重新整理仍可開；CACHE 名稱正確。 */
import { test as base, expect } from '@playwright/test';
import { swAssets, readRepo, swCacheOf, contextOptions, watchContext, assertWatchClean, dismissCelebrations, hideToast, installClock } from './helpers.js';

const test = base;

test('預快取清單：每個 App 檔都在、都存在（與 check-repo 同一條規則）', async () => {
  const { assets } = swAssets();
  expect(assets).toContain('./index.html');
  expect(assets).toContain('./js/app.js');
  expect(assets).toContain('./data/game.json');
  expect(assets).toContain('./data/videos.json');
  expect(assets).toContain('./data/explore.json');
  for (const a of assets) if (a !== './') expect(() => readRepo(a.replace(/^\.\//, '')), a).not.toThrow();
  expect(swCacheOf(readRepo('sw.js'))).toMatch(/^daily-ten-v\d+$/);
});

test('離線：SW 安裝後斷網重新整理，今日頁照常、紀錄還在', async ({ browser, baseURL }) => {
  const context = await browser.newContext(contextOptions({ serviceWorkers: 'allow' }));
  const w = watchContext(context);
  w.allowHosts.add('i.ytimg.com');
  await context.route('https://i.ytimg.com/**', (route) => route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64') }));
  const page = await context.newPage();
  await installClock(page, '2026-11-04T08:30:00+09:00');
  await page.goto(`${baseURL}/index.html`);
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
  const cacheName = swCacheOf(readRepo('sw.js'));
  await page.waitForFunction(async (name) => {
    const keys = await caches.keys();
    if (!keys.includes(name)) return false;
    const c = await caches.open(name);
    return (await c.keys()).length > 30 && !!navigator.serviceWorker.controller;
  }, cacheName, { timeout: 20_000 });
  await page.click('#tabs button[data-s="s-stretch"]');
  await page.click('#st-mark-full');
  await hideToast(page);
  await context.setOffline(true);
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, { timeout: 20_000 });
  await dismissCelebrations(page);
  await expect(page.locator('.habit.stretch')).toHaveClass(/done/);
  await expect(page.locator('#hero-go')).toBeVisible();
  await page.click('#tabs button[data-s="s-gym"]');
  await expect(page.locator('#gym-body')).toContainText('下一次：Upper A');
  await context.setOffline(false);
  w.allowConsoleErrors = true; // 離線時縮圖 <img> 載入失敗會印 console error，屬預期
  assertWatchClean(w);
  await context.close();
});
