/* data-guardian：V2a 遊戲進度標記單元測試（js/state/game.js 寫入 API、schema.js 讀取；純 Node，storage 用 shim）
   fixture：v3-checkin.json（V1，沒有 seen／deload）、v3-v2a.json（V2a 第一天）、v3-v2a-reverted-to-v2.json（D12）、
            v3-v2a-bad-fields.json（新欄位的壞值） */
import { test, expect } from '@playwright/test';
import { STORAGE_KEY, loadState, getState, setState, saveState } from '../js/state/store.js';
import { LIMITS, validateImport, readSeen, readDeload, isDeloadRestored, isSeenLevel } from '../js/state/schema.js';
import { migrate } from '../js/state/migrate.js';
import { buildBackup, parseImport, applyImport } from '../js/state/backup.js';
import { addSleepEntry, removeSleepEntry } from '../js/state/habits.js';
import {
  markLevelSeen, markPerfectDaySeen, setDeloadRestored, clearDeloadRestored, ensureSeenInitialized,
  readSeen as reSeen, readDeload as reDeload, isDeloadRestored as reRestored
} from '../js/state/game.js';
import {
  readFixture, loadFixture, NOW, MemoryStorage, installGlobals, clearGlobals, useTokyoTime, findBannedWords, deepFreeze,
  CHECKIN_LOG, V2A_SEEN, V2A_DELOAD, V2A_CHECKIN, legacyRecordSession, legacyV2Migrate
} from './state.helpers.js';

useTokyoTime(test);
test.afterEach(() => clearGlobals());

const MSG = {
  level: '等級應為 1–100,000 的整數',
  date: '日期格式不正確（應為 YYYY-MM-DD）',
  options: '初始化選項格式不正確（應為物件，例如 {perfectDayDone: true}）',
  perfectDayDone: '今天是否已完成 Perfect Day（perfectDayDone）應為 true 或 false',
  notLoaded: '資料還沒載入完成，請重新開啟 App 再試一次',
  corrupt: '遊戲進度的資料格式異常，請重新開啟 App 再試一次',
  error: '寫入失敗，請再試一次'
};
const MSG_REPAIRED = '部分資料格式異常，已自動修復。原始資料已另存，可下載保存。';
const DAY1 = new Date('2026-10-05T06:40:00+09:00'); // V2a 第一次開啟

/* 載入 fixture；local.writes 記錄每一次 setItem 的 key（證明「沒有寫入」） */
async function loadWith(name, now = NOW) {
  const local = new MemoryStorage(name ? { [STORAGE_KEY]: readFixture(name) } : {});
  local.writes = [];
  const setItem = local.setItem.bind(local);
  local.setItem = (k, v) => { local.writes.push(String(k)); setItem(k, v); };
  installGlobals({ local });
  const load = await loadState({ now });
  return { local, load };
}
const stored = (local) => JSON.parse(local.getItem(STORAGE_KEY));
const noSaved = ({ saved, ...rest }) => rest; // eslint-disable-line no-unused-vars
const game = () => getState().game;

/* UI 規則（js/state/game.js 檔頭）：engine 不判斷看過沒，UI 拿 summary 和 readSeen 比 */
const levelCard = (lv) => { const s = readSeen(getState()); return s.level !== null && lv > s.level; };
const celebrate = (date) => { const s = readSeen(getState()); return s.perfectDay !== null && date > s.perfectDay; };

test.describe('讀取（schema.js 純函式；game.js 原樣 re-export）', () => {
  test('正常值原樣讀出；回傳新物件，改它不影響 state；不改動傳入的 state', () => {
    const s = deepFreeze(loadFixture('v3-v2a.json'));
    const seen = readSeen(s);
    expect(seen).toStrictEqual(V2A_SEEN);
    expect(seen).not.toBe(s.game.seen);
    expect(readDeload(s)).toStrictEqual(V2A_DELOAD);
    expect(readDeload(s)).not.toBe(s.game.deload);
    expect(isDeloadRestored(s, '2026-10-05')).toBe(true);
    expect(isDeloadRestored(s, '2026-10-06')).toBe(false);
    expect([reSeen, reDeload, reRestored]).toStrictEqual([readSeen, readDeload, isDeloadRestored]);
  });

  test('沒有欄位（V1 以前的資料）→ 全部 null', () => {
    for (const name of ['v1-minimal.json', 'v2-real.json', 'v3.json', 'v3-checkin.json']) {
      const s = loadFixture(name);
      expect(readSeen(s), name).toStrictEqual({ level: null, perfectDay: null });
      expect(readDeload(s), name).toStrictEqual({ restoredOn: null });
      expect(isDeloadRestored(s, '2026-10-05'), name).toBe(false);
    }
  });

  test('形狀不對一律當成 null（state、game、seen、deload、子欄位），讀取時丟例外也不丟出', () => {
    const base = () => loadFixture('v3-v2a.json');
    for (const state of [null, undefined, 'x', 42, [], { game: null }, { game: 'x' }, { game: [] }]) {
      expect(readSeen(state)).toStrictEqual({ level: null, perfectDay: null });
      expect(readDeload(state)).toStrictEqual({ restoredOn: null });
    }
    for (const seen of [null, 'x', 7, [], [7, '2026-10-05'], true]) {
      const s = base();
      s.game.seen = seen;
      expect(readSeen(s), JSON.stringify(seen)).toStrictEqual({ level: null, perfectDay: null });
    }
    for (const level of ['7', 0, -1, 2.5, 100001, NaN, Infinity, null, true, {}]) {
      const s = base();
      s.game.seen.level = level;
      expect(readSeen(s), String(level)).toStrictEqual({ level: null, perfectDay: '2026-10-05' });
    }
    for (const day of ['2026/10/05', '2026-10-5', '2026-02-30', '2026-10-05T07:00:00+09:00', 20261005, null, '']) {
      const s = base();
      s.game.seen.perfectDay = day;
      s.game.deload.restoredOn = day;
      expect(readSeen(s), String(day)).toStrictEqual({ level: 7, perfectDay: null });
      expect(readDeload(s), String(day)).toStrictEqual({ restoredOn: null });
      expect(isDeloadRestored(s, '2026-10-05')).toBe(false);
    }
    for (const deload of [null, '2026-10-05', [], 1]) {
      const s = base();
      s.game.deload = deload;
      expect(readDeload(s), JSON.stringify(deload)).toStrictEqual({ restoredOn: null });
    }
    const hostile = { game: { get seen() { throw new Error('boom'); }, get deload() { throw new Error('boom'); } } };
    expect(readSeen(hostile)).toStrictEqual({ level: null, perfectDay: null });
    expect(readDeload(hostile)).toStrictEqual({ restoredOn: null });
    expect(isDeloadRestored(hostile, '2026-10-05')).toBe(false);
  });

  test('isDeloadRestored：date 無效 → false（即使 restoredOn 也是同一個怪值，或兩邊都沒有值）', () => {
    const s = loadFixture('v3-v2a.json');
    for (const d of [undefined, null, '', '2026/10/05', 20261005]) expect(isDeloadRestored(s, d), String(d)).toBe(false);
    s.game.deload.restoredOn = 'today';
    expect(isDeloadRestored(s, 'today')).toBe(false);
    s.game.deload.restoredOn = null; // 沒有恢復＋engine 算不出今天（null）→ 不是「已恢復」
    expect(isDeloadRestored(s, null)).toBe(false);
    expect(isDeloadRestored(loadFixture('v3-checkin.json'), null)).toBe(false);
    expect(isDeloadRestored(loadFixture('v3-checkin.json'), undefined)).toBe(false);
  });

  test('isSeenLevel 邊界：1–100,000 的整數', () => {
    expect(LIMITS.gameLevel).toBe(100000);
    for (const ok of [1, 2, 7, 99999, 100000]) expect(isSeenLevel(ok), String(ok)).toBe(true);
    for (const bad of [0, -1, 100001, 2.5, '7', NaN, Infinity, -Infinity, null, undefined, true, [7], {}]) expect(isSeenLevel(bad), String(bad)).toBe(false);
  });
});

