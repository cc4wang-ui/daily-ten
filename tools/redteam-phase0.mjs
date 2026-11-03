/* Phase 0 紅隊自查（純 Node，不寫檔）：邊界、壞資料、XP/等級不變、順序保留、暫停優先、洗牌不重複、匯出逃逸。
   用法：node tools/redteam-phase0.mjs */
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { parseRules } from '../js/game/rules.js';
import { todaySummary } from '../js/game/engine.js';
import { parsePhase0, nextGym, forgivingStreak, shuffleExplore, buildExport, EXPLORE_TASKS } from '../js/game/phase0.js';
import { dayNumber } from '../js/game/day.js';

const RAW = JSON.parse(readFileSync(new URL('../data/game.json', import.meta.url), 'utf8'));
const R = parseRules(RAW);
const base = { version: 3, level: 2, xp: 0, streak: { current: 0, best: 0, lastDate: null }, sessions: [{ date: '2026-11-02', type: 'full', xp: 10 }], prs: { hrp: [], plank: [], run2mi: [], pushup: [], pike: [], sideplank: [] }, settings: { bedtime: '23:00', wakeTime: '07:00', windowMin: 30 }, habits: { sleep: { log: [{ date: '2026-11-02', lightsOut: '2026-11-01T23:00:00+09:00', wake: '2026-11-02T07:00:00+09:00', lightsOutEdited: false }] }, explore: { items: [], log: [] } }, goals: {}, phase: { current: 'P1', startedAt: null, history: [] }, game: {} };

// 1. XP/等級不變：phase0 欄位本身不進 engine（engine 只讀 sessions/sleep）
{
  const a = todaySummary(base, new Date('2026-11-02T20:00:00+09:00'), R);
  const withPhase0 = { ...base, phase0: { gymLog: [{ date: '2026-11-02', mode: 'gym' }], exploreTries: [{ date: '2026-11-02', taskId: 'melodica' }], stretch: { '2026-11-02': 'short' } } };
  const b = todaySummary(withPhase0, new Date('2026-11-02T20:00:00+09:00'), R);
  assert.equal(a.xp.total, b.xp.total); assert.equal(a.level.lv, b.level.lv); assert.equal(a.perfectDay.done, b.perfectDay.done);
  console.log('RED 1 OK：phase0 欄位不改 XP/等級/Perfect Day，total =', a.xp.total);
}
// 2. 順序：同一天 gym+home 兩筆 log 只算第一筆？（UI 會覆寫同一天，只留一筆；此處驗證重複日期不重複推進需靠 UI 覆寫語意，純函式層驗證 count 以 gym 模式計）
{
  const p = parsePhase0({ phase0: { gymLog: [{ date: '2026-11-02', mode: 'gym' }, { date: '2026-11-03', mode: 'gym' }, { date: '2026-11-04', mode: 'gym' }, { date: '2026-11-05', mode: 'gym' }] } });
  assert.equal(nextGym(p, '2026-11-06').label, 'Upper A'); // 4 次後回到開頭
  console.log('RED 2 OK：4 次完整健身房課後順序回到 Upper A');
}
// 3. 暫停優先＋Freeze 只補非暫停：暫停日夾在中間不耗 Freeze，之後非暫停缺席仍需 Freeze
{
  const pauses = [{ from: '2026-11-03', to: '2026-11-04', kind: 'Travel' }];
  const r = forgivingStreak([dayNumber('2026-11-02'), dayNumber('2026-11-05')], pauses, dayNumber('2026-11-05'), { earnEvery: 7, max: 2 });
  assert.equal(r.days, 2); assert.deepEqual(r.used, []);
  console.log('RED 3 OK：暫停缺席不耗 Freeze、不斷連續');
}
// 4. 洗牌：200 次無立即重複；任務都有完成標準；邊界字串含 P1 2 支柱
{
  let prev = -1; for (let i = 0; i < 200; i++) { const n = shuffleExplore(prev); assert.notEqual(n, prev); prev = n; }
  assert.ok(EXPLORE_TASKS.every((t) => t.finish && t.finish.length > 0));
  const ex = buildExport({}, parsePhase0({}));
  assert.match(ex.json.boundary, /P1 Perfect Day 仍為動＋眠 2 支柱/);
  console.log('RED 4 OK：洗牌 200 次無立即重複，14 任務皆有完成標準');
}
// 5. 壞資料與匯出逃逸：引號、換行不破 CSV
{
  const bad = parsePhase0({ phase0: { gymLog: 'not-array', pauses: [{ from: 'x', to: 'y', kind: 'Nope' }], stretch: { '2026-11-02': 'long' }, pain: [{ date: '2026-11-02', exercise: 'a"b\nc' }] } });
  assert.deepEqual(bad.gymLog, []); assert.deepEqual(bad.pauses, []); assert.deepEqual(bad.stretch, {});
  const csv = buildExport({}, bad).csv;
  assert.match(csv, /a""b/);
  console.log('RED 5 OK：壞資料歸空不丟例外，CSV 引號已逃逸');
}
// 6. 邊界：最小課≠完整健身房課（weekGymCount 只算 gym）
{
  const { weekGymCount } = await import('../js/game/phase0.js');
  const p = parsePhase0({ phase0: { gymLog: [{ date: '2026-11-02', mode: 'minimum' }, { date: '2026-11-03', mode: 'walk' }] } });
  assert.equal(weekGymCount(p, '2026-11-06'), 0);
  console.log('RED 6 OK：最小課／散步不計健身房達標率 x/4');
}
console.log('redteam-phase0: all OK (6 checks)');
