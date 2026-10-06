/* game-designer：V2a 遊戲核心單元測試（純 Node，不開瀏覽器）
   Perfect Day（d9）、Freeze（d10）、D6 降量（d11）、D19 回歸任務（d12）、等級含 bonus（d13）、
   規則驗證、壞資料不丟例外、不改動 state、決定性、只加不減。 */
import { test, expect } from '@playwright/test';
import { parseRules, asRules } from '../js/game/rules.js';
import { todaySummary } from '../js/game/engine.js';
import { deloadFor, deloadRestoredDates, courseLevel } from '../js/habits/deload.js';
import { freezeStreak, returnQuest, dayFacts, perfectDays, weekStartNum } from '../js/game/timeline.js';
import { dayNumber } from '../js/game/day.js';
import { readRulesRaw, loadFixture, ALL_FIXTURES, useTZ, variant, makeState, night, session, plusDays, deepFreeze, rng } from './game.helpers.js';

useTZ(test);
const RAW = readRulesRaw();
const R = parseRules(RAW);
const sum = (state, iso, rules = R) => todaySummary(state, new Date(iso), rules);
const span = (from, n) => Array.from({ length: n }, (_, i) => plusDays(from, i));
const train = (dates, type = 'full') => dates.map((d) => session(d, type));
const at = (date, hm = '20:00') => `${date}T${hm}:00+09:00`;
const FULL_NIGHT = (d) => night(d, '23:00', '07:00'); // 眠 60（起床 30＋熄燈 20＋時數 10）

test.describe('規則資料：V2a 數值與驗證', () => {
  test('初始值（CLAUDE.md §6、D6、D19）', () => {
    expect(R.perfectDay).toEqual({ xp: 30 });
    expect(R.freeze).toEqual({ earnEvery: 7, max: 2 });
    expect(R.deload).toEqual({ shortSleepMin: 360, lateLightsOutMin: 90, step: 1, minLevel: 1 });
    expect(R.returnQuest).toEqual({ breakDays: 1, windowDays: 3, boostMinPillars: 2, multiplier: 1.5 });
    expect(R.week).toEqual({ startsOn: 1 });
    /* 既有數值一個都沒有調低（XP 由紀錄推導，調低會讓總 XP 倒退） */
    expect([R.move.tiers.minimal.xp, R.move.tiers.main.xp, R.move.tiers.plus.xp]).toEqual([30, 50, 60]);
    expect([R.sleep.wake.full, R.sleep.lightsOut.full, R.sleep.duration.full]).toEqual([30, 20, 10]);
    expect(R.level).toEqual({ base: 200, step: 50 });
  });

  const bad = [
    ['缺 perfectDay', 'perfectDay', undefined], ['perfectDay.xp 負數', 'perfectDay.xp', -1], ['perfectDay.xp 小數', 'perfectDay.xp', 2.5],
    ['freeze.earnEvery 0', 'freeze.earnEvery', 0], ['freeze.max 字串', 'freeze.max', '2'], ['缺 freeze', 'freeze', undefined],
    ['deload.shortSleepMin 超過一天', 'deload.shortSleepMin', 2000], ['deload.minLevel 0', 'deload.minLevel', 0],
    ['deload.step 負數', 'deload.step', -1], ['缺 deload', 'deload', undefined],
    ['returnQuest.multiplier < 1', 'returnQuest.multiplier', 0.9], ['returnQuest.multiplier 字串', 'returnQuest.multiplier', '1.5'],
    ['returnQuest.multiplier NaN', 'returnQuest.multiplier', NaN], ['returnQuest.boostMinPillars 4', 'returnQuest.boostMinPillars', 4],
    ['returnQuest.windowDays 0', 'returnQuest.windowDays', 0], ['returnQuest.breakDays 0', 'returnQuest.breakDays', 0],
    ['week.startsOn 7', 'week.startsOn', 7], ['缺 week', 'week', undefined],
    ['缺 copy.returnQuest.boost', 'copy.returnQuest.boost', undefined], ['copy.pillarNames.sleep 空白', 'copy.pillarNames.sleep', ' '],
    ['缺 copy.deload', 'copy.deload', undefined], ['缺 copy.freeze.label', 'copy.freeze.label', undefined],
    ['缺 copy.perfectDay.todo', 'copy.perfectDay.todo', undefined]
  ];
  for (const [name, path, value] of bad) {
    test(`壞規則 → null：${name}`, () => {
      const raw = variant(RAW, path, value);
      expect(parseRules(raw)).toBeNull();
      expect(asRules(raw)).toBeNull();
      expect(todaySummary(makeState(), new Date(at('2026-10-05')), raw)).toBeNull();
    });
  }
});