test.describe('ensureSeenInitialized（V2a 第一次開啟）', () => {
  test('v3-checkin（V1 資料，沒有 seen）：level = 目前等級、perfectDay = 昨天；只改記憶體、不寫 storage', async () => {
    const { local, load } = await loadWith('v3-checkin.json', DAY1);
    expect(load).toStrictEqual({ status: 'ok', error: null });
    expect('seen' in game()).toBe(false); // 載入不新增欄位
    const r = ensureSeenInitialized(7, '2026-10-05');
    expect(r).toStrictEqual({ ok: true, changed: true, seen: { level: 7, perfectDay: '2026-10-04' } });
    expect(game().seen).toStrictEqual({ level: 7, perfectDay: '2026-10-04' });
    expect(Object.keys(game()).slice(-1)).toEqual(['seen']); // 加在 game 最後，其他欄位順序不動
    expect(local.writes).toEqual([]);
    expect(local.getItem(STORAGE_KEY)).toBe(readFixture('v3-checkin.json'));
    r.seen.level = 99; // 回傳的是複本
    expect(game().seen.level).toBe(7);
    expect(validateImport(getState())).toEqual({ ok: true });
  });

  test('冪等、已有值不覆寫（換等級、換日期再呼叫都一樣）', async () => {
    const { local } = await loadWith('v3-checkin.json', DAY1);
    ensureSeenInitialized(7, '2026-10-05');
    const before = JSON.stringify(getState());
    for (const [lv, today] of [[7, '2026-10-05'], [9, '2026-10-05'], [3, '2026-10-20'], [7, '2025-01-01']]) {
      expect(ensureSeenInitialized(lv, today)).toStrictEqual({ ok: true, changed: false, seen: { level: 7, perfectDay: '2026-10-04' } });
    }
    expect(JSON.stringify(getState())).toBe(before);
    expect(local.writes).toEqual([]);
  });

  test('只補 null 的那一個；不認得的欄位保留', async () => {
    await loadWith('v3-checkin.json', DAY1);
    game().seen = { level: 9, perfectDay: null, note: 'keep' };
    expect(ensureSeenInitialized(7, '2026-10-05')).toStrictEqual({ ok: true, changed: true, seen: { level: 9, perfectDay: '2026-10-04' } });
    expect(game().seen).toStrictEqual({ level: 9, perfectDay: '2026-10-04', note: 'keep' });
    game().seen = { level: null, perfectDay: '2026-10-05' };
    expect(ensureSeenInitialized(7, '2026-10-06')).toStrictEqual({ ok: true, changed: true, seen: { level: 7, perfectDay: '2026-10-05' } });
    game().seen = { perfectDay: '2026-10-01' }; // 缺 level（手動改過的資料）
    expect(ensureSeenInitialized(8, '2026-10-06').seen).toStrictEqual({ level: 8, perfectDay: '2026-10-01' });
    game().seen = { level: 'abc', perfectDay: 20261005 }; // 記憶體中的怪值 = 沒有值，寫成正規化後的值
    expect(ensureSeenInitialized(8, '2026-10-06').seen).toStrictEqual({ level: 8, perfectDay: '2026-10-05' });
    expect(game().seen).toStrictEqual({ level: 8, perfectDay: '2026-10-05' });
    game().seen = 'garbage';
    expect(ensureSeenInitialized(8, '2026-10-06').seen).toStrictEqual({ level: 8, perfectDay: '2026-10-05' });
    expect(game().seen).toStrictEqual({ level: 8, perfectDay: '2026-10-05' });
  });

  test('不補發：今天之前的 Perfect Day、目前等級以下的升級卡都不出現；今天的 Perfect Day、下一級照常（各一次）', async () => {
    await loadWith('v3-checkin.json', DAY1); // 10-02、10-03 有訓練＋打卡（V1 時代的 Perfect Day）
    ensureSeenInitialized(7, '2026-10-05');
    for (const d of ['2026-10-02', '2026-10-03', '2026-10-04']) expect(celebrate(d), d).toBe(false);
    for (const lv of [1, 6, 7]) expect(levelCard(lv), String(lv)).toBe(false);
    expect(celebrate('2026-10-05')).toBe(true);
    expect(levelCard(8)).toBe(true);
    markPerfectDaySeen('2026-10-05');
    markLevelSeen(8);
    expect(celebrate('2026-10-05')).toBe(false); // 同一天不再播
    expect(levelCard(8)).toBe(false);            // 同一級不再出現
    expect(celebrate('2026-10-06')).toBe(true);
    expect(levelCard(9)).toBe(true);
  });

  test('{perfectDayDone: true}（開啟當下今天的 Perfect Day 已完成，例如舊版 App 先記好）→ perfectDay = 今天：不補播、不寫入', async () => {
    /* v3-checkin-reverted-to-v2：10-04 有打卡（V1）＋保底（舊版 App）→ 開啟時今天已是 Perfect Day */
    const { local, load } = await loadWith('v3-checkin-reverted-to-v2.json', new Date('2026-10-04T07:30:00+09:00'));
    expect(load.status).toBe('migrated');
    const r = ensureSeenInitialized(7, '2026-10-04', { perfectDayDone: true });
    expect(r).toStrictEqual({ ok: true, changed: true, seen: { level: 7, perfectDay: '2026-10-04' } });
    expect(celebrate('2026-10-04')).toBe(false); // 開啟之前完成的不補播 → UI 不會呼叫 markPerfectDaySeen
    expect(celebrate('2026-10-05')).toBe(true);
    expect(local.writes).toEqual([]);
    expect(local.getItem(STORAGE_KEY)).toBe(readFixture('v3-checkin-reverted-to-v2.json'));
    /* 已初始化之後，perfectDayDone 不影響任何東西（已有值不覆寫） */
    expect(ensureSeenInitialized(7, '2026-10-04', { perfectDayDone: false }).changed).toBe(false);
    expect(ensureSeenInitialized(7, '2026-10-05', { perfectDayDone: true }).changed).toBe(false);
    expect(game().seen).toStrictEqual({ level: 7, perfectDay: '2026-10-04' });
  });

  test('perfectDayDone 省略、null、false、選項是 null → 前一天；格式不對 → invalid（options／perfectDayDone），state 不變', async () => {
    for (const opts of [undefined, null, {}, { perfectDayDone: false }, { perfectDayDone: null }, { other: true }]) {
      await loadWith('v3-checkin.json', DAY1);
      expect(ensureSeenInitialized(7, '2026-10-05', opts).seen, JSON.stringify(opts)).toStrictEqual({ level: 7, perfectDay: '2026-10-04' });
    }
    const { local } = await loadWith('v3-checkin.json', DAY1);
    const before = JSON.stringify(getState());
    for (const opts of ['x', 1, true, [], [true]]) {
      expect(ensureSeenInitialized(7, '2026-10-05', opts), JSON.stringify(opts)).toStrictEqual({ ok: false, code: 'invalid', field: 'options', message: MSG.options });
    }
    for (const done of ['true', 1, 0, {}, []]) {
      expect(ensureSeenInitialized(7, '2026-10-05', { perfectDayDone: done }), JSON.stringify(done))
        .toStrictEqual({ ok: false, code: 'invalid', field: 'perfectDayDone', message: MSG.perfectDayDone });
    }
    expect(JSON.stringify(getState())).toBe(before);
    expect(local.writes).toEqual([]);
  });

  test('下一次任何 saveState（例如打卡）一併寫入；重新開 App 之後不再改變', async () => {
    const { local } = await loadWith('v3-checkin.json', DAY1);
    ensureSeenInitialized(7, '2026-10-05');
    const r = addSleepEntry({ ...V2A_CHECKIN, target: { ...V2A_CHECKIN.target } });
    expect(await r.saved).toBe(true);
    expect(stored(local).game.seen).toStrictEqual({ level: 7, perfectDay: '2026-10-04' });
    installGlobals({ local });
    expect(await loadState({ now: new Date('2026-10-09T07:00:00+09:00') })).toStrictEqual({ status: 'ok', error: null });
    expect(ensureSeenInitialized(9, '2026-10-09')).toStrictEqual({ ok: true, changed: false, seen: { level: 7, perfectDay: '2026-10-04' } });
  });

  test('沒有存檔就重開 App：storage 沒有 seen → 以那次開啟的等級重新初始化（之前沒有看過任何卡，不算補發）', async () => {
    const { local } = await loadWith('v3-checkin.json', DAY1);
    ensureSeenInitialized(7, '2026-10-05');
    installGlobals({ local });
    await loadState({ now: new Date('2026-10-06T07:00:00+09:00') });
    expect('seen' in game()).toBe(false);
    expect(ensureSeenInitialized(7, '2026-10-06').seen).toStrictEqual({ level: 7, perfectDay: '2026-10-05' });
    expect(local.writes).toEqual([]);
  });

  test('fresh（沒有資料）：Lv 1、昨天；仍然不寫入', async () => {
    const { local, load } = await loadWith(null, DAY1);
    expect(load.status).toBe('fresh');
    expect(ensureSeenInitialized(1, '2026-10-05')).toStrictEqual({ ok: true, changed: true, seen: { level: 1, perfectDay: '2026-10-04' } });
    expect(local.writes).toEqual([]);
  });

  test('跨月、跨年、閏年的「昨天」', async () => {
    for (const [today, before] of [['2026-11-01', '2026-10-31'], ['2027-01-01', '2026-12-31'], ['2028-03-01', '2028-02-29'], ['2026-03-01', '2026-02-28']]) {
      await loadWith('v3-checkin.json');
      expect(ensureSeenInitialized(7, today).seen.perfectDay, today).toBe(before);
    }
  });

  test('參數不對 → invalid（field level／today），state 不變', async () => {
    const { local } = await loadWith('v3-checkin.json', DAY1);
    const before = JSON.stringify(getState());
    for (const lv of [0, -1, 2.5, '7', null, undefined, NaN, Infinity, 100001, [7], { lv: 7 }]) {
      expect(ensureSeenInitialized(lv, '2026-10-05'), String(lv)).toStrictEqual({ ok: false, code: 'invalid', field: 'level', message: MSG.level });
    }
    for (const today of [undefined, null, '', '2026/10/05', '2026-10-5', '2026-02-30', 20261005, '2026-10-05T07:00:00+09:00', new Date(), '0000-01-01']) {
      expect(ensureSeenInitialized(7, today), String(today)).toStrictEqual({ ok: false, code: 'invalid', field: 'today', message: MSG.date });
    }
    expect(JSON.stringify(getState())).toBe(before);
    expect(local.writes).toEqual([]);
  });

  test('還沒載入 → not_loaded；game 不是物件 → corrupt（不建立、不改動）；讀取丟例外 → error', async () => {
    await loadWith('v3-checkin.json');
    setState(null);
    expect(ensureSeenInitialized(7, '2026-10-05')).toStrictEqual({ ok: false, code: 'not_loaded', message: MSG.notLoaded });
    for (const g of [undefined, null, 'x', []]) {
      const s = loadFixture('v3-checkin.json');
      s.game = g;
      setState(s);
      expect(ensureSeenInitialized(7, '2026-10-05'), String(g)).toStrictEqual({ ok: false, code: 'corrupt', message: MSG.corrupt });
      expect(s.game).toBe(g);
    }
    setState({ ...loadFixture('v3-checkin.json'), game: { set seen(v) { throw new Error('boom'); }, get seen() { return null; } } });
    expect(ensureSeenInitialized(7, '2026-10-05')).toStrictEqual({ ok: false, code: 'error', message: MSG.error });
  });

  test('recovered 且另存失敗（主 key 是原始資料唯一的副本）：初始化不寫主 key', async () => {
    const raw = readFixture('corrupt-state.txt');
    const local = new MemoryStorage({ [STORAGE_KEY]: raw });
    const setItem = local.setItem.bind(local);
    local.setItem = (k, v) => {
      if (String(k).startsWith('daily-ten-state.bak')) { const e = new Error('quota'); e.name = 'QuotaExceededError'; throw e; }
      setItem(k, v);
    };
    installGlobals({ local });
    const load = await loadState({ now: DAY1 });
    expect(load.status).toBe('recovered');
    expect(load.error.backupKey).toBe(STORAGE_KEY);
    expect(ensureSeenInitialized(1, '2026-10-05').ok).toBe(true);
    expect(local.getItem(STORAGE_KEY)).toBe(raw);
  });
});

