/* game-designer：js/game/engine.js 單元測試——XP 分級、等級曲線、連續天數、階段與探索閘門、下一步、壞資料（純 Node） */
import { test, expect } from '@playwright/test';
import { parseRules } from '../js/game/rules.js';
import { todaySummary, levelFromXp, aftGaps } from '../js/game/engine.js';
import { moveTier, moveDays } from '../js/habits/move.js';
import {
  readRulesRaw, readSource, loadFixture, ALL_FIXTURES, useTZ, variant, makeState, night, session, plusDays, deepFreeze, rng
} from './game.helpers.js';

useTZ(test);
const RAW = readRulesRaw();
const R = parseRules(RAW);
const at = (iso) => new Date(iso);
const sum = (state, iso, rules = R) => todaySummary(state, at(iso), rules);
const NEXT_KINDS = ['checkin', 'workout', 'boss', 'done'];

test.describe('動：各分級 XP（保底 30／主課表 50／加一輪 60）', () => {
  const cases = [
    ['minimal', {}, 30, 'minimal', '保底版'],
    ['full', {}, 50, 'main', '主課表'],
    ['cycle', {}, 50, 'main', '主課表（週三加練日）'],
    ['rest', {}, 50, 'main', '恢復日'],
    ['rain', {}, 50, 'main', '雨天替代'],
    ['boss', {}, 60, 'plus', 'Boss Day'],
    ['full', { plus: true }, 60, 'plus', '加一輪'],
    ['cycle', { plus: true }, 60, 'plus', '加一輪'],
    ['plus', {}, 60, 'plus', '加一輪'],
    ['yoga', {}, 50, 'main', '主課表'],
    ['full', { plus: 'yes' }, 50, 'main', '主課表']
  ];
  for (const [type, extra, xp, tier, label] of cases) {
    test(`${type}${extra.plus !== undefined ? ` plus=${extra.plus}` : ''} → ${tier} ${xp}`, () => {
      const s = sum(makeState({ sessions: [session('2026-10-05', type, extra)] }), '2026-10-05T20:00:00+09:00');
      expect(s.pillars.move).toEqual({ xp, max: 60, tier, done: true, type, label });
    });
  }

  test('type 不是字串 → 主課表；沒有紀錄 → none', () => {
    const s = sum(makeState({ sessions: [{ date: '2026-10-05', type: 5 }] }), '2026-10-05T20:00:00+09:00');
    expect(s.pillars.move).toEqual({ xp: 50, max: 60, tier: 'main', done: true, type: null, label: '主課表' });
    expect(sum(makeState(), '2026-10-05T20:00:00+09:00').pillars.move).toEqual({ xp: 0, max: 60, tier: 'none', done: false, type: null, label: null });
  });

  test('同一天多筆取最高的一級（保底後補完整版、Boss 後又練）', () => {
    const day = (list) => sum(makeState({ sessions: list }), '2026-10-05T20:00:00+09:00').pillars.move;
    expect(day([session('2026-10-05', 'minimal'), session('2026-10-05', 'full')])).toMatchObject({ xp: 50, tier: 'main' });
    expect(day([session('2026-10-05', 'full', { plus: true }), session('2026-10-05', 'minimal')])).toMatchObject({ xp: 60, label: '加一輪' });
    expect(day([session('2026-10-05', 'boss'), session('2026-10-05', 'full')])).toMatchObject({ xp: 60, label: 'Boss Day' });
  });

  test('moveTier／moveDays 直接呼叫', () => {
    expect(moveTier({ type: 'full' }, R)).toBe('main');
    expect(moveTier({ type: 'constructor' }, R)).toBe('main');
    expect(moveTier(null, R)).toBeNull();
    expect(moveTier({ type: 'full' }, null)).toBeNull();
    expect(moveDays(makeState({ sessions: [session('2026-10-05', 'boss')] }), R).get('2026-10-05')).toEqual({ tier: 'plus', xp: 60, type: 'boss', plus: false, label: 'Boss Day' });
    expect(moveDays({ sessions: 'x' }, R).size).toBe(0);
  });
});

