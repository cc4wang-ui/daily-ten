/* data-guardian：migrate.js 單元測試（純 Node，不開瀏覽器）
   預期值與 tests/fixtures/README.md 一致。 */
import { test, expect } from '@playwright/test';
import { migrate, mirrorLegacyToGame, streakFromSessions, MigrationError } from '../js/state/migrate.js';
import { defaultState, validateImport } from '../js/state/schema.js';
import { isoLocal } from '../js/state/time.js';
import { loadFixture, NOW, GOOD_FIXTURES, useTokyoTime, deepFreeze, rng } from './state.helpers.js';

useTokyoTime(test);

const st = (current, best, lastDate) => ({ current, best, lastDate });
const countBuckets = (o) => Object.values(o).reduce((n, a) => n + a.length, 0);

/* 遷移後的預期值（README 同一份表） */
const EXPECTED = {
  'v1-minimal.json':        { from: 1, repaired: false, migratedBefore: false, level: 2, xp: 35,  streak: st(1, 2, '2026-08-05'),  life: st(1, 2, '2026-08-05'),  sessions: 3,  prs: 1,  body: 0 },
  'v2-real.json':           { from: 2, repaired: false, migratedBefore: false, level: 3, xp: 361, streak: st(9, 11, '2026-09-28'), life: st(9, 11, '2026-09-28'), sessions: 32, prs: 11, body: 30 },
  'v2-missing-fields.json': { from: 2, repaired: false, migratedBefore: false, level: 2, xp: 60,  streak: st(3, 3, '2026-09-20'),  life: st(3, 3, '2026-09-20'),  sessions: 5,  prs: 1,  body: 0 },
  'v2-wrong-types.json':    { from: 2, repaired: true,  migratedBefore: false, level: 3, xp: 120, streak: st(4, 6, '2026-09-20'),  life: st(4, 4, '2026-09-20'),  sessions: 6,  prs: 3,  body: 2 },
  'empty-arrays.json':      { from: 2, repaired: false, migratedBefore: false, level: 2, xp: 0,   streak: st(0, 0, null),          life: st(0, 0, null),          sessions: 0,  prs: 0,  body: 0 },
  'v3.json':                { from: 3, repaired: false, migratedBefore: true,  level: 3, xp: 396, streak: st(12, 12, '2026-10-01'), life: st(12, 12, '2026-10-01'), sessions: 35, prs: 11, body: 31 },
  'v3-reverted-to-v2.json': { from: 2, repaired: false, migratedBefore: true,  level: 3, xp: 406, streak: st(13, 13, '2026-10-02'), life: st(13, 13, '2026-10-02'), sessions: 36, prs: 11, body: 31 }
};

test.describe('每個 fixture 的遷移結果', () => {
  for (const [name, e] of Object.entries(EXPECTED)) {
    test(name, () => {
      const r = migrate(loadFixture(name), { now: NOW });
      const s = r.state;
      expect(r.fromVersion).toBe(e.from);
      expect(r.repaired).toBe(e.repaired);
      expect(r.alreadyMigrated).toBe(e.migratedBefore);
      expect(s.version).toBe(3);
      expect(s.level).toBe(e.level);
      expect(s.xp).toBe(e.xp);
      expect(s.streak).toEqual(e.streak);
      expect(s.sessions.length).toBe(e.sessions);
      expect(countBuckets(s.prs)).toBe(e.prs);
      expect(countBuckets(s.body)).toBe(e.body);
      /* D12 雙寫：game 是 legacy 的複製 */
      expect(s.game.xp).toStrictEqual({ move: e.xp, sleep: 0, explore: 0, total: e.xp });
      expect(s.game.streaks.train).toStrictEqual(e.streak);
      expect(s.game.streaks.life).toStrictEqual(e.life);
      expect(s.game.level).toBe(null);
      /* v3 欄位齊全 */
      expect(Object.keys(s.prs).sort()).toEqual(['hrp', 'pike', 'plank', 'pushup', 'run2mi', 'sideplank']);
      expect(Object.keys(s.body).sort()).toEqual(['arm', 'rhr', 'shoulder', 'sleep', 'thigh', 'waist', 'weight']);
      for (const k of ['bedtime', 'wakeTime', 'windowMin', 'phoneDownMin', 'voice', 'beep', 'band']) expect(s.settings).toHaveProperty(k);
      expect(s.phase.current).toBe('P1');
      expect(s.goals.identity).toBe('我是獨立、自律、持續成長的人。');
      expect(s.habits.sleep.log).toEqual([]);
      expect(s.habits.explore.items[0]).toMatchObject({ id: 'dj', name: 'DJ', minimalAction: '練 1 個 transition', status: 'trying' });
      expect(s).toHaveProperty('meta.lastBackupAt');
    });
  }
});

