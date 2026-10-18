import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { progressionFor } from '../js/game/training-progression.js';

const rules = JSON.parse(readFileSync(new URL('../data/game.json', import.meta.url), 'utf8'));
const asOf = '2026-10-19';
const targetName = '伏地挺身 第1組';
function day(date, target = 10, options = {}) {
  const { effort = 'easy', actual = target, pain = false, form = true, variant = '伏地挺身', suffix = '', sets = [1, 2] } = options;
  return sets.map(set => ({ id: `${date}-${variant}-${set}-${suffix}`, date, name: `${variant} 第${set}組${suffix}`, target, actual, effort, pain, form }));
}
function state(...groups) {
  const feedback = groups.flat();
  return { sessions: [...new Set(feedback.map(f => f.date))].map(date => ({ date, type: 'full' })), game: { trainingFeedback: feedback } };
}
function result(s, options = {}) {
  return progressionFor({ state: s, asOf, name: targetName, baseReps: 10, requiredSets: 2, rules, ...options });
}
const twoEasy = () => state(day('2026-10-05'), day('2026-10-08'));

test('no historical self-report, missing rules and malformed containers preserve baseline without mutation', () => {
  for (const s of [{}, { sessions: [], game: {} }, { sessions: null, game: { trainingFeedback: null } }]) {
    const copy = structuredClone(s);
    assert.equal(result(s).reps, 10);
    assert.deepEqual(s, copy);
  }
  assert.equal(result(twoEasy(), { rules: null }).reps, 10);
  assert.equal(result(twoEasy(), { rules: {} }).reps, 10);
});

test('two complete easy dates increment each exact movement once, with deterministic chronological replay', () => {
  const s = twoEasy();
  const copy = structuredClone(s);
  const output = result(s);
  assert.deepEqual({ reps: output.reps, baseReps: output.baseReps, delta: output.delta }, { reps: 11, baseReps: 10, delta: 1 });
  assert.deepEqual(result(s), output);
  s.game.trainingFeedback.reverse();
  s.sessions.reverse();
  assert.deepEqual(result(s), output);
  s.game.trainingFeedback.reverse();
  s.sessions.reverse();
  assert.deepEqual(s, copy);
  assert.equal(result(state(day('2026-10-05'))).reps, 10);
});

test('four easy days require the new target before second increment and cap at base plus two', () => {
  const s = state(day('2026-10-01'), day('2026-10-03'), day('2026-10-05', 11), day('2026-10-08', 11), day('2026-10-12', 12), day('2026-10-15', 12));
  assert.equal(result(s).reps, 12);
  assert.equal(result(state(day('2026-10-01'), day('2026-10-03'), day('2026-10-05'), day('2026-10-08'))).reps, 11);
});

for (const [label, options] of [
  ['hard effort', { effort: 'hard' }], ['under target', { actual: 10 }], ['pain', { pain: true }], ['unstable form', { form: false }]
]) {
  test(`${label} after progression resets the movement to baseline`, () => {
    const s = state(day('2026-10-01'), day('2026-10-03'), day('2026-10-08', 11, options));
    assert.equal(result(s).reps, 10);
  });
}

test('okay and incomplete dates retain earned bonus but break the next easy streak', () => {
  for (const middle of [day('2026-10-08', 11, { effort: 'okay' }), day('2026-10-08', 11, { sets: [1] })]) {
    const s = state(day('2026-10-01'), day('2026-10-03'), day('2026-10-05', 11), middle, day('2026-10-12', 11));
    assert.equal(result(s).reps, 11);
  }
});

test('multiple completed sets on one day cannot replace two distinct dates', () => {
  const rows = [...day('2026-10-05'), ...day('2026-10-05').map(f => ({ ...f, id: `${f.id}-repeat` }))];
  assert.equal(result(state(rows)).reps, 10);
});

test('required third set cannot be substituted by a repeated first or second set', () => {
  const options = { name: '彈力帶划船 第1組', requiredSets: 3 };
  const twoSets = state(day('2026-10-05', 10, { variant: '彈力帶划船' }), day('2026-10-08', 10, { variant: '彈力帶划船' }));
  assert.equal(result(twoSets, options).reps, 10);
  const threeSets = state(day('2026-10-05', 10, { variant: '彈力帶划船', sets: [1, 2, 3] }), day('2026-10-08', 10, { variant: '彈力帶划船', sets: [1, 2, 3] }));
  assert.equal(result(threeSets, options).reps, 11);
});