test.describe('XP 由紀錄推導（可重算）', () => {
  test('v3 fixture：35 筆訓練 → 動 1760 XP，Lv 6（260 / 450）', () => {
    const s = sum(loadFixture('v3.json'), '2026-10-02T15:30:00+09:00');
    expect(s.xp).toEqual({ move: 1760, sleep: 0, explore: 0, total: 1760 });
    expect(s.level).toEqual({ lv: 6, xpInto: 260, xpNeed: 450, totalXp: 1760, label: 'Lv 6' });
  });

  test('v2-real fixture：32 筆訓練 → 1610 XP', () => {
    const s = sum(loadFixture('v2-real.json'), '2026-10-02T15:30:00+09:00');
    expect(s.xp.move).toBe(1610);
    expect(s.level).toMatchObject({ lv: 6, xpInto: 110, xpNeed: 450 });
  });

  test('早安打卡的 XP 加進總 XP；舊的 xp／game.xp 欄位不影響結果', () => {
    const st = loadFixture('v3.json');
    st.habits.sleep.log = [night('2026-10-01', '23:00', '06:58'), night('2026-10-02', '00:40', '06:58')];
    st.xp = 999999;
    st.game.xp = { move: 5, sleep: 5, explore: 5, total: 15 };
    const s = sum(st, '2026-10-02T15:30:00+09:00');
    expect(s.xp).toEqual({ move: 1760, sleep: 95, explore: 0, total: 1855 });
    expect(s.pillars.sleep.xp).toBe(35);
    expect(s.pillars.sleep.checkedIn).toBe(true);
    expect(s.pillars.sleep.entry).toEqual(st.habits.sleep.log[1]);
    expect(s.pillars.sleep.entry).not.toBe(st.habits.sleep.log[1]); // 回傳的是複本
    expect(s.pillars.sleep.score.lines.map((l) => l.xp)).toEqual([30, 5, 0]);
  });

  test('探索本版不計 XP，探環鎖定', () => {
    const st = makeState();
    st.habits.explore = { items: [{ id: 'dj', name: 'DJ' }], log: [{ date: '2026-10-05', itemId: 'dj', interest: 5 }] };
    const s = sum(st, '2026-10-05T20:00:00+09:00');
    expect(s.xp.explore).toBe(0);
    expect(s.pillars.explore).toMatchObject({ locked: true, open: false, xp: 0, max: 60 });
  });
});

test.describe('等級曲線：下一級需 200 + 50 ×（等級 − 1）', () => {
  test('邊界', () => {
    const lv = (x) => levelFromXp(x, R);
    expect(lv(0)).toEqual({ lv: 1, xpInto: 0, xpNeed: 200, totalXp: 0, label: 'Lv 1' });
    expect(lv(199)).toMatchObject({ lv: 1, xpInto: 199, xpNeed: 200 });
    expect(lv(200)).toMatchObject({ lv: 2, xpInto: 0, xpNeed: 250 });
    expect(lv(449)).toMatchObject({ lv: 2, xpInto: 249, xpNeed: 250 });
    expect(lv(450)).toMatchObject({ lv: 3, xpInto: 0, xpNeed: 300 });
    expect(lv(1099)).toMatchObject({ lv: 4, xpInto: 349, xpNeed: 350 }); // mockup：Lv 4 · x / 350
    expect(lv(1100)).toMatchObject({ lv: 5, xpInto: 0, xpNeed: 400, label: 'Lv 5' });
    expect(lv(1950)).toMatchObject({ lv: 7, xpInto: 0, xpNeed: 500 });
  });

  test('任何等級的累計門檻都等於公式加總', () => {
    let cum = 0;
    for (let L = 1; L <= 60; L++) {
      expect(levelFromXp(cum, R)).toMatchObject({ lv: L, xpInto: 0, xpNeed: 200 + 50 * (L - 1) });
      expect(levelFromXp(cum + 200 + 50 * (L - 1) - 1, R).lv).toBe(L);
      cum += 200 + 50 * (L - 1);
    }
  });

  test('壞輸入：負數、NaN、字串 → Lv 1；小數無條件捨去；超大值仍有限；rules 無效 → null', () => {
    for (const x of [-5, NaN, Infinity, '300', null, undefined, {}]) expect(levelFromXp(x, R)).toMatchObject({ lv: 1, xpInto: 0, totalXp: 0 });
    expect(levelFromXp(212.9, R)).toMatchObject({ lv: 2, xpInto: 12, totalXp: 212 });
    const big = levelFromXp(30000000, R);
    expect(Number.isFinite(big.lv) && big.lv > 1).toBe(true);
    expect(levelFromXp(100, null)).toBeNull();
  });
});