test.describe('v1 → v3', () => {
  test('套用 v2 規則（prs 六桶、body 七桶、profile、settings.band）並保留舊資料', () => {
    const raw = loadFixture('v1-minimal.json');
    const s = migrate(raw, { now: NOW }).state;
    expect(s.sessions).toStrictEqual(raw.sessions);
    expect(s.streak).toStrictEqual(raw.streak);
    expect(s.prs).toStrictEqual({ hrp: [{ date: '2026-08-02', reps: 12 }], plank: [], run2mi: [], pushup: [], pike: [], sideplank: [] });
    expect(s.body).toStrictEqual(defaultState(NOW).body);
    expect(s.profile).toStrictEqual({ heightCm: null, age: null });
    expect(s.settings).toStrictEqual({ voice: true, beep: true, band: true, bedtime: '23:00', wakeTime: '07:00', windowMin: 30, phoneDownMin: 30 });
  });

  test('沒有 version 的資料視為 v1，version 放在第一個欄位', () => {
    const raw = loadFixture('v1-minimal.json');
    delete raw.version;
    const r = migrate(raw, { now: NOW });
    expect(r.fromVersion).toBe(1);
    expect(r.repaired).toBe(false);
    expect(Object.keys(r.state)[0]).toBe('version');
    expect(r.state.version).toBe(3);
  });
});

