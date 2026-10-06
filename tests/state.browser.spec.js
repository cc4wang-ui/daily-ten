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

test('早安打卡（habits.js）：寫入 localStorage、重新整理後還在、復原後消失；載入補 startedAt 不寫主 key', async ({ page }) => {
  const raw = readFixture('v3.json');
  const ENTRY = { date: '2026-10-05', lightsOut: '2026-10-04T23:00:00+09:00', wake: '2026-10-05T06:58:00+09:00', lightsOutEdited: false };
  const first = await page.evaluate(async ({ raw, entry }) => {
    localStorage.setItem('daily-ten-state', raw);
    const store = await import('/js/state/store.js');
    const habits = await import('/js/state/habits.js');
    const boot = new Date('2026-10-05T06:55:00+09:00');
    const load = await store.loadState({ now: boot });
    const phase = habits.ensurePhaseStarted(boot);
    const untouched = localStorage.getItem('daily-ten-state') === raw;
    const add = habits.addSleepEntry(entry);
    const saved = await add.saved;
    const dup = habits.addSleepEntry({ ...entry, wake: '2026-10-05T07:10:00+09:00' });
    return { load, phase, untouched, add: { ok: add.ok, entry: add.entry }, saved, dup: { ok: dup.ok, code: dup.code, message: dup.message } };
  }, { raw, entry: ENTRY });
  expect(first.load).toStrictEqual({ status: 'ok', error: null });
  expect(first.phase).toStrictEqual({ ok: true, changed: false, startedAt: '2026-10-05T06:55:00+09:00' }); // loadState 已補上
  expect(first.untouched).toBe(true);
  expect(first.add).toStrictEqual({ ok: true, entry: ENTRY });
  expect(first.saved).toBe(true);
  expect(first.dup).toStrictEqual({ ok: false, code: 'duplicate', message: '2026-10-05 已經有睡眠紀錄，同一天只能記錄一次' });

  await page.reload();
  const second = await page.evaluate(async () => {
    const store = await import('/js/state/store.js');
    const habits = await import('/js/state/habits.js');
    const load = await store.loadState();
    const log = JSON.parse(JSON.stringify(store.getState().habits.sleep.log));
    const startedAt = store.getState().phase.startedAt;
    const undo = habits.removeSleepEntry('2026-10-05');
    const saved = await undo.saved;
    return { load, log, startedAt, removed: undo.removed, saved };
  });
  expect(second.load).toStrictEqual({ status: 'ok', error: null });
  expect(second.log).toStrictEqual([ENTRY]);
  expect(second.startedAt).toBe('2026-10-05T06:55:00+09:00');
  expect(second.removed).toBe(1);
  expect(second.saved).toBe(true);

  await page.reload();
  const third = await page.evaluate(async () => {
    const store = await import('/js/state/store.js');
    const load = await store.loadState();
    return { load, log: store.getState().habits.sleep.log, startedAt: store.getState().phase.startedAt };
  });
  expect(third).toStrictEqual({ load: { status: 'ok', error: null }, log: [], startedAt: '2026-10-05T06:55:00+09:00' });
});

