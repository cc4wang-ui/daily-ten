/* data-guardian：需要真實瀏覽器的流程（Blob 下載、navigator.share、localStorage 備份 key）。
   在同源的空白頁 tests/fixtures/harness.html 內動態 import('/js/state/*.js')，不經過 App 畫面。
   playwright.config：isMobile／hasTouch（maxTouchPoints > 0）、timezoneId Asia/Tokyo。 */
import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { readFixture } from './state.helpers.js';

const HARNESS = '/tests/fixtures/harness.html';
const NOW_ISO = '2026-10-02T12:00:00+09:00';

test.beforeEach(async ({ page }) => {
  await page.goto(HARNESS);
});

test('downloadBackup：Blob 下載，檔名與內容 = 儲存後的 state', async ({ page }) => {
  const raw = readFixture('v2-real.json');
  const downloadPromise = page.waitForEvent('download');
  const out = await page.evaluate(async ({ raw, nowIso }) => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: undefined }); // 確定走下載
    localStorage.setItem('daily-ten-state', raw);
    const store = await import('/js/state/store.js');
    const backup = await import('/js/state/backup.js');
    const load = await store.loadState();
    const before = JSON.stringify(store.getState());
    const res = await backup.downloadBackup({ now: new Date(nowIso) });
    return { load, res, before, stored: localStorage.getItem('daily-ten-state'), inMemory: JSON.stringify(store.getState()) };
  }, { raw, nowIso: NOW_ISO });
  const download = await downloadPromise;
  expect(out.load).toStrictEqual({ status: 'migrated', error: null });
  expect(out.res).toStrictEqual({ ok: true, method: 'download', filename: 'daily-ten-backup-2026-10-02.json' });
  expect(download.suggestedFilename()).toBe('daily-ten-backup-2026-10-02.json');
  const fileText = await readFile(await download.path(), 'utf8');
  const file = JSON.parse(fileText);
  expect(fileText).toBe(JSON.stringify(file, null, 2));
  expect(file.meta.lastBackupAt).toBe(NOW_ISO);
  expect(file.version).toBe(3);
  expect(file.game.xp).toStrictEqual({ move: 361, sleep: 0, explore: 0, total: 361 });
  expect(JSON.parse(out.stored)).toStrictEqual(file);     // 備份檔內容 = 儲存後的 state
  expect(JSON.parse(out.inMemory)).toStrictEqual(file);
  const { meta: _a, ...restFile } = file;
  const { meta: _b, ...restBefore } = JSON.parse(out.before);
  expect(restFile).toStrictEqual(restBefore);             // 除了 lastBackupAt 之外完全相同
});

test('downloadBackup：觸控裝置可分享檔案 → navigator.share；取消 → cancelled 且不寫入', async ({ page }) => {
  const raw = readFixture('v3.json');
  const out = await page.evaluate(async ({ raw }) => {
    const shared = [];
    let mode = 'ok';
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: (d) => !!(d && d.files && d.files.length === 1) });
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: async (d) => {
        if (mode === 'abort') throw new DOMException('Share canceled', 'AbortError');
        const f = d.files[0];
        shared.push({ name: f.name, type: f.type, text: await f.text(), keys: Object.keys(d) });
      }
    });
    localStorage.setItem('daily-ten-state', raw);
    const store = await import('/js/state/store.js');
    const backup = await import('/js/state/backup.js');
    await store.loadState();
    const okRes = await backup.downloadBackup({ now: new Date('2026-10-02T12:00:00+09:00') });
    const afterOk = localStorage.getItem('daily-ten-state');
    mode = 'abort';
    const abortRes = await backup.downloadBackup({ now: new Date('2026-10-09T12:00:00+09:00') });
    return { okRes, abortRes, shared, afterOk, afterAbort: localStorage.getItem('daily-ten-state'),
      memoryAfterAbort: JSON.stringify(store.getState()), touch: navigator.maxTouchPoints };
  }, { raw });
  expect(out.touch).toBeGreaterThan(0);
  expect(out.okRes).toStrictEqual({ ok: true, method: 'share', filename: 'daily-ten-backup-2026-10-02.json' });
  expect(out.shared).toHaveLength(1);
  expect(out.shared[0]).toMatchObject({ name: 'daily-ten-backup-2026-10-02.json', type: 'application/json', keys: ['files'] });
  expect(JSON.parse(out.shared[0].text)).toStrictEqual(JSON.parse(out.afterOk));
  expect(JSON.parse(out.afterOk).meta.lastBackupAt).toBe('2026-10-02T12:00:00+09:00');
  expect(out.abortRes).toStrictEqual({ ok: false, reason: 'cancelled', message: '已取消備份' });
  expect(out.afterAbort).toBe(out.afterOk);
  expect(JSON.parse(out.memoryAfterAbort).meta.lastBackupAt).toBe('2026-10-02T12:00:00+09:00');
});