test.describe('v2 → v3', () => {
  test('v2-real：舊欄位原樣保留、v3 欄位為預設值', () => {
    const raw = loadFixture('v2-real.json');
    const s = migrate(raw, { now: NOW }).state;
    for (const k of ['level', 'xp', 'streak', 'sessions', 'prs', 'body', 'profile']) expect(s[k]).toStrictEqual(raw[k]);
    expect(s.settings).toStrictEqual({ voice: true, beep: false, band: false, bedtime: '23:00', wakeTime: '07:00', windowMin: 30, phoneDownMin: 30 });
    const d = defaultState(NOW);
    for (const k of ['habits', 'goals', 'phase', 'meta']) expect(s[k]).toStrictEqual(d[k]);
    expect(s.habits.explore.items[0].createdAt).toBe(isoLocal(NOW));
  });

  test('v2-missing-fields：缺少的欄位補上，xp 與 streak.best 由 sessions 推導，不算修補', () => {
    const r = migrate(loadFixture('v2-missing-fields.json'), { now: NOW });
    expect(r.issues).toEqual([]);
    expect(r.state.xp).toBe(60);
    expect(r.state.level).toBe(2);
    expect(r.state.streak).toEqual({ current: 3, best: 3, lastDate: '2026-09-20' });
    expect(r.state.settings).toStrictEqual({ voice: false, beep: true, band: true, bedtime: '23:00', wakeTime: '07:00', windowMin: 30, phoneDownMin: 30 });
    expect(r.state.prs.hrp).toStrictEqual([{ date: '2026-09-20', reps: 15 }]);
    expect(r.state.profile).toStrictEqual({ heightCm: null, age: null });
  });

  test('v2-wrong-types：修補路徑與結果', () => {
    const r = migrate(loadFixture('v2-wrong-types.json'), { now: NOW });
    const s = r.state;
    const sortIssues = (a) => [...a].sort((x, y) => (x.path < y.path ? -1 : x.path > y.path ? 1 : 0));
    expect(sortIssues(r.issues)).toStrictEqual(sortIssues([
      { path: 'level', action: 'coerced' },
      { path: 'xp', action: 'coerced' },
      { path: 'streak.current', action: 'coerced' },
      { path: 'sessions[1]', action: 'dropped' },
      { path: 'sessions[2].xp', action: 'coerced' },
      { path: 'sessions[3]', action: 'dropped' },
      { path: 'sessions[4]', action: 'dropped' },
      { path: 'sessions[7].xp', action: 'reset' },
      { path: 'prs.hrp[0].reps', action: 'coerced' },
      { path: 'prs.hrp[1]', action: 'dropped' },
      { path: 'prs.run2mi', action: 'reset' },
      { path: 'prs.pushup', action: 'reset' },
      { path: 'body.weight[1]', action: 'dropped' },
      { path: 'body.weight[2]', action: 'dropped' },
      { path: 'body.rhr', action: 'reset' },
      { path: 'body.sleep[0].v', action: 'coerced' },
      { path: 'profile', action: 'reset' },
      { path: 'settings.voice', action: 'coerced' },
      { path: 'settings.beep', action: 'coerced' },
      { path: 'settings.band', action: 'reset' }
    ]));
    expect(s.level).toBe(3);
    expect(s.xp).toBe(120);
    expect(s.streak).toStrictEqual({ current: 4, best: 6, lastDate: '2026-09-20' });
    expect(s.sessions).toStrictEqual([
      { date: '2026-09-13', type: 'boss', xp: 20 },
      { date: '2026-09-15', type: 'full', xp: 10 },
      { date: '2026-09-17', type: 'full', xp: 10 },
      { date: '2026-09-18', type: 'cycle', xp: 15 },
      { date: '2026-09-19', type: 'rest', xp: 0 },
      { date: '2026-09-20', type: 'boss', xp: 20 }
    ]);
    expect(s.prs).toStrictEqual({
      hrp: [{ date: '2026-09-13', reps: 12 }, { date: '2026-09-20', reps: 15 }],
      plank: [], run2mi: [], pushup: [], pike: [], sideplank: [{ date: '2026-09-20', v: 45 }]
    });
    expect(s.body.weight).toStrictEqual([{ date: '2026-09-19', v: 68.2 }]);
    expect(s.body.rhr).toStrictEqual([]);
    expect(s.body.sleep).toStrictEqual([{ date: '2026-09-20', v: 7.5 }]);
    expect(s.profile).toStrictEqual({ heightCm: null, age: null });
    expect(s.settings).toStrictEqual({ voice: false, beep: true, band: true, bedtime: '23:00', wakeTime: '07:00', windowMin: 30, phoneDownMin: 30 });
  });
});