test.describe('markLevelSeen', () => {
  test('只增不減：比已看等級高才寫入並儲存；相同或更低 → changed:false、不寫入', async () => {
    const { local } = await loadWith('v3-v2a.json');
    const up = markLevelSeen(8);
    expect(noSaved(up)).toStrictEqual({ ok: true, changed: true, seen: { level: 8, perfectDay: '2026-10-05' } });
    expect(await up.saved).toBe(true);
    expect(stored(local).game.seen).toStrictEqual({ level: 8, perfectDay: '2026-10-05' });
    expect(stored(local)).toStrictEqual(getState());
    local.writes.length = 0;
    for (const lv of [8, 7, 1]) {
      const r = markLevelSeen(lv);
      expect(noSaved(r), String(lv)).toStrictEqual({ ok: true, changed: false, seen: { level: 8, perfectDay: '2026-10-05' } });
      expect(await r.saved).toBe(true);
    }
    expect(local.writes).toEqual([]);
    const jump = markLevelSeen(11); // 一次跳兩級以上：只記最高的
    expect(jump.seen).toStrictEqual({ level: 11, perfectDay: '2026-10-05' });
    expect(markLevelSeen(100000).changed).toBe(true);
    up.seen.level = 1; // 回傳的是複本
    expect(game().seen.level).toBe(100000);
  });

  test('還沒初始化也可以：建立 seen（perfectDay 維持 null，之後由 ensureSeenInitialized 補）', async () => {
    const { local } = await loadWith('v3-checkin.json');
    const r = markLevelSeen(8);
    expect(noSaved(r)).toStrictEqual({ ok: true, changed: true, seen: { level: 8, perfectDay: null } });
    expect(await r.saved).toBe(true);
    expect(stored(local).game.seen).toStrictEqual({ level: 8, perfectDay: null });
    expect(validateImport(stored(local))).toEqual({ ok: true });
    expect(ensureSeenInitialized(7, '2026-10-05').seen).toStrictEqual({ level: 8, perfectDay: '2026-10-04' });
  });

  test('保留 seen 內不認得的欄位；記憶體中的怪值寫成 null（不會存下格式錯的值）', async () => {
    const { local } = await loadWith('v3-v2a.json');
    game().seen.extra = { keep: true };
    game().seen.perfectDay = '2026/10/05';
    expect(markLevelSeen(8).seen).toStrictEqual({ level: 8, perfectDay: null });
    expect(stored(local).game.seen).toStrictEqual({ level: 8, perfectDay: null, extra: { keep: true } });
    expect(validateImport(stored(local))).toEqual({ ok: true });
  });

  test('參數不對 → invalid；還沒載入 → not_loaded；game 壞掉 → corrupt；都不寫入', async () => {
    const { local } = await loadWith('v3-v2a.json');
    const before = JSON.stringify(getState());
    for (const lv of [0, -3, 7.5, '8', null, undefined, NaN, Infinity, 100001, true]) {
      const r = markLevelSeen(lv);
      expect(r, String(lv)).toStrictEqual({ ok: false, code: 'invalid', field: 'level', message: MSG.level });
      expect(findBannedWords(r.message)).toEqual([]);
    }
    expect(JSON.stringify(getState())).toBe(before);
    setState(null);
    expect(markLevelSeen(8)).toStrictEqual({ ok: false, code: 'not_loaded', message: MSG.notLoaded });
    const s = loadFixture('v3-v2a.json');
    s.game = 'x';
    setState(s);
    expect(markLevelSeen(8)).toStrictEqual({ ok: false, code: 'corrupt', message: MSG.corrupt });
    expect(s.game).toBe('x');
    expect(local.writes).toEqual([]);
  });

  test('儲存失敗（容量不足）→ ok 仍為 true、saved = false，資料留在記憶體', async () => {
    const { local } = await loadWith('v3-v2a.json');
    local.failWrites = true;
    const orig = console.error;
    console.error = () => {};
    let r;
    try {
      r = markLevelSeen(8);
      expect(r.ok).toBe(true);
      expect(await r.saved).toBe(false);
    } finally {
      console.error = orig;
    }
    expect(game().seen.level).toBe(8);
    expect(local.getItem(STORAGE_KEY)).toBe(readFixture('v3-v2a.json'));
  });
});

