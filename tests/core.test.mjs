/* Daily Ten — 引擎單元測試（node --test）：遊戲日、週、等級、XP、連續／Freeze／回歸、Perfect Day／Week、PR、成就、v4 清理與舊資料搬移。 */
process.env.TZ = 'Asia/Tokyo';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gameDay, weekStartOf, levelFromXp, sessionResult, summarize, estimate1RM, pickCoachLine } from '../js/game/core.js';
import { defaultV4, parseV4, ensureV4, logStretch, migrateLegacy } from '../js/state/v4.js';
import { buildDraft, buildExercise, progression, templateFor, setCount } from '../js/game/gym.js';
import { gymAlternatives, stretchAlternatives, resolveGymTemplate, resolveStretchItem, applyGymSwaps, applyStretchSwaps, validateSwaps, cleanSwapMap } from '../js/game/swap.js';
import { pickTask, candidates } from '../js/game/explore.js';

const read = (f) => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url), 'utf8'));
const rules = read('game'), ach = read('achievements').items, gymData = read('gym'), stretchData = read('stretch'), explore = read('explore').items, coach = read('coach'), videos = read('videos'), swaps = read('swaps');
const NOW = new Date('2026-11-04T20:00:00+09:00');
const sum = (v4, now = NOW) => summarize(parseV4({ v4 }), { rules, achievements: ach, now });
const fullSession = (id, date, label = 'Upper A', weight = 20, reps = 8) => {
  const d = buildDraft(label, gymData, [], rules, { id, date, startedAt: `${date}T18:00:00+09:00` });
  d.exercises.forEach((e) => e.sets.forEach((s) => { s.done = true; s.weight = weight; s.reps = reps; }));
  d.finishedAt = `${date}T19:00:00+09:00`;
  return d;
};
const stretch = (v4, date, variant = 'full') => logStretch(v4, { date, variant, now: new Date(`${date}T08:00:00+09:00`), seconds: 900 });

test('遊戲日 04:00 換日；一週從週一開始', () => {
  assert.equal(gameDay(new Date('2026-11-04T03:59:00+09:00'), rules), '2026-11-03');
  assert.equal(gameDay(new Date('2026-11-04T04:00:00+09:00'), rules), '2026-11-04');
  assert.equal(weekStartOf('2026-11-04', rules), '2026-11-02');
  assert.equal(weekStartOf('2026-11-08', rules), '2026-11-02');
  assert.equal(weekStartOf('2026-11-09', rules), '2026-11-09');
});

test('等級曲線 200 + 50×(lv−1)', () => {
  assert.deepEqual(levelFromXp(0, rules), { lv: 1, into: 0, need: 200, pct: 0 });
  assert.deepEqual(levelFromXp(200, rules), { lv: 2, into: 0, need: 250, pct: 0 });
  assert.equal(levelFromXp(450, rules).lv, 3);
  assert.equal(levelFromXp(449, rules).lv, 2);
});

test('課表結果：complete／partial／none', () => {
  const s = fullSession('a', '2026-11-04');
  assert.equal(sessionResult(s, rules).result, 'complete');
  s.exercises[0].sets.forEach((x) => { x.done = false; });
  assert.equal(sessionResult(s, rules).result, 'partial');
  s.exercises.forEach((e) => e.sets.forEach((x) => { x.done = false; }));
  assert.equal(sessionResult(s, rules).result, 'none');
  s.exercises[0].sets[0].done = true;
  assert.equal(sessionResult(s, rules).result, 'none', '完成組數不到一半不計');
});

test('XP：伸展 40／20、健身房 100、Perfect Day 30、探索 60；今日 XP 與總 XP', () => {
  const v4 = defaultV4();
  stretch(v4, '2026-11-03', 'short');
  stretch(v4, '2026-11-04');
  v4.gym.sessions.push(fullSession('g1', '2026-11-04'));
  v4.explore.log.push({ date: '2026-11-04', taskId: 'x', title: '測試', category: '音樂', interest: 4, note: '', at: '2026-11-04T12:00:00+09:00' });
  const s = sum(v4);
  assert.equal(s.xp.total, 20 + 40 + 100 + 30 + 60 + 50, '含探索週目標 +50');
  assert.equal(s.today.xp, 40 + 100 + 30 + 60 + 50);
  assert.equal(s.today.perfect, true);
  assert.equal(s.xp.by.gym, 100); assert.equal(s.xp.by.stretch, 60); assert.equal(s.xp.by.explore, 60); assert.equal(s.xp.by.bonus, 80);
  assert.equal(s.week.gym.count, 1); assert.equal(s.week.stretch.count, 2); assert.equal(s.week.explore.count, 1);
  assert.equal(s.nextLabel, 'Lower A');
});