test.describe('v3 與 D12（被舊版改回 version 2）', () => {
  test('v3：遷移是 no-op（內容與欄位順序完全相同）', () => {
    const raw = loadFixture('v3.json');
    const r = migrate(raw, { now: NOW });
    expect(r.issues).toEqual([]);
    expect(r.state).toStrictEqual(raw);
    expect(JSON.stringify(r.state)).toBe(JSON.stringify(raw));
  });

  test('被改回 v2 且舊版多記一次 session：game 以複製同步，不重複計 XP', () => {
    const raw = loadFixture('v3-reverted-to-v2.json');
    expect(raw.version).toBe(2);
    expect(raw.xp).toBe(406);
    expect(raw.game.xp.move).toBe(396); // 舊版沒有動 game
    const r = migrate(raw, { now: NOW });
    expect(r.alreadyMigrated).toBe(true);
    expect(r.state.version).toBe(3);
    expect(r.state.xp).toBe(406);
    expect(r.state.game.xp).toStrictEqual({ move: 406, sleep: 0, explore: 0, total: 406 }); // 不是 396＋406
    expect(r.state.game.streaks.train).toStrictEqual({ current: 13, best: 13, lastDate: '2026-10-02' });
    expect(r.state.game.streaks.life).toStrictEqual({ current: 13, best: 13, lastDate: '2026-10-02' });
    const v3 = loadFixture('v3.json');
    for (const k of ['habits', 'goals', 'phase', 'meta', 'settings', 'prs', 'body', 'profile']) expect(r.state[k]).toStrictEqual(v3[k]);
    expect(r.state.habits.explore.items[0].createdAt).toBe('2026-09-28T07:30:00+09:00'); // 不因再次遷移而改變
  });

  test('已遷移：保留 game 的 sleep／explore／成就等，legacy xp 不會加總進 game', () => {
    const raw = loadFixture('v3.json');
    raw.version = 2;
    raw.game.xp = { move: 999, sleep: 40, explore: 20, total: 1059 };
    raw.game.achievements = { 'first-session': '2026-09-01T07:00:00+09:00' };
    raw.game.freezeTokens = 2;
    raw.game.perfectDays = ['2026-09-30'];
    raw.game.level = { move: 3, sleep: 1, explore: 1 };
    const r = migrate(raw, { now: NOW });
    expect(r.repaired).toBe(false);
    expect(r.state.game.xp).toStrictEqual({ move: 396, sleep: 40, explore: 20, total: 456 });
    expect(r.state.game.achievements).toStrictEqual({ 'first-session': '2026-09-01T07:00:00+09:00' });
    expect(r.state.game.freezeTokens).toBe(2);
    expect(r.state.game.perfectDays).toStrictEqual(['2026-09-30']);
    expect(r.state.game.level).toStrictEqual({ move: 3, sleep: 1, explore: 1 });
    expect(migrate(r.state, { now: NOW }).state.game.xp.total).toBe(456); // 再跑一次也一樣
  });

  test('已遷移但 game 缺欄位：只補缺欄位', () => {
    const raw = loadFixture('v3.json');
    raw.game = { xp: { sleep: 40 } };
    const r = migrate(raw, { now: NOW });
    expect(r.repaired).toBe(false);
    expect(r.state.game.xp).toMatchObject({ move: 396, sleep: 40, explore: 0, total: 436 });
    expect(r.state.game.freezeTokens).toBe(0);
    expect(r.state.game.achievements).toStrictEqual({});
    expect(validateImport(r.state)).toEqual({ ok: true });
  });

  test('game 不是物件 → 重建（記一筆 reset）', () => {
    const raw = loadFixture('v3.json');
    raw.game = 'broken';
    const r = migrate(raw, { now: NOW });
    expect(r.alreadyMigrated).toBe(false);
    expect(r.issues).toStrictEqual([{ path: 'game', action: 'reset' }]);
    expect(r.state.game.xp).toStrictEqual({ move: 396, sleep: 0, explore: 0, total: 396 });
  });
});

test.describe('冪等、不改動輸入、輸出一定能再匯入', () => {
  for (const name of GOOD_FIXTURES) {
    test(`${name}：跑兩次結果相同`, () => {
      const first = migrate(loadFixture(name), { now: NOW });
      const second = migrate(first.state, { now: NOW });
      expect(second.state).toStrictEqual(first.state);
      expect(JSON.stringify(second.state)).toBe(JSON.stringify(first.state));
      expect(second.repaired).toBe(false);
      expect(second.issues).toEqual([]);
      expect(second.fromVersion).toBe(3);
    });

    test(`${name}：不改動傳入物件（deep freeze）`, () => {
      const raw = loadFixture(name);
      const before = JSON.stringify(raw);
      deepFreeze(raw);
      const r = migrate(raw, { now: NOW });
      expect(JSON.stringify(raw)).toBe(before);
      expect(r.state).not.toBe(raw);
    });

    test(`${name}：遷移結果通過匯入驗證`, () => {
      expect(validateImport(migrate(loadFixture(name), { now: NOW }).state)).toEqual({ ok: true });
    });
  }

  test('不同的 now 只影響新建的 DJ createdAt', () => {
    const a = migrate(loadFixture('v2-real.json'), { now: NOW }).state;
    const b = migrate(loadFixture('v2-real.json'), { now: new Date('2027-01-01T00:00:00+09:00') }).state;
    expect(b.habits.explore.items[0].createdAt).toBe('2027-01-01T00:00:00+09:00');
    b.habits.explore.items[0].createdAt = a.habits.explore.items[0].createdAt;
    expect(b).toStrictEqual(a);
  });
});