test.describe('Perfect Day（d9）：已解鎖的支柱全完成 +30，放 bonus', () => {
  const D = '2026-10-06'; // 週二

  test('P1：保底版＋任何分數的早安打卡 → 達成；+30 放 bonus、不進支柱環', () => {
    const st = makeState({ sessions: [session(D, 'minimal')], sleep: [night(D, '02:30', '11:50')] });
    const s = sum(st, at(D));
    const sleepXp = s.pillars.sleep.xp;
    expect(sleepXp).toBe(25); // 起床 10＋熄燈 5＋時數 10：分數低也算完成
    expect(s.perfectDay).toEqual({
      done: true, xp: 30, need: ['move', 'sleep'], have: ['move', 'sleep'], date: D,
      reward: 30, count: 1, weekCount: 1, title: 'Perfect Day', label: '已解鎖的支柱全完成 +30 XP'
    });
    expect(s.pillars.move.xp).toBe(30);
    expect(s.xp).toEqual({ move: 30, sleep: 25, explore: 0, bonus: 30, total: 85, today: 85 });
    expect(s.level.totalXp).toBe(85);
  });

  test('只完成一個支柱 → 還沒達成，label 說還差哪一個；探索紀錄在 P1 不算', () => {
    const only = (sessions, sleep) => sum(makeState({ sessions, sleep }), at(D)).perfectDay;
    expect(only([session(D, 'full')], [])).toMatchObject({ done: false, xp: 0, have: ['move'], label: '再完成眠，就是 Perfect Day（+30 XP）' });
    expect(only([], [FULL_NIGHT(D)])).toMatchObject({ done: false, xp: 0, have: ['sleep'], label: '再完成動，就是 Perfect Day（+30 XP）' });
    expect(only([], [])).toMatchObject({ done: false, have: [], label: '再完成動、眠，就是 Perfect Day（+30 XP）' });
    const st = makeState({ sessions: [session(D, 'full')] });
    st.habits.explore.log = [{ date: D, itemId: 'dj', interest: 5 }];
    expect(sum(st, at(D)).perfectDay).toMatchObject({ done: false, need: ['move', 'sleep'] });
  });

  test('累計與本週（週一到週日）：週日、週一、週二 → 週二看是 3 天、本週 2 天；今天以後的紀錄到那天才算', () => {
    const dates = ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-08'];
    const st = makeState({ sessions: train(dates), sleep: dates.map(FULL_NIGHT) });
    expect(sum(st, at('2026-10-06')).perfectDay).toMatchObject({ done: true, count: 3, weekCount: 2 });
    expect(sum(st, at('2026-10-06')).xp.bonus).toBe(90);
    expect(sum(st, at('2026-10-07')).perfectDay).toMatchObject({ done: false, count: 3, weekCount: 2, have: [] });
    expect(sum(st, at('2026-10-08')).perfectDay).toMatchObject({ done: true, count: 4, weekCount: 3 });
    expect(sum(st, at('2026-10-12')).perfectDay).toMatchObject({ count: 4, weekCount: 0 }); // 新的一週
  });

  test('等級用含 bonus 的總 XP（d13）：支柱 180 + bonus 60 = 240 → Lv 2；Perfect Day 改成 0 → Lv 1', () => {
    const dates = ['2026-10-05', '2026-10-06'];
    const st = makeState({ sessions: train(dates, 'minimal'), sleep: dates.map(FULL_NIGHT) });
    const s = sum(st, at('2026-10-06'));
    expect(s.xp).toMatchObject({ move: 60, sleep: 120, bonus: 60, total: 240 });
    expect(s.level).toMatchObject({ lv: 2, xpInto: 40, totalXp: 240, label: 'Lv 2' });
    expect(sum(st, at('2026-10-06'), parseRules(variant(RAW, 'perfectDay.xp', 0))).level).toMatchObject({ lv: 1, xpInto: 180 });
  });

  test('解鎖新支柱前拿到的 Perfect Day 不會消失：P2 從 10/10 開始 → 10/08、10/09 仍算，之後要加上探', () => {
    const open = parseRules(variant(RAW, 'explore.open', true));
    const dates = span('2026-10-08', 4);
    const st = makeState({ sessions: train(dates), sleep: dates.map(FULL_NIGHT), phase: { current: 'P2', startedAt: '2026-10-10T08:00:00+09:00' } });
    const s = sum(st, at('2026-10-11'), open);
    expect(s.phase.current).toBe('P2');
    expect(s.perfectDay).toMatchObject({ done: false, count: 2, need: ['move', 'sleep', 'explore'], have: ['move', 'sleep'] });
    expect(s.perfectDay.label).toBe('再完成探，就是 Perfect Day（+30 XP）');
    /* 不知道 P2 從哪天開始：只有今天用 P2 的支柱，以前的日子用 P1 的 */
    const noStart = makeState({ sessions: train(dates), sleep: dates.map(FULL_NIGHT), phase: { current: 'P2', startedAt: null } });
    expect(sum(noStart, at('2026-10-11'), open).perfectDay).toMatchObject({ done: false, count: 3 });
  });

  test('perfectDays／dayFacts／weekStartNum 直接呼叫', () => {
    const moveIdx = new Map([['2026-10-05', { xp: 50 }], ['2026-10-09', { xp: 30 }]]);
    const sleepIdx = new Map([['2026-10-05', { score: { total: 60 } }], ['2026-10-06', { score: { total: 35 } }]]);
    const facts = dayFacts(moveIdx, sleepIdx, dayNumber('2026-10-08'), () => ['move', 'sleep']);
    expect([...facts.keys()]).toEqual([dayNumber('2026-10-05'), dayNumber('2026-10-06')]); // 10/09 在今天以後
    expect(facts.get(dayNumber('2026-10-05'))).toMatchObject({ xp: 110, count: 2, have: ['move', 'sleep'] });
    expect([...perfectDays(facts)]).toEqual([dayNumber('2026-10-05')]);
    expect(weekStartNum(dayNumber('2026-10-11'), 1)).toBe(dayNumber('2026-10-05')); // 週日 → 同一週的週一
    expect(weekStartNum(dayNumber('2026-10-05'), 1)).toBe(dayNumber('2026-10-05'));
    expect(weekStartNum(dayNumber('2026-10-05'), 0)).toBe(dayNumber('2026-10-04'));
  });
});

