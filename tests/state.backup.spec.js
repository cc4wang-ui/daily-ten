/* data-guardian：backup.js 單元測試（純 Node；需要 DOM 的下載流程見 state.browser.spec.js） */
import { test, expect } from '@playwright/test';
import { STORAGE_KEY, loadState, getState, setState, saveState } from '../js/state/store.js';
import { defaultState } from '../js/state/schema.js';
import { migrate } from '../js/state/migrate.js';
import {
  BACKUP_REMINDER_DAYS, IMPORT_MAX_CHARS, PRE_IMPORT_KEY, isoLocal, localDateStr, backupFilename, buildBackup,
  needsBackupReminder, parseImport, diffSummary, applyImport, downloadBackup, downloadRawBackup
} from '../js/state/backup.js';
import { ensurePhaseStarted } from '../js/state/habits.js';
import { validateImport } from '../js/state/schema.js';
import { readFixture, loadFixture, NOW, DAY_MS, MemoryStorage, installGlobals, clearGlobals, useTokyoTime, findBannedWords, CHECKIN_LOG, CHECKIN_STARTED_AT } from './state.helpers.js';

useTokyoTime(test);
test.afterEach(() => clearGlobals());

/* 目前資料 = v3.json（35 筆訓練、最後訓練日 2026-10-01、最後備份 2026-09-30 21:15） */
async function loadCurrent(name = 'v3.json') {
  const local = new MemoryStorage({ [STORAGE_KEY]: readFixture(name) });
  installGlobals({ local });
  await loadState({ now: NOW });
  return local;
}
const migrated = (name) => migrate(loadFixture(name), { now: NOW }).state;

test.describe('備份檔', () => {
  test('re-export 的時間工具與常數', () => {
    expect(isoLocal(NOW)).toBe('2026-10-02T15:30:00+09:00');
    expect(localDateStr(NOW)).toBe('2026-10-02');
    expect(BACKUP_REMINDER_DAYS).toBe(7);
    expect(IMPORT_MAX_CHARS).toBe(5000000);
  });

  test('backupFilename 用本地日期', () => {
    expect(backupFilename(NOW)).toBe('daily-ten-backup-2026-10-02.json');
    expect(backupFilename(new Date('2026-10-02T23:59:59+09:00'))).toBe('daily-ten-backup-2026-10-02.json');
    expect(backupFilename(new Date('2026-10-03T00:00:01+09:00'))).toBe('daily-ten-backup-2026-10-03.json');
  });

  test('buildBackup：檔名、lastBackupAt、game 已同步、text = 縮排 JSON、不改動傳入 state', () => {
    const state = migrated('v2-real.json');
    state.xp += 10; // 畫面記了一次訓練，game 尚未同步
    const before = JSON.stringify(state);
    const { filename, text, stamped } = buildBackup(state, NOW);
    expect(filename).toBe('daily-ten-backup-2026-10-02.json');
    expect(stamped.meta.lastBackupAt).toBe('2026-10-02T15:30:00+09:00');
    expect(stamped.game.xp.move).toBe(371);
    expect(text).toBe(JSON.stringify(stamped, null, 2));
    expect(JSON.parse(text)).toStrictEqual(stamped);
    expect(JSON.stringify(state)).toBe(before);
    expect(stamped).not.toBe(state);
  });

  test('備份檔內容 = 儲存後的 state', async () => {
    const local = await loadCurrent('v2-real.json');
    const { text, stamped } = buildBackup(getState(), NOW);
    setState(stamped);
    expect(await saveState()).toBe(true);
    expect(JSON.parse(local.getItem(STORAGE_KEY))).toStrictEqual(JSON.parse(text));
  });

  test('buildBackup 給非物件 → 丟 TypeError（downloadBackup 會先擋）', () => {
    expect(() => buildBackup(null, NOW)).toThrow(TypeError);
  });

  test('buildBackup 正規化：畫面在記憶體寫進格式不對的值，備份檔仍能通過嚴格驗證（= 下次載入的修補結果）', async () => {
    await loadCurrent('v3-checkin.json');
    const s = getState();
    s.settings.bedtime = '';                         // 例如時間欄位被清空
    s.habits.sleep.log.push({ date: '2026-10-05', wake: '06:58' }); // 沒經過 habits.js 的錯誤寫入
    s.phase.current = 'X';
    const before = JSON.stringify(s);
    expect(validateImport(s).ok).toBe(false);
    const { text, stamped } = buildBackup(s, NOW);
    expect(JSON.stringify(s)).toBe(before); // 不改動傳入的 state
    expect(stamped.settings.bedtime).toBe('23:00');
    expect(stamped.habits.sleep.log).toStrictEqual(CHECKIN_LOG);
    expect(stamped.phase.current).toBe('P1');
    const r = parseImport(text, { now: NOW });
    expect(r.ok).toBe(true);
    expect(r.incoming).toStrictEqual(stamped);
  });

  test('buildBackup：正常資料除了 lastBackupAt 之外完全不變（含欄位順序）', async () => {
    for (const name of ['v3.json', 'v3-checkin.json', 'v2-real.json', 'v2-wrong-types.json']) {
      await loadCurrent(name);
      const { stamped } = buildBackup(getState(), NOW);
      const expected = JSON.parse(JSON.stringify(getState()));
      expected.meta.lastBackupAt = isoLocal(NOW);
      expect(JSON.stringify(stamped), name).toBe(JSON.stringify(expected));
    }
  });
});