test('only prior completed full or cycle sessions count, never today, future or stale dates', () => {
  for (const type of ['minimal', 'rain', 'rest', 'boss']) {
    const s = twoEasy();
    s.sessions = s.sessions.map(session => ({ ...session, type }));
    assert.equal(result(s).reps, 10);
  }
  for (const dates of [['2026-10-19', '2026-10-20'], ['2026-09-01', '2026-09-02']]) {
    assert.equal(result(state(...dates.map(date => day(date)))).reps, 10);
  }
  const s = twoEasy();
  s.sessions[1].type = 'cycle';
  assert.equal(result(s).reps, 11);
  s.sessions.pop();
  assert.equal(result(s).reps, 10);
});

test('28-day boundary includes the earliest allowed date and excludes the day before it', () => {
  assert.equal(result(state(day('2026-09-21'), day('2026-09-22'))).reps, 11);
  assert.equal(result(state(day('2026-09-20'), day('2026-09-22'))).reps, 10);
});

test('today bad feedback cannot rewrite a bonus already earned before today', () => {
  const s = state(day('2026-10-05'), day('2026-10-08'), day(asOf, 11, { effort: 'hard', pain: true }));
  assert.equal(result(s).reps, 11);
});

test('standard, knee, pike and left/right variants cannot borrow each other evidence', () => {
  const knee = state(day('2026-10-05', 10, { suffix: ' · 跪姿' }), day('2026-10-08', 10, { suffix: ' · 跪姿' }));
  assert.equal(result(knee).reps, 10);
  assert.equal(result(knee, { name: '伏地挺身 第1組 · 跪姿' }).reps, 11);
  assert.equal(result(twoEasy(), { name: '派克伏地挺身 第1組' }).reps, 10);
  const left = state(day('2026-10-05', 10, { variant: '分腿蹲', suffix: ' · 左' }), day('2026-10-08', 10, { variant: '分腿蹲', suffix: ' · 左' }));
  assert.equal(result(left, { name: '分腿蹲 第1組 · 左' }).reps, 11);
  assert.equal(result(left, { name: '分腿蹲 第1組 · 右' }).reps, 10);
  assert.equal(result(twoEasy(), { name: '彈力帶肩上推 第1組' }).reps, 10);
});

test('duplicate feedback IDs cannot create progression, while distinct repeat occurrences remain valid', () => {
  const byId = twoEasy();
  byId.game.trainingFeedback[2].id = byId.game.trainingFeedback[0].id;
  assert.equal(result(byId).reps, 10);
  const byOrdinal = twoEasy();
  byOrdinal.game.trainingFeedback.push({ ...byOrdinal.game.trainingFeedback[2], id: 'new-id-same-set' });
  assert.equal(result(byOrdinal).reps, 11);
});

test('bad and inconsistent per-set evidence cannot manufacture an easy date', () => {
  for (const patch of [{ target: 99, actual: 99 }, { target: '10' }, { actual: NaN }, { form: null }, { effort: 'invented' }, { id: '' }, { date: '2026-02-30' }]) {
    const s = twoEasy();
    Object.assign(s.game.trainingFeedback.at(-1), patch);
    assert.equal(result(s).reps, 10, JSON.stringify(patch));
  }
});

test('variant ceiling caps earned progression; unsupported unnumbered names have no prescription', () => {
  const s = state(day('2026-10-05', 12, { suffix: ' · 跪姿' }), day('2026-10-08', 12, { suffix: ' · 跪姿' }));
  assert.equal(result(s, { name: '伏地挺身 第1組 · 跪姿', baseReps: 12 }).reps, 12);
  for (const name of ['伏地挺身', '伏地挺身 加練', '貓牛式', '原地快走 R1', '超人式划船 第1組']) assert.equal(result(twoEasy(), { name }), null);
});

