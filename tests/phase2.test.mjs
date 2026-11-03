/* Phase 2 單元測試（純 Node）：Strong／Hevy CSV 解析與格式錯誤、重複匯入不重複、
   匯入餵預填／PR、儀表板數字計算、44pt 與 reduced-motion 規則、壞資料。
   CSS／HTML 規則測試讀取原始檔對照（不開瀏覽器）。 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseImportCsv, mergeImportedSets, applyImportPrs, parsePhase2, makeImportRecord,
  dashboardMetrics, convertLbToKg, setFingerprint, PHASE2_BOUNDARY, CUT_THRESHOLD_TEXT,
} from '../js/game/phase2.js';
import { parsePhase1, lastSetsFor, prefillSets, bestPr, isNewPr } from '../js/game/phase1.js';
import { parsePhase0 } from '../js/game/phase0.js';

const STRONG = [
  'Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE',
  '2026-11-02,Upper A,3600,上斜臥推,1,40,8,,,,,',
  '2026-11-02,Upper A,3600,上斜臥推,2,40,7,,,,,',
  '2026-11-02,Upper A,3600,平板臥推,1,30,10,,,,,',
].join('\n');
const STRONG_LB = [
  'Date,Workout Name,Exercise Name,Set Order,Weight (lb),Reps',
  '2026-11-02,Upper A,上斜臥推,1,88.2,8',
].join('\n');
const HEVY = [
  'title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe',
  'Upper A,2026-11-02 07:00:00,2026-11-02 08:00:00,,上斜臥推,,,0,working,40,8,,,',
  'Upper A,2026-11-02 07:00:00,2026-11-02 08:00:00,,上斜臥推,,,1,working,40,7,,,',
  'Upper A,2026-11-02 07:00:00,2026-11-02 08:00:00,,上斜臥推,,,0,warmup,20,10,,,',
  'Upper A,2026-11-02 07:00:00,2026-11-02 08:00:00,,跑步,,,0,working,,,5,,',
].join('\n');

test('Strong CSV parses: date, exercise, sets, weight, reps', () => {
  const r = parseImportCsv(STRONG, { strongUnit: 'kg' });
  assert.equal(r.ok, true); assert.equal(r.format, 'strong');
  assert.equal(r.entries.length, 2);
  assert.deepEqual(r.entries[0], { date: '2026-11-02', label: '', exercise: '上斜臥推', sets: [{ weight: 40, reps: 8 }, { weight: 40, reps: 7 }] });
  assert.equal(r.validSets, 3); assert.deepEqual(r.errors, []);
});

test('Strong lb converts to kg; Hevy parses and skips warmup and non-strength rows explicitly', () => {
  assert.equal(convertLbToKg(88.2), 40);
  const lb = parseImportCsv(STRONG_LB);
  assert.equal(lb.ok, true); assert.equal(lb.entries[0].sets[0].weight, 40);
  const h = parseImportCsv(HEVY);
  assert.equal(h.ok, true); assert.equal(h.format, 'hevy');
  assert.equal(h.validSets, 2); // 熱身組與跑步列都不算肌力組
  assert.equal(h.skipped.warmup, 1); assert.equal(h.skipped.nonStrength, 1);
  assert.deepEqual(h.entries[0].sets, [{ weight: 40, reps: 8 }, { weight: 40, reps: 7 }]);
});

test('format errors are explicit and import nothing: unknown headers, missing columns, bad rows', () => {
  const unknown = parseImportCsv('Foo,Bar\n1,2\n');
  assert.equal(unknown.ok, false); assert.equal(unknown.format, null); assert.deepEqual(unknown.entries, []);
  assert.match(unknown.errors[0].message, /無法辨識/);
  const missing = parseImportCsv('Date,Exercise Name\n2026-11-02,上斜臥推\n', { strongUnit: 'kg' });
  assert.equal(missing.ok, false); assert.match(missing.errors[0].message, /缺少必要欄位/);
  const badRows = parseImportCsv([
    'Date,Workout Name,Exercise Name,Set Order,Weight,Reps',
    'not-a-date,Upper A,上斜臥推,1,40,8',
    '2026-11-02,Upper A,上斜臥推,1,40,abc',
    '2026-11-02,Upper A,,1,40,8',
    '2026-11-02,Upper A,平板臥推,1,30,10',
  ].join('\n'), { strongUnit: 'kg' });
  assert.equal(badRows.ok, true); // 仍有 1 組有效，但 3 列錯誤必須列出
  assert.equal(badRows.errors.length, 3);
  assert.equal(badRows.validSets, 1);
  const noUnit = parseImportCsv([
    'Date,Workout Name,Exercise Name,Set Order,Weight,Reps',
    '2026-11-02,Upper A,上斜臥推,1,40,8',
  ].join('\n'));
  assert.equal(noUnit.ok, false); assert.equal(noUnit.entries.length, 0);
  assert.match(noUnit.errors.map((e) => e.message).join(''), /單位/);
  assert.equal(parseImportCsv('').ok, false);
  assert.equal(parseImportCsv('Date,Exercise Name,Weight,Reps\n').ok, false); // 只有標題
});

test('duplicate import adds nothing the second time; partial overlap adds only fresh sets', () => {
  const parsed = parseImportCsv(STRONG, { strongUnit: 'kg' });
  const first = mergeImportedSets([], parsed.entries);
  assert.equal(first.addedSets, 3); assert.equal(first.duplicateSets, 0);
  const second = mergeImportedSets(first.gymSets, parsed.entries);
  assert.equal(second.addedSets, 0); assert.equal(second.duplicateSets, 3);
  assert.deepEqual(second.gymSets, first.gymSets);
  // 既有 2 組 40×8，匯入 3 組 40×8：只新增 1 組（多重集合去重）
  const partial = mergeImportedSets(
    [{ date: '2026-11-02', label: '', exercise: '上斜臥推', sets: [{ weight: 40, reps: 8 }, { weight: 40, reps: 8 }] }],
    [{ date: '2026-11-02', label: '', exercise: '上斜臥推', sets: [{ weight: 40, reps: 8 }, { weight: 40, reps: 8 }, { weight: 40, reps: 8 }] }],
  );
  assert.equal(partial.addedSets, 1); assert.equal(partial.duplicateSets, 2);
  assert.equal(partial.gymSets[0].sets.length, 3);
  // 輸入不被改動
  const before = JSON.stringify(parsed.entries);
  mergeImportedSets(first.gymSets, parsed.entries);
  assert.equal(JSON.stringify(parsed.entries), before);
  assert.notEqual(setFingerprint('2026-11-02', '上斜臥推', 40, 8), setFingerprint('2026-11-02', '上斜臥推', 42.5, 8));
});

test('imported records feed Phase 1 prefill and PR list, modes stay separate', () => {
  const parsed = parseImportCsv(STRONG, { strongUnit: 'kg' });
  const merged = mergeImportedSets([], parsed.entries);
  const p1 = parsePhase1({ phase1: { gymSets: merged.gymSets, prs: [] } });
  assert.deepEqual(lastSetsFor(p1.gymSets, '上斜臥推', '2026-11-03'), [{ weight: 40, reps: 8 }, { weight: 40, reps: 7 }]);
  assert.deepEqual(prefillSets({ name: '上斜臥推', sets: 2, rep: '6–10', kind: 'compound' }, lastSetsFor(p1.gymSets, '上斜臥推')), [{ weight: 40, reps: 8 }, { weight: 40, reps: 7 }]);
  const pr = applyImportPrs([], parsed.entries);
  assert.equal(pr.baselines.length, 2); assert.equal(pr.newPrs.length, 0); // 第一次只是基準
  assert.equal(bestPr(pr.prs, 'gym', '上斜臥推', 'weight'), 40);
  assert.equal(bestPr(pr.prs, 'home', '上斜臥推', 'weight'), null); // mode 分開：匯入不污染居家 PR
  // 第二次更重的匯入：嚴格優於舊最佳才算新 PR
  const heavier = applyImportPrs(pr.prs, [{ date: '2026-11-04', label: '', exercise: '上斜臥推', sets: [{ weight: 42.5, reps: 8 }] }]);
  assert.equal(heavier.newPrs.length, 1); assert.equal(heavier.newPrs[0].value, 42.5);
  assert.equal(isNewPr(heavier.prs, { exercise: '上斜臥推', mode: 'gym', kind: 'weight', value: 42.5 }), false); // 平舊不算
  const rec = makeImportRecord('strong', merged, parsed.entries);
  assert.deepEqual([rec.format, rec.addedSets, rec.firstDate, rec.lastDate], ['strong', 3, '2026-11-02', '2026-11-02']);
  assert.deepEqual(parsePhase2({ phase2: { imports: [rec] } }).imports.length, 1);
});

test('dashboard numbers: 28-day activity, gym vs home volume never merged, sleep trend, rolling 30-day', () => {
  const state = {
    sessions: [
      { date: '2026-11-02', type: 'full' }, { date: '2026-11-03', type: 'rest' },
      { date: '2026-11-06', type: 'minimal' },
    ],
    phase0: { gymLog: [{ date: '2026-11-04', mode: 'walk' }], pauses: [{ from: '2026-11-05', to: '2026-11-05', kind: 'Rest' }] },
    phase1: { gymSets: [
      { date: '2026-11-02', label: 'Upper A', exercise: '上斜臥推', sets: [{ weight: 40, reps: 8 }, { weight: 40, reps: 7 }] },
      { date: '2026-10-01', label: 'Upper A', exercise: '上斜臥推', sets: [{ weight: 100, reps: 10 }] }, // 28 天窗外，不計
    ], prs: [], plan: { suggestedDays: [], swaps: {} } },
    game: { trainingFeedback: [
      { date: '2026-11-03', id: 'a', name: '伏地挺身', target: 10, actual: 12, effort: 'okay', form: true, pain: false },
      { date: '2026-10-01', id: 'b', name: '伏地挺身', target: 10, actual: 99, effort: 'okay', form: true, pain: false }, // 窗外
    ] },
    body: { sleep: [{ date: '2026-11-02', v: 7 }, { date: '2026-11-03', v: 6.5 }] },
    habits: { sleep: { log: [] } },
  };
  const m = dashboardMetrics(state, '2026-11-06');
  assert.equal(m.activity.activeDays, 3); // 11/02 session、11/04 walk、11/06 minimal；11/03 rest 不計
  assert.equal(m.activity.days, 28); assert.equal(m.activity.pausedDays, 1);
  assert.equal(m.gymVolume.totalKg, 600); // 40×8＋40×7，窗外 100×10 不計
  assert.equal(m.gymVolume.weekly[0].kg, 600);
  assert.equal(m.homeVolume.totalReps, 12); // 居家是次數，不是 kg
  assert.equal('kg' in m.homeVolume, false); // 居家量物件本身就沒有 kg 欄位，絕不合併
  assert.equal(m.homeVolume.weekly[0].reps, 12);
  assert.equal(m.sleep.points, 2); assert.equal(m.sleep.avgHours, 6.8); // (7+6.5)/2=6.75→6.8
  assert.equal(m.retention30.activeDays, 3); assert.equal(m.retention30.days, 30);
  assert.match(m.retention30.note, /滾動觀察/); assert.match(m.retention30.note, /非同批回訪率/);
  assert.match(CUT_THRESHOLD_TEXT, /10%/);
  // 壞資料與窗外今天：不丟例外
  const bad = dashboardMetrics(null, '2026-11-06');
  assert.equal(bad.activity.activeDays, 0); assert.equal(bad.sleep.avgHours, null);
  assert.equal(dashboardMetrics(state, 'nope').activity.activeDays, 0);
  assert.equal(parsePhase0(state).gymLog.length, 1);
});

test('accessibility rules present in CSS and HTML: 44pt targets, reduced motion, zoom viewport', () => {
  const css = readFileSync(new URL('../css/app.css', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(css, /#p0 \.p0-pain\{[^}]*min-height:\s*44px/);
  assert.match(css, /#app select\{[^}]*min-height:\s*44px/);
  assert.match(css, /\.t-ctrl button\{[^}]*min-height:\s*44px/);
  // 減少動態：既有分項規則把動畫改為淡入；Phase 2 不新增任何 @keyframes（共 6 個既有），
  // 且絕不能有全域 transition-duration 規則——那會讓資料保護元素的 transitionDuration 不為 0，
  // 破壞 repo 的 reduced-motion 測試（第一輪全套件因此失敗 3 題的回歸防線）。
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*animation-name:\s*fade-in/);
  assert.equal((css.match(/@keyframes/g) || []).length, 6);
  assert.doesNotMatch(css, /\*\s*\{[^}]*transition-duration/);
  assert.doesNotMatch(html, /user-scalable=no/);
  assert.match(html, /id="st-tab-progress"/);
  assert.match(html, /id="s-progress"/);
  assert.match(html, /id="p2"/);
  assert.match(PHASE2_BOUNDARY, /滾動 30 天數字只是滾動觀察/);
});

test('bad data never throws across Phase 2 parsers', () => {
  assert.deepEqual(parseImportCsv(null).entries, []);
  assert.deepEqual(parseImportCsv(',,,,\n,,,,\n').entries, []);
  assert.equal(mergeImportedSets(null, null).addedSets, 0);
  assert.equal(mergeImportedSets([{ date: '2026-11-02', exercise: '上斜臥推', sets: 'bad' }], [{ date: '2026-11-02', exercise: '上斜臥推', sets: [{ weight: 40, reps: 8 }] }]).addedSets, 1);
  assert.deepEqual(applyImportPrs(null, null).prs, []);
  assert.deepEqual(parsePhase2(null).imports, []);
  assert.deepEqual(parsePhase2({ phase2: { imports: [{ format: 'bogus', addedSets: 3 }] } }).imports, []);
});