test.describe('連續天數：首頁用 train（有練就算）', () => {
  test('v3：昨天有練、今天還沒 → 連續 12 天（不算中斷）', () => {
    expect(sum(loadFixture('v3.json'), '2026-10-02T15:30:00+09:00').streak).toEqual({
      days: 12, best: 12, lastDate: '2026-10-01', todayDone: false, kind: 'train', label: '連續 12 天'
    });
    expect(sum(loadFixture('v3.json'), '2026-10-01T20:00:00+09:00').streak).toMatchObject({ days: 12, todayDone: true });
  });

  test('中斷超過一天 → 0，最佳紀錄保留', () => {
    expect(sum(loadFixture('v3.json'), '2026-10-03T09:00:00+09:00').streak).toMatchObject({ days: 0, best: 12, lastDate: '2026-10-01', label: '連續 0 天' });
  });

  test('今天以後的紀錄（時鐘或時區造成）不算進連續天數', () => {
    const st = makeState({ sessions: [session('2026-10-01', 'full'), session('2026-10-02', 'full'), session('2026-10-10', 'full')] });
    expect(sum(st, '2026-10-02T20:00:00+09:00').streak).toMatchObject({ days: 2, best: 2, lastDate: '2026-10-02', todayDone: true });
  });

  test('用遊戲日：凌晨 03:00 還算前一天', () => {
    const st = makeState({ sessions: [session('2026-10-04', 'boss')] });
    expect(sum(st, '2026-10-05T03:00:00+09:00').streak).toMatchObject({ days: 1, todayDone: true });
    expect(sum(st, '2026-10-05T04:00:00+09:00').streak).toMatchObject({ days: 1, todayDone: false });
  });

  test('rules 切到 life：當日動＋眠都完成才算', () => {
    const life = parseRules(variant(RAW, 'streak.home', 'life'));
    const st = makeState({
      sessions: ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'].map((d) => session(d, 'full')),
      sleep: ['2026-10-02', '2026-10-03', '2026-10-04'].map((d) => night(d, '23:00', '07:00'))
    });
    expect(sum(st, '2026-10-04T20:00:00+09:00', life).streak).toEqual({
      days: 3, best: 3, lastDate: '2026-10-04', todayDone: true, kind: 'life', label: '連續 3 天'
    });
  });
});

