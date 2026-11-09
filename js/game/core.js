/* Daily Ten — 遊戲引擎 v2（redo-v1）。純函式、決定性：不讀時鐘（now 由呼叫端傳入）、不碰 DOM／localStorage／網路、不改動輸入。
   三個習慣：健身房（gym）／晨間伸展（stretch）／探索（explore）。所有數值來自 data/game.json（rules）與 data/achievements.json。
   XP、等級、連續、Freeze、Perfect Day／Week、成就全部由紀錄重算，不儲存（儲存一份只會過期）。
   輸入 v4 的形狀見 js/state/v4.js 的 parseV4()（已清理過的乾淨資料）。
   對外：gameDay、weekStartOf、weekDays、levelFromXp、sessionResult、estimate1RM、summarize、pickCoachLine */
import { dayNumber, dayNumberToStr } from '../state/time.js';

const pad = (n) => String(n).padStart(2, '0');
const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/* 遊戲日：04:00 換日（凌晨 0–4 點算前一天）。now 可以是 Date 或毫秒。 */
export function gameDay(now, rules) {
  const d = now instanceof Date ? new Date(now.getTime()) : new Date(num(now, Date.now()));
  if (!Number.isFinite(d.getTime())) return '1970-01-01';
  const h = Number.isInteger(rules?.day?.boundaryHour) ? rules.day.boundaryHour : 4;
  if (d.getHours() < h) d.setDate(d.getDate() - 1);
  return `${pad(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/* 週一為一週的開始（rules.day.weekStartsOn，預設 1）。回傳 'YYYY-MM-DD'。 */
export function weekStartOf(dateStr, rules) {
  const n = dayNumber(dateStr);
  if (!Number.isFinite(n)) return dateStr;
  const startsOn = Number.isInteger(rules?.day?.weekStartsOn) ? rules.day.weekStartsOn : 1;
  const dow = ((n + 4) % 7 + 7) % 7; // 1970-01-01 是週四 → dow 0=日
  const back = (dow - startsOn + 7) % 7;
  return dayNumberToStr(n - back);
}
export function weekDays(weekStart) {
  const n = dayNumber(weekStart);
  return Array.from({ length: 7 }, (_, i) => dayNumberToStr(n + i));
}

export function levelFromXp(total, rules) {
  const base = num(rules?.level?.base, 200), step = num(rules?.level?.step, 50), max = num(rules?.level?.max, 100);
  let lv = 1, left = Math.max(0, Math.floor(num(total)));
  let need = base;
  while (lv < max && left >= need) { left -= need; lv += 1; need = base + step * (lv - 1); }
  const pct = lv >= max ? 100 : Math.max(0, Math.min(100, Math.round((left / need) * 100)));
  return { lv, into: left, need, pct };
}

/* Epley 估計 1RM；只用來比較 PR，不顯示成「你的 1RM」 */
export function estimate1RM(weight, reps) {
  const w = num(weight), r = num(reps);
  if (w <= 0 || r <= 0) return 0;
  return Math.round(w * (1 + r / 30) * 10) / 10;
}

/* 一次健身房課的結果：complete（每個動作至少 1 組完成）／partial（完成組數 ≥ 一半）／none */
export function sessionResult(session, rules) {
  const exs = Array.isArray(session?.exercises) ? session.exercises : [];
  let total = 0, done = 0, volume = 0, allHaveOne = exs.length > 0;
  for (const ex of exs) {
    const sets = Array.isArray(ex?.sets) ? ex.sets : [];
    let one = false;
    for (const s of sets) {
      total += 1;
      if (s && s.done) { done += 1; one = true; volume += num(s.weight) * num(s.reps); }
    }
    if (!one) allHaveOne = false;
  }
  const ratio = total ? done / total : 0;
  const minRatio = num(rules?.habits?.gym?.partialMinRatio, 0.5);
  const result = done === 0 ? 'none' : allHaveOne ? 'complete' : ratio >= minRatio ? 'partial' : 'none';
  return { result, total, done, volume: Math.round(volume), ratio };
}

/* ---------- 主推導 ---------- */
export function summarize(v4, { rules, achievements = [], now = new Date() }) {
  const today = gameDay(now, rules);
  const todayN = dayNumber(today);
  const H = rules.habits, B = rules.bonus;
  const gymXp = H.gym.xp, stXp = H.stretch.xp, exXp = H.explore.xp;

  /* 1. 每日紀錄 */
  const days = new Map(); // date → {gym:[sessions], stretch:variant, explore:[entries]}
  const dayOf = (d) => { if (!days.has(d)) days.set(d, { gym: [], stretch: null, stretchAt: null, explore: [] }); return days.get(d); };
  const sessions = (v4.gym?.sessions || []).map((s) => ({ ...s, ...sessionResult(s, rules) }))
    .filter((s) => s.result !== 'none')
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : String(a.finishedAt || '').localeCompare(String(b.finishedAt || ''))));
  for (const s of sessions) dayOf(s.date).gym.push(s);
  for (const e of v4.stretch?.log || []) {
    const d = dayOf(e.date);
    if (!d.stretch || (e.variant === 'full' && d.stretch !== 'full')) { d.stretch = e.variant; d.stretchAt = e.at || null; }
  }
  for (const e of v4.explore?.log || []) dayOf(e.date).explore.push(e);
  const paused = new Set();
  for (const p of v4.pauses || []) {
    const a = dayNumber(p.from), b = dayNumber(p.to);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    for (let n = a; n <= Math.min(b, a + 365); n++) paused.add(dayNumberToStr(n));
  }

  /* 2. PR（每個動作每次課最多 1 個；第一次是基準，不算 PR） */
  const best = new Map(); // exerciseId → {e1rm, weight, reps, date}
  const prs = []; // {date, exerciseId, name, weight, reps, e1rm, sessionId}
  const prBySession = new Map();
  for (const s of sessions) {
    for (const ex of s.exercises || []) {
      let top = null;
      for (const st of ex.sets || []) {
        if (!st?.done || num(st.weight) <= 0 || num(st.reps) <= 0) continue;
        const e1 = estimate1RM(st.weight, st.reps);
        if (!top || e1 > top.e1rm) top = { e1rm: e1, weight: st.weight, reps: st.reps };
      }
      if (!top) continue;
      const prev = best.get(ex.id);
      if (prev && top.e1rm > prev.e1rm) {
        const pr = { date: s.date, exerciseId: ex.id, name: ex.name, weight: top.weight, reps: top.reps, e1rm: top.e1rm, prevE1rm: prev.e1rm, sessionId: s.id };
        prs.push(pr);
        prBySession.set(s.id, (prBySession.get(s.id) || 0) + 1);
      }
      if (!prev || top.e1rm > prev.e1rm) best.set(ex.id, { ...top, date: s.date, name: ex.name });
    }
  }

  /* 3. 逐日走：活動日、連續、Freeze、回歸、XP 事件 */
  const allDates = [...days.keys()].sort();
  const firstN = allDates.length ? dayNumber(allDates[0]) : todayN;
  const events = []; // {date, kind, habit, xp, label}
  const push = (date, kind, habit, xp, label) => { if (xp > 0) events.push({ date, kind, habit, xp, label }); };
  const freeze = rules.streak?.freeze || { earnEvery: 7, max: 2 };
  let streak = 0, bestStreak = 0, tokens = 0, broken = false, hadActive = false, comebacks = 0;
  const frozen = new Set(), perfectDays = [], streakReached = new Map();
  const weeks = new Map(); // weekStart → {gym:Set(dates), stretch:Set, explore:count, goalsHit:{...}, perfect:null}
  const weekOf = (d) => { const w = weekStartOf(d, rules); if (!weeks.has(w)) weeks.set(w, { start: w, gymDays: new Set(), gymCount: 0, stretchDays: new Set(), exploreCount: 0, goalHit: {}, perfect: null, days: {} }); return weeks.get(w); };
  const activeDates = new Set();
  const lastDay = Math.max(todayN, firstN);
  for (let n = firstN; n <= lastDay; n++) {
    const date = dayNumberToStr(n);
    const d = days.get(date);
    const active = !!(d && (d.gym.length || d.stretch || d.explore.length));
    if (active) {
      activeDates.add(date);
      if (broken && hadActive) { comebacks += 1; push(date, 'comeback', 'all', num(B.comeback), '回歸'); }
      broken = false; hadActive = true;
      streak += 1;
      if (streak > bestStreak) bestStreak = streak;
      if (!streakReached.has(streak)) streakReached.set(streak, date);
      if (freeze.earnEvery > 0 && streak % freeze.earnEvery === 0) tokens = Math.min(num(freeze.max, 2), tokens + 1);
      /* XP */
      const w = weekOf(date);
      let gymDone = false;
      for (const s of d.gym) {
        const xp = s.result === 'complete' ? num(gymXp.complete) : num(gymXp.partial);
        push(date, 'gym', 'gym', xp, s.result === 'complete' ? `健身房 ${s.label}` : `健身房 ${s.label}（部分）`);
        if (s.result === 'complete') gymDone = true;
        const k = prBySession.get(s.id) || 0;
        if (k) push(date, 'pr', 'gym', k * num(B.pr), `PR ×${k}`);
      }
      if (gymDone) { w.gymDays.add(date); w.gymCount += 1; }
      if (d.stretch) { push(date, 'stretch', 'stretch', d.stretch === 'full' ? num(stXp.full) : num(stXp.short), d.stretch === 'full' ? '晨間伸展 15 分' : '晨間伸展 5 分'); w.stretchDays.add(date); }
      for (const e of d.explore) { push(date, 'explore', 'explore', num(exXp.complete), `探索：${e.title || ''}`.trim()); w.exploreCount += 1; }
      const req = rules.perfectDay?.requires || ['gym', 'stretch'];
      const pdOk = req.every((h) => (h === 'gym' ? gymDone : h === 'stretch' ? !!d.stretch : h === 'explore' ? d.explore.length > 0 : false));
      if (pdOk) { perfectDays.push(date); push(date, 'perfectDay', 'all', num(B.perfectDay), 'Perfect Day'); }
      /* 週目標：達標當天計入 */
      const T = rules.perfectWeek || { gym: 4, stretch: 6, explore: 1 };
      const goals = [['gym', w.gymCount >= num(H.gym.weeklyTarget, 4)], ['stretch', w.stretchDays.size >= num(H.stretch.weeklyTarget, 7)], ['explore', w.exploreCount >= num(H.explore.weeklyTarget, 1)]];
      for (const [h, hit] of goals) if (hit && !w.goalHit[h]) { w.goalHit[h] = date; push(date, 'weeklyGoal', h, num(B.weeklyGoal?.[h]), `每週目標：${H[h].label}`); }
      if (!w.perfect && w.gymCount >= num(T.gym, 4) && w.stretchDays.size >= num(T.stretch, 6) && w.exploreCount >= num(T.explore, 1)) { w.perfect = date; push(date, 'perfectWeek', 'all', num(B.perfectWeek), 'Perfect Week'); }
      w.days[date] = { gym: gymDone, gymPartial: d.gym.length > 0 && !gymDone, stretch: d.stretch, explore: d.explore.length };
    } else if (paused.has(date)) {
      /* 暫停：不斷連續、不耗 Freeze */
    } else if (n === todayN) {
      /* 今天還沒做：不算漏 */
    } else if (hadActive) {
      if (tokens > 0) { tokens -= 1; frozen.add(date); }
      else if (streak > 0) { streak = 0; broken = true; }
    }
  }

  /* 4. XP 總計 */
  const xpBy = { gym: 0, stretch: 0, explore: 0, bonus: 0 };
  let total = 0, todayXp = 0;
  for (const e of events) {
    total += e.xp;
    if (e.habit === 'gym' || e.habit === 'stretch' || e.habit === 'explore') xpBy[e.habit] += e.kind === 'weeklyGoal' ? 0 : e.xp;
    if (e.kind === 'weeklyGoal' || e.habit === 'all') xpBy.bonus += e.xp;
    if (e.date === today) todayXp += e.xp;
  }
  const level = levelFromXp(total, rules);

  /* 5. 今天與本週 */
  const td = days.get(today) || { gym: [], stretch: null, explore: [] };
  const thisWeekStart = weekStartOf(today, rules);
  const tw = weeks.get(thisWeekStart) || { start: thisWeekStart, gymDays: new Set(), gymCount: 0, stretchDays: new Set(), exploreCount: 0, goalHit: {}, perfect: null, days: {} };
  const completedGym = sessions.filter((s) => s.result === 'complete').length;
  const seq = Array.isArray(v4.gym?.sequence) && v4.gym.sequence.length ? v4.gym.sequence : ['Upper A', 'Lower A', 'Upper B', 'Lower B'];
  const nextLabel = seq[completedGym % seq.length];
  const gymToday = td.gym.find((s) => s.result === 'complete') || td.gym[0] || null;
  const dots = weekDays(thisWeekStart).map((date) => {
    const dd = days.get(date);
    const gymDone = !!(dd && dd.gym.some((s) => s.result === 'complete'));
    return { date, future: dayNumber(date) > todayN, today: date === today, gym: gymDone, stretch: dd ? dd.stretch : null, explore: dd ? dd.explore.length : 0, active: activeDates.has(date), frozen: frozen.has(date), paused: paused.has(date) };
  });
  const week = {
    start: thisWeekStart, days: dots,
    gym: { count: tw.gymCount, target: num(H.gym.weeklyTarget, 4) },
    stretch: { count: tw.stretchDays.size, target: num(H.stretch.weeklyTarget, 7) },
    explore: { count: tw.exploreCount, target: num(H.explore.weeklyTarget, 1) },
    perfect: !!tw.perfect, goalHit: tw.goalHit
  };
  const todayS = {
    date: today,
    gym: { done: !!gymToday && gymToday.result === 'complete', partial: !!gymToday && gymToday.result === 'partial', session: gymToday, nextLabel },
    stretch: { done: !!td.stretch, variant: td.stretch || null },
    explore: { done: td.explore.length > 0, count: td.explore.length },
    perfect: perfectDays.includes(today),
    xp: todayXp
  };
  const yesterday = dayNumberToStr(todayN - 1);
  const comebackDue = hadActive && !activeDates.has(today) && !activeDates.has(yesterday) && !frozen.has(yesterday) && !paused.has(yesterday) && streak === 0;

  /* 6. 成就 */
  const counts = { gym: completedGym, stretch: [...days.values()].filter((d) => d.stretch).length, explore: (v4.explore?.log || []).length };
  const volumeTotal = sessions.reduce((a, s) => a + s.volume, 0);
  const earlyHour = num(rules.stretch?.earlyHour, 9);
  const earlyStretch = [...days.values()].filter((d) => d.stretch && typeof d.stretchAt === 'string' && Number(d.stretchAt.slice(11, 13)) < earlyHour && Number(d.stretchAt.slice(11, 13)) >= num(rules.day?.boundaryHour, 4)).length;
  const categories = new Set((v4.explore?.log || []).map((e) => e.category).filter(Boolean)).size;
  const perfectWeeks = [...weeks.values()].filter((w) => w.perfect).map((w) => w.start).sort();
  const nthDate = (habit, n) => {
    if (habit === 'gym') return sessions.filter((s) => s.result === 'complete')[n - 1]?.date || today;
    if (habit === 'stretch') return allDates.filter((d) => days.get(d).stretch)[n - 1] || today;
    return (v4.explore?.log || []).map((e) => e.date).sort()[n - 1] || today;
  };
  const unlocked = {}, locked = [];
  for (const a of achievements) {
    let ok, date = today, progress = 0;
    switch (a.type) {
      case 'count': progress = counts[a.habit] || 0; ok = progress >= a.n; if (ok) date = nthDate(a.habit, a.n); break;
      case 'streak': progress = bestStreak; ok = bestStreak >= a.n; if (ok) date = streakReached.get(a.n) || today; break;
      case 'perfectDay': progress = perfectDays.length; ok = progress >= a.n; if (ok) date = perfectDays[a.n - 1]; break;
      case 'perfectWeek': progress = perfectWeeks.length; ok = progress >= a.n; if (ok) date = weeks.get(perfectWeeks[a.n - 1])?.perfect || today; break;
      case 'pr': progress = prs.length; ok = progress >= a.n; if (ok) date = prs[a.n - 1].date; break;
      case 'level': progress = level.lv; ok = level.lv >= a.n; break;
      case 'comeback': progress = comebacks; ok = comebacks >= a.n; if (ok) date = events.filter((e) => e.kind === 'comeback')[a.n - 1]?.date || today; break;
      case 'earlyStretch': progress = earlyStretch; ok = progress >= a.n; break;
      case 'volume': progress = volumeTotal; ok = progress >= a.n; break;
      case 'categories': progress = categories; ok = progress >= a.n; break;
      default: ok = false;
    }
    if (ok) unlocked[a.id] = date; else locked.push({ id: a.id, progress: Math.min(progress, a.n), n: a.n });
  }

  return {
    today: todayS, week, weeks: [...weeks.values()].sort((a, b) => (a.start < b.start ? -1 : 1)).map((w) => ({ start: w.start, gym: w.gymCount, stretch: w.stretchDays.size, explore: w.exploreCount, perfect: !!w.perfect, days: w.days })),
    xp: { total, by: xpBy, today: todayXp, events },
    level,
    streak: { current: streak, best: bestStreak, tokens, frozen: [...frozen].sort(), comebackDue, activeDates: [...activeDates].sort() },
    perfectDays, perfectWeeks,
    prs: prs.slice().reverse(), bests: Object.fromEntries(best),
    counts: { ...counts, volume: volumeTotal, earlyStretch, categories },
    achievements: { unlocked, locked },
    sessions, nextLabel
  };
}

/* 教練一句話：依狀態桶，同一天固定 */
export function pickCoachLine(coach, sum, now = new Date()) {
  const buckets = coach?.buckets || {};
  const t = sum.today;
  const dow = now.getDay();
  let key = 'fresh';
  if (sum.streak.comebackDue) key = 'comeback';
  else if (t.gym.done && t.stretch.done) key = 'allDone';
  else if (dow === 0 && !t.stretch.done) key = 'weekEnd';
  else if (t.gym.done || t.stretch.done) key = 'halfDone';
  else if (now.getHours() < 11 && !t.stretch.done) key = 'morning';
  else if (sum.counts.gym > 0 || sum.counts.stretch > 0) key = 'gymDay';
  const list = Array.isArray(buckets[key]) && buckets[key].length ? buckets[key] : (buckets.fresh || ['做了就亮燈。']);
  const seed = [...t.date].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  return list[seed % list.length];
}
