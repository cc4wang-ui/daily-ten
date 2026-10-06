/* data-guardian：schema.js／time.js 單元測試（純 Node，不開瀏覽器） */
import { test, expect } from '@playwright/test';
import { SCHEMA_VERSION, DEFAULT_IDENTITY, PHASES, defaultState, validateImport } from '../js/state/schema.js';
import { isoLocal, localDateStr, compactStamp, isValidDateStr, isIsoWithOffset, dayNumber, dayNumberToStr } from '../js/state/time.js';
import { loadFixture, NOW, useTokyoTime, findBannedWords } from './state.helpers.js';

useTokyoTime(test);

const codes = (r) => r.errors.map((e) => e.code);
const paths = (r) => r.errors.map((e) => e.path);
const sleepItem = (patch = {}) => ({ date: '2026-10-04', lightsOut: '2026-10-03T23:00:00+09:00', wake: '2026-10-04T06:58:12+09:00', lightsOutEdited: false, ...patch });

test.describe('defaultState', () => {
  test('內容精確符合 v3 規格', () => {
    expect(SCHEMA_VERSION).toBe(3);
    expect(DEFAULT_IDENTITY).toBe('我是獨立、自律、持續成長的人。');
    expect(defaultState(NOW)).toStrictEqual({
      version: 3, level: 2, xp: 0,
      streak: { current: 0, best: 0, lastDate: null },
      sessions: [],
      prs: { hrp: [], plank: [], run2mi: [], pushup: [], pike: [], sideplank: [] },
      body: { weight: [], waist: [], arm: [], shoulder: [], thigh: [], rhr: [], sleep: [] },
      profile: { heightCm: null, age: null },
      settings: { voice: true, beep: true, band: true, bedtime: '23:00', wakeTime: '07:00', windowMin: 30, phoneDownMin: 30 },
      habits: {
        sleep: { log: [] },
        explore: {
          items: [{ id: 'dj', name: 'DJ', minimalAction: '練 1 個 transition', createdAt: '2026-10-02T15:30:00+09:00', status: 'trying' }],
          log: []
        }
      },
      goals: { identity: '我是獨立、自律、持續成長的人。', weekly: [], season: [] },
      phase: { current: 'P1', startedAt: null, history: [] },
      game: {
        xp: { move: 0, sleep: 0, explore: 0, total: 0 }, level: null,
        streaks: { train: { current: 0, best: 0, lastDate: null }, life: { current: 0, best: 0, lastDate: null } },
        freezeTokens: 0, achievements: {}, perfectDays: []
      },
      meta: { lastBackupAt: null }
    });
  });

  test('每次回傳全新物件（改一份不影響下一份）', () => {
    const a = defaultState(NOW);
    a.sessions.push({ date: '2026-10-02', type: 'full', xp: 10 });
    a.game.xp.move = 99;
    a.habits.explore.items[0].name = 'x';
    const b = defaultState(NOW);
    expect(b.sessions).toEqual([]);
    expect(b.game.xp.move).toBe(0);
    expect(b.habits.explore.items[0].name).toBe('DJ');
    expect(b.game).not.toBe(a.game);
  });

  test('預設 now 為現在時間（createdAt 含 offset）', () => {
    expect(defaultState().habits.explore.items[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/);
  });

  test('defaultState 本身能通過匯入驗證', () => {
    expect(validateImport(defaultState(NOW))).toEqual({ ok: true });
  });
});

test.describe('time.js', () => {
  test('isoLocal／localDateStr：Asia/Tokyo', () => {
    expect(isoLocal(NOW)).toBe('2026-10-02T15:30:00+09:00');
    expect(localDateStr(NOW)).toBe('2026-10-02');
    expect(compactStamp(NOW)).toBe('20261002153000');
  });

  test('isoLocal：UTC、負 offset、半小時 offset', () => {
    process.env.TZ = 'UTC';
    expect(isoLocal(NOW)).toBe('2026-10-02T06:30:00+00:00');
    process.env.TZ = 'America/Los_Angeles';
    expect(isoLocal(NOW)).toBe('2026-10-01T23:30:00-07:00');
    expect(localDateStr(NOW)).toBe('2026-10-01');
    process.env.TZ = 'Asia/Kolkata';
    expect(isoLocal(NOW)).toBe('2026-10-02T12:00:00+05:30');
  });

  test('isoLocal：無效日期改用現在，不產生 NaN 字串', () => {
    expect(isoLocal(new Date('garbage'))).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
    expect(localDateStr('garbage')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('isValidDateStr：真實存在的日期才算', () => {
    for (const ok of ['2026-10-02', '2028-02-29', '2026-12-31', '0001-01-01']) expect(isValidDateStr(ok)).toBe(true);
    for (const bad of ['2026-02-29', '2026-02-30', '2026-13-01', '2026-00-10', '2026-9-1', '2026/09/01', '20260901', '', null, 20260901])
      expect(isValidDateStr(bad)).toBe(false);
  });

  test('isIsoWithOffset：含時區的 ISO 8601 時間才算', () => {
    for (const ok of [
      '2026-10-04T06:58:00+09:00', isoLocal(NOW), '2026-10-04T06:58+09:00', '2026-10-04T06:58:00.123+09:00',
      '2026-10-03T21:58:00.000Z', new Date(NOW).toISOString(), '2026-10-03T21:58:00Z', '2026-10-04T06:58:00-07:00',
      '2026-10-04T06:58:00+05:30', '2026-10-04T00:00:00+00:00', '2026-10-04T23:59:59+14:00', '2028-02-29T07:00:00+09:00'
    ]) expect(isIsoWithOffset(ok), ok).toBe(true);
    for (const bad of [
      '2026-10-04T06:58:00', '2026-10-04', '06:58', '2026-10-04 06:58:00+09:00', '2026-10-04T06:58:00+0900',
      '2026-10-04T06:58:00+9:00', '2026-10-04T6:58:00+09:00', '2026-10-04T24:00:00+09:00', '2026-10-04T06:60:00+09:00',
      '2026-10-04T06:58:60+09:00', '2026-10-04T06:58:00.1+09:00', '2026-10-04T06:58:00.1234+09:00', '2026-10-04t06:58:00z',
      '2026-02-30T07:00:00+09:00', '2026-13-01T07:00:00+09:00', '2026-10-04T06:58:00+24:00', ' 2026-10-04T06:58:00+09:00',
      '2026-10-04T06:58:00+09:00 ', '', null, undefined, 0, Date.parse('2026-10-04T06:58:00+09:00'), new Date(NOW), {}, []
    ]) expect(isIsoWithOffset(bad), String(bad)).toBe(false);
  });

  test('dayNumber 與時區無關，可來回轉換', () => {
    const a = dayNumber('2026-12-31');
    process.env.TZ = 'America/Los_Angeles';
    expect(dayNumber('2026-12-31')).toBe(a);
    expect(dayNumber('2027-01-01') - a).toBe(1);
    expect(dayNumberToStr(a + 1)).toBe('2027-01-01');
    expect(dayNumber('2026-03-01') - dayNumber('2026-02-28')).toBe(1);
    expect(dayNumber('2028-03-01') - dayNumber('2028-02-28')).toBe(2);
  });
});

test.describe('validateImport：好檔', () => {
  for (const name of ['v1-minimal.json', 'v2-real.json', 'empty-arrays.json', 'v3.json', 'v3-reverted-to-v2.json',
    'v3-checkin.json', 'v3-checkin-reverted-to-v2.json', 'v3-v2a.json', 'v3-v2a-reverted-to-v2.json']) {
    test(`${name} 通過`, () => {
      expect(validateImport(loadFixture(name))).toEqual({ ok: true });
    });
  }

  test('真實備份的怪資料要能通過（打錯的數字、非列舉 type、小數、重複日期）', () => {
    const s = loadFixture('v2-real.json');
    s.body.sleep.push({ date: '2026-09-28', v: 30 });     // 睡眠誤填 30
    s.body.weight.push({ date: '2026-09-29', v: 685 });   // 少打小數點
    s.body.rhr.push({ date: '2026-09-29', v: 0.5 });
    s.sessions.push({ date: '2026-09-29', type: 'yoga-flow', xp: 12.5 }); // 未來的新 type、小數 XP
    s.sessions.push({ date: '2026-09-29', type: 'full', xp: 10 });        // 同日兩筆
    s.prs.plank.push({ date: '2026-09-29', sec: 0 });
    s.xp = 361.5;
    expect(validateImport(s)).toEqual({ ok: true });
  });

  test('未知的額外欄位保留、不報錯', () => {
    const s = loadFixture('v3.json');
    s.future = { anything: [1, 2, { deep: 'x'.repeat(5000) }] };
    s.settings.theme = 'dark';
    s.sessions[0].note = '手機版新增的欄位';
    s.prs.deadhang = [{ when: 'yesterday' }];
    s.game.newCounter = -5;
    s.habits.reading = { log: ['whatever'] };
    expect(validateImport(s)).toEqual({ ok: true });
  });
});

test.describe('validateImport：壞檔', () => {
  test('import-bad-missing-fields.json → missing_field（streak、sessions）', () => {
    const r = validateImport(loadFixture('import-bad-missing-fields.json'));
    expect(r.ok).toBe(false);
    expect(r.errors).toStrictEqual([
      { code: 'missing_field', path: 'streak', message: '缺少必要欄位：連續天數（streak）' },
      { code: 'missing_field', path: 'sessions', message: '缺少必要欄位：訓練紀錄（sessions）' }
    ]);
  });

  test('import-bad-wrong-types.json → invalid_type', () => {
    const r = validateImport(loadFixture('import-bad-wrong-types.json'));
    expect(r.ok).toBe(false);
    expect(paths(r)).toStrictEqual(['xp', 'sessions', 'prs.hrp[0].date', 'settings.voice']);
    expect(new Set(codes(r))).toEqual(new Set(['invalid_type']));
    expect(r.errors[0].message).toBe('XP（xp）應為數字');
    expect(r.errors[2].message).toBe('PR 紀錄（prs.hrp[0].date）缺少必要的值，應為 YYYY-MM-DD 格式的日期');
  });

  test('import-bad-oversized.json → out_of_range', () => {
    const r = validateImport(loadFixture('import-bad-oversized.json'));
    expect(r.ok).toBe(false);
    expect(paths(r)).toStrictEqual(['level', 'xp', 'streak.current', 'streak.best', 'prs.hrp[0].reps', 'body.weight[0].v']);
    expect(new Set(codes(r))).toEqual(new Set(['out_of_range']));
    expect(r.errors[1].message).toBe('XP（xp）數值超出合理範圍（應介於 0–10,000,000）');
  });

  test('頂層不是物件 → invalid_type', () => {
    for (const v of [null, [], 'text', 42, true, undefined]) {
      const r = validateImport(v);
      expect(r).toStrictEqual({ ok: false, errors: [{ code: 'invalid_type', path: '', message: '檔案內容不是 Daily Ten 的資料格式' }] });
    }
  });

  test('streak 型別錯 → invalid_type；缺 current → invalid_type', () => {
    const s = loadFixture('v2-real.json');
    s.streak = 5;
    expect(validateImport(s).errors).toStrictEqual([{ code: 'invalid_type', path: 'streak', message: '連續天數（streak）應為物件' }]);
    s.streak = { best: 3, lastDate: null };
    const r = validateImport(s);
    expect(r.errors).toStrictEqual([{ code: 'invalid_type', path: 'streak.current', message: '連續天數（streak.current）缺少必要的值，應為整數' }]);
  });

  test('version：字串、0、小數、比目前新', () => {
    const s = loadFixture('v2-real.json');
    s.version = '2';
    expect(validateImport(s).errors).toStrictEqual([{ code: 'invalid_type', path: 'version', message: '版本（version）應為數字' }]);
    s.version = 0;
    expect(codes(validateImport(s))).toStrictEqual(['out_of_range']);
    s.version = 2.5;
    expect(codes(validateImport(s))).toStrictEqual(['out_of_range']);
    s.version = 4;
    const r = validateImport(s);
    expect(codes(r)).toStrictEqual(['out_of_range']);
    expect(r.errors[0].message).toBe('這份資料來自較新版本的 App（v4），請先更新 App 再匯入');
    delete s.version; // v1 沒有 version 也可以
    expect(validateImport(s)).toEqual({ ok: true });
  });

  test('錯誤最多收集 100 筆', () => {
    const s = loadFixture('v2-real.json');
    s.sessions = Array.from({ length: 300 }, () => ({ date: 'bad', type: '', xp: 'x' }));
    const r = validateImport(s);
    expect(r.ok).toBe(false);
    expect(r.errors.length).toBe(100);
  });
});

test.describe('validateImport：邊界值', () => {
  const base = () => loadFixture('v3.json');
  const cases = [
    ['xp 上限', (s) => { s.xp = 10000000; }, null],
    ['xp 超過上限', (s) => { s.xp = 10000001; }, ['out_of_range', 'xp']],
    ['xp 負數', (s) => { s.xp = -1; }, ['out_of_range', 'xp']],
    ['xp 字串', (s) => { s.xp = '120'; }, ['invalid_type', 'xp']],
    ['level 1', (s) => { s.level = 1; }, null],
    ['level 5', (s) => { s.level = 5; }, null],
    ['level 0', (s) => { s.level = 0; }, ['out_of_range', 'level']],
    ['level 6', (s) => { s.level = 6; }, ['out_of_range', 'level']],
    ['level 2.5', (s) => { s.level = 2.5; }, ['out_of_range', 'level']],
    ['level 字串', (s) => { s.level = '3'; }, ['invalid_type', 'level']],
    ['streak.current 上限', (s) => { s.streak.current = 100000; s.streak.best = 100000; }, null],
    ['streak.current 超過', (s) => { s.streak.current = 100001; }, ['out_of_range', 'streak.current']],
    ['streak.best 小數', (s) => { s.streak.best = 1.5; }, ['out_of_range', 'streak.best']],
    ['streak.lastDate null', (s) => { s.streak.lastDate = null; }, null],
    ['streak.lastDate 格式錯', (s) => { s.streak.lastDate = '2026/10/01'; }, ['out_of_range', 'streak.lastDate']],
    ['hrp reps 上限', (s) => { s.prs.hrp[0].reps = 10000; }, null],
    ['hrp reps 超過', (s) => { s.prs.hrp[0].reps = 10001; }, ['out_of_range', 'prs.hrp[0].reps']],
    ['hrp 用錯欄位（v 取代 reps）', (s) => { s.prs.hrp[0] = { date: '2026-09-06', v: 18 }; }, ['invalid_type', 'prs.hrp[0].reps']],
    ['plank sec 上限', (s) => { s.prs.plank[0].sec = 86400; }, null],
    ['plank sec 超過', (s) => { s.prs.plank[0].sec = 86401; }, ['out_of_range', 'prs.plank[0].sec']],
    ['run2mi sec 負數', (s) => { s.prs.run2mi[0].sec = -1; }, ['out_of_range', 'prs.run2mi[0].sec']],
    ['pushup v 字串', (s) => { s.prs.pushup[0].v = '22'; }, ['invalid_type', 'prs.pushup[0].v']],
    ['sideplank v 上限（秒）', (s) => { s.prs.sideplank[0].v = 86400; }, null],
    ['body v 為 0', (s) => { s.body.weight[0].v = 0; }, ['out_of_range', 'body.weight[0].v']],
    ['body v 上限', (s) => { s.body.weight[0].v = 100000; }, null],
    ['body v 超過', (s) => { s.body.weight[0].v = 100001; }, ['out_of_range', 'body.weight[0].v']],
    ['body 項目缺 date', (s) => { delete s.body.rhr[0].date; }, ['invalid_type', 'body.rhr[0].date']],
    ['session type 空字串', (s) => { s.sessions[0].type = ''; }, ['invalid_type', 'sessions[0].type']],
    ['session type 20 字', (s) => { s.sessions[0].type = 'x'.repeat(20); }, null],
    ['session type 21 字', (s) => { s.sessions[0].type = 'x'.repeat(21); }, ['out_of_range', 'sessions[0].type']],
    ['session date 不存在', (s) => { s.sessions[0].date = '2026-02-30'; }, ['out_of_range', 'sessions[0].date']],
    ['session date 是數字', (s) => { s.sessions[0].date = 20260824; }, ['invalid_type', 'sessions[0].date']],
    ['session 閏日', (s) => { s.sessions[0].date = '2028-02-29'; }, null],
    ['identity 500 字', (s) => { s.goals.identity = '我'.repeat(500); }, null],
    ['identity 501 字', (s) => { s.goals.identity = '我'.repeat(501); }, ['out_of_range', 'goals.identity']],
    ['bedtime 23:59', (s) => { s.settings.bedtime = '23:59'; }, null],
    ['bedtime 24:00', (s) => { s.settings.bedtime = '24:00'; }, ['out_of_range', 'settings.bedtime']],
    ['wakeTime 7:00', (s) => { s.settings.wakeTime = '7:00'; }, ['out_of_range', 'settings.wakeTime']],
    ['settings.band 字串', (s) => { s.settings.band = 'false'; }, ['invalid_type', 'settings.band']],
    ['game.level 數字', (s) => { s.game.level = 3; }, null],
    ['game.level 物件', (s) => { s.game.level = { move: 2, sleep: 1, explore: 1 }; }, null],
    ['game.level 字串', (s) => { s.game.level = 'L3'; }, ['invalid_type', 'game.level']],
    ['game.xp.total 字串', (s) => { s.game.xp.total = '396'; }, ['invalid_type', 'game.xp.total']],
    ['game 不是物件', (s) => { s.game = 'x'; }, ['invalid_type', 'game']],
    ['meta.lastBackupAt 數字', (s) => { s.meta.lastBackupAt = 123; }, ['invalid_type', 'meta.lastBackupAt']],
    ['explore item 缺 name', (s) => { delete s.habits.explore.items[0].name; }, ['invalid_type', 'habits.explore.items[0].name']],
    ['explore interest 6', (s) => { s.habits.explore.log = [{ date: '2026-10-01', itemId: 'dj', interest: 6 }]; }, ['out_of_range', 'habits.explore.log[0].interest']],
    /* B1：早安打卡 sleep log（date／lightsOut／wake 必填且含時區；lightsOutEdited 選填，有就要是 boolean） */
    ['sleep 項目正確', (s) => { s.habits.sleep.log = [sleepItem()]; }, null],
    ['sleep 項目用 Z 結尾', (s) => { s.habits.sleep.log = [sleepItem({ lightsOut: '2026-10-03T14:00:00.000Z', wake: '2026-10-03T21:58:00.000Z' })]; }, null],
    ['sleep 缺 lightsOutEdited（載入時補 false）', (s) => { const e = sleepItem(); delete e.lightsOutEdited; s.habits.sleep.log = [e]; }, null],
    ['sleep 同一天兩筆（怪資料不擋）', (s) => { s.habits.sleep.log = [sleepItem(), sleepItem({ lightsOutEdited: true })]; }, null],
    ['sleep 多出不認得的欄位', (s) => { s.habits.sleep.log = [sleepItem({ note: '出差' })]; }, null],
    ['sleep 項目是字串', (s) => { s.habits.sleep.log = ['2026-10-04 06:58']; }, ['invalid_type', 'habits.sleep.log[0]']],
    ['sleep 項目是 null', (s) => { s.habits.sleep.log = [null]; }, ['invalid_type', 'habits.sleep.log[0]']],
    ['sleep 缺 date', (s) => { const e = sleepItem(); delete e.date; s.habits.sleep.log = [e]; }, ['invalid_type', 'habits.sleep.log[0].date']],
    ['sleep date 不存在', (s) => { s.habits.sleep.log = [sleepItem({ date: '2026-02-30' })]; }, ['out_of_range', 'habits.sleep.log[0].date']],
    ['sleep 缺 wake', (s) => { const e = sleepItem(); delete e.wake; s.habits.sleep.log = [e]; }, ['invalid_type', 'habits.sleep.log[0].wake']],
    ['sleep wake 沒有時區', (s) => { s.habits.sleep.log = [sleepItem({ wake: '2026-10-04T06:58:00' })]; }, ['out_of_range', 'habits.sleep.log[0].wake']],
    ['sleep wake 是毫秒數', (s) => { s.habits.sleep.log = [sleepItem({ wake: 1791583080000 })]; }, ['invalid_type', 'habits.sleep.log[0].wake']],
    ['sleep lightsOut null', (s) => { s.habits.sleep.log = [sleepItem({ lightsOut: null })]; }, ['invalid_type', 'habits.sleep.log[0].lightsOut']],
    ['sleep lightsOut 只有 HH:MM', (s) => { s.habits.sleep.log = [sleepItem({ lightsOut: '23:00' })]; }, ['out_of_range', 'habits.sleep.log[0].lightsOut']],
    ['sleep lightsOutEdited 字串', (s) => { s.habits.sleep.log = [sleepItem({ lightsOutEdited: 'true' })]; }, ['invalid_type', 'habits.sleep.log[0].lightsOutEdited']],
    ['sleep lightsOutEdited null', (s) => { s.habits.sleep.log = [sleepItem({ lightsOutEdited: null })]; }, ['invalid_type', 'habits.sleep.log[0].lightsOutEdited']],
    ['sleep.log 不是陣列', (s) => { s.habits.sleep.log = {}; }, ['invalid_type', 'habits.sleep.log']],
    ['sleep 完整形狀（wakeEdited＋target）', (s) => { s.habits.sleep.log = [sleepItem({ wakeEdited: true, target: { bedtime: '23:30', wakeTime: '07:00', windowMin: 30 } })]; }, null],
    ['sleep wakeEdited false', (s) => { s.habits.sleep.log = [sleepItem({ wakeEdited: false })]; }, null],
    ['sleep target null', (s) => { s.habits.sleep.log = [sleepItem({ target: null })]; }, null],
    ['sleep target 多出欄位', (s) => { s.habits.sleep.log = [sleepItem({ target: { bedtime: '23:00', wakeTime: '07:00', windowMin: 30, phoneDownMin: 30 } })]; }, null],
    ['sleep wakeEdited 字串', (s) => { s.habits.sleep.log = [sleepItem({ wakeEdited: 'true' })]; }, ['invalid_type', 'habits.sleep.log[0].wakeEdited']],
    ['sleep target 是字串', (s) => { s.habits.sleep.log = [sleepItem({ target: '23:00' })]; }, ['invalid_type', 'habits.sleep.log[0].target']],
    ['sleep target 缺 windowMin', (s) => { s.habits.sleep.log = [sleepItem({ target: { bedtime: '23:00', wakeTime: '07:00' } })]; }, ['invalid_type', 'habits.sleep.log[0].target.windowMin']],
    ['sleep target.bedtime 格式錯', (s) => { s.habits.sleep.log = [sleepItem({ target: { bedtime: 'late', wakeTime: '07:00', windowMin: 30 } })]; }, ['out_of_range', 'habits.sleep.log[0].target.bedtime']],
    ['sleep target.windowMin 超過 1440', (s) => { s.habits.sleep.log = [sleepItem({ target: { bedtime: '23:00', wakeTime: '07:00', windowMin: 1441 } })]; }, ['out_of_range', 'habits.sleep.log[0].target.windowMin']],
    /* B1：加一輪（sessions[].plus 選填 boolean；type 'plus' 照收） */
    ['session plus true', (s) => { s.sessions[0].plus = true; }, null],
    ['session plus false', (s) => { s.sessions[0].plus = false; }, null],
    ['session type plus', (s) => { s.sessions.push({ date: '2026-10-02', type: 'plus', xp: 0 }); }, null],
    ['session type plus、沒有 xp', (s) => { s.sessions.push({ date: '2026-10-02', type: 'plus', plus: true }); }, null],
    ['session plus 字串', (s) => { s.sessions[0].plus = 'yes'; }, ['invalid_type', 'sessions[0].plus']],
    ['session plus null', (s) => { s.sessions[0].plus = null; }, ['invalid_type', 'sessions[0].plus']],
    /* B1：階段 */
    ['phase.startedAt 含時區', (s) => { s.phase.startedAt = '2026-10-02T06:50:10+09:00'; }, null],
    ['phase.startedAt Z 結尾', (s) => { s.phase.startedAt = '2026-10-01T21:50:10.000Z'; }, null],
    ['phase.startedAt 沒有時區', (s) => { s.phase.startedAt = '2026-10-02T06:50:10'; }, ['out_of_range', 'phase.startedAt']],
    ['phase.startedAt 只有日期', (s) => { s.phase.startedAt = '2026-10-02'; }, ['out_of_range', 'phase.startedAt']],
    ['phase.startedAt 數字', (s) => { s.phase.startedAt = 1791583080000; }, ['invalid_type', 'phase.startedAt']],
    ['phase.current P2', (s) => { s.phase.current = 'P2'; }, null],
    ['phase.current P3', (s) => { s.phase.current = 'P3'; }, null],
    ['phase.current P4', (s) => { s.phase.current = 'P4'; }, ['out_of_range', 'phase.current']],
    ['phase.current 小寫 p1', (s) => { s.phase.current = 'p1'; }, ['out_of_range', 'phase.current']],
    ['phase.current 空字串', (s) => { s.phase.current = ''; }, ['invalid_type', 'phase.current']],
    ['phase.current 數字', (s) => { s.phase.current = 1; }, ['invalid_type', 'phase.current']],
    /* V2a：game.seen {level, perfectDay}、game.deload {restoredOn}（選填；有就要完整、格式正確） */
    ['game.seen 正確', (s) => { s.game.seen = { level: 7, perfectDay: '2026-10-05' }; }, null],
    ['game.seen 未初始化（全 null）', (s) => { s.game.seen = { level: null, perfectDay: null }; }, null],
    ['game.seen.level 1', (s) => { s.game.seen = { level: 1, perfectDay: null }; }, null],
    ['game.seen.level 100,000', (s) => { s.game.seen = { level: 100000, perfectDay: null }; }, null],
    ['game.seen.level 0', (s) => { s.game.seen = { level: 0, perfectDay: null }; }, ['out_of_range', 'game.seen.level']],
    ['game.seen.level 100,001', (s) => { s.game.seen = { level: 100001, perfectDay: null }; }, ['out_of_range', 'game.seen.level']],
    ['game.seen.level 負數', (s) => { s.game.seen = { level: -1, perfectDay: null }; }, ['out_of_range', 'game.seen.level']],
    ['game.seen.level 小數', (s) => { s.game.seen = { level: 7.5, perfectDay: null }; }, ['out_of_range', 'game.seen.level']],
    ['game.seen.level 字串', (s) => { s.game.seen = { level: '7', perfectDay: null }; }, ['invalid_type', 'game.seen.level']],
    ['game.seen.level true', (s) => { s.game.seen = { level: true, perfectDay: null }; }, ['invalid_type', 'game.seen.level']],
    ['game.seen.perfectDay 斜線', (s) => { s.game.seen = { level: 7, perfectDay: '2026/10/05' }; }, ['out_of_range', 'game.seen.perfectDay']],
    ['game.seen.perfectDay 不存在的日期', (s) => { s.game.seen = { level: 7, perfectDay: '2026-02-30' }; }, ['out_of_range', 'game.seen.perfectDay']],
    ['game.seen.perfectDay 是 ISO 時間（不猜遊戲日）', (s) => { s.game.seen = { level: 7, perfectDay: '2026-10-05T07:00:00+09:00' }; }, ['out_of_range', 'game.seen.perfectDay']],
    ['game.seen.perfectDay 數字', (s) => { s.game.seen = { level: 7, perfectDay: 20261005 }; }, ['invalid_type', 'game.seen.perfectDay']],
    ['game.seen 缺 level', (s) => { s.game.seen = { perfectDay: '2026-10-05' }; }, ['invalid_type', 'game.seen.level']],
    ['game.seen 缺 perfectDay', (s) => { s.game.seen = { level: 7 }; }, ['invalid_type', 'game.seen.perfectDay']],
    ['game.seen null', (s) => { s.game.seen = null; }, ['invalid_type', 'game.seen']],
    ['game.seen 字串', (s) => { s.game.seen = '7'; }, ['invalid_type', 'game.seen']],
    ['game.seen 陣列', (s) => { s.game.seen = [7, '2026-10-05']; }, ['invalid_type', 'game.seen']],
    ['game.seen 多出不認得的欄位', (s) => { s.game.seen = { level: 7, perfectDay: '2026-10-05', weekly: '2026-W41' }; }, null],
    ['game.deload 正確', (s) => { s.game.deload = { restoredOn: '2026-10-05' }; }, null],
    ['game.deload.restoredOn null', (s) => { s.game.deload = { restoredOn: null }; }, null],
    ['game.deload.restoredOn 格式錯', (s) => { s.game.deload = { restoredOn: '10/05' }; }, ['out_of_range', 'game.deload.restoredOn']],
    ['game.deload.restoredOn 是 ISO 時間', (s) => { s.game.deload = { restoredOn: '2026-10-05T07:00:00+09:00' }; }, ['out_of_range', 'game.deload.restoredOn']],
    ['game.deload.restoredOn true', (s) => { s.game.deload = { restoredOn: true }; }, ['invalid_type', 'game.deload.restoredOn']],
    ['game.deload 缺 restoredOn', (s) => { s.game.deload = {}; }, ['invalid_type', 'game.deload.restoredOn']],
    ['game.deload null', (s) => { s.game.deload = null; }, ['invalid_type', 'game.deload']],
    ['game.deload 字串', (s) => { s.game.deload = '2026-10-05'; }, ['invalid_type', 'game.deload']],
    ['game.deload 多出不認得的欄位', (s) => { s.game.deload = { restoredOn: '2026-10-05', from: 3 }; }, null],
    /* M1 舊欄位（V2a 保留不動）：規則照舊 */
    ['game.freezeTokens 2', (s) => { s.game.freezeTokens = 2; }, null],
    ['game.freezeTokens 負數', (s) => { s.game.freezeTokens = -1; }, ['out_of_range', 'game.freezeTokens']],
    ['game.perfectDays 任何內容', (s) => { s.game.perfectDays = ['2026-09-30', { date: 'x' }, 3]; }, null],
    ['game.perfectDays 不是陣列', (s) => { s.game.perfectDays = '2026-09-30'; }, ['invalid_type', 'game.perfectDays']]
  ];
  for (const [name, mutate, expected] of cases) {
    test(name, () => {
      const s = base();
      mutate(s);
      const r = validateImport(s);
      if (expected === null) expect(r).toEqual({ ok: true });
      else expect(r.errors.map((e) => [e.code, e.path])).toStrictEqual([expected]);
    });
  }

  test('陣列長度上限 50,000 筆', () => {
    const s = base();
    const one = { date: '2026-10-01', type: 'full', xp: 10 };
    s.sessions = Array.from({ length: 50000 }, () => one);
    expect(validateImport(s)).toEqual({ ok: true });
    s.sessions.push(one);
    expect(validateImport(s).errors).toStrictEqual([{ code: 'out_of_range', path: 'sessions', message: '訓練紀錄（sessions）筆數過多（上限 50,000 筆）' }]);
  });
});

test.describe('錯誤訊息', () => {
  test('B1 欄位：睡眠紀錄、探索紀錄、階段的訊息', () => {
    const s = loadFixture('v3.json');
    s.habits.sleep.log = [sleepItem({ wake: '06:58' }), sleepItem({ lightsOut: null }), sleepItem({ lightsOutEdited: 'yes', target: { bedtime: '23:00', wakeTime: '7:00', windowMin: 30 } })];
    delete s.habits.explore.items[0].name;
    s.phase.current = 'P9';
    s.phase.startedAt = 'yesterday';
    expect(validateImport(s).errors).toStrictEqual([
      { code: 'out_of_range', path: 'habits.sleep.log[0].wake', message: '睡眠紀錄（habits.sleep.log[0].wake）應為含時區的時間（例 2026-10-04T06:58:00+09:00）' },
      { code: 'invalid_type', path: 'habits.sleep.log[1].lightsOut', message: '睡眠紀錄（habits.sleep.log[1].lightsOut）應為含時區的時間（例 2026-10-04T06:58:00+09:00）' },
      { code: 'invalid_type', path: 'habits.sleep.log[2].lightsOutEdited', message: '睡眠紀錄（habits.sleep.log[2].lightsOutEdited）應為 true 或 false' },
      { code: 'out_of_range', path: 'habits.sleep.log[2].target.wakeTime', message: '睡眠紀錄（habits.sleep.log[2].target.wakeTime）應為 HH:MM 格式的時間' },
      { code: 'invalid_type', path: 'habits.explore.items[0].name', message: '探索紀錄（habits.explore.items[0].name）缺少必要的值，應為文字' },
      { code: 'out_of_range', path: 'phase.current', message: '階段（phase.current）應為 P1、P2、P3 其中之一' },
      { code: 'out_of_range', path: 'phase.startedAt', message: '階段（phase.startedAt）應為含時區的時間（例 2026-10-04T06:58:00+09:00）' }
    ]);
    expect(PHASES).toEqual(['P1', 'P2', 'P3']);
    expect(Object.isFrozen(PHASES)).toBe(true);
  });

  test('V2a 欄位：升級卡與慶祝紀錄、降量恢復紀錄的訊息', () => {
    const s = loadFixture('v3-v2a.json');
    s.game.seen = { level: 0 };
    s.game.deload = { restoredOn: 20261005 };
    expect(validateImport(s).errors).toStrictEqual([
      { code: 'out_of_range', path: 'game.seen.level', message: '升級卡與慶祝紀錄（game.seen.level）數值超出合理範圍（應為 1–100,000 的整數）' },
      { code: 'invalid_type', path: 'game.seen.perfectDay', message: '升級卡與慶祝紀錄（game.seen.perfectDay）缺少必要的值，應為 YYYY-MM-DD 格式的日期' },
      { code: 'invalid_type', path: 'game.deload.restoredOn', message: '降量恢復紀錄（game.deload.restoredOn）應為 YYYY-MM-DD 格式的日期' }
    ]);
    s.game.seen = 'x';
    expect(validateImport(s).errors[0]).toStrictEqual({ code: 'invalid_type', path: 'game.seen', message: '升級卡與慶祝紀錄（game.seen）應為物件' });
  });

  test('全部是繁中、含欄位路徑、沒有用語表的「不用」詞', () => {
    const files = ['import-bad-missing-fields.json', 'import-bad-wrong-types.json', 'import-bad-oversized.json', 'v2-wrong-types.json', 'v2-missing-fields.json', 'v3-bad-sleep.json', 'v3-v2a-bad-fields.json'];
    const all = files.flatMap((f) => validateImport(loadFixture(f)).errors);
    const s = loadFixture('v3.json');
    s.version = 9; s.sessions[0].type = ''; s.goals.identity = '我'.repeat(501); s.settings.bedtime = '25:00'; s.game.level = 'x';
    all.push(...validateImport(s).errors, ...validateImport(null).errors);
    expect(all.length).toBeGreaterThan(30);
    for (const e of all) {
      expect(e.message).toMatch(/[一-鿿]/);
      if (e.path && !e.message.includes('較新版本')) expect(e.message).toContain(e.path);
      expect(findBannedWords(e.message)).toEqual([]);
    }
  });
});
