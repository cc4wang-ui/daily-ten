import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateImport } from '../js/state/schema.js';
import { migrate } from '../js/state/migrate.js';
import { buildBackup, parseImport } from '../js/state/backup.js';

const fixture = () => JSON.parse(readFileSync(new URL('./fixtures/v3.json', import.meta.url), 'utf8'));
const feedback = { id: 'run-one-12', date: '2026-10-02', name: '深蹲 第1組', target: 12, actual: 10, effort: 'hard', pain: false, form: false };

test('舊備份無回報欄位仍有效，載入不新增欄位', () => {
  const source = fixture();
  assert.equal(validateImport(source).ok, true);
  const loaded = migrate(source).state;
  assert.equal(Object.hasOwn(loaded.game, 'trainingFeedback'), false);
  const backup = buildBackup(source, new Date('2026-10-19T00:00:00Z'));
  const imported = parseImport(backup.text);
  assert.equal(imported.ok, true);
  assert.equal(Object.hasOwn(imported.incoming.game, 'trainingFeedback'), false);
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

test('舊回報不補 resistance；有效標籤以原文字通過匯入與備份', () => {
  const source = fixture();
  const label = '厚磅 20kg 🏋️';
  source.game.trainingFeedback = [feedback, { ...feedback, id: 'with-resistance', resistance: label }];
  assert.deepEqual(validateImport(source), { ok: true });
  const loaded = migrate(source);
  assert.equal(loaded.repaired, false);
  assert.deepEqual(loaded.state.game.trainingFeedback, source.game.trainingFeedback);
  assert.equal(Object.hasOwn(loaded.state.game.trainingFeedback[0], 'resistance'), false);

  const backup = buildBackup(source, new Date('2026-10-19T00:00:00Z'));
  const imported = parseImport(backup.text);
  assert.equal(imported.ok, true);
  assert.deepEqual(imported.incoming.game.trainingFeedback, source.game.trainingFeedback);
});

test('resistance 以 Unicode 字數限 40；有無效標籤時丟整筆，不能變成舊式無標籤回報', () => {
  const valid = { ...feedback, id: 'forty', resistance: '🏋'.repeat(40) };
  const invalid = [42, null, '', '   ', '🏋'.repeat(41)];
  const source = fixture();
  source.game.trainingFeedback = [feedback, valid, ...invalid.map((resistance, i) => ({ ...feedback, id: `bad-${i}`, resistance }))];
  const result = validateImport(source);
  assert.equal(result.ok, false);
  assert.deepEqual(result.errors.map(({ path }) => path), invalid.map((_, i) => `game.trainingFeedback[${i + 2}].resistance`));
  const loaded = migrate(source);
  assert.equal(loaded.repaired, true);
  assert.deepEqual(loaded.state.game.trainingFeedback, [feedback, valid]);
  assert.deepEqual(loaded.issues.filter(({ action }) => action === 'dropped').map(({ path }) => path), invalid.map((_, i) => `game.trainingFeedback[${i + 2}]`));
  assert.deepEqual(validateImport(loaded.state), { ok: true });
  assert.equal(parseImport(JSON.stringify(source)).ok, false);
  const backup = buildBackup(source, new Date('2026-10-19T00:00:00Z'));
  assert.deepEqual(JSON.parse(backup.text).game.trainingFeedback, [feedback, valid]);
});