test.describe('needsBackupReminder', () => {
  const withData = () => migrated('v2-real.json');
  test('從未備份＋有資料 → true', () => {
    expect(needsBackupReminder(withData(), NOW)).toBe(true);
  });
  test('從未備份＋沒有資料 → false', () => {
    expect(needsBackupReminder(defaultState(NOW), NOW)).toBe(false);
    expect(needsBackupReminder(migrated('empty-arrays.json'), NOW)).toBe(false);
  });
  test('剛好 7 天 → false；7 天＋1ms → true', () => {
    const s = withData();
    s.meta.lastBackupAt = '2026-09-25T15:30:00+09:00';
    expect(needsBackupReminder(s, NOW)).toBe(false);
    expect(needsBackupReminder(s, new Date(NOW.getTime() + 1))).toBe(true);
    s.meta.lastBackupAt = isoLocal(new Date(NOW.getTime() - BACKUP_REMINDER_DAYS * DAY_MS));
    expect(needsBackupReminder(s, NOW)).toBe(false);
  });
  test('不同時區寫下的時間也正確比較', () => {
    const s = withData();
    s.meta.lastBackupAt = '2026-09-25T06:30:00Z'; // = 2026-09-25 15:30 +09:00
    expect(needsBackupReminder(s, NOW)).toBe(false);
    expect(needsBackupReminder(s, new Date(NOW.getTime() + 1))).toBe(true);
  });
  test('lastBackupAt 無法解析 → true', () => {
    const s = withData();
    for (const bad of ['garbage', '', 123, {}]) {
      s.meta.lastBackupAt = bad;
      expect(needsBackupReminder(s, NOW)).toBe(true);
    }
    delete s.meta;
    expect(needsBackupReminder(s, NOW)).toBe(true);
  });
  test('「實質資料」：sessions、任一 PR／body 桶、任一 habits log；預設 DJ 項目不算', () => {
    const only = (mutate) => { const s = defaultState(NOW); mutate(s); return needsBackupReminder(s, NOW); };
    expect(only((s) => s.sessions.push({ date: '2026-10-01', type: 'full', xp: 10 }))).toBe(true);
    expect(only((s) => s.prs.sideplank.push({ date: '2026-10-01', v: 40 }))).toBe(true);
    expect(only((s) => s.body.rhr.push({ date: '2026-10-01', v: 58 }))).toBe(true);
    expect(only((s) => s.habits.sleep.log.push({ date: '2026-10-01' }))).toBe(true);
    expect(only((s) => s.habits.explore.log.push({ date: '2026-10-01', itemId: 'dj', interest: 4 }))).toBe(true);
    expect(only((s) => s.habits.explore.items.push({ id: 'x', name: 'x' }))).toBe(false);
    expect(only((s) => { s.goals.identity = '改過'; })).toBe(false);
  });
  test('省略 state 時用 getState()；也接受 needsBackupReminder(now)', async () => {
    await loadCurrent('v2-real.json');
    expect(needsBackupReminder(undefined, NOW)).toBe(true);
    expect(needsBackupReminder(NOW)).toBe(true);
    expect(needsBackupReminder(null, NOW)).toBe(false);
    await loadCurrent('v3.json');
    expect(needsBackupReminder(NOW)).toBe(false);
    expect(needsBackupReminder(new Date('2026-10-08T00:00:00+09:00'))).toBe(true);
  });
});