test.describe('Freeze（d10）：連續 7 天得 1 張、最多 2 張、自動使用', () => {
  const S = '2026-09-01';
  const st = (dates) => makeState({ sessions: train(dates) });

  test('得到：6 天 0 張、7 天 1 張、21 天仍 2 張（持有上限，第 21 天不再加）', () => {
    expect(sum(st(span(S, 6)), at(plusDays(S, 5))).freeze).toMatchObject({ tokens: 0, earnedTotal: 0, max: 2 });
    expect(sum(st(span(S, 7)), at(plusDays(S, 6))).freeze).toEqual({
      tokens: 1, max: 2, usedDates: [], earnedTotal: 1, usedTotal: 0, recent: [], label: 'Freeze 1 張', note: null
    });
    expect(sum(st(span(S, 14)), at(plusDays(S, 13))).freeze).toMatchObject({ tokens: 2, earnedTotal: 2 });
    expect(sum(st(span(S, 21)), at(plusDays(S, 20))).freeze).toMatchObject({ tokens: 2, earnedTotal: 2, label: 'Freeze 2 張' });
  });

  test('使用：漏 1 天自動用 1 張，前後接起來；補上的日子不加天數（frozenDays 另計）', () => {
    const dates = [...span(S, 7), ...span('2026-09-09', 3)]; // 漏 9/08
    const s = sum(st(dates), at('2026-09-11'));
    expect(s.streak).toMatchObject({ days: 10, best: 10, frozenDays: 1, todayDone: true, label: '連續 10 天' });
    expect(s.freeze).toMatchObject({ tokens: 0, usedDates: ['2026-09-08'], usedTotal: 1, earnedTotal: 1, recent: [], note: null });
  });

  test('連漏 2 天、持有 2 張 → 都用掉並接上；只有 1 張 → 不用（保留）、這一段結束', () => {
    const two = [...span(S, 14), ...span('2026-09-17', 3)]; // 漏 9/15、9/16
    expect(sum(st(two), at('2026-09-19')).streak).toMatchObject({ days: 17, best: 17, frozenDays: 2 });
    expect(sum(st(two), at('2026-09-19')).freeze).toMatchObject({ tokens: 0, usedDates: ['2026-09-15', '2026-09-16'] });
    const one = [...span(S, 7), ...span('2026-09-10', 3)]; // 漏 9/08、9/09，只有 1 張
    expect(sum(st(one), at('2026-09-12')).streak).toMatchObject({ days: 3, best: 7, frozenDays: 0 });
    expect(sum(st(one), at('2026-09-12')).freeze).toMatchObject({ tokens: 1, usedDates: [], usedTotal: 0 });
  });

  test('連漏 3 天、持有 2 張 → 接不上：張數保留，下一段從 1 開始，最佳紀錄保留', () => {
    const dates = [...span(S, 14), ...span('2026-09-18', 2)]; // 漏 9/15–9/17
    const s = sum(st(dates), at('2026-09-19'));
    expect(s.streak).toMatchObject({ days: 2, best: 14, frozenDays: 0 });
    expect(s.freeze).toMatchObject({ tokens: 2, usedDates: [] });
  });

  test('今天還沒結束：昨天漏了 → 一到今天就先用掉（顯示已使用＋說明）；今天練了照樣接上', () => {
    const before = sum(st(span(S, 7)), at('2026-09-09', '08:00'));
    expect(before.streak).toMatchObject({ days: 7, frozenDays: 1, todayDone: false, lastDate: '2026-09-07', label: '連續 7 天' });
    expect(before.freeze).toMatchObject({
      tokens: 0, usedDates: ['2026-09-08'], recent: ['2026-09-08'], note: '自動用了 1 張 Freeze，連續天數接上了'
    });
    const after = sum(st([...span(S, 7), '2026-09-09']), at('2026-09-09'));
    expect(after.streak).toMatchObject({ days: 8, frozenDays: 1, todayDone: true });
    expect(after.freeze).toMatchObject({ tokens: 0, recent: ['2026-09-08'], note: '自動用了 1 張 Freeze，連續天數接上了' });
    expect(sum(st([...span(S, 7), '2026-09-09', '2026-09-10']), at('2026-09-10')).freeze).toMatchObject({ recent: [], note: null });
  });

  test('今天還沒結束、昨天以前的空檔超過張數 → 連續 0 天，張數不動', () => {
    const s = sum(st(span(S, 7)), at('2026-09-10', '08:00')); // 漏 9/08、9/09
    expect(s.streak).toMatchObject({ days: 0, best: 7, frozenDays: 0, lastDate: '2026-09-07' });
    expect(s.freeze).toMatchObject({ tokens: 1, usedDates: [], recent: [], note: null });
  });

  test('昨天有練、今天還沒練 → 不算漏，不用 Freeze', () => {
    const s = sum(st(span(S, 7)), at('2026-09-08', '08:00'));
    expect(s.streak).toMatchObject({ days: 7, frozenDays: 0 });
    expect(s.freeze).toMatchObject({ tokens: 1, usedDates: [] });
  });

  test('補上的日子不算進下一張的 7 天：7 天＋漏 1＋6 天 → 實際 13 天沒有新的一張；第 14 天才得', () => {
    const base = [...span(S, 7), ...span('2026-09-09', 6)];
    expect(sum(st(base), at('2026-09-14')).freeze).toMatchObject({ tokens: 0, earnedTotal: 1 });
    expect(sum(st(base), at('2026-09-14')).streak).toMatchObject({ days: 13, frozenDays: 1 });
    expect(sum(st([...base, '2026-09-15']), at('2026-09-15')).freeze).toMatchObject({ tokens: 1, earnedTotal: 2 });
  });

  test('跨多次空檔：用完、再存、再用；最佳紀錄只算實際天數', () => {
    const dates = [...span(S, 7), ...span('2026-09-09', 7), ...span('2026-09-17', 7), ...span('2026-09-26', 2)];
    /* 9/01–07（得 1）漏 9/08（用）9/09–15（實際 14 → 得 1）漏 9/16（用）9/17–23（實際 21 → 得 1）漏 9/24–25（只有 1 張 → 結束） */
    const s = sum(st(dates), at('2026-09-27'));
    expect(s.freeze).toMatchObject({ tokens: 1, earnedTotal: 3, usedDates: ['2026-09-08', '2026-09-16'], usedTotal: 2 });
    expect(s.streak).toMatchObject({ days: 2, best: 21, frozenDays: 0 });
  });

  test('今天以後的紀錄不算；state 的 game.freezeTokens 不讀', () => {
    const s0 = st([...span(S, 7), '2026-09-20']);
    s0.game.freezeTokens = 99;
    expect(sum(s0, at('2026-09-07')).freeze).toMatchObject({ tokens: 1, earnedTotal: 1 });
    expect(sum(s0, at('2026-09-07')).streak).toMatchObject({ days: 7, best: 7 });
  });

  test('首頁改成 life（之後的版本）：Freeze 跟著 life 的日子', () => {
    const life = parseRules(variant(RAW, 'streak.home', 'life'));
    const dates = [...span(S, 7), '2026-09-09'];
    const s = makeState({ sessions: train(dates), sleep: dates.map(FULL_NIGHT) });
    expect(sum(s, at('2026-09-09'), life).streak).toMatchObject({ kind: 'life', days: 8, frozenDays: 1 });
  });

  test('freezeStreak 直接呼叫：空陣列、重複、亂序、今天以後', () => {
    expect(freezeStreak([], 100, R)).toEqual({ days: 0, best: 0, frozenDays: 0, lastNum: null, tokens: 0, earned: 0, used: [], recent: [] });
    const r = freezeStreak([7, 1, 2, 3, 4, 5, 6, 6, 3, 9, 50], 9, R);
    expect(r).toMatchObject({ days: 8, best: 8, frozenDays: 1, tokens: 0, earned: 1, used: [8], recent: [8], lastNum: 9 });
  });
});