test.describe('markPerfectDaySeen', () => {
  test('比已處理的日期晚才寫入；同一天或更早 → changed:false、不寫入', async () => {
    const { local } = await loadWith('v3-v2a.json');
    for (const d of ['2026-10-05', '2026-10-04', '2026-01-01']) {
      const r = markPerfectDaySeen(d);
      expect(noSaved(r), d).toStrictEqual({ ok: true, changed: false, seen: V2A_SEEN });
      expect(await r.saved).toBe(true);
    }
    expect(local.writes).toEqual([]);
    const r = markPerfectDaySeen('2026-10-06');
    expect(noSaved(r)).toStrictEqual({ ok: true, changed: true, seen: { level: 7, perfectDay: '2026-10-06' } });
    expect(await r.saved).toBe(true);
    expect(stored(local).game.seen).toStrictEqual({ level: 7, perfectDay: '2026-10-06' });
    expect(markPerfectDaySeen('2026-12-31').seen.perfectDay).toBe('2026-12-31');
    expect(markPerfectDaySeen('2027-01-01').seen.perfectDay).toBe('2027-01-01'); // 跨年：字串比較也正確
  });

  test('還沒初始化也可以：建立 seen（level 維持 null，之後由 ensureSeenInitialized 補）', async () => {
    const { local } = await loadWith('v3-checkin.json');
    expect(noSaved(markPerfectDaySeen('2026-10-05'))).toStrictEqual({ ok: true, changed: true, seen: { level: null, perfectDay: '2026-10-05' } });
    expect(stored(local).game.seen).toStrictEqual({ level: null, perfectDay: '2026-10-05' });
    expect(ensureSeenInitialized(7, '2026-10-05').seen).toStrictEqual({ level: 7, perfectDay: '2026-10-05' });
  });

  test('參數不對 → invalid（field date）；還沒載入、game 壞掉 → not_loaded／corrupt；都不寫入', async () => {
    const { local } = await loadWith('v3-v2a.json');
    for (const d of [undefined, null, '', '2026/10/06', '2026-10-6', '2026-13-01', 20261006, '2026-10-06T07:00:00+09:00', new Date()]) {
      expect(markPerfectDaySeen(d), String(d)).toStrictEqual({ ok: false, code: 'invalid', field: 'date', message: MSG.date });
    }
    setState(null);
    expect(markPerfectDaySeen('2026-10-06').code).toBe('not_loaded');
    setState({ ...loadFixture('v3-v2a.json'), game: null });
    expect(markPerfectDaySeen('2026-10-06').code).toBe('corrupt');
    expect(local.writes).toEqual([]);
  });
});