test.describe('parseImport：壞檔', () => {
  const BAD = [
    ['import-bad-not-json.txt', ['not_json']],
    ['import-bad-missing-fields.json', ['missing_field', 'missing_field']],
    ['import-bad-wrong-types.json', ['invalid_type', 'invalid_type', 'invalid_type', 'invalid_type']],
    ['import-bad-oversized.json', ['out_of_range', 'out_of_range', 'out_of_range', 'out_of_range', 'out_of_range', 'out_of_range']],
    ['corrupt-state.txt', ['not_json']]
  ];
  for (const [name, expectedCodes] of BAD) {
    test(`${name} → ${[...new Set(expectedCodes)].join('、')}，getState() 與 storage 都不變`, async () => {
      const local = await loadCurrent();
      const ref = getState();
      const before = JSON.stringify(ref);
      const storageBefore = local.snapshot();
      const r = parseImport(readFixture(name), { now: NOW });
      expect(r.ok).toBe(false);
      expect(r.errors.map((e) => e.code)).toStrictEqual(expectedCodes);
      for (const e of r.errors) {
        expect(typeof e.path).toBe('string');
        expect(e.message).toMatch(/[一-鿿]/);
        expect(findBannedWords(e.message)).toEqual([]);
      }
      expect(getState()).toBe(ref);
      expect(JSON.stringify(getState())).toBe(before);
      expect(local.snapshot()).toStrictEqual(storageBefore);
    });
  }

  test('超過 5,000,000 字元 → too_large；剛好 5,000,000 字元不算太大', () => {
    expect(parseImport('x'.repeat(5000001)).errors).toStrictEqual([
      { code: 'too_large', path: '', message: '檔案太大（超過 5,000,000 字元），不是 Daily Ten 的備份檔' }
    ]);
    expect(parseImport('x'.repeat(5000000)).errors[0].code).toBe('not_json');
  });

  test('不是字串、空字串 → not_json', () => {
    for (const v of [undefined, null, {}, 42, '', '   ']) expect(parseImport(v).errors[0].code).toBe('not_json');
  });

  test('較新版本的備份 → out_of_range（請先更新 App）', () => {
    const s = loadFixture('v3.json');
    s.version = 4;
    const r = parseImport(JSON.stringify(s));
    expect(r.errors).toStrictEqual([{ code: 'out_of_range', path: 'version', message: '這份資料來自較新版本的 App（v4），請先更新 App 再匯入' }]);
  });

  test('v3-bad-sleep.json（手動改壞的打卡紀錄）→ 8 筆錯誤，getState() 與 storage 都不變', async () => {
    const local = await loadCurrent('v3-checkin.json');
    const ref = getState();
    const before = JSON.stringify(ref);
    const storageBefore = local.snapshot();
    const r = parseImport(readFixture('v3-bad-sleep.json'), { now: NOW });
    expect(r.ok).toBe(false);
    expect(r.errors.map((e) => [e.code, e.path])).toStrictEqual([
      ['out_of_range', 'habits.sleep.log[1].wake'],
      ['invalid_type', 'habits.sleep.log[2].lightsOutEdited'],
      ['invalid_type', 'habits.sleep.log[4]'],
      ['invalid_type', 'habits.sleep.log[5]'],
      ['out_of_range', 'habits.sleep.log[6].lightsOut'],
      ['invalid_type', 'habits.sleep.log[7].wake'],
      ['invalid_type', 'habits.sleep.log[8].lightsOut'],
      ['out_of_range', 'phase.startedAt']
    ]);
    expect(r.errors[0].message).toBe('睡眠紀錄（habits.sleep.log[1].wake）應為含時區的時間（例 2026-10-04T06:58:00+09:00）');
    expect(r.errors[2].message).toBe('睡眠紀錄（habits.sleep.log[4]）應為物件');
    expect(r.errors[5].message).toBe('睡眠紀錄（habits.sleep.log[7].wake）缺少必要的值，應為含時區的時間（例 2026-10-04T06:58:00+09:00）');
    for (const e of r.errors) {
      expect(e.message).toMatch(/[一-鿿]/);
      expect(e.message).toContain(e.path);
      expect(findBannedWords(e.message)).toEqual([]);
    }
    expect(getState()).toBe(ref);
    expect(JSON.stringify(getState())).toBe(before);
    expect(local.snapshot()).toStrictEqual(storageBefore);
  });

  test('錯誤最多回傳 10 筆', () => {
    const s = loadFixture('v2-real.json');
    s.sessions = Array.from({ length: 30 }, () => ({ date: 'bad', type: 'full', xp: 10 }));
    const r = parseImport(JSON.stringify(s));
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBe(10);
  });
});