test.describe('MigrationError 與 version', () => {
  test('raw 不是 plain object → MigrationError', () => {
    for (const v of [null, undefined, [], 'text', 42, true, new Date(), [{ version: 2 }]]) {
      expect(() => migrate(v)).toThrow(MigrationError);
    }
    try { migrate(null); } catch (e) { expect(e.name).toBe('MigrationError'); expect(e.message).toMatch(/[一-鿿]/); }
  });

  test('version 是數字字串 → coerced', () => {
    const raw = loadFixture('v2-real.json');
    raw.version = '2';
    const r = migrate(raw, { now: NOW });
    expect(r.fromVersion).toBe(2);
    expect(r.issues).toStrictEqual([{ path: 'version', action: 'coerced' }]);
  });

  test('version 比目前新 → 降為 3、記 downgraded、保留不認得的欄位', () => {
    const raw = loadFixture('v3.json');
    raw.version = 4;
    raw.futureFeature = { keep: true };
    const r = migrate(raw, { now: NOW });
    expect(r.fromVersion).toBe(4);
    expect(r.issues).toStrictEqual([{ path: 'version', action: 'downgraded' }]);
    expect(r.state.version).toBe(3);
    expect(r.state.futureFeature).toStrictEqual({ keep: true });
  });

  test('version 無效 → 依形狀推測（有 body → 2）', () => {
    const raw = loadFixture('v2-real.json');
    raw.version = 'abc';
    const r = migrate(raw, { now: NOW });
    expect(r.fromVersion).toBe(2);
    expect(r.issues).toStrictEqual([{ path: 'version', action: 'reset' }]);
    raw.version = 0;
    delete raw.body;
    expect(migrate(raw, { now: NOW }).fromVersion).toBe(1);
  });
});