test.describe('D6 降量（d11）：睡眠 < 6 小時，或熄燈晚於時段 ≥ 90 分', () => {
  const D = '2026-10-06';
  const LATE_OK = { target: { bedtime: '01:00', wakeTime: '07:00', windowMin: 30 } }; // 熄燈 01:00 在時段內，只測時數
  const dl = (sleep, extra = {}, iso = at(D, '08:00')) => {
    const st = makeState({ sleep: [sleep], ...extra });
    if (extra.level !== undefined) st.level = extra.level;
    if (extra.game) st.game = { ...st.game, ...extra.game };
    return sum(st, iso).deload;
  };

  test('沒打卡 → 不降（triggered false、planLevel＝原本強度）', () => {
    expect(sum(makeState(), at(D, '08:00')).deload).toEqual({
      active: false, reason: null, reasons: [], triggered: false, fromLevel: 2, toLevel: 1, planLevel: 2,
      restored: false, sleepMin: null, lateMin: null, label: null, restoreLabel: null, date: D
    });
  });

  test('睡眠時數邊界：359 分 → 降；360 分（剛好 6 小時）→ 不降', () => {
    const short = dl(night(D, '01:01', '07:00', LATE_OK));
    expect(short).toEqual({
      active: true, reason: 'short', reasons: ['short'], triggered: true, fromLevel: 2, toLevel: 1, planLevel: 1,
      restored: false, sleepMin: 359, lateMin: null, label: '昨晚睡 5 小時 59 分，今天先改成 L1，輕一點也算數。',
      restoreLabel: '恢復 L2', date: D
    });
    expect(dl(night(D, '01:00', '07:00', LATE_OK))).toMatchObject({ active: false, triggered: false, reason: null, sleepMin: 360, planLevel: 2 });
  });

  test('熄燈邊界（就寢 23:00 ±30 → 時段到 23:30）：晚 89 分不降、90 分降、91 分降', () => {
    expect(dl(night(D, '00:59', '08:30'))).toMatchObject({ active: false, triggered: false, lateMin: 89, sleepMin: 451 });
    expect(dl(night(D, '01:00', '08:30'))).toMatchObject({
      active: true, reason: 'late', reasons: ['late'], lateMin: 90, planLevel: 1,
      label: '昨晚熄燈比時段晚 1 小時 30 分，今天先改成 L1，輕一點也算數。', restoreLabel: '恢復 L2'
    });
    expect(dl(night(D, '01:01', '08:30'))).toMatchObject({ active: true, reason: 'late', lateMin: 91 });
  });

  test('用打卡當時存的時段：windowMin 0 → 00:29 不降、00:30 降；之後改設定不影響', () => {
    const t0 = { target: { bedtime: '23:00', wakeTime: '07:00', windowMin: 0 } };
    expect(dl(night(D, '00:29', '08:30', t0), { settings: { windowMin: 120 } })).toMatchObject({ triggered: false, lateMin: 89 });
    expect(dl(night(D, '00:30', '08:30', t0), { settings: { windowMin: 120 } })).toMatchObject({ active: true, reason: 'late', lateMin: 90 });
  });

  test('兩個都符合 → 原因寫睡眠時數，reasons 兩個都列', () => {
    expect(dl(night(D, '01:30', '07:00'))).toMatchObject({
      active: true, reason: 'short', reasons: ['short', 'late'], sleepMin: 330, lateMin: 120,
      label: '昨晚睡 5 小時 30 分，今天先改成 L1，輕一點也算數。'
    });
  });

  test('熄燈比時段早很多不算晚；起床晚不影響', () => {
    expect(dl(night(D, '20:00', '07:00'))).toMatchObject({ triggered: false, lateMin: null });
    expect(dl(night(D, '23:00', '11:30'))).toMatchObject({ triggered: false });
  });

  test('降一級、最低 L1：L3 → L2；L1 → 不降、不顯示卡片（triggered 仍為 true）', () => {
    expect(dl(night(D, '01:01', '07:00', LATE_OK), { level: 3 })).toMatchObject({
      active: true, fromLevel: 3, toLevel: 2, planLevel: 2, restoreLabel: '恢復 L3', label: '昨晚睡 5 小時 59 分，今天先改成 L2，輕一點也算數。'
    });
    expect(dl(night(D, '01:01', '07:00', LATE_OK), { level: 1 })).toMatchObject({
      active: false, triggered: true, reason: 'short', fromLevel: 1, toLevel: 1, planLevel: 1, label: null, restoreLabel: null
    });
  });

  test('恢復只對當天有效：game.deload.restoredOn＝今天 → 不降、顯示「已恢復」；是昨天 → 照樣降', () => {
    const n = night(D, '01:01', '07:00', LATE_OK);
    expect(dl(n, { game: { deload: { restoredOn: D } } })).toMatchObject({
      active: false, restored: true, triggered: true, planLevel: 2, label: '已恢復 L2，照原本的強度練', restoreLabel: null
    });
    expect(dl(n, { game: { deload: { restoredOn: '2026-10-05' } } })).toMatchObject({ active: true, restored: false, planLevel: 1 });
    expect(dl(n, { game: { deload: { restoredOn: ['2026-10-01', D] } } })).toMatchObject({ restored: true, active: false });
    for (const restoredOn of [5, {}, 'today', null, ['x'], '2026-02-30']) {
      expect(dl(n, { game: { deload: { restoredOn } } })).toMatchObject({ restored: false, active: true });
    }
    expect(dl(n, { game: { deload: 'x' } })).toMatchObject({ restored: false, active: true });
  });

  test('今天已經練完 → 不顯示降量卡；只看今天的打卡（昨天睡很少、今天沒打卡 → 不降）', () => {
    const n = night(D, '01:01', '07:00', LATE_OK);
    expect(dl(n, { sessions: [session(D, 'full')] })).toMatchObject({ active: false, triggered: true, label: null, restoreLabel: null, planLevel: 2 });
    const st = makeState({ sleep: [night('2026-10-05', '01:01', '07:00', LATE_OK)] });
    expect(sum(st, at(D, '08:00')).deload).toMatchObject({ triggered: false, active: false });
  });

  test('課表強度無效（null、字串、0、小數）→ 不降，不丟例外', () => {
    for (const level of [null, '2', 0, 2.5, -1, undefined]) {
      const st = makeState({ sleep: [night(D, '01:01', '07:00', LATE_OK)] });
      st.level = level;
      expect(sum(st, at(D, '08:00')).deload).toMatchObject({ active: false, triggered: true, fromLevel: null, toLevel: null, planLevel: null, label: null });
    }
    expect(courseLevel({ level: 4 }, R)).toBe(4);
    expect(courseLevel(null, R)).toBeNull();
    expect(courseLevel({ level: 4 }, null)).toBeNull();
  });

  test('deloadFor 直接呼叫：不到 1 小時寫「N 分鐘」；壞輸入回不降的預設值', () => {
    const score = (minutes, side = null, offMin = 0) => ({ duration: { status: 'base', minutes }, lightsOut: { status: side ? 'base' : 'full', side, offMin } });
    expect(deloadFor({ level: 3 }, D, { score: score(45) }, false, R)).toMatchObject({ active: true, label: '昨晚睡 45 分鐘，今天先改成 L2，輕一點也算數。' });
    expect(deloadFor({ level: 3 }, D, { score: score(420, 'late', 125) }, false, R)).toMatchObject({ reason: 'late', label: '昨晚熄燈比時段晚 2 小時 5 分，今天先改成 L2，輕一點也算數。' });
    for (const bad of [null, 5, {}, { score: null }, { score: { duration: 'x', lightsOut: null } }, { score: { duration: { status: 'none', minutes: 10 } } }]) {
      expect(deloadFor({ level: 3 }, D, bad, false, R)).toMatchObject({ active: false, triggered: false });
    }
    expect(deloadFor({ level: 3 }, D, { score: score(45) }, false, null)).toMatchObject({ active: false, fromLevel: null, date: D });
    expect(deloadFor(null, 'bad', null, false, R)).toMatchObject({ active: false, date: null, fromLevel: null });
    expect(deloadRestoredDates({ game: { deload: { restoredOn: D } } })).toEqual([D]);
    expect(deloadRestoredDates(null)).toEqual([]);
  });
});