test('壞打卡紀錄 → repaired：原字串存在 bak-v3、App 資料可用，修補後的備份可再匯入', async ({ page }) => {
  const raw = readFixture('v3-bad-sleep.json');
  const out = await page.evaluate(async ({ raw }) => {
    localStorage.setItem('daily-ten-state', raw);
    const store = await import('/js/state/store.js');
    const backup = await import('/js/state/backup.js');
    const load = await store.loadState();
    const { text } = backup.buildBackup(store.getState(), new Date('2026-10-05T08:00:00+09:00'));
    const again = backup.parseImport(text);
    return { load, bak: localStorage.getItem('daily-ten-state.bak-v3') === raw, main: localStorage.getItem('daily-ten-state') === raw,
      dates: store.getState().habits.sleep.log.map((e) => e.date), importOk: again.ok };
  }, { raw });
  expect(out.load).toStrictEqual({
    status: 'repaired',
    error: { code: 'repaired', message: '部分資料格式異常，已自動修復。原始資料已另存，可下載保存。', backupKey: 'daily-ten-state.bak-v3' }
  });
  expect(out.bak).toBe(true);
  expect(out.main).toBe(true);
  expect(out.dates).toEqual(['2026-10-02', '2026-10-04', '2026-10-05', '2026-10-02', '2026-10-10', '2026-10-11']);
  expect(out.importOk).toBe(true);
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

test('V2a 遊戲進度標記（game.js）：初始化不寫入；看過升級卡／慶祝、恢復寫入 localStorage，重新整理後還在；復原後變回 null', async ({ page }) => {
  const raw = readFixture('v3-checkin.json');
  const first = await page.evaluate(async ({ raw }) => {
    localStorage.setItem('daily-ten-state', raw);
    const store = await import('/js/state/store.js');
    const game = await import('/js/state/game.js');
    const load = await store.loadState({ now: new Date('2026-10-05T06:40:00+09:00') });
    const init = game.ensureSeenInitialized(7, '2026-10-05');
    const untouched = localStorage.getItem('daily-ten-state') === raw;
    const keys = Object.keys(localStorage);
    const lv = game.markLevelSeen(8);
    const lvSaved = await lv.saved;
    const pd = game.markPerfectDaySeen('2026-10-05');
    const pdSaved = await pd.saved;
    const rs = game.setDeloadRestored('2026-10-05');
    const rsSaved = await rs.saved;
    return { load, init, untouched, keys, saved: [lvSaved, pdSaved, rsSaved], game: JSON.parse(localStorage.getItem('daily-ten-state')).game };
  }, { raw });
  expect(first.load).toStrictEqual({ status: 'ok', error: null });
  expect(first.init).toStrictEqual({ ok: true, changed: true, seen: { level: 7, perfectDay: '2026-10-04' } });
  expect(first.untouched).toBe(true); // 開 App＋初始化不寫入
  expect(first.keys).toEqual(['daily-ten-state']);
  expect(first.saved).toEqual([true, true, true]);
  expect(first.game.seen).toStrictEqual({ level: 8, perfectDay: '2026-10-05' });
  expect(first.game.deload).toStrictEqual({ restoredOn: '2026-10-05' });

  await page.reload();
  const second = await page.evaluate(async () => {
    const store = await import('/js/state/store.js');
    const game = await import('/js/state/game.js');
    const schema = await import('/js/state/schema.js');
    const load = await store.loadState({ now: new Date('2026-10-05T07:10:00+09:00') });
    const init = game.ensureSeenInitialized(3, '2026-10-05');
    const restored = schema.isDeloadRestored(store.getState(), '2026-10-05');
    const undo = game.clearDeloadRestored('2026-10-05');
    const saved = await undo.saved;
    return { load, init, restored, undo: { ok: undo.ok, changed: undo.changed, deload: undo.deload }, saved };
  });
  expect(second.load).toStrictEqual({ status: 'ok', error: null });
  expect(second.init).toStrictEqual({ ok: true, changed: false, seen: { level: 8, perfectDay: '2026-10-05' } });
  expect(second.restored).toBe(true);
  expect(second.undo).toStrictEqual({ ok: true, changed: true, deload: { restoredOn: null } });
  expect(second.saved).toBe(true);

  await page.reload();
  const third = await page.evaluate(async () => {
    const store = await import('/js/state/store.js');
    const load = await store.loadState();
    return { load, seen: store.getState().game.seen, deload: store.getState().game.deload };
  });
  expect(third).toStrictEqual({ load: { status: 'ok', error: null }, seen: { level: 8, perfectDay: '2026-10-05' }, deload: { restoredOn: null } });
});

test('V2a 壞欄位 → repaired：原字串存在 bak-v3，修補後的備份可再匯入', async ({ page }) => {
  const raw = readFixture('v3-v2a-bad-fields.json');
  const out = await page.evaluate(async ({ raw }) => {
    localStorage.setItem('daily-ten-state', raw);
    const store = await import('/js/state/store.js');
    const backup = await import('/js/state/backup.js');
    const load = await store.loadState();
    const { text } = backup.buildBackup(store.getState(), new Date('2026-10-06T08:00:00+09:00'));
    const again = backup.parseImport(text);
    return { load, bak: localStorage.getItem('daily-ten-state.bak-v3') === raw, main: localStorage.getItem('daily-ten-state') === raw,
      seen: store.getState().game.seen, deload: store.getState().game.deload, importOk: again.ok };
  }, { raw });
  expect(out.load).toStrictEqual({
    status: 'repaired',
    error: { code: 'repaired', message: '部分資料格式異常，已自動修復。原始資料已另存，可下載保存。', backupKey: 'daily-ten-state.bak-v3' }
  });
  expect(out.bak).toBe(true);
  expect(out.main).toBe(true);
  expect(out.seen).toStrictEqual({ level: 7, perfectDay: null });
  expect(out.deload).toStrictEqual({ restoredOn: null });
  expect(out.importOk).toBe(true);
});
