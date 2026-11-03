/* Daily Ten — 正向回饋加強包（遊戲化優化，不動既有 XP）
   純函式、決定性：不讀時鐘（todayNum／today 由呼叫端傳入）、不碰 DOM／localStorage／網路、不改動 state。
   設計原則（沿用專案既有規則，見 data/game.json _notes）：
     - 不懲罰：這裡只有「達成」與「還差幾天」，沒有扣分、沒有負面字眼、沒有把漏練算成失敗。
     - 不動既有 XP：里程碑、Perfect Day 連續、本週目標、新 PR 都是「徽章／文案」，不進 xp.bonus、
       不改等級曲線，所以既有總 XP 永遠不會因為這支程式而倒退，也不會讓舊測試的 xp 數字改變。
     - 全部由紀錄推導：訓練 sessions、睡眠 log、PR 紀錄每次重算，和 engine 的 d6 一致；
       匯入、補記、舊版改寫都不會讓徽章和畫面各說各話。
   對外：
     rewardsFor(state, summary, rules) → null | {
       streak: { days, best, todayDone, milestoneToday, nextMilestone:{days, remaining}|null,
                 milestonesAchieved:[...] },
       perfectStreak: { current, best, milestoneToday, nextMilestone:{days, remaining}|null },
       week: { moveDays, perfectDays, goal, reached, remaining, label },
       prs: [{ key, name, unit, target, best, gap, met, todayValue, isNewPr, isFirst, label }],
       celebrations: [{ kind, title, text }],   // 只含「今天」發生的事，首頁／完成畫面直接用
       homeLine: string                         // 首頁一行：下一個里程碑＋本週進度，永遠是往前看的
     }
   Perfect Day 連續的定義：同一天同時有動（訓練紀錄）與眠（早安打卡）。
   這正是目前 P1（探未解鎖）Perfect Day 的定義；探解鎖後若要把探算進去，改這裡的
   isPerfectDay 判斷即可，engine 的 perfectDay 判斷不受影響。 */
import { asRules, fill } from './rules.js';
import { dayNumber, dayNumberToStr } from './day.js';
import { weekStartNum } from './timeline.js';
import { moveDays } from '../habits/move.js';
import { sleepDays } from '../habits/sleep.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isInt = (v) => Number.isInteger(v) && v >= 0;

/* 規則檔沒有 rewards 區塊、或形狀不對時，用這組安全的預設值，不丟例外、不讓遊戲卡片消失。 */
const DEFAULTS = {
  milestones: [3, 7, 14, 21, 30, 60, 90, 180, 365],
  perfectStreakMilestones: [3, 7, 14, 30],
  weekPerfectGoal: 5,
};
function rewardsRules(rules) {
  const R = asRules(rules);
  if (!R) return null;
  const raw = isObj(R.rewards) ? R.rewards : {};
  const intList = (v, fallback) => (Array.isArray(v) && v.length && v.every(isInt) ? [...new Set(v)].sort((a, b) => a - b) : fallback);
  return {
    milestones: intList(raw.milestones, DEFAULTS.milestones),
    perfectStreakMilestones: intList(raw.perfectStreakMilestones, DEFAULTS.perfectStreakMilestones),
    weekPerfectGoal: isInt(raw.weekPerfectGoal) && raw.weekPerfectGoal >= 1 ? raw.weekPerfectGoal : DEFAULTS.weekPerfectGoal,
    copy: isObj(raw.copy) ? raw.copy : {},
  };
}
function copyOf(RW, key, fallback, vars) {
  const t = RW.copy && typeof RW.copy[key] === 'string' && RW.copy[key].trim() ? RW.copy[key] : fallback;
  return fill(t, vars || {});
}
function nextMilestone(list, days) {
  const next = list.find((n) => n > days);
  return next === undefined ? null : { days: next, remaining: next - days };
}
/* 連續天數：從今天（或昨天，今天還沒練時）往回數，連續「有紀錄」的日子。 */
function currentRun(datesSet, todayNum) {
  let end = todayNum;
  if (!datesSet.has(end)) end -= 1;
  let current = 0;
  for (let n = end; datesSet.has(n); n--) current += 1;
  return current;
}
function bestRun(datesSet) {
  const nums = [...datesSet].sort((a, b) => a - b);
  let best = 0, run = 0, prev = null;
  for (const n of nums) {
    run = prev !== null && n === prev + 1 ? run + 1 : 1;
    if (run > best) best = run;
    prev = n;
  }
  return best;
}
const clockText = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

