/* 正向回饋加強包驗證（純 Node，不開瀏覽器、不寫檔）：
   用真的 engine＋rewards 算三個情境，確認既有 XP 不變、里程碑／新 PR／壞資料都正確。
   用法：node tools/verify-rewards.mjs（TZ 建議 Asia/Tokyo） */
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { parseRules } from '../js/game/rules.js';
import { todaySummary } from '../js/game/engine.js';

const RAW = JSON.parse(readFileSync(new URL('../data/game.json', import.meta.url), 'utf8'));
const R = parseRules(RAW);
assert.ok(R, 'rules should parse');
const night = (date, lo, wake) => {
  const [y, m, d] = date.split('-').map(Number);
  const loDate = lo >= '12:00' ? new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10) : date;
  return { date, lightsOut: `${loDate}T${lo}:00+09:00`, wake: `${date}T${wake}:00+09:00`, lightsOutEdited: false };
};
const session = (date, type) => ({ date, type, xp: 10 });
const makeState = ({ sessions = [], sleep = [], prs = null } = {}) => ({
  version: 3, level: 2, xp: 0, streak: { current: 0, best: 0, lastDate: null }, sessions,
  prs: prs || { hrp: [], plank: [], run2mi: [], pushup: [], pike: [], sideplank: [] },
  settings: { bedtime: '23:00', wakeTime: '07:00', windowMin: 30 },
  habits: { sleep: { log: sleep }, explore: { items: [], log: [] } },
  goals: { identity: '我是獨立、自律、持續成長的人。' },
  phase: { current: 'P1', startedAt: null, history: [] },
  game: { xp: { move: 0, sleep: 0, explore: 0, total: 0 } }, meta: {},
});
const span = (from, n) => Array.from({ length: n }, (_, i) => {
  const [y, m, d] = from.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10);
});
const at = (date, hm = '20:00') => `${date}T${hm}:00+09:00`;

// 情境 1：連續 7 天訓練＋每天打卡，最後一天 2026-10-07（週三）
{
  const dates = span('2026-10-01', 7);
  const st = makeState({ sessions: dates.map((d) => session(d, 'full')), sleep: dates.map((d) => night(d, '23:00', '07:00')) });
  const s = todaySummary(st, new Date(at('2026-10-07')), R);
  assert.equal(s.xp.total, 980, '既有 XP 不變：動 350＋眠 420＋Perfect 210');
  assert.equal(s.rewards.streak.milestoneToday, 7);
  assert.equal(s.rewards.perfectStreak.current, 7);
  assert.equal(s.rewards.week.perfectDays, 3, '本週（週一到週三）Perfect 3 天');
  assert.equal(s.rewards.celebrations.length, 2);
  console.log('情境1 OK：', s.rewards.homeLine);
}
// 情境 2：新 PR：之前 HRP 最好 10 下，今天 12 下
{
  const dates = span('2026-10-01', 3);
  const st = makeState({
    sessions: dates.map((d) => session(d, 'full')),
    sleep: dates.map((d) => night(d, '23:00', '07:00')),
    prs: { hrp: [{ date: '2026-10-01', reps: 10 }, { date: '2026-10-03', reps: 12 }], plank: [], run2mi: [], pushup: [], pike: [], sideplank: [] },
  });
  const s = todaySummary(st, new Date(at('2026-10-03')), R);
  const hrp = s.rewards.prs.find((p) => p.key === 'hrp');
  assert.equal(hrp.isNewPr, true);
  assert.equal(hrp.label, '新 PR！HRP 伏地挺身 12 下');
  console.log('情境2 OK：', hrp.label);
}
// 情境 3：壞資料不丟例外，rewards 欄位仍在
{
  const s = todaySummary(null, new Date(at('2026-10-05')), R);
  assert.ok(s.rewards, 'rewards field exists on bad state');
  assert.deepEqual(s.rewards.celebrations, []);
  console.log('情境3 OK：壞資料不丟例外');
}
console.log('verify-rewards: all OK');