test.describe('階段：P1 睡飽 · 第 N 天', () => {
  test('沒有起點也還沒打卡 → 不顯示第幾天', () => {
    expect(sum(makeState(), '2026-10-05T20:00:00+09:00').phase).toEqual({ current: 'P1', day: null, week: null, label: 'P1 睡飽', name: '睡飽' });
  });

  test('沒有 startedAt 時，以第一筆早安打卡為第 1 天', () => {
    const st = makeState({ sleep: [night('2026-10-05', '23:00', '06:58')] });
    expect(sum(st, '2026-10-05T07:00:00+09:00').phase).toMatchObject({ day: 1, label: 'P1 睡飽 · 第 1 天' });
    expect(sum(st, '2026-10-09T07:00:00+09:00').phase).toMatchObject({ day: 5, week: 1, label: 'P1 睡飽 · 第 5 天' });
  });

  test('phase.startedAt（ISO 或日期）優先；04:00 前的時間算前一天；未來的起點不採用', () => {
    const p = (startedAt) => sum(makeState({ phase: { startedAt } }), '2026-10-05T20:00:00+09:00').phase;
    expect(p('2026-10-01T08:00:00+09:00')).toMatchObject({ day: 5, label: 'P1 睡飽 · 第 5 天' });
    expect(p('2026-10-01')).toMatchObject({ day: 5 });
    expect(p('2026-10-01T03:00:00+09:00')).toMatchObject({ day: 6 });
    expect(p('2026-12-01')).toMatchObject({ day: null, label: 'P1 睡飽' });
    expect(p({})).toMatchObject({ day: null });
  });

  test('探索未開放：state 寫 P2／P3 也維持 P1；不認得的階段 → P1', () => {
    for (const current of ['P2', 'P3', 'P9', null, 3]) {
      const s = sum(makeState({ phase: { current, startedAt: '2026-10-01' } }), '2026-10-05T20:00:00+09:00');
      expect(s.phase.current).toBe('P1');
      expect(s.pillars.explore.locked).toBe(true);
    }
  });

  test('探索開放後（之後的版本）：P2 用「第 N 週」、探環解鎖；P1 的探環仍鎖定', () => {
    const open = parseRules(variant(RAW, 'explore.open', true));
    const p2 = sum(makeState({ phase: { current: 'P2', startedAt: '2026-10-01' } }), '2026-10-20T20:00:00+09:00', open);
    expect(p2.phase).toEqual({ current: 'P2', day: 20, week: 3, label: 'P2 探索 · 第 3 週', name: '探索' });
    expect(p2.pillars.explore).toMatchObject({ locked: false, open: true });
    expect(sum(makeState(), '2026-10-20T20:00:00+09:00', open).pillars.explore.locked).toBe(true);
  });
});

test.describe('P1→P2：近 14 天 ≥10 天起床在時段內；探索未開放時的閘門', () => {
  const NOW = '2026-10-20T20:00:00+09:00';
  const days = (from, n) => Array.from({ length: n }, (_, i) => plusDays(from, i));
  const unlock = (sleep) => sum(makeState({ sleep }), NOW);

  test('9 天 → 9 / 10，還沒達成', () => {
    const sleep = [...days('2026-10-07', 5).map((d) => night(d, '23:00', '07:31')), ...days('2026-10-12', 9).map((d) => night(d, '23:00', '07:00'))];
    const s = unlock(sleep);
    expect(s.pillars.explore.unlock).toEqual({
      have: 9, need: 10, count: 9, windowDays: 14, ready: false,
      title: '近 14 天起床在時段內 10 天後解鎖', label: '9 / 10 天 · 先把睡眠顧好', short: '解鎖 9/10'
    });
  });

  test('10 天 → 條件達成；探索未開放 → 階段維持 P1、探環鎖定、顯示「探索下一版開放」', () => {
    const sleep = [...days('2026-10-07', 4).map((d) => night(d, '23:00', '07:31')), ...days('2026-10-11', 10).map((d) => night(d, '23:00', '07:00'))];
    const s = unlock(sleep);
    expect(s.pillars.explore.unlock).toEqual({
      have: 10, need: 10, count: 10, windowDays: 14, ready: true,
      title: '條件達成', label: '條件達成，探索下一版開放', short: '下一版開放'
    });
    expect(s.phase.current).toBe('P1');
    expect(s.pillars.explore).toMatchObject({ locked: true, open: false });
  });

  test('只算「時段內」：差 30 分內（near）不算', () => {
    const s = unlock(days('2026-10-07', 14).map((d) => night(d, '23:00', '07:31')));
    expect(s.pillars.explore.unlock).toMatchObject({ have: 0, count: 0, ready: false });
  });

  test('10 天分散在 19 天裡（任何 14 天內最多 7 天）→ 不算達成', () => {
    const sleep = Array.from({ length: 10 }, (_, i) => night(plusDays('2026-10-02', i * 2), '23:00', '07:00'));
    expect(unlock(sleep).pillars.explore.unlock).toMatchObject({ count: 7, have: 7, ready: false, label: '7 / 10 天 · 先把睡眠顧好' });
  });

  test('一旦達成就保留：舊的日子滑出 14 天也不倒退', () => {
    const s = unlock(days('2026-10-06', 10).map((d) => night(d, '23:00', '07:00')));
    expect(s.pillars.explore.unlock).toMatchObject({ count: 9, have: 10, ready: true, label: '條件達成，探索下一版開放' });
    const later = sum(makeState({ sleep: days('2026-10-06', 10).map((d) => night(d, '23:00', '07:00')) }), '2026-12-01T20:00:00+09:00');
    expect(later.pillars.explore.unlock).toMatchObject({ count: 0, ready: true });
  });

  test('今天以後的紀錄不算', () => {
    const s = unlock(days('2026-10-21', 10).map((d) => night(d, '23:00', '07:00')));
    expect(s.pillars.explore.unlock).toMatchObject({ count: 0, ready: false });
  });

  test('用紀錄裡的目標判斷：之後改起床目標，已達成的天數不變', () => {
    const sleep = days('2026-10-11', 10).map((d) => ({ ...night(d, '23:00', '07:00'), target: { bedtime: '23:00', wakeTime: '07:00', windowMin: 30 } }));
    const s = sum(makeState({ sleep, settings: { wakeTime: '05:00' } }), NOW);
    expect(s.pillars.explore.unlock).toMatchObject({ count: 10, ready: true });
  });
});

