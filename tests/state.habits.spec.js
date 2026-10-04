/* data-guardian：habits.js 單元測試（B1 早安打卡寫入 API、ensurePhaseStarted；純 Node，storage 用 shim）
   fixture：v3.json（sleep log 空）、v3-checkin.json（3 天打卡）、v3-checkin-reverted-to-v2.json（D12）、v3-bad-sleep.json */
import { test, expect } from '@playwright/test';
import { STORAGE_KEY, loadState, getState, setState, saveState } from '../js/state/store.js';
import { validateImport } from '../js/state/schema.js';
import { migrate } from '../js/state/migrate.js';
import { buildBackup, parseImport } from '../js/state/backup.js';
import { validateSleepEntry, addSleepEntry, removeSleepEntry, ensurePhaseStarted, SLEEP_MAX_GAP_HOURS } from '../js/state/habits.js';
import {
  readFixture, loadFixture, NOW, MemoryStorage, installGlobals, clearGlobals, useTokyoTime, findBannedWords,
  CHECKIN_LOG, CHECKIN_STARTED_AT, legacyRecordSession, legacyV2Migrate
} from './state.helpers.js';

useTokyoTime(test);
test.afterEach(() => clearGlobals());

/* 10-05（週一）早上的打卡：昨晚 23:00 熄燈、06:58 起床 */
const ENTRY = Object.freeze({ date: '2026-10-05', lightsOut: '2026-10-04T23:00:00+09:00', wake: '2026-10-05T06:58:00+09:00', lightsOutEdited: false });
const entry = (patch = {}) => ({ ...ENTRY, ...patch });

/* 載入 fixture；local.writes 記錄每一次 setItem 的 key（證明「沒有寫入」） */
async function loadWith(name) {
  const local = new MemoryStorage(name ? { [STORAGE_KEY]: readFixture(name) } : {});
  local.writes = [];
  const setItem = local.setItem.bind(local);
  local.setItem = (k, v) => { local.writes.push(String(k)); setItem(k, v); };
  installGlobals({ local });
  const load = await loadState({ now: NOW });
  return { local, load };
}
const stored = (local) => JSON.parse(local.getItem(STORAGE_KEY));
const sleepLog = () => getState().habits.sleep.log;