test.describe('D19 回歸任務（d12）：中斷後完成任一支柱 → 徽章；3 天內完成 2 支柱的那天 XP ×1.5（一次）', () => {
  const MON = '2026-10-05';
  const rqOf = (st, iso) => sum(st, iso).returnQuest;

  test('沒有紀錄 → none；昨天有完成 → none；第一次使用不算回歸', () => {
    expect(rqOf(makeState(), at(MON))).toEqual({
      stage: 'none', label: null, breakDays: 0, badgeDate: null, boostDate: null, multiplier: 1.5,
      boostUntil: null, daysLeft: null, boostXp: 0, badges: 0, boosts: 0
    });
    expect(rqOf(makeState({ sessions: [session('2026-10-04', 'full')] }), at(MON, '08:00'))).toMatchObject({ stage: 'none' });
    expect(rqOf(makeState({ sessions: [session(MON, 'full')] }), at(MON))).toMatchObject({ stage: 'none', badges: 0 });
  });

  test('只有早安打卡的日子也算活躍日（不是中斷）', () => {
    const st = makeState({ sessions: [session('2026-10-03', 'full')], sleep: [FULL_NIGHT('2026-10-04')] });
    expect(rqOf(st, at(MON))).toMatchObject({ stage: 'none' });
  });

  test('中斷：昨天什麼都沒做 → 今天是回歸任務（不提中斷幾天的文案）', () => {
    const st = makeState({ sessions: [session('2026-10-03', 'full')] });
    expect(rqOf(st, at(MON, '08:00'))).toEqual({
      stage: 'return', label: '回歸任務：今天完成任一支柱，就拿到回歸徽章', breakDays: 1, badgeDate: null, boostDate: null,
      multiplier: 1.5, boostUntil: null, daysLeft: null, boostXp: 0, badges: 0, boosts: 0
    });
  });

  test('回來的那天完成 1 個支柱 → 徽章；3 天內（含今天）可以拿加成', () => {
    const st = makeState({ sessions: [session('2026-10-03', 'full'), session(MON, 'minimal')] });
    expect(rqOf(st, at(MON))).toEqual({
      stage: 'badge', label: '拿到回歸徽章！3 天內有一天完成 2 個支柱，那天 XP ×1.5', breakDays: 1, badgeDate: MON, boostDate: null,
      multiplier: 1.5, boostUntil: '2026-10-07', daysLeft: 3, boostXp: 0, badges: 1, boosts: 0
    });
  });

  test('回來的那天就完成 2 支柱 → 當天 ×1.5：多出來＝基礎 XP × 0.5（Perfect Day +30 不乘）', () => {
    const st = makeState({ sessions: [session('2026-10-03', 'full'), session(MON, 'full')], sleep: [FULL_NIGHT(MON)] });
    const s = sum(st, at(MON));
    expect(s.returnQuest).toMatchObject({ stage: 'boost', badgeDate: MON, boostDate: MON, boostXp: 55, badges: 1, boosts: 1, label: '回歸加成：今天 XP ×1.5，多 55 XP' });
    expect(s.xp).toEqual({ move: 100, sleep: 60, explore: 0, bonus: 85, total: 245, today: 195 }); // 今天：50＋60＋30＋55
  });

  test('徽章隔天完成 2 支柱 → 那天加成；第 3 天再完成 2 支柱不會重複', () => {
    const base = [session('2026-10-02', 'full'), session(MON, 'full')]; // 10/03、10/04 中斷
    const day2 = '2026-10-06';
    const day3 = '2026-10-07';
    const st2 = makeState({ sessions: [...base, session(day2, 'full')], sleep: [FULL_NIGHT(day2)] });
    expect(rqOf(st2, at(day2))).toMatchObject({ stage: 'boost', badgeDate: MON, boostDate: day2, boostXp: 55, breakDays: 2, badges: 1, boosts: 1 });
    const st3 = makeState({ sessions: [...base, session(day2, 'full'), session(day3, 'full')], sleep: [FULL_NIGHT(day2), FULL_NIGHT(day3)] });
    const s3 = sum(st3, at(day3));
    expect(s3.returnQuest).toMatchObject({ stage: 'none', boostXp: 0, badges: 1, boosts: 1, label: null });
    expect(s3.xp.bonus).toBe(30 + 30 + 55); // 兩天 Perfect Day＋一次加成
  });

  test('隔天早上還沒做任何事 → 仍是 badge（剩 2 天）；3 天都只完成 1 支柱 → 第 3 天提醒「今天」，第 4 天沒有加成', () => {
    const base = [session('2026-10-03', 'full'), session(MON, 'full')];
    expect(rqOf(makeState({ sessions: base }), at('2026-10-06', '08:00'))).toMatchObject({
      stage: 'badge', daysLeft: 2, badgeDate: MON, boostUntil: '2026-10-07', label: '回歸加成：2 天內有一天完成 2 個支柱，那天 XP ×1.5'
    });
    const three = [...base, session('2026-10-06', 'full'), session('2026-10-07', 'full')];
    expect(rqOf(makeState({ sessions: three }), at('2026-10-07'))).toMatchObject({
      stage: 'badge', daysLeft: 1, label: '回歸加成：今天完成 2 個支柱，今天 XP ×1.5'
    });
    const late = makeState({ sessions: [...three, session('2026-10-08', 'full')], sleep: [FULL_NIGHT('2026-10-08')] });
    expect(rqOf(late, at('2026-10-08'))).toMatchObject({ stage: 'none', boosts: 0 });
    expect(sum(late, at('2026-10-08')).xp.bonus).toBe(30); // 只有 Perfect Day
  });

  test('加成期間又中斷 → 回到回歸任務；下一次回歸重新給徽章與加成', () => {
    const st = makeState({ sessions: [session('2026-10-03', 'full'), session(MON, 'full')] });
    expect(rqOf(st, at('2026-10-07', '08:00'))).toMatchObject({ stage: 'return', breakDays: 1, badges: 1 });
    const back = makeState({ sessions: [session('2026-10-03', 'full'), session(MON, 'full'), session('2026-10-07', 'full')], sleep: [FULL_NIGHT('2026-10-07')] });
    expect(rqOf(back, at('2026-10-07'))).toMatchObject({ stage: 'boost', badgeDate: '2026-10-07', badges: 2, boosts: 1 });
  });

  test('每次中斷各給一次：兩次中斷 → 兩次加成', () => {
    const sessions = ['2026-10-01', '2026-10-03', '2026-10-06'].map((d) => session(d, 'full'));
    const st = makeState({ sessions, sleep: ['2026-10-03', '2026-10-06'].map(FULL_NIGHT) });
    expect(rqOf(st, at('2026-10-06'))).toMatchObject({ stage: 'boost', badges: 2, boosts: 2 });
    expect(sum(st, at('2026-10-06')).xp.bonus).toBe(2 * 30 + 2 * 55);
  });

  test('中斷好幾天：每天都是回歸任務（breakDays 增加），回來就有徽章', () => {
    const st = makeState({ sessions: [session('2026-09-28', 'full')] });
    expect(rqOf(st, at('2026-10-01', '08:00'))).toMatchObject({ stage: 'return', breakDays: 2 });
    expect(rqOf(st, at(MON, '08:00'))).toMatchObject({ stage: 'return', breakDays: 6 });
    const back = makeState({ sessions: [session('2026-09-28', 'full')], sleep: [FULL_NIGHT(MON)] });
    expect(rqOf(back, at(MON))).toMatchObject({ stage: 'badge', breakDays: 6, badgeDate: MON, badges: 1 });
  });

  test('加成四捨五入：主課表 50＋眠 35 → 85 × 0.5 = 42.5 → 43', () => {
    const st = makeState({ sessions: [session('2026-10-03', 'full'), session(MON, 'full')], sleep: [night(MON, '00:40', '06:58')] });
    const s = sum(st, at(MON));
    expect(s.pillars.sleep.xp).toBe(35);
    expect(s.returnQuest).toMatchObject({ stage: 'boost', boostXp: 43 });
    expect(s.xp.bonus).toBe(30 + 43);
  });

  test('倍數來自規則：multiplier 2 → 多出來＝基礎 XP', () => {
    const r2 = parseRules(variant(RAW, 'returnQuest.multiplier', 2));
    const st = makeState({ sessions: [session('2026-10-03', 'full'), session(MON, 'full')], sleep: [FULL_NIGHT(MON)] });
    expect(sum(st, at(MON), r2).returnQuest).toMatchObject({ boostXp: 110, multiplier: 2, label: '回歸加成：今天 XP ×2，多 110 XP' });
  });

  test('returnQuest 直接呼叫：空事實 → none', () => {
    expect(returnQuest(new Map(), 100, R)).toEqual({
      stage: 'none', breakDays: 0, badgeNum: null, boostNum: null, untilNum: null, badges: 0, boosts: 0, boostXp: 0, boostToday: 0
    });
  });
});