test.describe('下一步（nextAction）', () => {
  const next = (state, iso) => sum(state, iso).nextAction;
  const MON = '2026-10-05';
  const SUN = '2026-10-04';

  test('早上還沒打卡 → 早安打卡', () => {
    expect(next(makeState(), `${MON}T06:58:00+09:00`)).toEqual({ kind: 'checkin', label: '早安打卡' });
  });

  test('已打卡、還沒練 → 今日課表', () => {
    expect(next(makeState({ sleep: [night(MON, '23:00', '06:58')] }), `${MON}T07:10:00+09:00`)).toEqual({ kind: 'workout', label: '開始今日課表' });
  });

  test('週日已打卡、還沒練 → Boss Day', () => {
    expect(next(makeState({ sleep: [night(SUN, '23:00', '07:00')] }), `${SUN}T08:00:00+09:00`)).toEqual({ kind: 'boss', label: '開始 Boss Day' });
  });

  test('打卡＋訓練都完成 → 完成', () => {
    const st = makeState({ sleep: [night(SUN, '23:00', '07:00')], sessions: [session(SUN, 'boss')] });
    expect(next(st, `${SUN}T20:00:00+09:00`)).toEqual({ kind: 'done', label: '今天都完成了' });
  });

  test('先練了、還沒打卡（時段內）→ 仍先早安打卡', () => {
    expect(next(makeState({ sessions: [session(MON, 'full')] }), `${MON}T06:00:00+09:00`).kind).toBe('checkin');
  });

  test('打卡時段已過：沒打卡也直接到課表；練完就完成', () => {
    expect(next(makeState(), `${MON}T13:00:00+09:00`).kind).toBe('workout');
    expect(next(makeState({ sessions: [session(MON, 'full')] }), `${MON}T13:00:00+09:00`).kind).toBe('done');
  });

  test('週一凌晨 03:30 仍是週日（遊戲日）→ Boss Day；週日練過 → 完成', () => {
    expect(next(makeState(), `${MON}T03:30:00+09:00`).kind).toBe('boss');
    expect(next(makeState({ sessions: [session(SUN, 'boss')] }), `${MON}T03:30:00+09:00`).kind).toBe('done');
  });

  test('週六（恢復日）→ 今日課表；摘要帶遊戲日與星期', () => {
    const s = sum(makeState(), '2026-10-03T13:00:00+09:00');
    expect(s.nextAction.kind).toBe('workout');
    expect([s.date, s.weekday]).toEqual(['2026-10-03', 6]);
    expect(s.checkIn).toMatchObject({ open: false, code: 'late' });
  });
});

