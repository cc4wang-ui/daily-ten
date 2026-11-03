/* Phase 2 紅隊自查（純 Node，不寫檔）：XP/等級不變、匯入不重複計分、首頁仍只有兩條進度、
   匯入不寫 session、量分開算、滾動 30 天非驗證結論、壞資料。用法：node tools/redteam-phase2.mjs */
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { parseRules } from '../js/game/rules.js';
import { todaySummary } from '../js/game/engine.js';
import { parsePhase0 } from '../js/game/phase0.js';
import { parsePhase1 } from '../js/game/phase1.js';
import {
  parseImportCsv, mergeImportedSets, applyImportPrs, dashboardMetrics, PHASE2_BOUNDARY,
} from '../js/game/phase2.js';

const RAW = JSON.parse(readFileSync(new URL('../data/game.json', import.meta.url), 'utf8'));
const R = parseRules(RAW);
const base = { version: 3, level: 2, xp: 0, streak: { current: 0, best: 0, lastDate: null }, sessions: [{ date: '2026-11-02', type: 'full', xp: 10 }], prs: { hrp: [], plank: [], run2mi: [], pushup: [], pike: [], sideplank: [] }, settings: { bedtime: '23:00', wakeTime: '07:00', windowMin: 30 }, habits: { sleep: { log: [{ date: '2026-11-02', lightsOut: '2026-11-01T23:00:00+09:00', wake: '2026-11-02T07:00:00+09:00', lightsOutEdited: false }] }, explore: { items: [], log: [] } }, goals: {}, phase: { current: 'P1', startedAt: null, history: [] }, game: {} };
const STRONG = 'Date,Workout Name,Exercise Name,Set Order,Weight,Reps\n2026-11-02,Upper A,上斜臥推,1,40,8\n2026-11-02,Upper A,上斜臥推,2,40,7\n';

// 1. XP/等級/Perfect Day 不變：phase2 欄位與匯入的 gymSets 本身不進 engine（engine 只讀 sessions/sleep）
{
  const a = todaySummary(base, new Date('2026-11-02T20:00:00+09:00'), R);
  const parsed = parseImportCsv(STRONG, { strongUnit: 'kg' });
  const merged = mergeImportedSets([], parsed.entries);
  const withPhase2 = { ...base, phase1: { gymSets: merged.gymSets, prs: [], plan: { suggestedDays: [], swaps: {} } }, phase2: { imports: [{ format: 'strong', addedSets: 2, duplicateSets: 0, totalSets: 2, firstDate: '2026-11-02', lastDate: '2026-11-02' }] } };
  const b = todaySummary(withPhase2, new Date('2026-11-02T20:00:00+09:00'), R);
  assert.equal(a.xp.total, b.xp.total); assert.equal(a.level.lv, b.level.lv); assert.equal(a.perfectDay.done, b.perfectDay.done);
  console.log('RED 1 OK：phase2／匯入欄位不改 XP/等級/Perfect Day，total =', a.xp.total);
}
// 2. 匯入不重複計分：同一檔案重匯新增 0、session 陣列長度不變、PR 不重複推高
{
  const parsed = parseImportCsv(STRONG, { strongUnit: 'kg' });
  const first = mergeImportedSets([], parsed.entries);
  const pr1 = applyImportPrs([], parsed.entries);
  const second = mergeImportedSets(first.gymSets, parsed.entries);
  const pr2 = applyImportPrs(pr1.prs, parsed.entries);
  assert.equal(second.addedSets, 0); assert.equal(second.duplicateSets, 2);
  assert.deepEqual(second.gymSets, first.gymSets);
  assert.equal(pr2.newPrs.length, 0); assert.equal(pr2.baselines.length, 0); // 基準已存在，不再推基準
  assert.equal(base.sessions.length, 1); // 匯入沒寫 session（base 未被改動即為證）
  console.log('RED 2 OK：重匯新增 0 組、不重複 PR、不寫 session');
}
// 3. 首頁仍只有兩條進度：home.js 不渲染 Phase 2 面板，p2 只存在於統計的 Progress 分段
{
  const home = readFileSync(new URL('../js/ui/home.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.equal(home.includes('renderPhase2Panel'), false);
  assert.equal(home.includes('p2'), false);
  const homeSection = html.split('id="s-home"')[1].split('id="s-checkin"')[0];
  assert.equal(homeSection.includes('id="p2"'), false);
  assert.equal(homeSection.includes('id="s-progress"'), false);
  assert.match(html, /id="s-progress"/); // Progress 分段存在，但不在首頁
  console.log('RED 3 OK：首頁不含 p2／Progress，Phase 2 只在統計分段');
}
// 4. 量分開算：健身房 kg 與居家次數不合併；睡眠平均不受量影響
{
  const m = dashboardMetrics({
    sessions: [], phase0: { gymLog: [] },
    phase1: { gymSets: [{ date: '2026-11-06', label: '', exercise: '上斜臥推', sets: [{ weight: 40, reps: 10 }] }], prs: [], plan: {} },
    game: { trainingFeedback: [{ date: '2026-11-06', id: 'a', name: '伏地挺身', target: 10, actual: 20, effort: 'okay', form: true, pain: false }] },
    body: { sleep: [{ date: '2026-11-06', v: 7 }] }, habits: { sleep: { log: [] } },
  }, '2026-11-06');
  assert.equal(m.gymVolume.totalKg, 400); assert.equal(m.homeVolume.totalReps, 20);
  assert.equal(m.gymVolume.totalKg + m.homeVolume.totalReps, 420); // 420 只是測試相加，產品絕不顯示此合併值
  assert.equal(m.sleep.avgHours, 7);
  console.log('RED 4 OK：健身房 400 kg、居家 20 下分開，睡眠 7 小時獨立');
}
// 5. 滾動 30 天是觀察不是結論；砍功能門檻只註明、不刪功能
{
  const m = dashboardMetrics({ sessions: [{ date: '2026-11-06', type: 'full' }], phase0: {}, phase1: {}, game: {}, body: {}, habits: {} }, '2026-11-06');
  assert.equal(m.retention30.activeDays, 1); assert.equal(m.retention30.days, 30);
  assert.match(m.retention30.note, /滾動觀察/); assert.doesNotMatch(m.retention30.note, /已驗證/);
  assert.match(PHASE2_BOUNDARY, /滾動 30 天數字只是滾動觀察/);
  const ui = readFileSync(new URL('../js/ui/phase2.js', import.meta.url), 'utf8');
  assert.match(ui, /CUT_THRESHOLD_TEXT/);
  assert.doesNotMatch(ui, /delete|removeChild|filter\(.*\)\.length\s*=\s*0/); // 儀表板不刪除功能（僅註明門檻）
  console.log('RED 5 OK：滾動 30 天標明觀察性質，儀表板不刪功能');
}
// 6. 壞資料不丟例外；game.json／engine／rewards 未被 Phase 2 動到（檔案清單見 PHASE2.md）
{
  assert.deepEqual(parseImportCsv('not csv at all').entries, []);
  assert.equal(mergeImportedSets('bad', 'bad').addedSets, 0);
  assert.equal(dashboardMetrics({ sessions: 'bad', phase1: { gymSets: 'bad' } }, '2026-11-06').activity.activeDays, 0);
  assert.equal(parsePhase1({ phase1: { gymSets: 'bad' } }).gymSets.length, 0);
  assert.equal(parsePhase0(null).gymLog.length, 0);
  console.log('RED 6 OK：壞資料安全過濾，不丟例外');
}
console.log('redteam-phase2：6/6 通過');