test('同一天伸展只算一次，短版不覆蓋完整版', () => {
  const v4 = defaultV4();
  stretch(v4, '2026-11-04');
  stretch(v4, '2026-11-04', 'short');
  assert.equal(v4.stretch.log.length, 1);
  assert.equal(v4.stretch.log[0].variant, 'full');
  const v2 = defaultV4();
  stretch(v2, '2026-11-04', 'short');
  stretch(v2, '2026-11-04');
  assert.equal(sum(v2).xp.total, 40);
});

test('連續天數、Freeze 自動補、回歸 XP、今天未做不算漏', () => {
  const v4 = defaultV4();
  for (let d = 20; d <= 27; d++) stretch(v4, `2026-10-${d}`); // 8 天 → 得 1 張 Freeze
  // 10-28 漏 → Freeze 補；10-29、10-30 有做
  stretch(v4, '2026-10-29'); stretch(v4, '2026-10-30');
  let s = sum(v4, new Date('2026-10-30T20:00:00+09:00'));
  assert.equal(s.streak.current, 10);
  assert.deepEqual(s.streak.frozen, ['2026-10-28']);
  assert.equal(s.streak.tokens, 0);
  // 10-31、11-01 漏（沒 Freeze）→ 歸零；11-02 回來 → 回歸 +20
  stretch(v4, '2026-11-02');
  s = sum(v4, new Date('2026-11-02T20:00:00+09:00'));
  assert.equal(s.streak.current, 1);
  assert.equal(s.streak.best, 10);
  assert.ok(s.xp.events.some((e) => e.kind === 'comeback' && e.date === '2026-11-02'));
  assert.equal(s.achievements.unlocked['comeback-1'], '2026-11-02');
  // 11-03 沒做、今天 11-04 還沒做 → comebackDue
  s = sum(v4, new Date('2026-11-04T09:00:00+09:00'));
  assert.equal(s.streak.current, 0);
  assert.equal(s.streak.comebackDue, true);
  // 今天還沒做不算漏：連續維持
  s = sum(v4, new Date('2026-11-03T09:00:00+09:00'));
  assert.equal(s.streak.current, 1);
});

test('暫停日不斷連續、不耗 Freeze', () => {
  const v4 = defaultV4();
  stretch(v4, '2026-11-01'); stretch(v4, '2026-11-02');
  v4.pauses.push({ from: '2026-11-03', to: '2026-11-03', kind: 'rest' });
  stretch(v4, '2026-11-04');
  const s = sum(v4);
  assert.equal(s.streak.current, 3);
  assert.equal(s.streak.frozen.length, 0);
});

test('每週目標與 Perfect Week（健身房 4、伸展 6、探索 1）', () => {
  const v4 = defaultV4();
  const days = ['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07'];
  days.forEach((d) => stretch(v4, d));
  ['2026-11-02', '2026-11-03', '2026-11-05', '2026-11-06'].forEach((d, i) => v4.gym.sessions.push(fullSession(`g${i}`, d, ['Upper A', 'Lower A', 'Upper B', 'Lower B'][i])));
  v4.explore.log.push({ date: '2026-11-07', taskId: 'x', title: 't', category: 'c', interest: 3, note: '', at: '2026-11-07T12:00:00+09:00' });
  const s = sum(v4, new Date('2026-11-07T20:00:00+09:00'));
  assert.equal(s.week.perfect, true);
  assert.deepEqual(s.perfectWeeks, ['2026-11-02']);
  assert.equal(s.week.goalHit.gym, '2026-11-06');
  assert.equal(s.week.goalHit.stretch, undefined, '伸展週目標是 7 天；Perfect Week 只要 6');
  assert.ok(s.xp.events.some((e) => e.kind === 'perfectWeek' && e.xp === 200));
  assert.equal(s.xp.events.filter((e) => e.kind === 'weeklyGoal').length, 2);
  assert.equal(s.nextLabel, 'Upper A', '四次完整課後回到 Upper A');
  assert.equal(s.achievements.unlocked['perfect-week-1'], '2026-11-07');
});