test.describe('parseImport：好檔 → 差異摘要', () => {
  test('匯入較舊的備份：摘要與警告', async () => {
    const local = await loadCurrent('v3.json');
    const ref = getState();
    const storageBefore = local.snapshot();
    const r = parseImport(readFixture('v2-real.json'), { now: NOW });
    expect(r.ok).toBe(true);
    expect(r.incoming.version).toBe(3);
    expect(r.incoming.xp).toBe(361);
    expect(r.incoming.game.xp.move).toBe(361);
    expect(r.incoming).not.toBe(ref);
    expect(r.summary.rows).toStrictEqual([
      { key: 'version', label: '版本', current: 'v3', incoming: 'v2 → v3', changed: true },
      { key: 'level', label: '等級', current: 'L3', incoming: 'L3', changed: false },
      { key: 'xp', label: 'XP', current: '396', incoming: '361', changed: true },
      { key: 'streak', label: '連續天數', current: '12 天', incoming: '9 天', changed: true },
      { key: 'bestStreak', label: '最佳連續', current: '12 天', incoming: '11 天', changed: true },
      { key: 'lastSession', label: '最後訓練日', current: '2026-10-01', incoming: '2026-09-28', changed: true },
      { key: 'sessions', label: '訓練紀錄筆數', current: '35 筆', incoming: '32 筆', changed: true },
      { key: 'prs', label: 'PR 筆數', current: '11 筆', incoming: '11 筆', changed: false },
      { key: 'body', label: '身體指標筆數', current: '31 筆', incoming: '30 筆', changed: true },
      { key: 'sleepLog', label: '睡眠紀錄筆數', current: '0 筆', incoming: '0 筆', changed: false },
      { key: 'lastBackup', label: '最後備份', current: '2026-09-30 21:15', incoming: '從未備份', changed: true }
    ]);
    expect(r.summary.warnings).toStrictEqual([
      '訓練紀錄會從 35 筆變成 32 筆',
      '身體指標紀錄會從 31 筆變成 30 筆',
      '匯入檔的最後訓練日（2026-09-28）比目前（2026-10-01）舊'
    ]);
    for (const w of r.summary.warnings) expect(findBannedWords(w)).toEqual([]);
    expect(getState()).toBe(ref);
    expect(local.snapshot()).toStrictEqual(storageBefore);
  });

  test('匯入較新的備份：沒有警告', async () => {
    await loadCurrent('v2-real.json');
    const r = parseImport(readFixture('v3.json'), { now: NOW });
    expect(r.ok).toBe(true);
    expect(r.summary.warnings).toEqual([]);
    expect(r.summary.rows.find((x) => x.key === 'version')).toStrictEqual({ key: 'version', label: '版本', current: 'v3', incoming: 'v3', changed: false });
  });

  test('匯入有打卡紀錄的備份：睡眠紀錄筆數 0 → 3；反過來會警告睡眠紀錄變少', async () => {
    await loadCurrent('v3.json');
    const r = parseImport(readFixture('v3-checkin.json'), { now: NOW });
    expect(r.ok).toBe(true);
    expect(r.incoming.habits.sleep.log).toStrictEqual(CHECKIN_LOG);
    expect(r.summary.rows.find((x) => x.key === 'sleepLog')).toStrictEqual({ key: 'sleepLog', label: '睡眠紀錄筆數', current: '0 筆', incoming: '3 筆', changed: true });
    expect(r.summary.warnings).toEqual([]);
    await loadCurrent('v3-checkin.json');
    const back = parseImport(readFixture('v3.json'), { now: NOW });
    expect(back.summary.warnings).toStrictEqual([
      '訓練紀錄會從 37 筆變成 35 筆',
      '睡眠紀錄會從 3 筆變成 0 筆',
      '匯入檔的最後訓練日（2026-10-01）比目前（2026-10-03）舊'
    ]);
    for (const w of back.summary.warnings) expect(findBannedWords(w)).toEqual([]);
  });

  test('applyImport 之後呼叫 ensurePhaseStarted：匯入檔有 startedAt 就沿用；沒有（M1 備份）才寫入', async () => {
    await loadCurrent('v3.json');
    expect(await applyImport(parseImport(readFixture('v3-checkin.json'), { now: NOW }).incoming)).toBe(true);
    expect(ensurePhaseStarted(NOW)).toStrictEqual({ ok: true, changed: false, startedAt: CHECKIN_STARTED_AT });
    expect(await applyImport(parseImport(readFixture('v2-real.json'), { now: NOW }).incoming)).toBe(true);
    expect(getState().phase.startedAt).toBe(null);
    expect(ensurePhaseStarted(NOW)).toStrictEqual({ ok: true, changed: true, startedAt: '2026-10-02T15:30:00+09:00' });
  });

  test('每個好 fixture 都能匯入（含 v1、被改回 v2、空陣列、帶 BOM）', async () => {
    await loadCurrent();
    for (const name of ['v1-minimal.json', 'v2-real.json', 'v3.json', 'v3-reverted-to-v2.json', 'empty-arrays.json',
      'v3-checkin.json', 'v3-checkin-reverted-to-v2.json']) {
      const r = parseImport(readFixture(name), { now: NOW });
      expect(r.ok, name).toBe(true);
      expect(r.incoming.version).toBe(3);
    }
    expect(parseImport('﻿' + readFixture('v2-real.json')).ok).toBe(true);
    const rev = parseImport(readFixture('v3-reverted-to-v2.json'), { now: NOW });
    expect(rev.incoming.game.xp).toStrictEqual({ move: 406, sleep: 0, explore: 0, total: 406 });
  });

  test('自己下載的備份一定能再匯入，且內容不變', async () => {
    await loadCurrent('v2-wrong-types.json'); // 修補過的資料也一樣
    const { text, stamped } = buildBackup(getState(), NOW);
    const r = parseImport(text, { now: NOW });
    expect(r.ok).toBe(true);
    expect(r.incoming).toStrictEqual(stamped);
  });

  test('diffSummary：目前沒有 state 時顯示 —，不出警告', () => {
    const d = diffSummary(null, migrated('v2-real.json'));
    expect(d.rows.every((x) => x.current === '—')).toBe(true);
    expect(d.rows.find((x) => x.key === 'sessions').incoming).toBe('32 筆');
    expect(d.warnings).toEqual([]);
  });
});