test.describe('setDeloadRestored／clearDeloadRestored（D6「恢復 L{n}」與復原）', () => {
  test('恢復 → 復原 → 再恢復：每一步都儲存、isDeloadRestored 跟著變；復原後 state 與 storage 回到恢復前', async () => {
    const { local } = await loadWith('v3-checkin.json');
    await saveState(); // 先存一次，讓 storage 與記憶體同步（載入不寫主 key）
    const before = JSON.stringify(getState());
    const set = setDeloadRestored('2026-10-05');
    expect(noSaved(set)).toStrictEqual({ ok: true, changed: true, deload: { restoredOn: '2026-10-05' } });
    expect(await set.saved).toBe(true);
    expect(stored(local).game.deload).toStrictEqual({ restoredOn: '2026-10-05' });
    expect(isDeloadRestored(getState(), '2026-10-05')).toBe(true);
    const undo = clearDeloadRestored('2026-10-05');
    expect(noSaved(undo)).toStrictEqual({ ok: true, changed: true, deload: { restoredOn: null } });
    expect(await undo.saved).toBe(true);
    expect(isDeloadRestored(getState(), '2026-10-05')).toBe(false);
    const after = JSON.parse(before);
    after.game.deload = { restoredOn: null }; // 欄位留著（null），其他完全不變
    expect(stored(local)).toStrictEqual(after);
    expect(setDeloadRestored('2026-10-05').changed).toBe(true);
    expect(stored(local).game.deload).toStrictEqual({ restoredOn: '2026-10-05' });
  });

  test('同一天再按 → 不寫入；別天 → 直接取代（恢復只對當天有效）', async () => {
    const { local } = await loadWith('v3-v2a.json');
    const same = setDeloadRestored('2026-10-05');
    expect(noSaved(same)).toStrictEqual({ ok: true, changed: false, deload: V2A_DELOAD });
    expect(local.writes).toEqual([]);
    const next = setDeloadRestored('2026-10-07');
    expect(next.deload).toStrictEqual({ restoredOn: '2026-10-07' });
    expect(await next.saved).toBe(true);
    expect(isDeloadRestored(getState(), '2026-10-05')).toBe(false);
    expect(isDeloadRestored(getState(), '2026-10-07')).toBe(true);
    expect(setDeloadRestored('2026-10-06').deload).toStrictEqual({ restoredOn: '2026-10-06' }); // 時鐘往回也照記
  });

  test('復原：不是那一天、沒有恢復過 → changed:false、不寫入、不建立 deload；連按兩次不會出錯', async () => {
    const { local } = await loadWith('v3-v2a.json');
    expect(noSaved(clearDeloadRestored('2026-10-06'))).toStrictEqual({ ok: true, changed: false, deload: V2A_DELOAD });
    expect(local.writes).toEqual([]);
    expect(clearDeloadRestored('2026-10-05').changed).toBe(true);
    const twice = clearDeloadRestored('2026-10-05');
    expect(noSaved(twice)).toStrictEqual({ ok: true, changed: false, deload: { restoredOn: null } });
    expect(await twice.saved).toBe(true);
    const fresh = await loadWith('v3-checkin.json');
    expect(noSaved(clearDeloadRestored('2026-10-05'))).toStrictEqual({ ok: true, changed: false, deload: { restoredOn: null } });
    expect('deload' in game()).toBe(false);
    expect(fresh.local.writes).toEqual([]);
  });

  test('保留 deload 內不認得的欄位', async () => {
    const { local } = await loadWith('v3-v2a.json');
    game().deload.from = 3;
    setDeloadRestored('2026-10-06');
    expect(stored(local).game.deload).toStrictEqual({ restoredOn: '2026-10-06', from: 3 });
    clearDeloadRestored('2026-10-06');
    expect(stored(local).game.deload).toStrictEqual({ restoredOn: null, from: 3 });
  });

  test('參數不對 → invalid（field date）；還沒載入、game 壞掉 → not_loaded／corrupt；讀取丟例外 → error；都不寫入', async () => {
    const { local } = await loadWith('v3-v2a.json');
    for (const fn of [setDeloadRestored, clearDeloadRestored]) {
      for (const d of [undefined, null, '', 'today', '2026-10-32', 20261005, '2026-10-05T07:00:00+09:00']) {
        expect(fn(d), `${fn.name} ${String(d)}`).toStrictEqual({ ok: false, code: 'invalid', field: 'date', message: MSG.date });
      }
    }
    expect(getState().game.deload).toStrictEqual(V2A_DELOAD);
    setState(null);
    expect(setDeloadRestored('2026-10-06').code).toBe('not_loaded');
    expect(clearDeloadRestored('2026-10-05').code).toBe('not_loaded');
    setState({ ...loadFixture('v3-v2a.json'), game: [] });
    expect(setDeloadRestored('2026-10-06').code).toBe('corrupt');
    expect(clearDeloadRestored('2026-10-05').code).toBe('corrupt');
    setState({ ...loadFixture('v3-v2a.json'), game: { get deload() { throw new Error('boom'); } } });
    expect(setDeloadRestored('2026-10-06')).toStrictEqual({ ok: false, code: 'error', message: MSG.error });
    expect(local.writes).toEqual([]);
  });

  test('訊息為繁中，沒有用語表的「不用」詞', () => {
    for (const m of Object.values(MSG)) {
      expect(m).toMatch(/[一-鿿]/);
      expect(findBannedWords(m)).toEqual([]);
    }
  });
});