test('PR：第一次是基準，之後估計 1RM 創新高才算、每課每動作最多 1 次、+10 XP', () => {
  const v4 = defaultV4();
  v4.gym.sessions.push(fullSession('g1', '2026-11-02', 'Upper A', 20, 8));
  v4.gym.sessions.push(fullSession('g2', '2026-11-04', 'Upper B', 22.5, 8));
  const s = sum(v4);
  assert.equal(s.prs.length, 7, '7 個動作各 1 個 PR');
  assert.equal(s.prs[0].exerciseId !== undefined, true);
  assert.ok(s.xp.events.some((e) => e.kind === 'pr' && e.xp === 70));
  assert.equal(estimate1RM(100, 10), 133.3);
  assert.equal(s.achievements.unlocked['pr-1'], '2026-11-04');
});

test('成就：count／streak／earlyStretch／categories 的進度', () => {
  const v4 = defaultV4();
  for (let d = 1; d <= 3; d++) stretch(v4, `2026-11-0${d}`);
  v4.explore.log.push({ date: '2026-11-02', taskId: 'a', title: 'a', category: '音樂', interest: 3, note: '', at: '2026-11-02T12:00:00+09:00' });
  v4.explore.log.push({ date: '2026-11-03', taskId: 'b', title: 'b', category: '手作', interest: 3, note: '', at: '2026-11-03T12:00:00+09:00' });
  const s = sum(v4, new Date('2026-11-03T20:00:00+09:00'));
  assert.equal(s.achievements.unlocked['streak-3'], '2026-11-03');
  assert.equal(s.achievements.unlocked['first-stretch'], '2026-11-01');
  assert.equal(s.achievements.unlocked['first-explore'], '2026-11-02');
  assert.equal(s.counts.earlyStretch, 3);
  const cats = s.achievements.locked.find((x) => x.id === 'explore-cats-4');
  assert.equal(cats.progress, 2);
  assert.ok(ach.length >= 30);
  assert.ok(ach.every((a) => a.id && a.name && a.desc && a.type && Number.isFinite(a.n)));
});

test('parseV4 丟掉壞資料、不丟例外；ensureV4 冪等', () => {
  const raw = { v4: { version: 1, gym: { sessions: [{ id: 'x', date: 'bad', exercises: [] }, { id: 'y', date: '2026-11-04', finishedAt: 'nope', exercises: [] }, fullSession('ok', '2026-11-04')] }, stretch: { log: [{ date: '2026-11-04', variant: 'nope' }, { date: '2026-11-04', variant: 'short' }] }, explore: { log: [{ date: '2026-11-04' }], current: { taskId: 5 } }, pauses: [{ from: '2026-11-05', to: '2026-11-04' }] } };
  const p = parseV4(raw);
  assert.equal(p.gym.sessions.length, 1);
  assert.equal(p.stretch.log.length, 1);
  assert.equal(p.explore.log.length, 0);
  assert.equal(p.explore.current, null);
  assert.equal(p.pauses.length, 0);
  assert.equal(p.settings.identity.length > 0, true);
  const st = { version: 3 };
  const a = ensureV4(st); const b = ensureV4(st);
  assert.equal(a.created, true); assert.equal(b.created, false); assert.equal(st.v4, b.v4);
  assert.doesNotThrow(() => summarize(parseV4({ v4: { gym: 1, stretch: null, explore: 'x' } }), { rules, achievements: ach, now: NOW }));
});

test('parseV4：draft 的進行中休息只保留給未完成的草稿，且須是合法數字', () => {
  const draft = (rest, finishedAt = null) => ({ id: 'd', date: '2026-11-04', label: 'Upper A', startedAt: '2026-11-04T15:00:00+09:00', finishedAt, exercises: [], rest });
  // 合法：未完成草稿保留 deadline／total（2026-11-08 休息倒數修復：draft.rest）
  let p = parseV4({ v4: { gym: { draft: draft({ deadline: 1790000000000, total: 150 }) } } });
  assert.deepEqual(p.gym.draft.rest, { deadline: 1790000000000, total: 150 });
  // 已完成的課不帶 rest
  p = parseV4({ v4: { gym: { draft: draft({ deadline: 1790000000000, total: 150 }, '2026-11-04T16:00:00+09:00') } } });
  assert.equal(p.gym.draft.rest, undefined);
  // 壞資料：deadline 不是數字、total 不是正整數、rest 不是物件 → 全部丟掉
  for (const bad of [{ deadline: 'x', total: 150 }, { deadline: 1790000000000, total: 0 }, { deadline: 1790000000000, total: 1.5 }, { deadline: 1790000000000 }, 'x', null]) {
    p = parseV4({ v4: { gym: { draft: draft(bad) } } });
    assert.equal(p.gym.draft.rest, undefined);
  }
});

