/* data-guardian：store.js 單元測試（純 Node；localStorage／window.storage 用 shim） */
import { test, expect } from '@playwright/test';
import { STORAGE_KEY, BACKUP_KEY_PREFIX, loadState, getState, setState, saveState, migrateState } from '../js/state/store.js';
import { defaultState } from '../js/state/schema.js';
import { readFixture, loadFixture, NOW, MemoryStorage, WindowStorage, installGlobals, clearGlobals, useTokyoTime, findBannedWords } from './state.helpers.js';

useTokyoTime(test);
test.afterEach(() => clearGlobals());

const MSG_REPAIRED = '部分資料格式異常，已自動修復。原始資料已另存，可下載保存。';
const MSG_RECOVERED = '讀取資料時發生問題，已改用空白資料。原始資料已另存，可下載保存。';
const BAK2 = 'daily-ten-state.bak-v2';

function withLocal(raw) {
  const local = new MemoryStorage(raw === undefined ? {} : { [STORAGE_KEY]: raw });
  installGlobals({ local });
  return local;
}

test.describe('loadState：狀態', () => {
  test('import 時不碰 window／localStorage；完全沒有 storage → fresh', async () => {
    clearGlobals();
    const r = await loadState({ now: NOW });
    expect(r).toStrictEqual({ status: 'fresh', error: null });
    expect(getState()).toStrictEqual(defaultState(NOW));
  });

  test('沒有資料 → fresh（不寫入任何 key）', async () => {
    const local = withLocal();
    expect(await loadState({ now: NOW })).toStrictEqual({ status: 'fresh', error: null });
    expect(getState()).toStrictEqual(defaultState(NOW));
    expect(local.keys()).toEqual([]);
  });

  test('正常 v3 → ok', async () => {
    const raw = readFixture('v3.json');
    const local = withLocal(raw);
    expect(await loadState({ now: NOW })).toStrictEqual({ status: 'ok', error: null });
    expect(getState()).toStrictEqual(loadFixture('v3.json'));
    expect(local.keys()).toEqual([STORAGE_KEY]);
  });

  for (const [name, xp, streak] of [
    ['v1-minimal.json', 35, 1], ['v2-real.json', 361, 9], ['v2-missing-fields.json', 60, 3],
    ['empty-arrays.json', 0, 0], ['v3-reverted-to-v2.json', 406, 13]
  ]) {
    test(`${name} → migrated，主 key 不被覆寫`, async () => {
      const raw = readFixture(name);
      const local = withLocal(raw);
      expect(await loadState({ now: NOW })).toStrictEqual({ status: 'migrated', error: null });
      expect(getState().version).toBe(3);
      expect(getState().xp).toBe(xp);
      expect(getState().streak.current).toBe(streak);
      expect(getState().game.xp.move).toBe(xp);
      expect(local.getItem(STORAGE_KEY)).toBe(raw);
      expect(local.keys()).toEqual([STORAGE_KEY]);
    });
  }

  test('B1：v3-checkin → ok（內容不變）；v3-checkin-reverted-to-v2 → migrated；主 key 都不被覆寫', async () => {
    let raw = readFixture('v3-checkin.json');
    let local = withLocal(raw);
    expect(await loadState({ now: NOW })).toStrictEqual({ status: 'ok', error: null });
    expect(getState()).toStrictEqual(loadFixture('v3-checkin.json'));
    expect(local.keys()).toEqual([STORAGE_KEY]);
    raw = readFixture('v3-checkin-reverted-to-v2.json');
    local = withLocal(raw);
    expect(await loadState({ now: NOW })).toStrictEqual({ status: 'migrated', error: null });
    expect(getState().habits.sleep.log).toHaveLength(3);
    expect(getState().game.xp.move).toBe(414);
    expect(local.getItem(STORAGE_KEY)).toBe(raw);
    expect(local.keys()).toEqual([STORAGE_KEY]);
  });

  test('B1：v3-bad-sleep → repaired：原始字串存到 bak-v3，主 key 不變，壞打卡丟掉', async () => {
    const raw = readFixture('v3-bad-sleep.json');
    const local = withLocal(raw);
    const r = await loadState({ now: NOW });
    expect(r).toStrictEqual({ status: 'repaired', error: { code: 'repaired', message: MSG_REPAIRED, backupKey: 'daily-ten-state.bak-v3' } });
    expect(local.getItem('daily-ten-state.bak-v3')).toBe(raw);
    expect(local.getItem(STORAGE_KEY)).toBe(raw);
    expect(getState().habits.sleep.log.map((e) => e.date)).toEqual(['2026-10-02', '2026-10-04', '2026-10-05', '2026-10-02', '2026-10-10']);
    expect(getState().phase.startedAt).toBe(null);
    expect(getState().xp).toBe(411);
  });

  test('v2-wrong-types → repaired：原始字串存到 bak-v2，主 key 不變', async () => {
    const raw = readFixture('v2-wrong-types.json');
    const local = withLocal(raw);
    const r = await loadState({ now: NOW });
    expect(r).toStrictEqual({ status: 'repaired', error: { code: 'repaired', message: MSG_REPAIRED, backupKey: BAK2 } });
    expect(local.getItem(BAK2)).toBe(raw);
    expect(local.getItem(STORAGE_KEY)).toBe(raw);
    expect(getState().xp).toBe(120);
    expect(getState().sessions.length).toBe(6);
  });

  test('壞 JSON → recovered（parse）：備份 key 寫入原字串、主 key 未被覆寫、改用空白資料', async () => {
    const raw = readFixture('corrupt-state.txt');
    const local = withLocal(raw);
    const r = await loadState({ now: NOW });
    expect(r).toStrictEqual({ status: 'recovered', error: { code: 'parse', message: MSG_RECOVERED, backupKey: BAK2 } });
    expect(local.getItem(BAK2)).toBe(raw);
    expect(local.getItem(STORAGE_KEY)).toBe(raw);
    expect(getState()).toStrictEqual(defaultState(NOW));
  });

  test('JSON 但不是物件（null、陣列、字串、數字）→ recovered（migrate）', async () => {
    for (const raw of ['null', '[]', '"daily ten"', '42', '[{"version":2}]']) {
      const local = withLocal(raw);
      const r = await loadState({ now: NOW });
      expect(r.status).toBe('recovered');
      expect(r.error.code).toBe('migrate');
      expect(local.getItem(r.error.backupKey)).toBe(raw);
      expect(local.getItem(STORAGE_KEY)).toBe(raw);
      expect(getState()).toStrictEqual(defaultState(NOW));
    }
  });

  test('version 大於 3 → repaired，原字串存到 bak-v4', async () => {
    const s = loadFixture('v3.json');
    s.version = 4;
    const raw = JSON.stringify(s);
    const local = withLocal(raw);
    const r = await loadState({ now: NOW });
    expect(r.status).toBe('repaired');
    expect(r.error.backupKey).toBe('daily-ten-state.bak-v4');
    expect(local.getItem('daily-ten-state.bak-v4')).toBe(raw);
    expect(getState().version).toBe(3);
  });

  test('壞 JSON 的 version 由字串辨識（v3 → bak-v3），辨識不出用 2', async () => {
    const v3 = readFixture('v3.json');
    const truncated = v3.slice(0, 200);
    let local = withLocal(truncated);
    expect((await loadState({ now: NOW })).error.backupKey).toBe('daily-ten-state.bak-v3');
    expect(local.getItem('daily-ten-state.bak-v3')).toBe(truncated);
    local = withLocal('}}}garbage');
    expect((await loadState({ now: NOW })).error.backupKey).toBe(BAK2);
  });

  test('訊息為繁中，沒有用語表的「不用」詞', () => {
    for (const m of [MSG_REPAIRED, MSG_RECOVERED]) expect(findBannedWords(m)).toEqual([]);
  });
});

