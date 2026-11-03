/* Phase 1 紅隊自查（純 Node，不寫檔）：XP/等級不變、順序保留、PR 分開、Plan 守門、
   雙重漸進單一建議、計時器暫停、疼痛暫停、壞資料。用法：node tools/redteam-phase1.mjs */
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { parseRules } from '../js/game/rules.js';
import { todaySummary } from '../js/game/engine.js';
import { parsePhase0, nextGym } from '../js/game/phase0.js';
import {
  parsePhase1, progressionSuggestion, tickRest, isNewPr, bestPr, combinedPrList,
  weekGymAdherence, validatePlanChange, applyPlanChange, progressionHeld, templateForLabel,
} from '../js/game/phase1.js';

const RAW = JSON.parse(readFileSync(new URL('../data/game.json', import.meta.url), 'utf8'));
const R = parseRules(RAW);
const base = { version: 3, level: 2, xp: 0, streak: { current: 0, best: 0, lastDate: null }, sessions: [{ date: '2026-11-02', type: 'full', xp: 10 }], prs: { hrp: [], plank: [], run2mi: [], pushup: [], pike: [], sideplank: [] }, settings: { bedtime: '23:00', wakeTime: '07:00', windowMin: 30 }, habits: { sleep: { log: [{ date: '2026-11-02', lightsOut: '2026-11-01T23:00:00+09:00', wake: '2026-11-02T07:00:00+09:00', lightsOutEdited: false }] }, explore: { items: [], log: [] } }, goals: {}, phase: { current: 'P1', startedAt: null, history: [] }, game: {} };

// 1. XP/等級/Perfect Day 不變：phase1 欄位本身不進 engine（engine 只讀 sessions/sleep）
{
  const a = todaySummary(base, new Date('2026-11-02T20:00:00+09:00'), R);
  const withPhase1 = { ...base, phase1: { gymSets: [{ date: '2026-11-02', label: 'Upper A', exercise: '上斜臥推', sets: [{ weight: 40, reps: 10 }] }], prs: [{ date: '2026-11-02', exercise: '上斜臥推', mode: 'gym', kind: 'weight', value: 40 }], plan: { suggestedDays: [1, 2], swaps: {} } } };
  const b = todaySummary(withPhase1, new Date('2026-11-02T20:00:00+09:00'), R);
  assert.equal(a.xp.total, b.xp.total); assert.equal(a.level.lv, b.level.lv); assert.equal(a.perfectDay.done, b.perfectDay.done);
  console.log('RED 1 OK：phase1 欄位不改 XP/等級/Perfect Day，total =', a.xp.total);
}
// 2. 順序保留＋A/B 內容相同：改居家不推進；Upper A＝Upper B
{
  const p = parsePhase0({ phase0: { gymLog: [{ date: '2026-11-02', mode: 'gym' }, { date: '2026-11-03', mode: 'home' }] } });
  assert.equal(nextGym(p, '2026-11-06').label, 'Lower A');
  assert.deepEqual(templateForLabel('Upper A').template, templateForLabel('Upper B').template);
  console.log('RED 2 OK：改居家不推進順序，A/B 內容相同');
}
// 3. PR 分開：gym/home、HRP/push-up max 各自計分，第一次不算新 PR
{
  const combined = combinedPrList({ prs: { hrp: [{ date: '2026-11-02', reps: 20 }], pushup: [{ date: '2026-11-02', v: 30 }], plank: [], run2mi: [] } }, parsePhase1({ phase1: { prs: [{ date: '2026-11-02', exercise: '上斜臥推', mode: 'gym', kind: 'weight', value: 40 }] } }));
  assert.equal(bestPr(combined, 'home', 'HRP', 'reps'), 20);
  assert.equal(bestPr(combined, 'home', 'push-up max', 'reps'), 30);
  assert.equal(isNewPr(combined, { exercise: '上斜臥推', mode: 'home', kind: 'weight', value: 100 }), false);
  console.log('RED 3 OK：PR 以 mode＋exercise 分開，HRP≠push-up max');
}
// 4. Plan 守門：組數／動作庫拒絕且原 plan 不變；建議日＋同肌群互換才放行
{
  const plan = { suggestedDays: [], swaps: {} };
  assert.equal(validatePlanChange(plan, { type: 'sets', sets: 5 }).ok, false);
  assert.equal(applyPlanChange(plan, { type: 'library', add: '肩推' }), plan);
  assert.equal(validatePlanChange(plan, { type: 'suggestedDays', days: [1, 4] }).ok, true);
  assert.equal(validatePlanChange(plan, { type: 'swap', label: 'Upper A', from: '上斜臥推', to: '側平舉' }).ok, false);
  console.log('RED 4 OK：Plan 只能改建議日與同肌群互換');
}
// 5. 雙重漸進一次只建議一種改變；疼痛暫停
{
  const s = progressionSuggestion({ kind: 'compound', body: 'upper', reps: [10, 10], formGood: true });
  assert.equal(s.action, 'add-weight'); assert.ok(!('sets' in s) && !('days' in s));
  assert.equal(progressionSuggestion({ kind: 'compound', body: 'upper', reps: [10, 10], formGood: true, painHeld: true }).action, 'hold');
  assert.equal(progressionHeld([{ date: '2026-11-06', exercise: '上斜臥推' }], '2026-11-06', '上斜臥推'), true);
  console.log('RED 5 OK：雙重漸進單一建議，疼痛暫停進步');
}
// 6. 計時器暫停不扣秒；達標率只計完整課
{
  assert.equal(tickRest(60000, 1000, true), 60000);
  assert.equal(tickRest(60000, 1000, false), 59000);
  const p0 = parsePhase0({ phase0: { gymLog: [{ date: '2026-11-02', mode: 'gym' }, { date: '2026-11-03', mode: 'minimum' }, { date: '2026-11-04', mode: 'walk' }] } });
  assert.equal(weekGymAdherence(p0, '2026-11-06').text, '1/4');
  console.log('RED 6 OK：暫停計時不扣秒，達標率只計完整課');
}
// 7. 壞資料不丟例外；game.json／engine／rewards 未被 Phase 1 動到（由檔案檢查：本腳本不寫檔，見 PHASE1.md 檔案清單）
{
  const bad = parsePhase1({ phase1: { gymSets: '不是陣列', prs: [{ mode: 'gym' }], plan: { suggestedDays: [99] } } });
  assert.deepEqual(bad.gymSets, []); assert.deepEqual(bad.prs, []); assert.deepEqual(bad.plan.suggestedDays, []);
  assert.equal(progressionSuggestion({ kind: 'compound', reps: ['x'], formGood: true }).action, 'hold');
  console.log('RED 7 OK：壞資料安全過濾，不丟例外');
}
console.log('redteam-phase1：7/7 通過');