test('舊 Phase 0／1 資料搬進 v4：健身房組數、伸展、探索', () => {
  const st = { version: 3, phase1: { gymSets: [
    { date: '2026-10-30', label: 'Upper A', exercise: '上斜臥推', sets: [{ weight: 20, reps: 8 }, { weight: 20, reps: 8 }] },
    { date: '2026-10-30', label: 'Upper A', exercise: '平板臥推', sets: [{ weight: 40, reps: 6 }] },
    { date: 'bad', label: 'Upper A', exercise: '側平舉', sets: [{ weight: 5, reps: 12 }] }
  ] }, phase0: { stretch: { '2026-10-30': 'full', '2026-10-31': 'short', 'x': 'full' }, exploreTries: [{ date: '2026-10-31', taskId: 'origami' }] } };
  const { v4, created, moved } = ensureV4(st);
  assert.equal(created, true);
  assert.deepEqual(moved, { gym: 1, stretch: 2, explore: 1 });
  const s = sum(v4, new Date('2026-10-31T20:00:00+09:00'));
  assert.equal(s.counts.gym, 1);
  assert.equal(s.sessions[0].exercises[0].id, 'incline-db-press');
  assert.equal(s.counts.stretch, 2);
  assert.equal(s.counts.explore, 1);
  assert.equal(s.nextLabel, 'Lower A');
  assert.doesNotThrow(() => migrateLegacy({ phase1: { gymSets: 'x' }, phase0: { stretch: null } }, defaultV4()));
});

test('健身房：模板、預填、漸進建議', () => {
  assert.equal(templateFor('Lower B', gymData).type, 'lower');
  assert.equal(templateFor('nope', gymData).label, 'Upper A');
  assert.equal(setCount('2–3'), 2); assert.equal(setCount(2), 2); assert.equal(setCount('x'), 2);
  const prev = fullSession('g1', '2026-11-02', 'Upper A', 20, 10);
  const d = buildDraft('Upper B', gymData, [prev], rules, { id: 'g2', date: '2026-11-04', startedAt: '2026-11-04T18:00:00+09:00' });
  assert.equal(d.exercises[0].sets[0].weight, 20);
  assert.equal(d.exercises[0].sets[0].done, false);
  assert.match(d.exercises[0].suggestion, /加 2\.5 kg/);
  const low = progression(gymData.templates.lower[0], [{ weight: 60, reps: 10 }, { weight: 60, reps: 10 }], 'lower', rules);
  assert.equal(low.kind, 'weight'); assert.equal(low.weight, 65);
  const reps = progression(gymData.templates.upper[0], [{ weight: 20, reps: 8 }], 'upper', rules);
  assert.equal(reps.kind, 'reps'); assert.equal(reps.reps, 9);
  assert.equal(progression(gymData.templates.upper[0], null, 'upper', rules).kind, 'start');
});