test.describe('loadState：備份 key 規則', () => {
  test('已存在且內容不同 → 另開 bak-v2-{YYYYMMDDHHmmss}，舊備份不動', async () => {
    const raw = readFixture('corrupt-state.txt');
    const local = new MemoryStorage({ [STORAGE_KEY]: raw, [BAK2]: 'older backup' });
    installGlobals({ local });
    const r = await loadState({ now: NOW });
    expect(r.error.backupKey).toBe('daily-ten-state.bak-v2-20261002153000');
    expect(local.getItem('daily-ten-state.bak-v2-20261002153000')).toBe(raw);
    expect(local.getItem(BAK2)).toBe('older backup');
  });

  test('內容相同就沿用；重複開 App 不會一直複製', async () => {
    const raw = readFixture('corrupt-state.txt');
    const local = new MemoryStorage({ [STORAGE_KEY]: raw, [BAK2]: raw });
    installGlobals({ local });
    expect((await loadState({ now: NOW })).error.backupKey).toBe(BAK2);
    expect(local.keys()).toEqual([STORAGE_KEY, BAK2]);

    const local2 = new MemoryStorage({ [STORAGE_KEY]: raw, [BAK2]: 'older backup' });
    installGlobals({ local: local2 });
    const first = await loadState({ now: NOW });
    const second = await loadState({ now: new Date('2026-10-03T08:00:00+09:00') });
    const third = await loadState({ now: new Date('2026-10-04T08:00:00+09:00') });
    expect(second.error.backupKey).toBe(first.error.backupKey);
    expect(third.error.backupKey).toBe(first.error.backupKey);
    expect(local2.keys()).toEqual([STORAGE_KEY, BAK2, 'daily-ten-state.bak-v2-20261002153000']);
  });

  test('同一秒內再衝突 → 加 -2 後綴', async () => {
    const raw = readFixture('corrupt-state.txt');
    const local = new MemoryStorage({ [STORAGE_KEY]: raw, [BAK2]: 'a', 'daily-ten-state.bak-v2-20261002153000': 'b' });
    installGlobals({ local });
    expect((await loadState({ now: NOW })).error.backupKey).toBe('daily-ten-state.bak-v2-20261002153000-2');
  });

  test('另存失敗（容量不足）→ 改用空白資料，backupKey 指向主 key，提示先下載', async () => {
    const raw = readFixture('corrupt-state.txt');
    const local = withLocal(raw);
    local.failWrites = true;
    const r = await loadState({ now: NOW });
    expect(r.status).toBe('recovered');
    expect(r.error.backupKey).toBe(STORAGE_KEY);
    expect(r.error.message).toBe('讀取資料時發生問題，已改用空白資料。原始資料另存失敗，請先下載保存再繼續記錄。');
    expect(local.getItem(STORAGE_KEY)).toBe(raw);
  });

  test('BACKUP_KEY_PREFIX', () => {
    expect(BACKUP_KEY_PREFIX).toBe('daily-ten-state.bak-v');
  });
});