test.describe('applyImport', () => {
  test('覆蓋 state 並儲存；覆蓋前的資料存到 PRE_IMPORT_KEY', async () => {
    const local = await loadCurrent('v3.json');
    const prev = JSON.stringify(getState());
    const { incoming } = parseImport(readFixture('v2-real.json'), { now: NOW });
    expect(await applyImport(incoming)).toBe(true);
    expect(getState()).toStrictEqual(incoming);
    expect(JSON.parse(local.getItem(STORAGE_KEY))).toStrictEqual(incoming);
    expect(local.getItem(PRE_IMPORT_KEY)).toBe(prev);
    expect(PRE_IMPORT_KEY).toBe('daily-ten-state.pre-import');
  });

  test('儲存失敗 → false，記憶體中的資料不變', async () => {
    const local = await loadCurrent('v3.json');
    const ref = getState();
    const { incoming } = parseImport(readFixture('v2-real.json'), { now: NOW });
    local.failWrites = true;
    const orig = console.error;
    console.error = () => {};
    try {
      expect(await applyImport(incoming)).toBe(false);
    } finally {
      console.error = orig;
    }
    expect(getState()).toBe(ref);
    expect(local.getItem(STORAGE_KEY)).toBe(readFixture('v3.json'));
  });

  test('不是物件 → false，什麼都不動', async () => {
    const local = await loadCurrent();
    const ref = getState();
    for (const v of [null, undefined, 'x', []]) expect(await applyImport(v)).toBe(false);
    expect(getState()).toBe(ref);
    expect(local.getItem(PRE_IMPORT_KEY)).toBe(null);
  });
});

