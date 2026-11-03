/* Phase 1 單元測試（純 Node）：預填、雙重漸進邊界、PR mode 分開、達標率只計完整課、
   Plan 守門、疼痛暫停進步、可暫停計時器、順序保留、A/B 內容相同、壞資料。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePhase0, nextGym } from '../js/game/phase0.js';
import {
  parsePhase1, templateSets, templateForLabel, lastSetsFor, prefillSets,
  progressionSuggestion, restSeconds, tickRest, formatRest,
  isNewPr, bestPr, prsByMode, combinedPrList,
  countsAsFullGym, weekGymAdherence,
  canSwap, validatePlanChange, applyPlanChange, progressionHeld,
} from '../js/game/phase1.js';

const P1 = (over = {}) => parsePhase1({ phase1: over });
const P0 = (over = {}) => parsePhase0({ phase0: over });

test('prefill carries last values, defaults to blank, clamps to template range', () => {
  const logs = [{ date: '2026-11-02', label: 'Upper A', exercise: '上斜臥推', sets: [{ weight: 40, reps: 8 }, { weight: 40, reps: 7 }] }];
  assert.deepEqual(lastSetsFor(logs, '上斜臥推', '2026-11-03'), [{ weight: 40, reps: 8 }, { weight: 40, reps: 7 }]);
  assert.equal(lastSetsFor(logs, '平板臥推', '2026-11-03'), null);
  assert.equal(lastSetsFor(logs, '上斜臥推', '2026-11-01'), null); // 未來紀錄不預填
  const upperTpl = { name: '上斜臥推', sets: 2, rep: '6–10', kind: 'compound' };
  assert.deepEqual(prefillSets(upperTpl, lastSetsFor(logs, '上斜臥推')), [{ weight: 40, reps: 8 }, { weight: 40, reps: 7 }]);
  assert.deepEqual(prefillSets(upperTpl, null), [{ weight: null, reps: null }, { weight: null, reps: null }]);
  const lowerTpl = { name: '深蹲或腿推', sets: '2–3', rep: '6–10', kind: 'compound' };
  assert.deepEqual(templateSets(lowerTpl), { min: 2, max: 3, default: 2 });
  // 上次做了 3 組 → 預填 3 組；上次 1 組 → 補到 min 2 組
  assert.equal(prefillSets(lowerTpl, [{ weight: 80, reps: 8 }, { weight: 80, reps: 8 }, { weight: 80, reps: 6 }]).length, 3);
  assert.equal(prefillSets(lowerTpl, [{ weight: 80, reps: 8 }]).length, 2);
});

test('double progression boundaries, single action only', () => {
  const top = progressionSuggestion({ kind: 'compound', body: 'upper', reps: [10, 10], formGood: true });
  assert.equal(top.action, 'add-weight'); assert.equal(top.incrementKg, 2.5); assert.equal(top.singleAction, true);
  assert.equal('sets' in top, false); assert.equal('days' in top, false);
  const topLower = progressionSuggestion({ kind: 'compound', body: 'lower', reps: [10, 10, 10], formGood: true });
  assert.equal(topLower.incrementKg, 5);
  const mid = progressionSuggestion({ kind: 'compound', body: 'upper', reps: [10, 8], formGood: true });
  assert.equal(mid.action, 'add-reps'); assert.equal(mid.incrementKg, 0);
  const isoTop = progressionSuggestion({ kind: 'isolation', body: 'upper', reps: [15, 15], formGood: true });
  assert.equal(isoTop.action, 'add-weight');
  const isoMid = progressionSuggestion({ kind: 'isolation', body: 'upper', reps: [15, 12], formGood: true });
  assert.equal(isoMid.action, 'add-reps');
  const below = progressionSuggestion({ kind: 'compound', body: 'upper', reps: [5, 8], formGood: true });
  assert.equal(below.action, 'hold');
  const badForm = progressionSuggestion({ kind: 'compound', body: 'upper', reps: [10, 10], formGood: false });
  assert.equal(badForm.action, 'hold');
  const empty = progressionSuggestion({ kind: 'compound', body: 'upper', reps: [], formGood: true });
  assert.equal(empty.action, 'hold');
});

test('PR split by mode; HRP and push-up max are separate keys; first record is baseline', () => {
  const prs = [
    { date: '2026-11-02', exercise: '上斜臥推', mode: 'gym', kind: 'weight', value: 40 },
    { date: '2026-11-02', exercise: '上斜臥推', mode: 'home', kind: 'weight', value: 20 },
  ];
  assert.equal(bestPr(prs, 'gym', '上斜臥推', 'weight'), 40);
  assert.equal(bestPr(prs, 'home', '上斜臥推', 'weight'), 20);
  assert.equal(isNewPr(prs, { exercise: '上斜臥推', mode: 'gym', kind: 'weight', value: 42.5 }), true);
  assert.equal(isNewPr(prs, { exercise: '上斜臥推', mode: 'gym', kind: 'weight', value: 40 }), false); // 平舊不算
  assert.equal(isNewPr(prs, { exercise: '上斜臥推', mode: 'gym', kind: 'weight', value: 39 }), false);
  assert.equal(isNewPr([], { exercise: '深蹲或腿推', mode: 'gym', kind: 'weight', value: 100 }), false); // 第一次只是基準
  assert.equal(prsByMode(prs, 'home').length, 1);
  const combined = combinedPrList({ prs: { hrp: [{ date: '2026-11-02', reps: 20 }], pushup: [{ date: '2026-11-02', v: 30 }], plank: [], run2mi: [] } }, P1({ prs }));
  assert.equal(bestPr(combined, 'home', 'HRP', 'reps'), 20);
  assert.equal(bestPr(combined, 'home', 'push-up max', 'reps'), 30);
  assert.notEqual(bestPr(combined, 'home', 'HRP', 'reps'), bestPr(combined, 'home', 'push-up max', 'reps'));
});

test('gym adherence counts only full sessions; minimal/walk/home/stretch excluded', () => {
  assert.equal(countsAsFullGym('gym'), true);
  for (const m of ['home', 'minimum', 'walk']) assert.equal(countsAsFullGym(m), false);
  const p0 = P0({ gymLog: [
    { date: '2026-11-02', mode: 'gym' }, { date: '2026-11-03', mode: 'home' },
    { date: '2026-11-04', mode: 'minimum' }, { date: '2026-11-05', mode: 'walk' },
  ], stretch: { '2026-11-06': 'full' } });
  const a = weekGymAdherence(p0, '2026-11-06');
  assert.equal(a.count, 1); assert.equal(a.denominator, 4); assert.equal(a.text, '1/4'); assert.equal(a.countsOnlyFull, true);
});

test('Plan guard: suggestedDays and same-group swaps only; sets/library rejected unchanged', () => {
  const plan = { suggestedDays: [], swaps: {} };
  assert.equal(validatePlanChange(plan, { type: 'sets', label: 'Upper A', sets: 3 }).ok, false);
  assert.equal(validatePlanChange(plan, { type: 'exercises', add: '肩推' }).ok, false);
  assert.equal(validatePlanChange(plan, { type: 'library', add: '肩推' }).ok, false);
  assert.equal(validatePlanChange(plan, { type: 'template', label: 'Upper A' }).ok, false);
  assert.equal(applyPlanChange(plan, { type: 'sets', sets: 3 }), plan); // 拒絕時原 plan 不變
  assert.equal(canSwap('上斜臥推', '平板臥推'), true);
  assert.equal(canSwap('上斜臥推', '側平舉'), false); // 不同肌群
  assert.equal(canSwap('上斜臥推', '肩推'), false); // 不在動作庫
  assert.equal(canSwap('深蹲或腿推', '提踵'), false);
  assert.equal(validatePlanChange(plan, { type: 'swap', label: 'Upper A', from: '上斜臥推', to: '側平舉' }).ok, false);
  const withDays = applyPlanChange(plan, { type: 'suggestedDays', days: [1, 2, 4, 5] });
  assert.deepEqual(withDays.suggestedDays, [1, 2, 4, 5]);
  const withSwap = applyPlanChange(withDays, { type: 'swap', label: 'Upper A', from: '上斜臥推', to: '平板臥推' });
  assert.deepEqual(withSwap.swaps['Upper A'], { from: '上斜臥推', to: '平板臥推' });
  assert.equal(validatePlanChange(plan, { type: 'suggestedDays', days: [7] }).ok, false);
});

test('pain holds progression; sequence retained; A equals B content', () => {
  const pain = [{ date: '2026-11-06', exercise: '上斜臥推' }];
  assert.equal(progressionHeld(pain, '2026-11-06', '上斜臥推'), true);
  assert.equal(progressionHeld(pain, '2026-11-06', '平板臥推'), false);
  assert.equal(progressionHeld(P0({ pain }), '2026-11-06', '上斜臥推'), true);
  const s = progressionSuggestion({ kind: 'compound', body: 'upper', reps: [10, 10], formGood: true, painHeld: true });
  assert.equal(s.action, 'hold');
  const p0 = P0({ gymLog: [{ date: '2026-11-02', mode: 'gym' }, { date: '2026-11-03', mode: 'home' }] });
  assert.equal(nextGym(p0, '2026-11-06').label, 'Lower A'); // 改居家不推進
  assert.deepEqual(templateForLabel('Upper A').template, templateForLabel('Upper B').template);
  assert.deepEqual(templateForLabel('Lower A').template, templateForLabel('Lower B').template);
  assert.equal(templateForLabel('Upper A').template.length, 7);
  assert.equal(templateForLabel('Lower A').template.length, 6);
});

test('pausable rest timer: paused tick unchanged, running decrements, floor at zero', () => {
  assert.equal(restSeconds('compound'), 150);
  assert.equal(restSeconds('isolation'), 75);
  assert.equal(tickRest(60000, 1000, true), 60000);
  assert.equal(tickRest(60000, 1000, false), 59000);
  assert.equal(tickRest(500, 1000, false), 0);
  assert.equal(formatRest(150000), '2:30');
  assert.equal(formatRest(75000), '1:15');
  assert.equal(formatRest(0), '0:00');
});

test('bad data never throws', () => {
  const bad = parsePhase1(null);
  assert.deepEqual(bad.gymSets, []); assert.deepEqual(bad.prs, []);
  const bad2 = parsePhase1({ phase1: {
    gymSets: [{ date: 'nope', exercise: '上斜臥推', sets: [{ weight: 40, reps: 8 }] }, { date: '2026-11-02', exercise: '上斜臥推', sets: [{ weight: '重', reps: 8 }] }, { date: '2026-11-02', exercise: '', sets: [] }],
    prs: [{ date: '2026-11-02', exercise: '上斜臥推', mode: 'bogus', kind: 'weight', value: 40 }],
    plan: { suggestedDays: [1, 9, '二'], swaps: { 'Bogus': { from: 'a', to: 'b' } } },
  } });
  assert.deepEqual(bad2.gymSets, []); assert.deepEqual(bad2.prs, []); assert.deepEqual(bad2.plan.suggestedDays, [1]); assert.deepEqual(bad2.plan.swaps, {});
  assert.equal(prefillSets(null, null).length, 2);
  assert.equal(progressionSuggestion(null).action, 'hold');
  assert.equal(isNewPr(null, null), false);
  assert.equal(bestPr(null, 'gym', 'x', 'weight'), null);
  assert.equal(weekGymAdherence(null, '2026-11-06').count, 0);
});