test.describe('載入修補規則', () => {
  const v2 = () => loadFixture('v2-real.json');

  test('level：超出範圍的整數夾回 1–5，小數改預設 2', () => {
    for (const [input, out, action] of [[7, 5, 'clamped'], [0, 1, 'clamped'], ['9', 5, 'clamped'], [2.5, 2, 'reset'], [null, 2, 'reset'], ['4', 4, 'coerced']]) {
      const raw = v2();
      raw.level = input;
      const r = migrate(raw, { now: NOW });
      expect(r.state.level).toBe(out);
      expect(r.issues).toStrictEqual([{ path: 'level', action }]);
    }
  });

  test('xp：缺少 → 由 sessions 加總（不算修補）；無效 → 由 sessions 加總（derived）', () => {
    const missing = v2();
    delete missing.xp;
    const a = migrate(missing, { now: NOW });
    expect(a.state.xp).toBe(361);
    expect(a.issues).toEqual([]);
    for (const bad of [-5, 'abc', 1e12, null, {}, true]) {
      const raw = v2();
      raw.xp = bad;
      const r = migrate(raw, { now: NOW });
      expect(r.state.xp).toBe(361);
      expect(r.issues).toStrictEqual([{ path: 'xp', action: 'derived' }]);
      expect(r.state.game.xp.move).toBe(361);
    }
  });

  test('streak：缺少 → 推導（不算修補）；不是物件或欄位無效 → 推導（derived）', () => {
    const missing = v2();
    delete missing.streak;
    expect(migrate(missing, { now: NOW }).state.streak).toStrictEqual({ current: 9, best: 11, lastDate: '2026-09-28' });
    expect(migrate(missing, { now: NOW }).issues).toEqual([]);
    const notObj = v2();
    notObj.streak = 'x';
    const r1 = migrate(notObj, { now: NOW });
    expect(r1.state.streak).toStrictEqual({ current: 9, best: 11, lastDate: '2026-09-28' });
    expect(r1.issues).toStrictEqual([{ path: 'streak', action: 'derived' }]);
    const badField = v2();
    badField.streak.current = 2.5;
    badField.streak.lastDate = 'yesterday';
    const r2 = migrate(badField, { now: NOW });
    expect(r2.state.streak).toStrictEqual({ current: 9, best: 11, lastDate: '2026-09-28' });
    expect(r2.issues).toStrictEqual([{ path: 'streak.current', action: 'derived' }, { path: 'streak.lastDate', action: 'derived' }]);
  });

  test('sessions 不是陣列 → []；超過 50,000 筆 → 保留最新的 50,000 筆', () => {
    const a = v2();
    a.sessions = { 0: { date: '2026-09-01', type: 'full', xp: 10 } };
    const r = migrate(a, { now: NOW });
    expect(r.state.sessions).toEqual([]);
    expect(r.issues).toStrictEqual([{ path: 'sessions', action: 'reset' }]);
    const b = v2();
    b.sessions = Array.from({ length: 50002 }, (_, i) => ({ date: '2026-09-01', type: i === 50001 ? 'last' : 'full', xp: 1 }));
    const r2 = migrate(b, { now: NOW });
    expect(r2.state.sessions.length).toBe(50000);
    expect(r2.state.sessions[49999].type).toBe('last');
    expect(r2.issues).toStrictEqual([{ path: 'sessions', action: 'truncated' }]);
    expect(validateImport(r2.state)).toEqual({ ok: true });
  });

  test('超出匯入範圍的 PR／body 項目在載入時丟掉，確保備份一定能再匯入', () => {
    const raw = v2();
    raw.prs.run2mi.push({ date: '2026-09-29', sec: -60 });
    raw.prs.hrp.push({ date: '2026-09-29', reps: 99999 });
    raw.body.weight.push({ date: '2026-09-29', v: 0 });
    const r = migrate(raw, { now: NOW });
    expect(r.issues).toStrictEqual([
      { path: 'prs.hrp[2]', action: 'dropped' },
      { path: 'prs.run2mi[2]', action: 'dropped' },
      { path: 'body.weight[14]', action: 'dropped' }
    ]);
    expect(validateImport(r.state)).toEqual({ ok: true });
  });

  test('過長的身分宣言截斷為 500 字；時間 7:00 → 07:00', () => {
    const raw = loadFixture('v3.json');
    raw.goals.identity = '我'.repeat(600);
    raw.settings.wakeTime = '7:00';
    const r = migrate(raw, { now: NOW });
    expect(r.state.goals.identity).toBe('我'.repeat(500));
    expect(r.state.settings.wakeTime).toBe('07:00');
    expect(r.issues).toStrictEqual([{ path: 'settings.wakeTime', action: 'coerced' }, { path: 'goals.identity', action: 'truncated' }]);
  });

  test('探索項目：缺識別欄位的整筆丟掉、其他欄位補預設或重設', () => {
    const raw = loadFixture('v3.json');
    raw.habits.explore.items.push({ name: '沒有 id' }, { id: 'piano', name: '鋼琴' }, { id: 'run', name: '跑步', status: 123 });
    raw.habits.explore.log = [{ date: '2026-10-01', itemId: 'dj', interest: 4 }, { date: '2026-10-01', interest: 3 }];
    const r = migrate(raw, { now: NOW });
    const items = r.state.habits.explore.items;
    expect(items.map((x) => x.id)).toEqual(['dj', 'piano', 'run']);
    expect(items[1]).toStrictEqual({ id: 'piano', name: '鋼琴', minimalAction: '', createdAt: null, status: 'trying' });
    expect(items[2].status).toBe('trying');
    expect(r.state.habits.explore.log).toStrictEqual([{ date: '2026-10-01', itemId: 'dj', interest: 4 }]);
    expect(r.issues).toStrictEqual([
      { path: 'habits.explore.items[1]', action: 'dropped' },
      { path: 'habits.explore.items[3].status', action: 'reset' },
      { path: 'habits.explore.log[1]', action: 'dropped' }
    ]);
  });

  test('不認得的欄位在每一層都原樣保留', () => {
    const raw = v2();
    raw.extra = { nested: [1, 'two'] };
    raw.settings.theme = 'dark';
    raw.sessions[0].note = '雨天';
    raw.prs.deadhang = [{ date: '2026-09-01', sec: 30 }];
    const s = migrate(raw, { now: NOW }).state;
    expect(s.extra).toStrictEqual({ nested: [1, 'two'] });
    expect(s.settings.theme).toBe('dark');
    expect(s.sessions[0].note).toBe('雨天');
    expect(s.prs.deadhang).toStrictEqual([{ date: '2026-09-01', sec: 30 }]);
  });
});