export function rewardsFor(state, summary, rules) {
  try {
    const RW = rewardsRules(rules);
    const R = asRules(rules);
    if (!RW || !R || !isObj(summary) || typeof summary.date !== 'string') return null;
    const todayNum = dayNumber(summary.date);
    if (!Number.isFinite(todayNum)) return null;
    const moveIdx = moveDays(state, R);
    const sleepIdx = sleepDays(state, R);
    const moveDates = new Set([...moveIdx.keys()].map((d) => dayNumber(d)));
    const sleepDates = new Set([...sleepIdx.keys()].map((d) => dayNumber(d)));
    const perfectDates = new Set([...moveDates].filter((n) => sleepDates.has(n) && n <= todayNum));

    /* ---- 訓練連續 ---- */
    const streakDays = isInt(summary.streak && summary.streak.days) ? summary.streak.days : 0;
    const streakBest = isInt(summary.streak && summary.streak.best) ? summary.streak.best : streakDays;
    const streakTodayDone = !!(summary.streak && summary.streak.todayDone);
    const streakMilestoneToday = streakTodayDone && RW.milestones.includes(streakDays) ? streakDays : null;
    const streak = {
      days: streakDays, best: streakBest, todayDone: streakTodayDone,
      milestoneToday: streakMilestoneToday,
      nextMilestone: nextMilestone(RW.milestones, streakDays),
      milestonesAchieved: RW.milestones.filter((n) => n <= streakBest),
    };

    /* ---- Perfect Day 連續 ---- */
    const perfectCurrent = currentRun(perfectDates, todayNum);
    const perfectBest = bestRun(perfectDates);
    const perfectToday = perfectDates.has(todayNum);
    const perfectMilestoneToday = perfectToday && RW.perfectStreakMilestones.includes(perfectCurrent) ? perfectCurrent : null;
    const perfectStreak = {
      current: perfectCurrent, best: perfectBest, today: perfectToday,
      milestoneToday: perfectMilestoneToday,
      nextMilestone: nextMilestone(RW.perfectStreakMilestones, perfectCurrent),
    };

    /* ---- 本週（週一到週日） ---- */
    const monday = weekStartNum(todayNum, R.week.startsOn);
    const inWeek = (n) => n >= monday && n <= todayNum;
    const weekMoveDays = [...moveDates].filter(inWeek).length;
    const weekPerfectDays = [...perfectDates].filter(inWeek).length;
    const weekGoal = RW.weekPerfectGoal;
    const weekReachedToday = perfectToday && weekPerfectDays === weekGoal;
    const week = {
      moveDays: weekMoveDays, perfectDays: weekPerfectDays, goal: weekGoal,
      reached: weekPerfectDays >= weekGoal, reachedToday: weekReachedToday,
      remaining: Math.max(0, weekGoal - weekPerfectDays),
      label: copyOf(RW, 'weekProgress', '本週 Perfect Day {have}/{need} 天', { have: weekPerfectDays, need: weekGoal }),
    };

    /* ---- AFT 自選目標：今天是不是新 PR ---- */
    const prs = isObj(state) && isObj(state.prs) ? state.prs : {};
    const prList = R.aft.items.map((it) => {
      const list = Array.isArray(prs[it.key]) ? prs[it.key] : [];
      const valueOf = (p) => (isObj(p) ? p[it.field] : undefined);
      let prevBest = null, todayBest = null, todayValue = null;
      for (const p of list) {
        const v = valueOf(p);
        if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || (it.better === 'lower' && v === 0)) continue;
        if (p.date === summary.date) {
          if (todayBest === null || (it.better === 'lower' ? v < todayBest : v > todayBest)) todayBest = v;
        } else {
          if (prevBest === null || (it.better === 'lower' ? v < prevBest : v > prevBest)) prevBest = v;
        }
      }
      todayValue = todayBest;
      const best = todayBest === null ? prevBest : (prevBest === null ? todayBest : (it.better === 'lower' ? Math.min(prevBest, todayBest) : Math.max(prevBest, todayBest)));
      const rawGap = best === null ? null : (it.better === 'lower' ? best - it.target : it.target - best);
      const gap = rawGap === null ? null : Math.max(0, Math.round(rawGap));
      const isNewPr = todayBest !== null && prevBest !== null && (it.better === 'lower' ? todayBest < prevBest : todayBest > prevBest);
      const isFirst = todayBest !== null && prevBest === null;
      const valueText = it.unit === 'reps' ? `${Math.round(todayBest)} 下` : clockText(Math.round(todayBest));
      return {
        key: it.key, name: it.name, unit: it.unit, target: it.target, best, gap, met: gap === 0,
        todayValue, isNewPr, isFirst,
        label: isNewPr ? copyOf(RW, 'newPr', '新 PR！{name} {value}', { name: it.name, value: valueText })
          : isFirst ? copyOf(RW, 'firstPr', '{name} 第一次成績：{value}', { name: it.name, value: valueText }) : null,
      };
    });

    /* ---- 今天的慶祝（只含今天發生的事，依重要度排序） ---- */
    const celebrations = [];
    if (streakMilestoneToday !== null) celebrations.push({
      kind: 'streakMilestone', title: copyOf(RW, 'streakMilestoneTitle', '連續 {n} 天', { n: streakMilestoneToday }),
      text: copyOf(RW, 'streakMilestone', '連續 {n} 天了，穩穩地前進。', { n: streakMilestoneToday }),
    });
    if (perfectMilestoneToday !== null) celebrations.push({
      kind: 'perfectStreakMilestone', title: copyOf(RW, 'perfectStreakTitle', 'Perfect Day 連續 {n} 天', { n: perfectMilestoneToday }),
      text: copyOf(RW, 'perfectStreak', '動和眠都到齊，連續 {n} 天 Perfect Day。', { n: perfectMilestoneToday }),
    });
    if (weekReachedToday) celebrations.push({
      kind: 'weekGoal', title: copyOf(RW, 'weekGoalTitle', '本週 Perfect Day 達標', {}),
      text: copyOf(RW, 'weekGoal', '本週 Perfect Day 已經 {n} 天，達標了。', { n: weekGoal }),
    });
    for (const p of prList) {
      if (p.isNewPr) celebrations.push({ kind: 'newPr', title: copyOf(RW, 'newPrTitle', '新 PR', {}), text: p.label });
    }

    /* ---- 首頁一行：永遠往前看，不提漏了幾天 ---- */
    const nextPart = streak.nextMilestone
      ? copyOf(RW, 'nextMilestone', '下一個里程碑 {n} 天，還差 {left} 天', { n: streak.nextMilestone.days, left: streak.nextMilestone.remaining })
      : copyOf(RW, 'nextMilestoneDone', '已經超過最遠的里程碑，繼續保持', {});
    const homeLine = celebrations.length
      ? celebrations.map((c) => c.text).join(' ')
      : `${nextPart} · ${week.label}`;

    return { streak, perfectStreak, week, prs: prList, celebrations, homeLine, today: summary.date };
  } catch (e) {
    return null;
  }
}