test.describe('loadState：讀取順序（window.storage 優先）', () => {
  test('window.storage 有值就用它', async () => {
    const ws = new WindowStorage({ [STORAGE_KEY]: readFixture('v3.json') });
    const local = new MemoryStorage({ [STORAGE_KEY]: readFixture('v2-real.json') });
    installGlobals({ local, windowStorage: ws });
    expect(await loadState({ now: NOW })).toStrictEqual({ status: 'ok', error: null });
    expect(getState().xp).toBe(396);
  });

  test('window.storage 沒有值 → localStorage', async () => {
    installGlobals({ local: new MemoryStorage({ [STORAGE_KEY]: readFixture('v2-real.json') }), windowStorage: new WindowStorage() });
    expect((await loadState({ now: NOW })).status).toBe('migrated');
    expect(getState().xp).toBe(361);
  });

  test('window.storage 讀取丟例外 → localStorage', async () => {
    const ws = new WindowStorage({ [STORAGE_KEY]: readFixture('v3.json') });
    ws.failGet = true;
    installGlobals({ local: new MemoryStorage({ [STORAGE_KEY]: readFixture('v2-real.json') }), windowStorage: ws });
    expect((await loadState({ now: NOW })).status).toBe('migrated');
    expect(getState().xp).toBe(361);
  });

  test('window.storage 內容壞掉、localStorage 正常 → 用 localStorage，壞的那份另存（repaired）', async () => {
    const corrupt = readFixture('corrupt-state.txt');
    const local = new MemoryStorage({ [STORAGE_KEY]: readFixture('v2-real.json') });
    installGlobals({ local, windowStorage: new WindowStorage({ [STORAGE_KEY]: corrupt }) });
    const r = await loadState({ now: NOW });
    expect(r.status).toBe('repaired');
    expect(r.error.backupKey).toBe(BAK2);
    expect(local.getItem(BAK2)).toBe(corrupt);
    expect(getState().xp).toBe(361);
  });
});

