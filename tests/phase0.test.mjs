/* Phase 0 單元測試（純 Node）：順序保留、暫停優先、最小課／散步、伸展、洗牌不重複、壞資料、匯出。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePhase0, nextGym, weekGymCount, forgivingStreak, phase0Day, reminderDue, shuffleExplore, EXPLORE_TASKS, buildExport } from '../js/game/phase0.js';
import { dayNumber } from '../js/game/day.js';

const P = (over = {}) => parsePhase0({ phase0: over });
test('gym sequence retains position on miss/home/minimum/walk', () => {
  const p = P({ gymLog: [{ date: '2026-11-02', mode: 'gym' }, { date: '2026-11-03', mode: 'home' }, { date: '2026-11-04', mode: 'minimum' }, { date: '2026-11-05', mode: 'walk' }] });
  const n = nextGym(p, '2026-11-06');
  assert.equal(n.count, 1); assert.equal(n.label, 'Lower A'); assert.equal(n.type, 'lower');
  assert.equal(n.template.length, 6);
  const upper = nextGym(P({ gymLog: [] }), '2026-11-06');
  assert.equal(upper.label, 'Upper A'); assert.equal(upper.template.length, 7);
  assert.equal(weekGymCount(p, '2026-11-06'), 1);
});
test('pause takes precedence over freeze: all-pause gap does not consume or break', () => {
  const pauses = [{ from: '2026-11-03', to: '2026-11-05', kind: 'Sick' }];
  const r = forgivingStreak([dayNumber('2026-11-02'), dayNumber('2026-11-06')], pauses, dayNumber('2026-11-06'), { earnEvery: 7, max: 2 });
  assert.equal(r.days, 2); assert.equal(r.tokens, 0); assert.deepEqual(r.used, []);
  // 非暫停缺席 1 天且無 Freeze → 斷開；有 1 張 Freeze → 接上且耗 1 張
  const broken = forgivingStreak([dayNumber('2026-11-02'), dayNumber('2026-11-04')], [], dayNumber('2026-11-04'), { earnEvery: 7, max: 2 });
  assert.equal(broken.days, 1);
  const withFreeze = forgivingStreak([dayNumber('2026-10-27'), dayNumber('2026-10-28'), dayNumber('2026-10-29'), dayNumber('2026-10-30'), dayNumber('2026-10-31'), dayNumber('2026-11-01'), dayNumber('2026-11-02'), dayNumber('2026-11-04')], [], dayNumber('2026-11-04'), { earnEvery: 7, max: 2 });
  assert.equal(withFreeze.days, 8); assert.equal(withFreeze.tokens, 0); assert.deepEqual(withFreeze.used, ['2026-11-03']);
});
test('minimum counts movement, walk does not; stretch short counts', () => {
  const p = P({ gymLog: [{ date: '2026-11-06', mode: 'minimum' }], stretch: { '2026-11-06': 'short' } });
  const d = phase0Day(p, '2026-11-06', false);
  assert.equal(d.movementCredit, true); assert.equal(d.activityDay, true); assert.equal(d.stretch, 'short');
  const w = phase0Day(P({ gymLog: [{ date: '2026-11-06', mode: 'walk' }] }), '2026-11-06', false);
  assert.equal(w.movementCredit, false); assert.equal(w.activityDay, true);
});
test('reminder only when enabled, time reached, not done', () => {
  assert.equal(reminderDue({ time: '08:00', enabled: true }, '08:30', false), true);
  assert.equal(reminderDue({ time: '08:00', enabled: true }, '07:30', false), false);
  assert.equal(reminderDue({ time: '08:00', enabled: true }, '08:30', true), false);
  assert.equal(reminderDue({ time: '08:00', enabled: false }, '08:30', false), false);
  assert.equal(reminderDue(null, '08:30', false), false);
});
test('shuffle never repeats immediately, 14 tasks, bad data safe', () => {
  assert.equal(EXPLORE_TASKS.length, 14);
  let prev = 0;
  for (let i = 0; i < 200; i++) { const n = shuffleExplore(prev); assert.notEqual(n, prev); prev = n; }
  assert.equal(shuffleExplore(-1, () => 0), 0);
  const bad = parsePhase0(null);
  assert.deepEqual(bad.gymLog, []); assert.equal(nextGym(bad, '2026-11-06').label, 'Upper A');
  const bad2 = parsePhase0({ phase0: { gymLog: [{ date: 'nope', mode: 'gym' }, { date: '2026-11-02', mode: 'bogus' }], pauses: [{ from: '2026-11-05', to: '2026-11-01', kind: 'Sick' }] } });
  assert.deepEqual(bad2.gymLog, []); assert.deepEqual(bad2.pauses, []);
  const ex = buildExport({}, P({ gymLog: [{ date: '2026-11-06', mode: 'gym' }] }));
  assert.match(ex.csv, /"2026-11-06","gym"/);
});