test('downloadBackup：沒有觸控（maxTouchPoints = 0）即使可分享也改用下載', async ({ page }) => {
  const downloadPromise = page.waitForEvent('download');
  const res = await page.evaluate(async ({ raw }) => {
    let shareCalled = false;
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 0 });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { shareCalled = true; } });
    localStorage.setItem('daily-ten-state', raw);
    const store = await import('/js/state/store.js');
    const backup = await import('/js/state/backup.js');
    await store.loadState();
    const r = await backup.downloadBackup({ now: new Date('2026-10-02T12:00:00+09:00') });
    return { ...r, shareCalled };
  }, { raw: readFixture('v3.json') });
  const download = await downloadPromise;
  expect(res).toStrictEqual({ ok: true, method: 'download', filename: 'daily-ten-backup-2026-10-02.json', shareCalled: false });
  expect(download.suggestedFilename()).toBe('daily-ten-backup-2026-10-02.json');
});

test('downloadBackup：分享因其他原因失敗 → 改用下載', async ({ page }) => {
  const downloadPromise = page.waitForEvent('download');
  const res = await page.evaluate(async ({ raw }) => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
    Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { throw new DOMException('denied', 'NotAllowedError'); } });
    localStorage.setItem('daily-ten-state', raw);
    const store = await import('/js/state/store.js');
    const backup = await import('/js/state/backup.js');
    await store.loadState();
    return backup.downloadBackup({ now: new Date('2026-10-02T12:00:00+09:00') });
  }, { raw: readFixture('v3.json') });
  await downloadPromise;
  expect(res).toStrictEqual({ ok: true, method: 'download', filename: 'daily-ten-backup-2026-10-02.json' });
});

test('壞 state → recovered：原字串存在 bak-v2，downloadRawBackup 下載成 .txt', async ({ page }) => {
  const corrupt = readFixture('corrupt-state.txt');
  const first = await page.evaluate(async ({ corrupt }) => {
    localStorage.setItem('daily-ten-state', corrupt);
    const store = await import('/js/state/store.js');
    const load = await store.loadState();
    return { load, bak: localStorage.getItem(load.error.backupKey), main: localStorage.getItem('daily-ten-state'), version: store.getState().version };
  }, { corrupt });
  expect(first.load).toStrictEqual({
    status: 'recovered',
    error: { code: 'parse', message: '讀取資料時發生問題，已改用空白資料。原始資料已另存，可下載保存。', backupKey: 'daily-ten-state.bak-v2' }
  });
  expect(first.bak).toBe(corrupt);
  expect(first.main).toBe(corrupt);
  expect(first.version).toBe(3);

  const downloadPromise = page.waitForEvent('download');
  const res = await page.evaluate(async () => {
    const backup = await import('/js/state/backup.js');
    return backup.downloadRawBackup('daily-ten-state.bak-v2', { now: new Date('2026-10-02T12:00:00+09:00') });
  });
  const download = await downloadPromise;
  expect(res).toStrictEqual({ ok: true, filename: 'daily-ten-raw-2026-10-02.txt' });
  expect(download.suggestedFilename()).toBe('daily-ten-raw-2026-10-02.txt');
  expect(await readFile(await download.path(), 'utf8')).toBe(corrupt);
});

test('匯入流程：壞檔不動資料；好檔確認後才覆蓋', async ({ page }) => {
  const out = await page.evaluate(async ({ current, bad, good }) => {
    localStorage.setItem('daily-ten-state', current);
    const store = await import('/js/state/store.js');
    const backup = await import('/js/state/backup.js');
    await store.loadState();
    const before = localStorage.getItem('daily-ten-state');
    const badRes = backup.parseImport(bad);
    const afterBad = localStorage.getItem('daily-ten-state');
    const preview = backup.parseImport(good);
    const afterPreview = localStorage.getItem('daily-ten-state');
    const applied = await backup.applyImport(preview.incoming);
    return { badCodes: badRes.errors.map((e) => e.code), unchanged: before === afterBad && before === afterPreview,
      warnings: preview.summary.warnings, applied, savedXp: JSON.parse(localStorage.getItem('daily-ten-state')).xp,
      preImport: localStorage.getItem('daily-ten-state.pre-import') !== null };
  }, { current: readFixture('v3.json'), bad: readFixture('import-bad-wrong-types.json'), good: readFixture('v2-real.json') });
  expect(out.badCodes).toStrictEqual(['invalid_type', 'invalid_type', 'invalid_type', 'invalid_type']);
  expect(out.unchanged).toBe(true);
  expect(out.warnings).toHaveLength(3);
  expect(out.applied).toBe(true);
  expect(out.savedXp).toBe(361);
  expect(out.preImport).toBe(true);
});