test.describe('AFT 自選目標差距', () => {
  test('mockup 數字：差 4 下、差 18 秒、差 1:43（取歷來最佳）', () => {
    /* 最佳成績刻意不放最後一筆：要取「歷來最佳」，不是最新一次 */
    const prs = {
      hrp: [{ date: '2026-09-06', reps: 11 }, { date: '2026-09-27', reps: 9 }],
      plank: [{ date: '2026-09-13', sec: 72 }, { date: '2026-09-20', sec: 60 }],
      run2mi: [{ date: '2026-08-30', sec: 1300 }, { date: '2026-09-20', sec: 1350 }]
    };
    const g = aftGaps(makeState({ prs }), R);
    expect(g.title).toBe('AFT 自選目標差距');
    expect(g.subtitle).toContain('自選目標');
    expect(g.items).toEqual([
      { key: 'hrp', name: 'HRP 伏地挺身', unit: 'reps', target: 15, best: 11, gap: 4, met: false, bestText: '11 下', targetText: '15 下', gapText: '差 4 下' },
      { key: 'plank', name: 'Plank', unit: 'sec', target: 90, best: 72, gap: 18, met: false, bestText: '1:12', targetText: '1:30', gapText: '差 18 秒' },
      { key: 'run2mi', name: '2 英里跑', unit: 'sec', target: 1197, best: 1300, gap: 103, met: false, bestText: '21:40', targetText: '19:57', gapText: '差 1:43' }
    ]);
  });

  test('達標、差超過 1 分鐘、沒有紀錄、壞紀錄', () => {
    const g = aftGaps(makeState({ prs: { hrp: [{ reps: 15 }], plank: [{ sec: 20 }], run2mi: [{ sec: 0 }, { sec: 'x' }, null] } }), R);
    expect(g.items[0]).toMatchObject({ met: true, gap: 0, gapText: '已達自選目標' });
    expect(g.items[1]).toMatchObject({ gap: 70, gapText: '差 1:10' });
    expect(g.items[2]).toMatchObject({ best: null, gap: null, met: false, bestText: '—', gapText: '尚無紀錄' });
    for (const st of [null, {}, { prs: 'x' }, { prs: { hrp: 'x' } }]) expect(aftGaps(st, R).items.every((i) => i.gapText === '尚無紀錄')).toBe(true);
    expect(aftGaps(makeState(), null)).toBeNull();
  });
});