test.describe('validateSleepEntry（純函式）', () => {
  test('正確的打卡：回傳只含四個欄位的新物件（依固定順序），不改動傳入物件', () => {
    const input = { wake: ENTRY.wake, score: { total: 60 }, lightsOutEdited: true, date: ENTRY.date, lightsOut: ENTRY.lightsOut, xp: 60 };
    const before = JSON.stringify(input);
    const r = validateSleepEntry(input);
    expect(r.ok).toBe(true);
    expect(Object.keys(r.entry)).toEqual(['date', 'lightsOut', 'wake', 'lightsOutEdited']);
    expect(r.entry).toStrictEqual({ date: ENTRY.date, lightsOut: ENTRY.lightsOut, wake: ENTRY.wake, lightsOutEdited: true });
    expect(r.entry).not.toBe(input);
    expect(JSON.stringify(input)).toBe(before);
  });

  test('接受的時間寫法：秒可省略、毫秒 3 位、Z 結尾（toISOString）、其他時區', () => {
    for (const patch of [
      { lightsOut: '2026-10-04T23:00+09:00', wake: '2026-10-05T06:58+09:00' },
      { lightsOut: '2026-10-04T23:00:00.000+09:00', wake: '2026-10-05T06:58:00.123+09:00' },
      { lightsOut: '2026-10-04T14:00:00.000Z', wake: '2026-10-04T21:58:00.000Z' },
      { lightsOut: '2026-10-04T23:00:00+08:00', wake: '2026-10-05T06:58:00+08:00' },
      { lightsOut: '2026-10-04T23:00:00-07:00', wake: '2026-10-05T06:58:00-07:00' },
      { lightsOut: '2026-10-04T23:00:00+09:00', wake: '2026-10-05T05:58:00+08:00' } // 出差換時區：比的是實際時刻
    ]) {
      expect(validateSleepEntry(entry(patch)), JSON.stringify(patch)).toMatchObject({ ok: true });
    }
  });

  const BAD = [
    ['不是物件：null', null, 'entry'],
    ['不是物件：undefined', undefined, 'entry'],
    ['不是物件：陣列', [ENTRY], 'entry'],
    ['不是物件：字串', '2026-10-05 06:58', 'entry'],
    ['不是物件：數字', 42, 'entry'],
    ['不是物件：Date', new Date(), 'entry'],
    ['date 缺少', entry({ date: undefined }), 'date'],
    ['date 不存在的日期', entry({ date: '2026-02-30' }), 'date'],
    ['date 斜線', entry({ date: '2026/10/05' }), 'date'],
    ['date 數字', entry({ date: 20261005 }), 'date'],
    ['date 未補零', entry({ date: '2026-10-5' }), 'date'],
    ['lightsOut 缺少', entry({ lightsOut: undefined }), 'lightsOut'],
    ['lightsOut null', entry({ lightsOut: null }), 'lightsOut'],
    ['lightsOut 只有 HH:MM', entry({ lightsOut: '23:00' }), 'lightsOut'],
    ['lightsOut 沒有時區', entry({ lightsOut: '2026-10-04T23:00:00' }), 'lightsOut'],
    ['lightsOut 用空白分隔', entry({ lightsOut: '2026-10-04 23:00:00+09:00' }), 'lightsOut'],
    ['lightsOut 時區沒有冒號', entry({ lightsOut: '2026-10-04T23:00:00+0900' }), 'lightsOut'],
    ['lightsOut 時區只有 1 位數', entry({ lightsOut: '2026-10-04T23:00:00+9:00' }), 'lightsOut'],
    ['lightsOut 24 點', entry({ lightsOut: '2026-10-04T24:00:00+09:00' }), 'lightsOut'],
    ['lightsOut 毫秒 1 位', entry({ lightsOut: '2026-10-04T23:00:00.1+09:00' }), 'lightsOut'],
    ['lightsOut 日期不存在', entry({ lightsOut: '2026-02-30T23:00:00+09:00' }), 'lightsOut'],
    ['lightsOut 小寫 z', entry({ lightsOut: '2026-10-04T14:00:00z' }), 'lightsOut'],
    ['lightsOut 是 Date 物件', entry({ lightsOut: new Date('2026-10-04T23:00:00+09:00') }), 'lightsOut'],
    ['lightsOut 是毫秒數', entry({ lightsOut: Date.parse('2026-10-04T23:00:00+09:00') }), 'lightsOut'],
    ['wake 缺少', entry({ wake: undefined }), 'wake'],
    ['wake null', entry({ wake: null }), 'wake'],
    ['wake 沒有時區', entry({ wake: '2026-10-05T06:58:00' }), 'wake'],
    ['wake 只有 HH:MM', entry({ wake: '06:58' }), 'wake'],
    ['wake 前後有空白', entry({ wake: ' 2026-10-05T06:58:00+09:00' }), 'wake'],
    ['lightsOutEdited 缺少', entry({ lightsOutEdited: undefined }), 'lightsOutEdited'],
    ['lightsOutEdited 字串', entry({ lightsOutEdited: 'true' }), 'lightsOutEdited'],
    ['lightsOutEdited 數字', entry({ lightsOutEdited: 1 }), 'lightsOutEdited'],
    ['lightsOutEdited null', entry({ lightsOutEdited: null }), 'lightsOutEdited'],
    ['熄燈 = 起床', entry({ lightsOut: ENTRY.wake }), 'lightsOut'],
    ['熄燈晚於起床（熄燈寫成起床當天 23:00）', entry({ lightsOut: '2026-10-05T23:00:00+09:00' }), 'lightsOut'],
    ['熄燈到起床超過 24 小時（熄燈多減了一天）', entry({ lightsOut: '2026-10-04T00:40:00+09:00' }), 'lightsOut']
  ];
  for (const [name, input, field] of BAD) {
    test(`拒絕：${name} → field = ${field}`, () => {
      const r = validateSleepEntry(input);
      expect(r.ok).toBe(false);
      expect(r.field).toBe(field);
      expect(r.message).toMatch(/[一-鿿]/);
      expect(findBannedWords(r.message)).toEqual([]);
      expect(r).not.toHaveProperty('entry');
    });
  }

  test('相隔剛好 24 小時可以；多 1 秒不行', () => {
    expect(SLEEP_MAX_GAP_HOURS).toBe(24);
    expect(validateSleepEntry(entry({ lightsOut: '2026-10-04T06:58:00+09:00' })).ok).toBe(true);
    const r = validateSleepEntry(entry({ lightsOut: '2026-10-04T06:57:59+09:00' }));
    expect(r).toStrictEqual({ ok: false, field: 'lightsOut', message: '熄燈到起床超過 24 小時，請確認熄燈時間' });
  });

  test('訊息內容', () => {
    expect(validateSleepEntry(entry({ wake: '06:58' }))).toStrictEqual({
      ok: false, field: 'wake', message: '起床時間（wake）應為含時區的時間，例如 2026-10-04T06:58:00+09:00'
    });
    expect(validateSleepEntry(entry({ lightsOut: '2026-10-05T23:00:00+09:00' })).message).toBe('熄燈時間要早於起床時間');
    expect(validateSleepEntry(null).message).toBe('睡眠紀錄格式不正確');
  });

  test('讀欄位時丟例外的物件 → field = entry，不丟例外', () => {
    const hostile = { get date() { throw new Error('boom'); } };
    expect(validateSleepEntry(hostile)).toMatchObject({ ok: false, field: 'entry' });
  });
});