test.describe('mirrorLegacyToGame', () => {
  test('複製不是累加、冪等、回傳同一個物件', () => {
    const s = migrate(loadFixture('v2-real.json'), { now: NOW }).state;
    s.xp += 10;
    s.sessions.push({ date: '2026-09-29', type: 'full', xp: 10 });
    s.streak = { current: 10, best: 11, lastDate: '2026-09-29' };
    expect(mirrorLegacyToGame(s)).toBe(s);
    mirrorLegacyToGame(s);
    expect(s.game.xp).toStrictEqual({ move: 371, sleep: 0, explore: 0, total: 371 });
    expect(s.game.streaks.train).toStrictEqual({ current: 10, best: 11, lastDate: '2026-09-29' });
    expect(s.game.streaks.train).not.toBe(s.streak);
    expect(s.game.streaks.life).toStrictEqual({ current: 10, best: 11, lastDate: '2026-09-29' });
  });

  test('total = move + sleep + explore', () => {
    const s = migrate(loadFixture('v3.json'), { now: NOW }).state;
    s.game.xp.sleep = 30;
    s.game.xp.explore = 45;
    mirrorLegacyToGame(s);
    expect(s.game.xp).toStrictEqual({ move: 396, sleep: 30, explore: 45, total: 471 });
  });

  test('沒有 game 就建立；壞掉的值不會讓它丟例外', () => {
    const s = loadFixture('v2-real.json');
    mirrorLegacyToGame(s);
    expect(s.game.xp.move).toBe(361);
    expect(s.game.streaks.train).toStrictEqual({ current: 9, best: 11, lastDate: '2026-09-28' });
    const junk = { xp: 'abc', streak: null, sessions: 'x', game: { xp: null, streaks: 5 } };
    mirrorLegacyToGame(junk);
    expect(junk.game.xp).toStrictEqual({ move: 0, sleep: 0, explore: 0, total: 0 });
    expect(junk.game.streaks.life).toStrictEqual({ current: 0, best: 0, lastDate: null });
    expect(mirrorLegacyToGame(null)).toBe(null);
  });
});