test.describe('壞資料不丟例外、不改動 state、決定性', () => {
  const NOW = '2026-10-05T20:00:00+09:00';

  function sane(s) {
    expect(s).not.toBeNull();
    for (const v of [s.xp.move, s.xp.sleep, s.xp.explore, s.xp.total, s.level.lv, s.level.xpInto, s.level.xpNeed, s.streak.days, s.streak.best]) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
    expect(s.level.lv).toBeGreaterThanOrEqual(1);
    expect(s.streak.best).toBeGreaterThanOrEqual(s.streak.days);
    expect([0, 30, 50, 60]).toContain(s.pillars.move.xp);
    expect(s.pillars.sleep.xp).toBeGreaterThanOrEqual(0);
    expect(s.pillars.sleep.xp).toBeLessThanOrEqual(60);
    expect(NEXT_KINDS).toContain(s.nextAction.kind);
    expect(['P1', 'P2', 'P3']).toContain(s.phase.current);
    expect(typeof s.checkIn.code).toBe('string');
  }

  test('state 是 null、數字、字串、陣列、空物件 → 預設值', () => {
    for (const st of [null, undefined, 42, 'x', [], {}, { sessions: 'x' }, { sessions: {} }, { habits: 5 }, { settings: [] }, { phase: 'P2' }]) {
      const s = sum(st, NOW);
      sane(s);
      expect(s.xp.total).toBe(0);
      expect(s.level).toMatchObject({ lv: 1, xpInto: 0 });
      expect(s.streak.days).toBe(0);
      expect(s.nextAction.kind).toBe('workout');
      expect(s.phase.label).toBe('P1 睡飽');
    }
  });

  test('混合壞資料：略過壞項目、其餘照算', () => {
    const st = {
      sessions: [null, 1, 'a', [], {}, { date: 'bad' }, { date: '2026-02-30', type: 'full' }, { date: '2026-10-05', type: 5 },
        { date: '2026-10-04', type: '__proto__' }, { date: '2026-10-03', type: 'constructor' }, { date: '2026-10-02', type: 'toString', plus: 'yes' }],
      habits: {
        sleep: { log: [null, { date: '2026-10-05', wake: 'garbage', lightsOut: 5, target: 'x' },
          { date: '2026-10-04', wake: '2026-10-04T07:00:00+09:00', lightsOut: '2026-10-03T23:00:00+09:00', target: { bedtime: 5, wakeTime: null, windowMin: -3 } }] },
        explore: 'x'
      },
      settings: { bedtime: 99, wakeTime: '7', windowMin: -5 },
      phase: { current: 'P9', startedAt: {} },
      prs: { hrp: 'x', plank: [{ sec: 'a' }, null, { sec: -1 }], run2mi: [{ sec: 0 }, { sec: NaN }] }
    };
    const s = sum(st, NOW);
    sane(s);
    expect(s.xp).toEqual({ move: 200, sleep: 60, explore: 0, total: 260 });
    expect(s.pillars.move).toMatchObject({ tier: 'main', xp: 50, type: null });
    expect(s.pillars.sleep).toMatchObject({ checkedIn: true, xp: 0 });
    expect(s.streak).toMatchObject({ days: 4, best: 4 });
    expect(s.phase).toMatchObject({ current: 'P1', day: 2 });
    expect(aftGaps(st, R).items.map((i) => i.gapText)).toEqual(['尚無紀錄', '尚無紀錄', '尚無紀錄']);
  });

  test('所有 fixture（未遷移的原始檔，含型別錯與超大值）都不丟例外', () => {
    for (const name of ALL_FIXTURES) {
      const st = loadFixture(name);
      sane(sum(st, NOW));
      expect(aftGaps(st, R)).not.toBeNull();
    }
  });

  test('fuzz：300 份隨機壞 state', () => {
    const rand = rng(20261004);
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];
    const atoms = [null, undefined, 0, -1, 1.5, NaN, Infinity, '', 'x', true, [], {}, '2026-10-05', '2026-02-30', '07:00', '25:00',
      '2026-10-05T06:58:00+09:00', '2026-10-04T23:00:00+09:00', '2026-10-05T23:59:00-07:00', '__proto__'];
    const dates = ['2026-10-01', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', 'bad', null, 5];
    const any = (depth = 0) => {
      const r = rand();
      if (depth > 2 || r < 0.6) return pick(atoms);
      if (r < 0.8) return Array.from({ length: Math.floor(rand() * 4) }, () => any(depth + 1));
      return Object.fromEntries(Array.from({ length: Math.floor(rand() * 4) }, () => [pick(['date', 'type', 'wake', 'lightsOut', 'target', 'plus', 'x']), any(depth + 1)]));
    };
    const sessionLike = () => (rand() < 0.2 ? any() : { date: pick(dates), type: pick(['full', 'boss', 'minimal', 'rain', 5, null, 'x']), plus: pick([true, false, 'yes', undefined]) });
    const sleepLike = () => (rand() < 0.2 ? any() : {
      date: pick(dates), wake: pick(atoms), lightsOut: pick(atoms), lightsOutEdited: pick(atoms),
      target: rand() < 0.5 ? any() : { bedtime: pick(atoms), wakeTime: pick(atoms), windowMin: pick([30, 0, -1, 999, '30', null]) }
    });
    for (let i = 0; i < 300; i++) {
      const st = rand() < 0.1 ? any() : {
        sessions: rand() < 0.1 ? any() : Array.from({ length: Math.floor(rand() * 8) }, sessionLike),
        habits: rand() < 0.1 ? any() : { sleep: rand() < 0.1 ? any() : { log: Array.from({ length: Math.floor(rand() * 6) }, sleepLike) } },
        settings: rand() < 0.3 ? any() : { bedtime: pick(atoms), wakeTime: pick(atoms), windowMin: pick([30, -1, 1e9, 'x', null]) },
        phase: rand() < 0.3 ? any() : { current: pick(['P1', 'P2', 'P3', 'P0', null, 2]), startedAt: pick(atoms) },
        prs: rand() < 0.3 ? any() : { hrp: [{ reps: pick(atoms) }], plank: any(), run2mi: [{ sec: pick([1197, 0, -3, 'x', NaN]) }] }
      };
      const iso = pick(['2026-10-05T06:58:00+09:00', '2026-10-05T03:59:00+09:00', '2026-10-04T08:00:00+09:00', '2026-10-05T13:00:00+09:00']);
      sane(sum(st, iso));
      expect(aftGaps(st, R)).not.toBeNull();
    }
  });

  test('凍結的 state 也能算（證明不改動 state），結果與未凍結相同；同樣輸入同樣輸出', () => {
    const make = () => {
      const st = loadFixture('v3.json');
      st.habits.sleep.log = [night('2026-10-01', '23:00', '06:58'), night('2026-10-02', '23:20', '07:40')];
      return st;
    };
    const plain = make();
    const before = JSON.stringify(plain);
    const a = sum(plain, '2026-10-02T09:00:00+09:00');
    expect(JSON.stringify(plain)).toBe(before);
    const frozen = sum(deepFreeze(make()), '2026-10-02T09:00:00+09:00');
    expect(frozen).toEqual(a);
    expect(sum(plain, '2026-10-02T09:00:00+09:00')).toStrictEqual(a);
  });

  test('rules 無效或 now 無法辨識 → null（UI 隱藏遊戲卡片）', () => {
    const st = loadFixture('v3.json');
    for (const rules of [null, undefined, {}, 'x', variant(RAW, 'level', undefined)]) expect(todaySummary(st, at(NOW), rules)).toBeNull();
    for (const now of [undefined, null, 'garbage', NaN, new Date('x')]) expect(todaySummary(st, now, R)).toBeNull();
    expect(todaySummary(st, Date.parse(NOW), R)).not.toBeNull();
    expect(todaySummary(st, at(NOW), RAW)).toEqual(todaySummary(st, at(NOW), R)); // 未凍結的原始規則也接受
  });
});

