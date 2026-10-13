import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateImport } from '../js/state/schema.js';
import { migrate } from '../js/state/migrate.js';

const fixture = () => JSON.parse(readFileSync(new URL('./fixtures/v3.json', import.meta.url), 'utf8'));
const feedback = { id: 'run-one-12', date: '2026-10-02', name: '深蹲 第1組', target: 12, actual: 10, effort: 'hard', pain: false, form: false };

test('舊備份無回報欄位仍有效，載入不新增欄位', () => {
  const source = fixture();
  assert.equal(validateImport(source).ok, true);
  const loaded = migrate(source).state;
  assert.equal(Object.hasOwn(loaded.game, 'trainingFeedback'), false);
});

test('有效回報通過匯入與遷移；無效回報在載入時丟棄', () => {
  const source = fixture();
  source.game.trainingFeedback = [feedback];
  assert.equal(validateImport(source).ok, true);
  assert.deepEqual(migrate(source).state.game.trainingFeedback, [feedback]);
  source.game.trainingFeedback.push({ ...feedback, actual: -1 });
  source.game.trainingFeedback.push({ ...feedback, id: undefined });
  assert.equal(validateImport(source).ok, false);
  const loaded = migrate(source);
  assert.deepEqual(loaded.state.game.trainingFeedback, [feedback]);
  assert.equal(loaded.repaired, true);
});