test.describe('fixtures/README.md 對照', () => {
  test('提醒表：每個 fixture 載入後的 needsBackupReminder', async () => {
    const at = (iso) => new Date(iso);
    const table = [
      ['v1-minimal.json', true], ['v2-real.json', true], ['v2-missing-fields.json', true], ['v2-wrong-types.json', true],
      ['v3.json', false], ['v3-reverted-to-v2.json', false], ['empty-arrays.json', false], ['corrupt-state.txt', false],
      ['v3-checkin.json', false], ['v3-checkin-reverted-to-v2.json', false], ['v3-bad-sleep.json', false]
    ];
    for (const [name, atNow] of table) {
      await loadCurrent(name);
      expect(needsBackupReminder(getState(), NOW), name).toBe(atNow);
    }
    for (const name of ['v3.json', 'v3-reverted-to-v2.json']) {
      await loadCurrent(name);
      expect(needsBackupReminder(getState(), at('2026-10-07T21:15:00+09:00')), name).toBe(false);
      expect(needsBackupReminder(getState(), new Date(at('2026-10-07T21:15:00+09:00').getTime() + 1)), name).toBe(true);
    }
    /* B1 fixture：lastBackupAt 2026-10-03T21:05:00+09:00 */
    for (const name of ['v3-checkin.json', 'v3-checkin-reverted-to-v2.json', 'v3-bad-sleep.json']) {
      await loadCurrent(name);
      expect(needsBackupReminder(getState(), at('2026-10-10T21:05:00+09:00')), name).toBe(false);
      expect(needsBackupReminder(getState(), new Date(at('2026-10-10T21:05:00+09:00').getTime() + 1)), name).toBe(true);
    }
  });

  test('載入用的 fixture 拿去匯入：v2-missing-fields、v2-wrong-types 被嚴格驗證擋下', async () => {
    await loadCurrent();
    const missing = parseImport(readFixture('v2-missing-fields.json'));
    expect(missing.errors.map((e) => [e.code, e.path])).toStrictEqual([['invalid_type', 'streak.best']]);
    const wrong = parseImport(readFixture('v2-wrong-types.json'));
    expect(wrong.errors.length).toBe(10);
    const { validateImport } = await import('../js/state/schema.js');
    const all = validateImport(loadFixture('v2-wrong-types.json')).errors;
    expect(all.length).toBe(20);
    expect(all.filter((e) => e.code === 'invalid_type').length).toBe(19);
    expect(all.filter((e) => e.code === 'out_of_range').map((e) => e.path)).toStrictEqual(['sessions[3].date']);
    expect(wrong.errors).toStrictEqual(all.slice(0, 10));
  });
});

test.describe('下載在沒有 DOM 的環境不丟例外', () => {
  test('downloadBackup：失敗回 {ok:false, reason:"error"}，state 不變', async () => {
    await loadCurrent();
    const ref = getState();
    const before = JSON.stringify(ref);
    const r = await downloadBackup({ now: NOW });
    expect(r).toStrictEqual({ ok: false, reason: 'error', message: '備份檔產生失敗，請再試一次' });
    expect(getState()).toBe(ref);
    expect(JSON.stringify(getState())).toBe(before);
  });

  test('downloadBackup：沒有 state → {ok:false}', async () => {
    setState(null);
    expect(await downloadBackup({ now: NOW })).toStrictEqual({ ok: false, reason: 'error', message: '目前沒有可備份的資料' });
  });

  test('downloadRawBackup：找不到 key 或沒有 DOM → {ok:false}', () => {
    installGlobals({ local: new MemoryStorage({ 'daily-ten-state.bak-v2': '{"broken' }) });
    expect(downloadRawBackup('daily-ten-state.bak-v9', { now: NOW })).toStrictEqual({ ok: false, message: '找不到另存的原始資料' });
    expect(downloadRawBackup(null)).toStrictEqual({ ok: false, message: '找不到另存的原始資料' });
    expect(downloadRawBackup('daily-ten-state.bak-v2', { now: NOW })).toStrictEqual({ ok: false, message: '原始資料下載失敗，請再試一次' });
  });
});