test.describe('saveState', () => {
  test('先 mirror 再寫入 window.storage 與 localStorage', async () => {
    const ws = new WindowStorage();
    const local = new MemoryStorage({ [STORAGE_KEY]: readFixture('v2-real.json') });
    installGlobals({ local, windowStorage: ws });
    await loadState({ now: NOW });
    /* 模擬既有畫面的 recordSession：只動 legacy 欄位 */
    const s = getState();
    s.sessions.push({ date: '2026-09-29', type: 'full', xp: 10 });
    s.xp += 10;
    s.streak.current += 1;
    s.streak.lastDate = '2026-09-29';
    expect(await saveState()).toBe(true);
    const saved = JSON.parse(local.getItem(STORAGE_KEY));
    expect(saved.version).toBe(3);
    expect(saved.xp).toBe(371);
    expect(saved.game.xp).toStrictEqual({ move: 371, sleep: 0, explore: 0, total: 371 });
    expect(saved.game.streaks.train).toStrictEqual({ current: 10, best: 11, lastDate: '2026-09-29' });
    expect(saved.game.streaks.life).toStrictEqual({ current: 10, best: 11, lastDate: '2026-09-29' });
    expect(ws.map.get(STORAGE_KEY)).toBe(local.getItem(STORAGE_KEY));
    expect(getState().game.xp.move).toBe(371); // 記憶體中的 state 也已同步
  });

  test('寫入失敗 → false，console.error 原字串', async () => {
    const local = withLocal(readFixture('v3.json'));
    await loadState({ now: NOW });
    local.failWrites = true;
    const logged = [];
    const orig = console.error;
    console.error = (...a) => logged.push(a.join(' '));
    try {
      expect(await saveState()).toBe(false);
    } finally {
      console.error = orig;
    }
    expect(logged).toEqual(['儲存失敗：資料僅存在記憶體中']);
  });

  test('state 還沒載入（null）→ false，不寫入任何東西', async () => {
    const local = withLocal(readFixture('v3.json'));
    setState(null);
    const orig = console.error;
    console.error = () => {};
    try {
      expect(await saveState()).toBe(false);
    } finally {
      console.error = orig;
    }
    expect(local.getItem(STORAGE_KEY)).toBe(readFixture('v3.json'));
  });

  test('recovered 之後第一次儲存才覆寫主 key；備份 key 保留原字串', async () => {
    const raw = readFixture('corrupt-state.txt');
    const local = withLocal(raw);
    await loadState({ now: NOW });
    expect(await saveState()).toBe(true);
    expect(JSON.parse(local.getItem(STORAGE_KEY)).version).toBe(3);
    expect(local.getItem(BAK2)).toBe(raw);
  });
});

test.describe('migrateState／getState／setState', () => {
  test('migrateState：回傳新物件，不改動輸入；失敗回 null 不丟例外', () => {
    const raw = loadFixture('v2-real.json');
    const before = JSON.stringify(raw);
    const s = migrateState(raw);
    expect(s).not.toBe(raw);
    expect(s.version).toBe(3);
    expect(s.game.xp.move).toBe(361);
    expect(JSON.stringify(raw)).toBe(before);
    for (const bad of [null, undefined, 'text', 42, []]) expect(migrateState(bad)).toBe(null);
    const hostile = { get version() { throw new Error('boom'); } };
    expect(migrateState(hostile)).toBe(null);
  });

  test('setState 換掉記憶體中的 state', () => {
    const next = defaultState(NOW);
    setState(next);
    expect(getState()).toBe(next);
  });
});