test.describe('streakFromSessions', () => {
  const S = (...dates) => dates.map((date) => ({ date, type: 'full', xp: 10 }));
  test('未排序、重複日期、中斷', () => {
    expect(streakFromSessions(S('2026-09-03', '2026-09-01', '2026-09-02', '2026-09-02', '2026-09-05')))
      .toStrictEqual({ current: 1, best: 3, lastDate: '2026-09-05' });
  });
  test('跨月、跨年、閏年', () => {
    expect(streakFromSessions(S('2026-12-30', '2026-12-31', '2027-01-01'))).toStrictEqual({ current: 3, best: 3, lastDate: '2027-01-01' });
    expect(streakFromSessions(S('2026-02-28', '2026-03-01'))).toStrictEqual({ current: 2, best: 2, lastDate: '2026-03-01' });
    expect(streakFromSessions(S('2028-02-28', '2028-03-01'))).toStrictEqual({ current: 1, best: 1, lastDate: '2028-03-01' });
    expect(streakFromSessions(S('2028-02-28', '2028-02-29', '2028-03-01'))).toStrictEqual({ current: 3, best: 3, lastDate: '2028-03-01' });
  });
  test('忽略無效項目；空的或不是陣列 → 0', () => {
    expect(streakFromSessions([null, 'x', { date: 'bad' }, { type: 'full' }, ...S('2026-09-01')])).toStrictEqual({ current: 1, best: 1, lastDate: '2026-09-01' });
    expect(streakFromSessions([])).toStrictEqual({ current: 0, best: 0, lastDate: null });
    expect(streakFromSessions(undefined)).toStrictEqual({ current: 0, best: 0, lastDate: null });
  });
  test('不依賴「今天」與時區', () => {
    const sessions = loadFixture('v2-real.json').sessions;
    const tokyo = streakFromSessions(sessions);
    process.env.TZ = 'America/Los_Angeles';
    expect(streakFromSessions(sessions)).toStrictEqual(tokyo);
    process.env.TZ = 'Pacific/Kiritimati';
    expect(streakFromSessions(sessions)).toStrictEqual(tokyo);
    expect(tokyo).toStrictEqual({ current: 9, best: 11, lastDate: '2026-09-28' });
  });
});

test.describe('fuzz：隨機破壞資料，載入永遠不丟例外', () => {
  const JUNK = [null, '', 'abc', '12', -1, 0, 1.5, 1e12, true, false, [], {}, [null], { date: 'x' }, '2026-13-40', 'x'.repeat(600)];
  function paths(o, prefix = []) {
    const out = [];
    if (o && typeof o === 'object') {
      for (const k of Object.keys(o)) {
        out.push([...prefix, k]);
        out.push(...paths(o[k], [...prefix, k]));
      }
    }
    return out;
  }
  test('500 次隨機破壞：遷移成功、輸出可匯入、冪等、不改動輸入', () => {
    const rand = rng(20261002);
    const sources = ['v1-minimal.json', 'v2-real.json', 'v3.json', 'v3-reverted-to-v2.json', 'v2-wrong-types.json'].map(loadFixture);
    for (let i = 0; i < 500; i++) {
      const raw = JSON.parse(JSON.stringify(sources[i % sources.length]));
      const all = paths(raw);
      const edits = 1 + Math.floor(rand() * 4);
      for (let j = 0; j < edits; j++) {
        const p = all[Math.floor(rand() * all.length)];
        let parent = raw;
        for (const k of p.slice(0, -1)) parent = parent && typeof parent === 'object' ? parent[k] : undefined;
        if (!parent || typeof parent !== 'object') continue;
        if (rand() < 0.2) delete parent[p[p.length - 1]];
        else parent[p[p.length - 1]] = JSON.parse(JSON.stringify(JUNK[Math.floor(rand() * JUNK.length)]));
      }
      const before = JSON.stringify(raw);
      const r = migrate(raw, { now: NOW });
      expect(JSON.stringify(raw)).toBe(before);
      const v = validateImport(r.state);
      if (!v.ok) throw new Error(`#${i} 輸出無法匯入：${JSON.stringify(v.errors)}\n輸入：${before}`);
      const again = migrate(r.state, { now: NOW });
      if (again.repaired || JSON.stringify(again.state) !== JSON.stringify(r.state)) {
        throw new Error(`#${i} 不冪等：${JSON.stringify(again.issues)}\n輸入：${before}`);
      }
      expect(r.state.game.xp.move).toBe(r.state.xp);
    }
  });
});