test('negative unfinished sessions reset bonus, while unfinished positive reports cannot earn it', () => {
  for (const patch of [{ effort: 'hard' }, { actual: 9 }, { pain: true }, { form: false }]) {
    const s = state(day('2026-10-05'), day('2026-10-08'), day('2026-10-12', 11, patch));
    s.sessions = s.sessions.filter(session => session.date !== '2026-10-12');
    assert.equal(result(s).reps, 10);
  }
  const unfinished = twoEasy();
  unfinished.sessions = [];
  assert.equal(result(unfinished).reps, 10);
});

test('unrelated movement negative evidence and stale negative dates do not reset this movement', () => {
  const s = state(day('2026-10-05'), day('2026-10-08'), day('2026-10-12', 11, { variant: '彈力帶肩上推', effort: 'hard' }), day('2026-09-01', 11, { pain: true }));
  assert.equal(result(s).reps, 11);
});

test('duplicate session entries and extra unknown numbered sets cannot inflate day count', () => {
  const s = state(day('2026-10-05'));
  s.sessions.push({ ...s.sessions[0] });
  s.game.trainingFeedback.push(...day('2026-10-05', 10, { sets: [3, 4] }));
  assert.equal(result(s).reps, 10);
});


test('two completed plus days can progress once despite repeated complete worksets, never twice per day', () => {
  const plusDay = date => [...day(date), ...day(date).map(f => ({ ...f, id: `${f.id}-plus` }))];
  assert.equal(result(state(plusDay('2026-10-05'), plusDay('2026-10-08'))).reps, 11);
  assert.equal(result(state(plusDay('2026-10-05'))).reps, 10);
});

test('repeated first set or out-of-range ordinals cannot replace the required first and second sets', () => {
  for (const sets of [[1, 1], [2, 3], [99, 100], [1, 2, 3]]) {
    const make = date => day(date, 10, { sets }).map((f, index) => ({ ...f, id: `${f.id}-${index}` }));
    assert.equal(result(state(make('2026-10-05'), make('2026-10-08'))).reps, 10, JSON.stringify(sets));
  }
});

test('one repeated plus occurrence that is hard resets the earned target', () => {
  const badPlus = [...day('2026-10-12', 11), ...day('2026-10-12', 11).map((f, index) => ({ ...f, id: `${f.id}-plus`, effort: index ? 'hard' : 'easy' }))];
  assert.equal(result(state(day('2026-10-05'), day('2026-10-08'), badPlus)).reps, 10);
});

test('one duplicate ID in an otherwise complete repeated plus day still blocks progression', () => {
  const plus = [...day('2026-10-08'), ...day('2026-10-08').map(f => ({ ...f, id: `${f.id}-plus` }))];
  plus.at(-1).id = plus[0].id;
  assert.equal(result(state(day('2026-10-05'), plus)).reps, 10);
});

test('invalid as-of dates preserve baseline; malformed historical dates cannot supply evidence', () => {
  for (const invalid of ['2026-02-29', '2026-02-30', '2026-13-01', '2026-10-00', '2026-1-19', '2026-10-19T00:00:00Z', '', null, 20261019]) {
    assert.equal(result(twoEasy(), { asOf: invalid }).reps, 10, String(invalid));
  }
  for (const invalid of ['2026-02-30', '2026-13-01', '2026-10-00', '2026-10-8']) {
    assert.equal(result(state(day('2026-10-05'), day(invalid))).reps, 10, invalid);
  }
});

test('valid leap-day evidence works with date-only chronological window boundaries', () => {
  const s = state(day('2024-02-27'), day('2024-02-29'));
  assert.equal(result(s, { asOf: '2024-03-01' }).reps, 11);
  assert.equal(result(s, { asOf: '2024-02-29' }).reps, 10); // The leap day is still today.
});

test('early calendar years use real leap dates without mutating state or rules', () => {
  const ruleSnapshot = structuredClone(rules);
  for (const [first, second, today] of [
    ['0000-02-27', '0000-02-29', '0000-03-01'],
    ['0099-02-27', '0099-02-28', '0099-03-01'],
  ]) {
    const s = state(day(first), day(second));
    const snapshot = structuredClone(s);
    assert.equal(result(s, { asOf: today }).reps, 11, today);
    assert.deepEqual(s, snapshot);
  }
  for (const invalid of ['0099-02-29', '0100-02-29', '0000-02-30']) {
    assert.equal(result(twoEasy(), { asOf: invalid }).reps, 10, invalid);
  }
  assert.deepEqual(rules, ruleSnapshot);
});