test('探索：洗牌不重複、做過的排後面', () => {
  const log = explore.slice(0, explore.length - 2).map((t) => ({ taskId: t.id }));
  const c = candidates(explore, log, [], null);
  assert.equal(c.length, 2);
  const t = pickTask(explore, [], [], explore[0].id, () => 0);
  assert.notEqual(t.id, explore[0].id);
  assert.ok(explore.length >= 40);
  assert.ok(explore.every((x) => x.id && x.title && x.category && x.twoMinute && x.finish));
  assert.ok(explore.every((x) => !/https?:\/\//.test(JSON.stringify(x))), '任務池不含網址');
});

test('資料檔一致：伸展 900／300 秒、每個動作與伸展項目都有示範 Short', () => {
  const full = stretchData.items.reduce((a, b) => a + b.full, 0), short = stretchData.items.reduce((a, b) => a + b.short, 0);
  assert.equal(full, rules.stretch.fullMinutes * 60);
  assert.equal(short, rules.stretch.shortMinutes * 60);
  const ids = new Set(videos.items.filter((v) => typeof v.youtubeId === 'string' && /^[A-Za-z0-9_-]{11}$/.test(v.youtubeId)).map((v) => v.id));
  for (const e of [...gymData.templates.upper, ...gymData.templates.lower]) assert.ok(ids.has(e.id), `缺示範：${e.id}`);
  for (const s of stretchData.items) assert.ok(ids.has(s.id), `缺示範：${s.id}`);
  assert.ok(videos.items.every((v) => Number.isInteger(v.views) && v.views > 0 && v.shortsStatus === 200));
});

test('教練一句話：同一天固定、依狀態桶', () => {
  const v4 = defaultV4();
  const s = sum(v4, new Date('2026-11-04T08:00:00+09:00'));
  const a = pickCoachLine(coach, s, new Date('2026-11-04T08:00:00+09:00'));
  const b = pickCoachLine(coach, s, new Date('2026-11-04T09:30:00+09:00'));
  assert.equal(a, b);
  assert.ok(coach.buckets.morning.includes(a));
});

/* ---------- 換動作（2026-11-08） ---------- */
test('換動作：備用表自我檢查全過（每項 ≥3 個備用、id 不重複不衝突）', () => {
  assert.deepEqual(validateSwaps(swaps, gymData, stretchData), []);
  for (const e of [...gymData.templates.upper, ...gymData.templates.lower]) {
    assert.ok(gymAlternatives(swaps, e.id).length >= 3, `${e.id} 備用不到 3 個`);
  }
  for (const it of stretchData.items) {
    assert.ok(stretchAlternatives(swaps, it.id).length >= 3, `${it.id} 備用不到 3 個`);
  }
});

test('換動作：備用與原動作同一量級（組數相同、次數 6–15 下、kind 合法）', () => {
  for (const e of [...gymData.templates.upper, ...gymData.templates.lower]) {
    for (const a of gymAlternatives(swaps, e.id)) {
      assert.equal(setCount(a.sets), setCount(e.sets), `${e.id} → ${a.id} 組數不同`);
      const m = /^(\d{1,3})\s*[–-]\s*(\d{1,3})$/.exec(a.reps);
      assert.ok(m, `${a.id} reps 格式不對`);
      assert.ok(Number(m[1]) >= 6 && Number(m[2]) <= 15, `${a.id} 次數範圍超出 6–15`);
      assert.ok(a.kind === 'compound' || a.kind === 'isolation');
    }
  }
});

test('換動作：resolve（原動作、備用、不存在的對應、伸展沿用秒數）', () => {
  const orig = gymData.templates.upper[0]; // 上斜臥推
  assert.deepEqual(resolveGymTemplate(orig, null, swaps).swappedFrom, null);
  assert.equal(resolveGymTemplate(orig, {}, swaps).id, 'incline-db-press');
  const alt = resolveGymTemplate(orig, { 'incline-db-press': 'incline-machine-press' }, swaps);
  assert.equal(alt.id, 'incline-machine-press');
  assert.equal(alt.swappedFrom, 'incline-db-press');
  assert.equal(alt.kind, 'compound');
  assert.equal(resolveGymTemplate(orig, { 'incline-db-press': '不存在的動作' }, swaps).id, 'incline-db-press');
  assert.equal(resolveGymTemplate(orig, { 'bench-press': 'incline-machine-press' }, swaps).id, 'incline-db-press', '別人的對應不影響這個動作');
  const st = stretchData.items[0]; // 貓牛式 90／60
  const rst = resolveStretchItem(st, { 'cat-cow': 'seated-cat-cow' }, swaps);
  assert.equal(rst.id, 'seated-cat-cow');
  assert.equal(rst.swappedFrom, 'cat-cow');
  assert.equal(rst.full, 90); assert.equal(rst.short, 60);
  assert.equal(resolveStretchItem(st, { 'cat-cow': '不存在的項目' }, swaps).id, 'cat-cow');
});

test('換動作：伸展備用沿用原項目秒數（完整版 900 秒、短版 300 秒不變）', () => {
  const map = { 'cat-cow': 'standing-cat-cow', 'hip-90-90': 'butterfly', 'down-dog-child': 'child-pose' };
  const full = applyStretchSwaps(stretchData.items, map, swaps);
  assert.equal(full.reduce((a, b) => a + b.full, 0), 900);
  assert.equal(full.reduce((a, b) => a + b.short, 0), 300);
  assert.equal(full[0].id, 'standing-cat-cow');
  assert.equal(full[0].swappedFrom, 'cat-cow');
  assert.equal(applyStretchSwaps(stretchData.items, {}, swaps)[0].id, 'cat-cow');
});

test('換動作：buildDraft 套用對應，備用動作查自己的上次紀錄', () => {
  // 上次做過腿推 100kg × 10 下兩組；深蹲換成腿推後，預填應是腿推的紀錄、建議加 5kg
  const prev = fullSession('g0', '2026-11-02', 'Lower A', 100, 10);
  prev.exercises[0].id = 'leg-press'; prev.exercises[0].name = '腿推';
  const d = buildDraft('Lower A', gymData, [prev], rules, { id: 'g1', date: '2026-11-04', startedAt: '2026-11-04T18:00:00+09:00', swaps: { squat: 'leg-press' }, swapsData: swaps });
  assert.equal(d.exercises[0].id, 'leg-press');
  assert.equal(d.exercises[0].swappedFrom, 'squat');
  assert.equal(d.exercises[0].sets[0].weight, 100);
  assert.match(d.exercises[0].suggestion, /加 5 kg/);
  const d2 = buildDraft('Lower A', gymData, [prev], rules, { id: 'g2', date: '2026-11-04', startedAt: '2026-11-04T18:00:00+09:00' });
  assert.equal(d2.exercises[0].id, 'squat');
  assert.equal(d2.exercises[0].swappedFrom, null);
});

test('換動作：buildExercise 重建單一動作（課表進行中換動作共用）', () => {
  const prev = fullSession('g0', '2026-11-02', 'Upper A', 12, 12);
  prev.exercises[2].id = 'machine-lateral-raise'; prev.exercises[2].name = '器械側平舉';
  const tpl = resolveGymTemplate(gymData.templates.upper[2], { 'lateral-raise': 'machine-lateral-raise' }, swaps);
  const ex = buildExercise(tpl, [prev], 'upper', rules);
  assert.equal(ex.id, 'machine-lateral-raise');
  assert.equal(ex.swappedFrom, 'lateral-raise');
  assert.equal(ex.sets[0].weight, 12);
  assert.equal(ex.sets.every((s) => s.done === false), true);
});

test('換動作：對應表清理（不存在的備用 id 會被清掉）', () => {
  assert.deepEqual(cleanSwapMap({ squat: 'leg-press', 'bench-press': '不存在的動作', 'rdl': 5 }, 'gym', swaps), { squat: 'leg-press' });
  assert.deepEqual(cleanSwapMap(null, 'gym', swaps), {});
  assert.deepEqual(cleanSwapMap({ 'cat-cow': 'cobra' }, 'stretch', swaps), {}, '健身房備用不能當伸展備用');
});

test('換動作：defaultV4 與 fillMissing 有 swaps 欄位；舊資料不丟', () => {
  const v4 = defaultV4();
  assert.deepEqual(v4.gym.swaps, {});
  assert.deepEqual(v4.stretch.swaps, {});
  const old = defaultV4();
  delete old.gym.swaps; delete old.stretch.swaps;
  old.gym.swaps = undefined;
  const { v4: fixed } = ensureV4({ v4: old });
  assert.deepEqual(fixed.gym.swaps, {});
  assert.deepEqual(fixed.stretch.swaps, {});
});

test('換動作：換過的課照常計分（sessionResult 不認動作 id）', () => {
  const d = buildDraft('Upper A', gymData, [], rules, { id: 'g9', date: '2026-11-04', startedAt: '2026-11-04T18:00:00+09:00', swaps: { 'bench-press': 'dumbbell-bench-press' }, swapsData: swaps });
  d.exercises.forEach((e) => e.sets.forEach((s) => { s.done = true; s.weight = 20; s.reps = 8; }));
  d.finishedAt = '2026-11-04T19:00:00+09:00';
  assert.equal(sessionResult(d, rules).result, 'complete');
  const cleaned = parseV4({ v4: { ...defaultV4(), gym: { sessions: [d], draft: null } } });
  assert.equal(cleaned.gym.sessions[0].exercises[1].id, 'dumbbell-bench-press');
  assert.equal(sum({ ...defaultV4(), gym: { sessions: [d], draft: null } }).xp.by.gym, 100);
});