test.describe('V2a fixture', () => {
  test('v3-v2a：載入 ok、內容不變、遷移是 no-op；seen／deload 正確；初始化不改變任何東西；不寫入', async () => {
    const raw = loadFixture('v3-v2a.json');
    const r = migrate(raw, { now: NOW });
    expect(r.issues).toEqual([]);
    expect(JSON.stringify(r.state)).toBe(JSON.stringify(raw));
    const { local, load } = await loadWith('v3-v2a.json', new Date('2026-10-05T20:00:00+09:00'));
    expect(load).toStrictEqual({ status: 'ok', error: null });
    expect(getState()).toStrictEqual(raw);
    expect(game().seen).toStrictEqual(V2A_SEEN);
    expect(game().deload).toStrictEqual(V2A_DELOAD);
    expect(getState().habits.sleep.log).toStrictEqual([...CHECKIN_LOG, V2A_CHECKIN]);
    expect(getState().sessions.at(-1)).toStrictEqual({ date: '2026-10-05', type: 'full', xp: 10 });
    expect(getState().xp).toBe(421);
    expect(game().xp).toStrictEqual({ move: 421, sleep: 0, explore: 0, total: 421 });
    expect(ensureSeenInitialized(7, '2026-10-05')).toStrictEqual({ ok: true, changed: false, seen: V2A_SEEN });
    expect(celebrate('2026-10-05')).toBe(false);
    expect(levelCard(7)).toBe(false);
    expect(isDeloadRestored(getState(), '2026-10-05')).toBe(true);
    expect(local.writes).toEqual([]);
  });

  test('v3-v2a = v3-checkin 之後 V2a 第一天的寫入流程（逐字、含欄位順序）', async () => {
    const { local } = await loadWith('v3-checkin.json', DAY1);
    expect(ensureSeenInitialized(7, '2026-10-05').changed).toBe(true);                       // 06:40 開 App（不寫入）
    expect(local.writes).toEqual([]);
    const ci = addSleepEntry({ ...V2A_CHECKIN, target: getState().settings });                // 06:41 早安打卡（熄燈改成 01:45）
    expect(await ci.saved).toBe(true);
    expect(await setDeloadRestored('2026-10-05').saved).toBe(true);                           // 降量 → 按「恢復 L3」
    legacyRecordSession(getState(), '2026-10-05', 'full', 10);                                // 晚上主課表（UI 的 recordSession）
    expect(await saveState()).toBe(true);
    expect(await markPerfectDaySeen('2026-10-05').saved).toBe(true);                          // Perfect Day 慶祝播完
    expect(markLevelSeen(7).changed).toBe(false);                                             // 當天沒有升級
    expect(JSON.stringify(stored(local))).toBe(JSON.stringify(loadFixture('v3-v2a.json')));
  });

  test('v3-v2a-reverted-to-v2 = 舊版 App 開啟 v3-v2a 後做一次保底（version 改回 2、只動 legacy 欄位）', () => {
    const s = legacyV2Migrate(loadFixture('v3-v2a.json'));
    legacyRecordSession(s, '2026-10-06', 'minimal', 3);
    expect(JSON.stringify(s)).toBe(JSON.stringify(loadFixture('v3-v2a-reverted-to-v2.json')));
  });

  test('D12（被舊版改回 v2）：migrated；seen／deload 原樣、不重設、不補發；訓練與打卡不重複；XP 是複製不是相加', async () => {
    const raw = loadFixture('v3-v2a-reverted-to-v2.json');
    expect(raw.version).toBe(2);
    expect(raw.xp).toBe(424);
    expect(raw.game.xp.move).toBe(421); // 舊版沒有動 game
    const { local, load } = await loadWith('v3-v2a-reverted-to-v2.json', new Date('2026-10-06T21:00:00+09:00'));
    expect(load).toStrictEqual({ status: 'migrated', error: null });
    const s = getState();
    expect(s.version).toBe(3);
    expect(s.game.seen).toStrictEqual(V2A_SEEN);
    expect(s.game.deload).toStrictEqual(V2A_DELOAD);
    expect(s.habits.sleep.log).toStrictEqual([...CHECKIN_LOG, V2A_CHECKIN]);
    expect(s.sessions.slice(-2)).toStrictEqual([{ date: '2026-10-05', type: 'full', xp: 10 }, { date: '2026-10-06', type: 'minimal', xp: 3 }]);
    expect(new Set(s.sessions.map((x) => x.date)).size).toBe(s.sessions.length);
    expect(s.xp).toBe(424);
    expect(s.game.xp).toStrictEqual({ move: 424, sleep: 0, explore: 0, total: 424 }); // 不是 421＋424
    expect(s.game.streaks.train).toStrictEqual({ current: 2, best: 14, lastDate: '2026-10-06' });
    const v2a = loadFixture('v3-v2a.json');
    for (const k of ['habits', 'goals', 'phase', 'meta', 'settings', 'prs', 'body', 'profile']) expect(s[k], k).toStrictEqual(v2a[k]);
    expect(ensureSeenInitialized(9, '2026-10-06').changed).toBe(false); // 不會被當成第一次開啟
    expect(levelCard(7)).toBe(false);
    expect(celebrate('2026-10-05')).toBe(false);
    expect(local.writes).toEqual([]);
    const again = migrate(s, { now: NOW });
    expect(again.issues).toEqual([]);
    expect(again.state.game.seen).toStrictEqual(V2A_SEEN);
  });

  test('D12 來回（每天：新版開 App、打卡、各寫入 API → 舊版開 App 記訓練 → 新版重新載入）：欄位都在、每天剛好一筆', async () => {
    const local = new MemoryStorage({ [STORAGE_KEY]: readFixture('v3-checkin.json') });
    installGlobals({ local });
    const days = [['2026-10-05', 'full', 10], ['2026-10-06', 'cycle', 15], ['2026-10-07', 'minimal', 3]];
    let lv = 7;
    for (const [date, type, xp] of days) {
      await loadState({ now: new Date(`${date}T06:40:00+09:00`) });
      ensureSeenInitialized(7, date);
      const prev = new Date(`${date}T00:00:00Z`);
      prev.setUTCDate(prev.getUTCDate() - 1);
      expect(addSleepEntry({ date, lightsOut: `${prev.toISOString().slice(0, 10)}T23:30:00+09:00`, wake: `${date}T06:50:00+09:00`, lightsOutEdited: false }).ok).toBe(true);
      if (date === '2026-10-05') expect(setDeloadRestored(date).ok).toBe(true);
      expect(markPerfectDaySeen(date).ok).toBe(true);
      lv += 1;
      expect(markLevelSeen(lv).ok).toBe(true);
      await saveState();
      const old = legacyV2Migrate(JSON.parse(local.getItem(STORAGE_KEY))); // 舊版 App 開啟、記訓練
      legacyRecordSession(old, date, type, xp);
      local.setItem(STORAGE_KEY, JSON.stringify(old));
      expect(old.version).toBe(2);
    }
    const load = await loadState({ now: new Date('2026-10-08T06:40:00+09:00') });
    expect(load).toStrictEqual({ status: 'migrated', error: null });
    expect(game().seen).toStrictEqual({ level: 10, perfectDay: '2026-10-07' });
    expect(game().deload).toStrictEqual({ restoredOn: '2026-10-05' });
    const log = getState().habits.sleep.log;
    expect(log.map((e) => e.date)).toEqual(['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07']);
    expect(new Set(getState().sessions.map((x) => x.date)).size).toBe(getState().sessions.length);
    expect(getState().xp).toBe(411 + 28);
    expect(game().xp).toStrictEqual({ move: 439, sleep: 0, explore: 0, total: 439 });
    expect(ensureSeenInitialized(7, '2026-10-08').changed).toBe(false);
  });

  test('v3-v2a-bad-fields：載入 repaired（原字串存 bak-v3、主 key 不變）；修補 3 處、其他資料不受影響；修補後可匯入', async () => {
    const raw = readFixture('v3-v2a-bad-fields.json');
    const { local, load } = await loadWith('v3-v2a-bad-fields.json', new Date('2026-10-06T06:40:00+09:00'));
    expect(load).toStrictEqual({ status: 'repaired', error: { code: 'repaired', message: MSG_REPAIRED, backupKey: 'daily-ten-state.bak-v3' } });
    expect(local.getItem('daily-ten-state.bak-v3')).toBe(raw);
    expect(local.getItem(STORAGE_KEY)).toBe(raw);
    expect(local.writes).toEqual(['daily-ten-state.bak-v3']);
    const r = migrate(JSON.parse(raw), { now: NOW });
    expect(r.issues).toStrictEqual([
      { path: 'game.seen.level', action: 'coerced' },     // "7" → 7（無損）
      { path: 'game.seen.perfectDay', action: 'reset' },  // "2026/10/05" → null（不猜）
      { path: 'game.deload', action: 'reset' }            // 字串 → {restoredOn:null}
    ]);
    expect(game().seen).toStrictEqual({ level: 7, perfectDay: null });
    expect(game().deload).toStrictEqual({ restoredOn: null });
    expect(validateImport(getState())).toEqual({ ok: true });
    const v2a = loadFixture('v3-v2a.json');
    const { game: g1, ...rest1 } = getState();
    const { game: g2, ...rest2 } = v2a;
    expect(rest1).toStrictEqual(rest2);
    const { seen: _s1, deload: _d1, ...gameRest1 } = g1;
    const { seen: _s2, deload: _d2, ...gameRest2 } = g2;
    expect(gameRest1).toStrictEqual(gameRest2);
    /* 修補後：level 保留、perfectDay 由初始化補上（今天之前不補播）；今天沒有恢復 → 降量照常（安全的預設） */
    expect(ensureSeenInitialized(9, '2026-10-06')).toStrictEqual({ ok: true, changed: true, seen: { level: 7, perfectDay: '2026-10-05' } });
    expect(isDeloadRestored(getState(), '2026-10-05')).toBe(false);
    /* 再開一次：同一份原字串不會一直另存 */
    installGlobals({ local });
    expect((await loadState({ now: new Date('2026-10-06T07:00:00+09:00') })).error.backupKey).toBe('daily-ten-state.bak-v3');
    expect(local.keys()).toEqual([STORAGE_KEY, 'daily-ten-state.bak-v3']);
  });

  test('v3-v2a-bad-fields 拿去匯入 → 3 筆錯誤（繁中、含路徑），state 與 storage 都不變', async () => {
    const { local } = await loadWith('v3-v2a.json');
    const ref = getState();
    const before = JSON.stringify(ref);
    const snap = local.snapshot();
    const r = parseImport(readFixture('v3-v2a-bad-fields.json'), { now: NOW });
    expect(r).toStrictEqual({
      ok: false,
      errors: [
        { code: 'invalid_type', path: 'game.seen.level', message: '升級卡與慶祝紀錄（game.seen.level）應為整數' },
        { code: 'out_of_range', path: 'game.seen.perfectDay', message: '升級卡與慶祝紀錄（game.seen.perfectDay）應為 YYYY-MM-DD 格式的日期' },
        { code: 'invalid_type', path: 'game.deload', message: '降量恢復紀錄（game.deload）應為物件' }
      ]
    });
    for (const e of r.errors) expect(findBannedWords(e.message)).toEqual([]);
    expect(getState()).toBe(ref);
    expect(JSON.stringify(getState())).toBe(before);
    expect(local.snapshot()).toStrictEqual(snap);
  });
});