test.describe('壞資料、不改動 state、決定性、只加不減', () => {
  const NOW = at('2026-10-05');
  const STAGES = ['none', 'return', 'badge', 'boost'];

  function saneV2a(s) {
    expect(s).not.toBeNull();
    const { xp, perfectDay: pd, freeze: fz, deload: dl, returnQuest: rq, streak } = s;
    for (const v of [xp.move, xp.sleep, xp.explore, xp.bonus, xp.total, xp.today]) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
    expect(xp.total).toBe(xp.move + xp.sleep + xp.explore + xp.bonus);
    expect(s.level.totalXp).toBe(xp.total);
    expect([0, R.perfectDay.xp]).toContain(pd.xp);
    expect(pd.done).toBe(pd.have.length === pd.need.length);
    expect(pd.have.every((p) => pd.need.includes(p))).toBe(true);
    expect(pd.weekCount).toBeLessThanOrEqual(pd.count);
    expect(pd.date).toBe(s.date);
    expect(fz.tokens).toBeGreaterThanOrEqual(0);
    expect(fz.tokens).toBeLessThanOrEqual(fz.max);
    expect([...fz.usedDates].sort()).toEqual(fz.usedDates);
    expect(fz.usedTotal).toBe(fz.usedDates.length);
    expect(streak.frozenDays).toBeGreaterThanOrEqual(0);
    expect(streak.frozenDays).toBeLessThanOrEqual(fz.usedTotal);
    expect(typeof dl.active).toBe('boolean');
    expect([null, 'short', 'late']).toContain(dl.reason);
    if (dl.active) {
      expect(dl.toLevel).toBeLessThan(dl.fromLevel);
      expect(typeof dl.label).toBe('string');
      expect(typeof dl.restoreLabel).toBe('string');
    }
    expect(STAGES).toContain(rq.stage);
    expect(rq.multiplier).toBe(R.returnQuest.multiplier);
    expect(rq.boostXp).toBeGreaterThanOrEqual(0);
    expect(rq.boosts).toBeLessThanOrEqual(rq.badges);
    expect(rq.stage === 'none' ? rq.label === null : typeof rq.label === 'string').toBe(true);
  }

  test('state 是 null、數字、陣列、空物件、壞 game → V2a 欄位都是安全預設', () => {
    for (const st of [null, undefined, 42, 'x', [], {}, { game: 5 }, { game: { deload: [] } }, { level: 'x' }, { habits: { sleep: { log: 5 } } }]) {
      const s = sum(st, NOW);
      saneV2a(s);
      expect(s.xp).toEqual({ move: 0, sleep: 0, explore: 0, bonus: 0, total: 0, today: 0 });
      expect(s.perfectDay).toMatchObject({ done: false, count: 0, need: ['move', 'sleep'] });
      expect(s.freeze).toMatchObject({ tokens: 0, usedDates: [] });
      expect(s.deload.active).toBe(false);
      expect(s.returnQuest.stage).toBe('none');
    }
  });

  test('所有 fixture（含被舊版改回 v2、型別錯、超大值）都不丟例外', () => {
    for (const name of [...ALL_FIXTURES, 'v3-checkin.json', 'v3-checkin-reverted-to-v2.json', 'v3-bad-sleep.json']) {
      for (const iso of [NOW, at('2026-10-03', '08:00'), at('2026-12-31', '23:00')]) saneV2a(sum(loadFixture(name), iso));
    }
  });

  test('fuzz：400 份隨機壞 state（含奇怪的 game.deload、課表強度、重複與未來的日期）', () => {
    const rand = rng(20261006);
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];
    const dates = ['2026-09-28', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-09', 'bad', null, 7];
    const atoms = [null, undefined, 0, -1, 2.5, NaN, '', 'x', true, [], {}, '2026-10-05', '__proto__', '2026-10-05T06:58:00+09:00', '2026-10-05T01:30:00+09:00'];
    for (let i = 0; i < 400; i++) {
      const sessions = Array.from({ length: Math.floor(rand() * 10) }, () => (rand() < 0.15 ? pick(atoms) : { date: pick(dates), type: pick(['full', 'minimal', 'boss', 5, null]), plus: pick([true, false, 'x']) }));
      const log = Array.from({ length: Math.floor(rand() * 6) }, () => {
        if (rand() < 0.15) return pick(atoms);
        const d = pick(dates);
        const ok = typeof d === 'string' && d !== 'bad';
        return {
          date: d,
          wake: ok && rand() < 0.8 ? `${d}T0${pick([5, 6, 7, 8, 9])}:${pick(['00', '29', '59'])}:00+09:00` : pick(atoms),
          lightsOut: ok && rand() < 0.8 ? `${d}T0${pick([0, 1, 2])}:${pick(['00', '30', '59'])}:00+09:00` : pick(atoms),
          target: rand() < 0.5 ? undefined : pick([{ bedtime: '23:00', wakeTime: '07:00', windowMin: pick([0, 30, -1, 'x']) }, null, 'x'])
        };
      });
      const st = rand() < 0.05 ? pick(atoms) : {
        level: pick([1, 2, 3, 5, 0, null, '3', 2.5]),
        sessions: rand() < 0.1 ? pick(atoms) : sessions,
        habits: { sleep: { log: rand() < 0.1 ? pick(atoms) : log } },
        settings: rand() < 0.3 ? pick(atoms) : { bedtime: pick(['23:00', 'x', null]), wakeTime: '07:00', windowMin: pick([30, -1, 'x']) },
        phase: rand() < 0.3 ? pick(atoms) : { current: pick(['P1', 'P2', 'P3', null]), startedAt: pick(atoms) },
        game: rand() < 0.2 ? pick(atoms) : { freezeTokens: pick(atoms), perfectDays: pick(atoms), deload: rand() < 0.5 ? pick(atoms) : { restoredOn: pick([...atoms, ['2026-10-05'], ['x', 5]]) } }
      };
      const iso = pick([NOW, at('2026-10-05', '03:59'), at('2026-10-05', '08:00'), at('2026-10-06', '08:00'), at('2026-10-02', '12:00')]);
      saneV2a(sum(st, iso));
    }
  });

  test('凍結的 state 也能算、結果相同（證明不改動 state）；同樣輸入同樣輸出', () => {
    const make = () => {
      const dates = [...span('2026-09-20', 7), ...span('2026-09-28', 3), '2026-10-03', '2026-10-05'];
      const st = makeState({ sessions: train(dates), sleep: ['2026-09-29', '2026-09-30', '2026-10-03', '2026-10-05'].map((d) => night(d, '01:20', '06:58')) });
      st.game.deload = { restoredOn: '2026-10-04' };
      return st;
    };
    const plain = make();
    const before = JSON.stringify(plain);
    for (const iso of [NOW, at('2026-10-05', '08:00'), at('2026-10-04'), at('2026-10-07')]) {
      const a = sum(plain, iso);
      expect(JSON.stringify(plain)).toBe(before);
      const frozen = sum(deepFreeze(make()), iso);
      expect(frozen).toEqual(a);
      expect(sum(plain, iso)).toStrictEqual(a);
      saneV2a(a);
    }
    /* 回傳的陣列是新的：改它不會影響下一次結果 */
    const a = sum(plain, NOW);
    a.freeze.usedDates.push('x');
    a.perfectDay.need.push('x');
    expect(sum(plain, NOW).freeze.usedDates).not.toContain('x');
    expect(sum(plain, NOW).perfectDay.need).toEqual(['move', 'sleep']);
    expect(R.phases.P1.pillars).toEqual(['move', 'sleep']);
  });

  test('只加不減：每天只新增當天的紀錄、時間往前走 → 總 XP 與等級永遠不會下降（60 天 × 30 份隨機）', () => {
    const rand = rng(7);
    for (let k = 0; k < 30; k++) {
      const sessions = [];
      const sleep = [];
      let prevTotal = -1;
      let prevLv = 0;
      for (let i = 0; i < 60; i++) {
        const d = plusDays('2026-08-01', i);
        for (const iso of [at(d, '06:00'), at(d, '23:00')]) {
          const s = sum(makeState({ sessions: [...sessions], sleep: [...sleep] }), iso);
          expect(s.xp.total).toBeGreaterThanOrEqual(prevTotal);
          expect(s.level.lv).toBeGreaterThanOrEqual(prevLv);
          prevTotal = s.xp.total;
          prevLv = s.level.lv;
          if (iso.endsWith('06:00:00+09:00')) {
            if (rand() < 0.6) sleep.push(night(d, pick(rand, ['22:50', '23:40', '01:10']), pick(rand, ['06:40', '07:20', '08:10'])));
            if (rand() < 0.55) sessions.push(session(d, pick(rand, ['minimal', 'full', 'boss'])));
          }
        }
      }
    }
    function pick(r, arr) { return arr[Math.floor(r() * arr.length)]; }
  });
});