test.describe('純函式：engine／day／habits 不碰時鐘、DOM、儲存、網路', () => {
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/.*$/gm, '$1');
  const FORBIDDEN = [
    [/\blocalStorage\b/, 'localStorage'], [/\bsessionStorage\b/, 'sessionStorage'], [/\bdocument\b/, 'document'],
    [/\bwindow\b/, 'window'], [/\bnavigator\b/, 'navigator'], [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
    [/\bDate\.now\s*\(/, 'Date.now()'], [/new\s+Date\s*\(\s*\)/, 'new Date()'], [/\bMath\.random\b/, 'Math.random'],
    [/from\s+['"][^'"]*\/ui\//, 'import js/ui'], [/store\.js/, 'store.js'], [/\bindexedDB\b/, 'indexedDB']
  ];
  for (const file of ['js/game/engine.js', 'js/game/day.js', 'js/habits/move.js', 'js/habits/sleep.js', 'js/game/rules.js']) {
    test(file, () => {
      const code = strip(readSource(file));
      for (const [re, name] of FORBIDDEN) expect(re.test(code), `${file} 不應出現 ${name}`).toBe(false);
      const fetches = code.match(/\bfetch\b/g) || [];
      if (file === 'js/game/rules.js') expect(fetches.length).toBe(2); // typeof 檢查＋唯一一次 fetch(RULES_URL)
      else expect(fetches).toEqual([]);
    });
  }
});