test.describe('save → load → export → import：新欄位原樣保留', () => {
  test('記憶體 → storage → 重新開 App → 備份檔 → 匯入預覽 → 確認匯入 → 重新開 App，seen／deload 每一步都相同', async () => {
    const { local } = await loadWith('v3-v2a.json');
    expect(markLevelSeen(8).ok).toBe(true);
    expect(markPerfectDaySeen('2026-10-06').ok).toBe(true);
    expect(setDeloadRestored('2026-10-06').ok).toBe(true);
    const seen = { level: 8, perfectDay: '2026-10-06' };
    const deload = { restoredOn: '2026-10-06' };
    expect(stored(local).game.seen).toStrictEqual(seen);
    installGlobals({ local });
    expect(await loadState({ now: new Date('2026-10-06T21:00:00+09:00') })).toStrictEqual({ status: 'ok', error: null });
    expect([game().seen, game().deload]).toStrictEqual([seen, deload]);
    const { text, stamped } = buildBackup(getState(), new Date('2026-10-06T21:05:00+09:00'));
    expect([stamped.game.seen, stamped.game.deload]).toStrictEqual([seen, deload]);
    expect(JSON.parse(text).game.seen).toStrictEqual(seen);
    /* 換一支手機（空的 storage）匯入 */
    const other = new MemoryStorage();
    installGlobals({ local: other });
    await loadState({ now: new Date('2026-10-07T07:00:00+09:00') });
    const preview = parseImport(text, { now: new Date('2026-10-07T07:00:00+09:00') });
    expect(preview.ok).toBe(true);
    expect([preview.incoming.game.seen, preview.incoming.game.deload]).toStrictEqual([seen, deload]);
    expect(preview.incoming).toStrictEqual(stamped);
    expect(await applyImport(preview.incoming)).toBe(true);
    expect(ensureSeenInitialized(7, '2026-10-07').changed).toBe(false); // 匯入的 seen 已有值：不重設
    installGlobals({ local: other });
    expect(await loadState({ now: new Date('2026-10-07T07:05:00+09:00') })).toStrictEqual({ status: 'ok', error: null });
    expect([game().seen, game().deload]).toStrictEqual([seen, deload]);
    expect(JSON.stringify(getState())).toBe(JSON.stringify(stamped));
  });

  test('匯入沒有 seen 的舊備份（V1）：seen 跟著消失 → ensureSeenInitialized 以目前等級重新初始化（不補發）', async () => {
    await loadWith('v3-v2a.json');
    const { incoming } = parseImport(readFixture('v3-checkin.json'), { now: NOW });
    expect(await applyImport(incoming)).toBe(true);
    expect(readSeen(getState())).toStrictEqual({ level: null, perfectDay: null });
    expect('deload' in game()).toBe(false);
    expect(ensureSeenInitialized(7, '2026-10-07').seen).toStrictEqual({ level: 7, perfectDay: '2026-10-06' });
  });

  test('差異摘要不列 seen／deload（不是紀錄）；匯入 V2a 檔的預覽與 V1 檔同樣 8 列', async () => {
    await loadWith('v3-checkin.json');
    const r = parseImport(readFixture('v3-v2a.json'), { now: NOW });
    expect(r.ok).toBe(true);
    expect(r.summary.rows.map((x) => x.key)).toEqual(['version', 'level', 'lastSession', 'sessions', 'prs', 'body', 'sleepLog', 'lastBackup']);
    expect(r.summary.rows.find((x) => x.key === 'sleepLog')).toStrictEqual({ key: 'sleepLog', label: '睡眠紀錄筆數', current: '3 筆', incoming: '4 筆', changed: true });
    expect(r.summary.warnings).toEqual([]);
  });

  test('備份正規化：畫面在記憶體寫進怪值（沒經過 game.js），備份檔仍能通過嚴格驗證（＝下次載入的修補結果）', async () => {
    await loadWith('v3-v2a.json');
    game().seen.level = 'abc';
    game().deload = 5;
    const { text, stamped } = buildBackup(getState(), NOW);
    expect(stamped.game.seen).toStrictEqual({ level: null, perfectDay: '2026-10-05' });
    expect(stamped.game.deload).toStrictEqual({ restoredOn: null });
    expect(parseImport(text, { now: NOW }).ok).toBe(true);
  });

  test('打卡 → 復原（removeSleepEntry）不動 seen／deload', async () => {
    await loadWith('v3-v2a.json');
    const add = addSleepEntry({ date: '2026-10-06', lightsOut: '2026-10-05T23:30:00+09:00', wake: '2026-10-06T06:50:00+09:00', lightsOutEdited: false });
    expect(add.ok).toBe(true);
    expect(removeSleepEntry('2026-10-06').removed).toBe(1);
    expect([game().seen, game().deload]).toStrictEqual([V2A_SEEN, V2A_DELOAD]);
  });
});