test.describe('addSleepEntry', () => {
  test('寫入並儲存：回傳複本、saved = true、主 key 含新紀錄、可再匯入、再遷移是 no-op', async () => {
    const { local } = await loadWith('v3.json');
    const r = addSleepEntry(entry());
    expect(r.ok).toBe(true);
    expect(Object.keys(r)).toEqual(['ok', 'entry', 'saved']);
    expect(r.entry).toStrictEqual(ENTRY);
    expect(await r.saved).toBe(true);
    expect(sleepLog()).toStrictEqual([ENTRY]);
    expect(stored(local).habits.sleep.log).toStrictEqual([ENTRY]);
    expect(stored(local)).toStrictEqual(getState());
    r.entry.lightsOutEdited = true; // 複本：改它不影響 state
    expect(sleepLog()[0].lightsOutEdited).toBe(false);
    expect(validateImport(getState())).toEqual({ ok: true });
    const again = migrate(getState(), { now: NOW });
    expect(again.issues).toEqual([]);
    expect(JSON.stringify(again.state)).toBe(JSON.stringify(getState()));
  });

  test('其他欄位不寫入（只存四個欄位）', async () => {
    await loadWith('v3.json');
    const r = addSleepEntry({ ...entry(), score: { total: 60 }, xp: 60 });
    expect(r.ok).toBe(true);
    expect(sleepLog()).toStrictEqual([ENTRY]);
  });

  test('同一天已有紀錄 → duplicate；state 與 storage 都不變', async () => {
    const { local } = await loadWith('v3-checkin.json');
    const before = JSON.stringify(getState());
    const snap = local.snapshot();
    const r = addSleepEntry({ date: '2026-10-04', lightsOut: '2026-10-03T23:30:00+09:00', wake: '2026-10-04T07:30:00+09:00', lightsOutEdited: true });
    expect(r).toStrictEqual({ ok: false, code: 'duplicate', message: '2026-10-04 已經有睡眠紀錄，同一天只能記錄一次' });
    expect(JSON.stringify(getState())).toBe(before);
    expect(local.snapshot()).toStrictEqual(snap);
    expect(local.writes).toEqual([]);
  });

  test('形狀不對 → invalid（含 field）；state 與 storage 都不變', async () => {
    const { local } = await loadWith('v3-checkin.json');
    const before = JSON.stringify(getState());
    for (const [input, field] of [
      [null, 'entry'], [entry({ date: '2026-13-01' }), 'date'], [entry({ wake: '2026-10-05T06:58:00' }), 'wake'],
      [entry({ lightsOut: '23:00' }), 'lightsOut'], [entry({ lightsOutEdited: 'false' }), 'lightsOutEdited'],
      [entry({ lightsOut: '2026-10-05T07:30:00+09:00' }), 'lightsOut']
    ]) {
      const r = addSleepEntry(input);
      expect(r.ok).toBe(false);
      expect(r.code).toBe('invalid');
      expect(r.field).toBe(field);
      expect(Object.keys(r)).toEqual(['ok', 'code', 'field', 'message']);
      expect(findBannedWords(r.message)).toEqual([]);
    }
    expect(JSON.stringify(getState())).toBe(before);
    expect(local.writes).toEqual([]);
  });

  test('依日期排序插入（打卡是最新的一天 → 加在最後）', async () => {
    await loadWith('v3-checkin.json');
    expect(addSleepEntry(entry()).ok).toBe(true);
    expect(addSleepEntry({ date: '2026-10-01', lightsOut: '2026-09-30T23:00:00+09:00', wake: '2026-10-01T07:00:00+09:00', lightsOutEdited: false }).ok).toBe(true);
    expect(addSleepEntry({ date: '2026-09-29', lightsOut: '2026-09-28T23:00:00+09:00', wake: '2026-09-29T07:00:00+09:00', lightsOutEdited: false }).ok).toBe(true);
    expect(sleepLog().map((e) => e.date)).toEqual(['2026-09-29', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05']);
  });

  test('還沒載入 → not_loaded；記憶體中的 log 不是陣列 → corrupt（不改動）；讀取丟例外 → error', async () => {
    const { local } = await loadWith('v3.json');
    setState(null);
    expect(addSleepEntry(entry())).toStrictEqual({ ok: false, code: 'not_loaded', message: '資料還沒載入完成，請重新開啟 App 再試一次' });
    const broken = loadFixture('v3.json');
    broken.habits.sleep.log = 'x';
    setState(broken);
    expect(addSleepEntry(entry())).toMatchObject({ ok: false, code: 'corrupt' });
    expect(broken.habits.sleep.log).toBe('x');
    for (const habits of [undefined, null, 'x', { sleep: null }, { sleep: {} }]) {
      const s = loadFixture('v3.json');
      s.habits = habits;
      setState(s);
      expect(addSleepEntry(entry()).code).toBe('corrupt');
    }
    setState({ ...loadFixture('v3.json'), habits: { sleep: { get log() { throw new Error('boom'); } } } });
    expect(addSleepEntry(entry())).toStrictEqual({ ok: false, code: 'error', message: '記錄失敗，請再試一次' });
    expect(local.writes).toEqual([]);
  });

  test('筆數達上限（50,000）→ full', async () => {
    await loadWith('v3.json');
    const log = sleepLog();
    for (let i = 0; i < 50000; i++) log.push(ENTRY);
    expect(addSleepEntry({ ...entry(), date: '2026-10-06' })).toStrictEqual({ ok: false, code: 'full', message: '睡眠紀錄已達上限（50,000 筆）' });
    expect(log.length).toBe(50000);
  });

  test('儲存失敗（容量不足）→ ok 仍為 true、saved = false，資料留在記憶體（與其他紀錄相同）', async () => {
    const { local } = await loadWith('v3.json');
    local.failWrites = true;
    const logged = [];
    const orig = console.error;
    console.error = (...a) => logged.push(a.join(' '));
    let r;
    try {
      r = addSleepEntry(entry()); // 沒有 window.storage 時 saveState 在呼叫當下就寫 localStorage
      expect(r.ok).toBe(true);
      expect(await r.saved).toBe(false);
    } finally {
      console.error = orig;
    }
    expect(logged).toEqual(['儲存失敗：資料僅存在記憶體中']);
    expect(sleepLog()).toStrictEqual([ENTRY]);
    expect(local.getItem(STORAGE_KEY)).toBe(readFixture('v3.json'));
  });

  test('寫入後重新開 App：status ok、紀錄還在', async () => {
    const { local } = await loadWith('v3.json');
    await addSleepEntry(entry()).saved;
    installGlobals({ local });
    expect(await loadState({ now: NOW })).toStrictEqual({ status: 'ok', error: null });
    expect(sleepLog()).toStrictEqual([ENTRY]);
  });
});

test.describe('removeSleepEntry（復原）', () => {
  test('只刪該日，其他日不動；saved = true', async () => {
    const { local } = await loadWith('v3-checkin.json');
    const r = removeSleepEntry('2026-10-03');
    expect(r.ok).toBe(true);
    expect(r.removed).toBe(1);
    expect(await r.saved).toBe(true);
    expect(sleepLog()).toStrictEqual([CHECKIN_LOG[0], CHECKIN_LOG[2]]);
    expect(stored(local).habits.sleep.log).toStrictEqual([CHECKIN_LOG[0], CHECKIN_LOG[2]]);
    const rest = { ...stored(local) };
    const fx = loadFixture('v3-checkin.json');
    rest.habits = fx.habits;
    expect(rest).toStrictEqual(fx); // 其他欄位完全不變
  });

  test('找不到 → {ok:true, removed:0}，不寫入；連按兩次復原不會出錯', async () => {
    const { local } = await loadWith('v3-checkin.json');
    const r = removeSleepEntry('2026-10-05');
    expect(r.ok).toBe(true);
    expect(r.removed).toBe(0);
    expect(await r.saved).toBe(true);
    expect(local.writes).toEqual([]);
    expect(sleepLog()).toStrictEqual(CHECKIN_LOG);
  });

  test('日期格式不對 → invalid；還沒載入 → not_loaded；log 壞掉 → corrupt', async () => {
    await loadWith('v3-checkin.json');
    for (const bad of [undefined, null, '', '2026/10/04', '2026-02-30', 20261004, { date: '2026-10-04' }]) {
      expect(removeSleepEntry(bad)).toStrictEqual({ ok: false, code: 'invalid', message: '要刪除的日期格式不正確（應為 YYYY-MM-DD）' });
    }
    expect(sleepLog()).toStrictEqual(CHECKIN_LOG);
    setState(null);
    expect(removeSleepEntry('2026-10-04').code).toBe('not_loaded');
    const s = loadFixture('v3.json');
    s.habits.sleep = { log: {} };
    setState(s);
    expect(removeSleepEntry('2026-10-04').code).toBe('corrupt');
  });

  test('匯入資料裡同一天有兩筆 → 兩筆都刪（該日不留紀錄）', async () => {
    await loadWith('v3-bad-sleep.json');
    expect(sleepLog().filter((e) => e.date === '2026-10-02')).toHaveLength(2);
    const r = removeSleepEntry('2026-10-02');
    expect(r.removed).toBe(2);
    expect(sleepLog().map((e) => e.date)).toEqual(['2026-10-04', '2026-10-05', '2026-10-10']);
  });

  test('打卡 → 復原 → 再打卡：state 回到打卡前、storage 一致、再打卡不算重複', async () => {
    const { local } = await loadWith('v3.json');
    await saveState(); // 先存一次，讓 storage 與記憶體同步（載入不寫主 key）
    const before = JSON.stringify(getState());
    const add = addSleepEntry(entry());
    await add.saved;
    const undo = removeSleepEntry(add.entry.date);
    expect(undo).toMatchObject({ ok: true, removed: 1 });
    await undo.saved;
    expect(JSON.stringify(getState())).toBe(before);
    expect(local.getItem(STORAGE_KEY)).toBe(before);
    expect(removeSleepEntry(add.entry.date).removed).toBe(0); // 第二次復原
    const again = addSleepEntry(entry({ lightsOut: '2026-10-05T00:30:00+09:00', lightsOutEdited: true }));
    expect(again.ok).toBe(true);
    expect(sleepLog()).toStrictEqual([{ ...ENTRY, lightsOut: '2026-10-05T00:30:00+09:00', lightsOutEdited: true }]);
  });
});

test.describe('ensurePhaseStarted', () => {
  test('startedAt 是 null → 寫入 isoLocal(now)（只改記憶體，不寫 storage）；下一次 saveState 才一併寫入', async () => {
    const { local } = await loadWith('v3.json');
    const r = ensurePhaseStarted(NOW);
    expect(r).toStrictEqual({ ok: true, changed: true, startedAt: '2026-10-02T15:30:00+09:00' });
    expect(getState().phase).toStrictEqual({ current: 'P1', startedAt: '2026-10-02T15:30:00+09:00', history: [] });
    expect(local.writes).toEqual([]);
    expect(local.getItem(STORAGE_KEY)).toBe(readFixture('v3.json')); // 載入不寫主 key 的規則不變
    await saveState();
    expect(stored(local).phase.startedAt).toBe('2026-10-02T15:30:00+09:00');
  });

  test('冪等：已有值不覆寫（換一個 now 再呼叫、重新開 App 後再呼叫）', async () => {
    const { local } = await loadWith('v3.json');
    ensurePhaseStarted(NOW);
    const later = new Date('2026-10-09T07:00:00+09:00');
    expect(ensurePhaseStarted(later)).toStrictEqual({ ok: true, changed: false, startedAt: '2026-10-02T15:30:00+09:00' });
    await saveState();
    installGlobals({ local });
    expect(await loadState({ now: later })).toStrictEqual({ status: 'ok', error: null });
    expect(ensurePhaseStarted(later)).toStrictEqual({ ok: true, changed: false, startedAt: '2026-10-02T15:30:00+09:00' });
    await loadWith('v3-checkin.json');
    expect(ensurePhaseStarted(later)).toStrictEqual({ ok: true, changed: false, startedAt: CHECKIN_STARTED_AT });
  });

  test('記憶體中的值不是含時區的時間 → 視為沒有，重新寫入', async () => {
    await loadWith('v3.json');
    for (const bad of ['garbage', '2026-10-02', '2026-10-02T06:50:10', '', 0]) {
      getState().phase.startedAt = bad;
      expect(ensurePhaseStarted(NOW)).toStrictEqual({ ok: true, changed: true, startedAt: '2026-10-02T15:30:00+09:00' });
    }
    getState().phase.startedAt = '2026-10-01T22:00:00Z';
    expect(ensurePhaseStarted(NOW).changed).toBe(false);
  });

  test('now 省略或無效 → 用現在時間（仍含 +09:00）', async () => {
    await loadWith('v3.json');
    expect(ensurePhaseStarted().startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/);
    getState().phase.startedAt = null;
    expect(ensurePhaseStarted('garbage').startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/);
  });

  test('還沒載入 → not_loaded；phase 不是物件 → corrupt（不建立）', async () => {
    await loadWith('v3.json');
    setState(null);
    expect(ensurePhaseStarted(NOW)).toStrictEqual({ ok: false, code: 'not_loaded', message: '資料還沒載入完成，請重新開啟 App 再試一次' });
    const s = loadFixture('v3.json');
    s.phase = 'P1';
    setState(s);
    expect(ensurePhaseStarted(NOW)).toMatchObject({ ok: false, code: 'corrupt' });
    expect(s.phase).toBe('P1');
  });

  test('recovered 且另存失敗（主 key 是原始資料唯一的副本）：開機呼叫不會覆寫主 key', async () => {
    const raw = readFixture('corrupt-state.txt');
    const local = new MemoryStorage({ [STORAGE_KEY]: raw });
    local.failWrites = true;
    installGlobals({ local });
    const load = await loadState({ now: NOW });
    expect(load.status).toBe('recovered');
    expect(load.error.backupKey).toBe(STORAGE_KEY);
    local.failWrites = false;
    let writes = 0;
    const setItem = local.setItem.bind(local);
    local.setItem = (k, v) => { writes++; setItem(k, v); };
    expect(ensurePhaseStarted(NOW).changed).toBe(true);
    expect(writes).toBe(0);
    expect(local.getItem(STORAGE_KEY)).toBe(raw);
  });
});

test.describe('fixture 重播（v3-checkin 是 B1 寫入流程的實際結果）', () => {
  test('v3.json → 3 天早安打卡＋訓練＋備份 = v3-checkin.json（逐字、含欄位順序）', async () => {
    const local = new MemoryStorage({ [STORAGE_KEY]: readFixture('v3.json') });
    installGlobals({ local });
    const day = async (bootIso, sleep, session, backupIso) => {
      const boot = new Date(bootIso);
      expect((await loadState({ now: boot })).status).toBe('ok');
      ensurePhaseStarted(boot);
      const r = addSleepEntry(sleep);
      expect(r.ok).toBe(true);
      expect(await r.saved).toBe(true);
      if (session) { legacyRecordSession(getState(), ...session); await saveState(); }
      if (backupIso) { setState(buildBackup(getState(), new Date(backupIso)).stamped); await saveState(); }
    };
    await day('2026-10-02T06:50:10+09:00', CHECKIN_LOG[0], ['2026-10-02', 'full', 10]);
    await day('2026-10-03T07:24:30+09:00', CHECKIN_LOG[1], ['2026-10-03', 'rest', 5], '2026-10-03T21:05:00+09:00');
    await day('2026-10-04T06:57:50+09:00', CHECKIN_LOG[2], null);
    expect(JSON.stringify(stored(local))).toBe(JSON.stringify(loadFixture('v3-checkin.json')));
  });

  test('v3-checkin-reverted-to-v2.json = 舊版 App 開啟 v3-checkin 後做一次保底（version 改回 2、只動 legacy 欄位）', () => {
    const s = legacyV2Migrate(loadFixture('v3-checkin.json'));
    legacyRecordSession(s, '2026-10-04', 'minimal', 3);
    expect(JSON.stringify(s)).toBe(JSON.stringify(loadFixture('v3-checkin-reverted-to-v2.json')));
  });
});

test.describe('D12：被舊版改回 version 2 之後', () => {
  test('sleep log 不遺失、不重複；startedAt 保留；XP 是複製不是相加；同一天不能再打卡', async () => {
    const { local, load } = await loadWith('v3-checkin-reverted-to-v2.json');
    expect(load).toStrictEqual({ status: 'migrated', error: null });
    const s = getState();
    expect(s.version).toBe(3);
    expect(s.habits.sleep.log).toStrictEqual(CHECKIN_LOG);
    expect(s.phase.startedAt).toBe(CHECKIN_STARTED_AT);
    expect(s.xp).toBe(414);
    expect(s.game.xp).toStrictEqual({ move: 414, sleep: 0, explore: 0, total: 414 }); // 不是 411＋414
    expect(ensurePhaseStarted(NOW).changed).toBe(false);
    expect(addSleepEntry({ date: '2026-10-04', lightsOut: '2026-10-03T23:00:00+09:00', wake: '2026-10-04T08:00:00+09:00', lightsOutEdited: false }).code).toBe('duplicate');
    expect(local.writes).toEqual([]);
  });

  test('來回三次（新版打卡 → 舊版記訓練 → 新版載入）：每天剛好一筆、XP 一直等於 legacy', async () => {
    const local = new MemoryStorage({ [STORAGE_KEY]: readFixture('v3-checkin-reverted-to-v2.json') });
    installGlobals({ local });
    const days = [['2026-10-05', 'full', 10], ['2026-10-06', 'full', 10], ['2026-10-07', 'cycle', 15]];
    for (const [date, type, xp] of days) {
      await loadState({ now: new Date(`${date}T06:00:00+09:00`) });
      const prev = new Date(`${date}T00:00:00Z`);
      prev.setUTCDate(prev.getUTCDate() - 1);
      const r = addSleepEntry({ date, lightsOut: `${prev.toISOString().slice(0, 10)}T23:00:00+09:00`, wake: `${date}T07:00:00+09:00`, lightsOutEdited: false });
      expect(r.ok).toBe(true);
      await r.saved;
      const old = legacyV2Migrate(JSON.parse(local.getItem(STORAGE_KEY))); // 舊版 App 開啟
      legacyRecordSession(old, date, type, xp);
      local.setItem(STORAGE_KEY, JSON.stringify(old));
    }
    const load = await loadState({ now: new Date('2026-10-08T06:00:00+09:00') });
    expect(load.status).toBe('migrated');
    const log = getState().habits.sleep.log;
    expect(log.map((e) => e.date)).toEqual(['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07']);
    expect(new Set(log.map((e) => e.date)).size).toBe(log.length);
    expect(getState().xp).toBe(414 + 35);
    expect(getState().game.xp).toStrictEqual({ move: 449, sleep: 0, explore: 0, total: 449 });
    expect(getState().phase.startedAt).toBe(CHECKIN_STARTED_AT);
  });
});

test.describe('備份來回', () => {
  test('打卡後下載的備份一定能再匯入，內容不變；差異摘要顯示睡眠紀錄筆數', async () => {
    await loadWith('v3-checkin.json');
    expect(addSleepEntry(entry()).ok).toBe(true);
    const { text, stamped } = buildBackup(getState(), new Date('2026-10-05T07:10:00+09:00'));
    expect(stamped.habits.sleep.log).toStrictEqual([...CHECKIN_LOG, ENTRY]);
    const r = parseImport(text, { now: NOW });
    expect(r.ok).toBe(true);
    expect(r.incoming).toStrictEqual(stamped);
    expect(r.summary.rows.find((x) => x.key === 'sleepLog')).toStrictEqual({ key: 'sleepLog', label: '睡眠紀錄筆數', current: '4 筆', incoming: '4 筆', changed: false });
  });
});
