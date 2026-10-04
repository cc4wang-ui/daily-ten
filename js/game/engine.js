/* Daily Ten — 遊戲引擎（擁有者：game-designer）
   純函式、決定性：不讀時鐘（now 由呼叫端傳入）、不碰 DOM／localStorage／網路、不改動傳入的 state。
   XP 一律由紀錄推導（sessions＋habits.sleep.log），每次重算；本版不寫入任何 XP／連續天數欄位。
   state 欄位缺漏或型別錯 → 回合理預設，不丟例外；rules 無效或 now 無法辨識 → todaySummary 回 null（UI 隱藏遊戲卡片）。

   對外：
     todaySummary(state, now, rules) → {
       date, weekday,                                   // 遊戲日 'YYYY-MM-DD'；0 = 日 … 6 = 六
       phase:{ current, day, week, label, name },       // day／week：該階段第幾天／週（不知道起點時 null）
       level:{ lv, xpInto, xpNeed, totalXp, label },    // 中央等級＝總 XP 等級，label 'Lv N'
       streak:{ days, kind, best, lastDate, todayDone, label },
       pillars:{
         move:{ xp, max, tier:'none'|'minimal'|'main'|'plus', done, type, label },
         sleep:{ xp, max, checkedIn, entry, score },
         explore:{ locked, open, xp, max, unlock:{ have, need, count, windowDays, ready, title, label, short } }
       },
       nextAction:{ kind:'checkin'|'workout'|'boss'|'done', label },
       checkIn:{ open, code, reason, date, from, until }, // 同 js/habits/sleep.js 的 checkInWindow
       xp:{ move, sleep, explore, total }                 // 各支柱累計 XP（推導值）
     }
     levelFromXp(totalXp, rules) → { lv, xpInto, xpNeed, totalXp, label } | null
     aftGaps(state, rules)       → { title, subtitle, items:[{ key, name, unit, target, best, gap, met,
                                     bestText, targetText, gapText }] } | null（AFT 三項自選目標差距，取歷來最佳） */
import { asRules, fill } from './rules.js';
import { toDate, gameDate, weekdayOf, dateOfStamp, dayNumber, dayNumberToStr } from './day.js';
import { moveDays } from '../habits/move.js';
import { sleepDays, checkInWindow } from '../habits/sleep.js';

const PHASE_IDS = ['P1', 'P2', 'P3'];
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
/* 回傳 state 內物件的複本，UI 改它不會動到 state（JSON 複製失敗時退回淺複製，不丟例外） */
function clone(v) {
  try {
    return JSON.parse(JSON.stringify(v));
  } catch (e) {
    return { ...v };
  }
}

function report(where, e) {
  try { console.error(`Daily Ten：${where} 計算失敗`, e); } catch (_) { /* 沒有 console 也不影響 */ }
}

/* ---------- 等級 ---------- */
export function levelFromXp(totalXp, rules) {
  const R = asRules(rules);
  if (!R) return null;
  const total = typeof totalXp === 'number' && Number.isFinite(totalXp) && totalXp > 0 ? Math.floor(totalXp) : 0;
  const { base, step } = R.level;
  let lv = 1;
  let rem = total;
  for (;;) {
    const need = base + step * (lv - 1);
    if (rem < need) return { lv, xpInto: rem, xpNeed: need, totalXp: total, label: fill(R.copy.level, { lv }) };
    rem -= need;
    lv += 1;
  }
}

/* ---------- 連續天數 ----------
   days：今天有做 → 到今天為止；今天還沒做但昨天有 → 到昨天為止（今天還沒結束，不算中斷）；否則 0。
   best：今天（含）以前最長的一段。今天以後的日期（裝置時鐘或時區造成）不算進連續天數。 */
function runInfo(days, todayNum) {
  const past = [...days].filter((n) => n <= todayNum).sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  for (let i = 0; i < past.length; i++) {
    run = i > 0 && past[i] === past[i - 1] + 1 ? run + 1 : 1;
    if (run > best) best = run;
  }
  let cur = 0;
  const anchor = days.has(todayNum) ? todayNum : days.has(todayNum - 1) ? todayNum - 1 : null;
  if (anchor !== null) for (let k = anchor; days.has(k); k--) cur++;
  return {
    days: cur, best,
    lastDate: past.length ? dayNumberToStr(past[past.length - 1]) : null,
    todayDone: days.has(todayNum)
  };
}

/* ---------- 階段與解鎖 ---------- */
const phaseAllowed = (R, id) => R.explore.open || !R.phases[id].pillars.includes('explore');

function unlockP2(R, sleepIdx, todayNum) {
  const U = R.unlock.P2;
  const nums = [];
  for (const [date, v] of sleepIdx) {
    const n = dayNumber(date);
    if (v.score.wake.inWindow && n <= todayNum) nums.push(n);
  }
  nums.sort((a, b) => a - b);
  const count = nums.filter((n) => n > todayNum - U.windowDays).length;
  /* 條件一旦達成就保留：任何一段「windowDays 天內 ≥ minDays 天」都算 */
  let ready = false;
  for (let i = 0, j = 0; i < nums.length && !ready; i++) {
    while (nums[i] - nums[j] >= U.windowDays) j++;
    if (i - j + 1 >= U.minDays) ready = true;
  }
  const C = R.copy.unlock;
  const have = ready ? U.minDays : Math.min(count, U.minDays);
  const vars = { have, need: U.minDays, span: U.windowDays };
  return {
    have, need: U.minDays, count, windowDays: U.windowDays, ready,
    title: ready ? C.readyTitle : fill(C.title, vars),
    label: ready ? C.ready : fill(C.progress, vars),
    short: ready ? C.readyShort : fill(C.short, vars)
  };
}

function phaseInfo(state, R, todayNum, sleepIdx) {
  const ph = isObj(state) && isObj(state.phase) ? state.phase : {};
  const want = PHASE_IDS.includes(ph.current) ? ph.current : 'P1';
  let current = want;
  while (current !== 'P1' && !phaseAllowed(R, current)) current = PHASE_IDS[PHASE_IDS.indexOf(current) - 1];
  /* 起點：state.phase.startedAt（同一階段時）；P1 沒有起點時用第一筆早安打卡 */
  let start = current === want ? dateOfStamp(ph.startedAt, R) : null;
  if (start && dayNumber(start) > todayNum) start = null;
  if (!start && current === 'P1') {
    let first = null;
    for (const date of sleepIdx.keys()) {
      const n = dayNumber(date);
      if (n <= todayNum && (first === null || n < first)) first = n;
    }
    if (first !== null) start = dayNumberToStr(first);
  }
  const P = R.phases[current];
  const elapsed = start ? todayNum - dayNumber(start) : null;
  const day = elapsed === null ? null : elapsed + 1;
  const week = elapsed === null ? null : Math.floor(elapsed / 7) + 1;
  const vars = { id: current, name: P.name, n: P.unit === 'week' ? week : day };
  const label = day === null ? fill(R.copy.phaseNoDay, vars) : fill(P.unit === 'week' ? R.copy.phaseWithWeek : R.copy.phaseWithDay, vars);
  return { current, day, week, label, name: P.name };
}

/* ---------- 今日摘要 ---------- */
function summarize(state, d, R) {
  const date = gameDate(d, R);
  const todayNum = dayNumber(date);
  const weekday = weekdayOf(date);
  const moveIdx = moveDays(state, R);
  const sleepIdx = sleepDays(state, R);

  let moveXp = 0;
  for (const v of moveIdx.values()) moveXp += v.xp;
  let sleepXp = 0;
  for (const v of sleepIdx.values()) sleepXp += v.score.total;
  const exploreXp = 0; // 探索本版未開放（探索紀錄的分鐘數也還沒有欄位）
  const totalXp = moveXp + sleepXp + exploreXp;

  const phase = phaseInfo(state, R, todayNum, sleepIdx);
  const pillarsOn = R.phases[phase.current].pillars;
  const unlock = unlockP2(R, sleepIdx, todayNum);

  const m = moveIdx.get(date) || null;
  const s = sleepIdx.get(date) || null;
  const move = {
    xp: m ? m.xp : 0, max: R.pillars.move.max, tier: m ? m.tier : 'none', done: !!m,
    type: m ? m.type : null, label: m ? m.label : null
  };
  const sleep = {
    xp: s ? s.score.total : 0, max: R.pillars.sleep.max, checkedIn: !!s,
    entry: s ? clone(s.entry) : null, score: s ? s.score : null
  };
  const exploreOn = R.explore.open && pillarsOn.includes('explore');
  const explore = { locked: !exploreOn, open: R.explore.open, xp: 0, max: R.pillars.explore.max, unlock };

  /* 連續天數：train＝有練就算；life＝當日完成的已解鎖支柱 ≥ min(lifeMinPillars, 已解鎖支柱數) */
  const kind = R.streak.home;
  const days = new Set();
  if (kind === 'train') {
    for (const k of moveIdx.keys()) days.add(dayNumber(k));
  } else {
    const need = Math.min(R.streak.lifeMinPillars, pillarsOn.length);
    const all = new Set([...moveIdx.keys(), ...sleepIdx.keys()]);
    for (const k of all) {
      const n = (pillarsOn.includes('move') && moveIdx.has(k) ? 1 : 0) + (pillarsOn.includes('sleep') && sleepIdx.has(k) ? 1 : 0);
      if (n >= need) days.add(dayNumber(k));
    }
  }
  const run = runInfo(days, todayNum);
  const streak = { ...run, kind, label: fill(R.copy.streak, { n: run.days }) };

  /* 下一步：早上先打卡（時段內、還沒打）→ 還沒練：週日 Boss Day、其他日今日課表 → 都完成 */
  const checkIn = checkInWindow(state, d, R);
  let kindNext;
  if (pillarsOn.includes('sleep') && !sleep.checkedIn && checkIn.open) kindNext = 'checkin';
  else if (!move.done) kindNext = weekday === R.move.bossWeekday ? 'boss' : 'workout';
  else kindNext = 'done';

  return {
    date, weekday, phase,
    level: levelFromXp(totalXp, R),
    streak,
    pillars: { move, sleep, explore },
    nextAction: { kind: kindNext, label: R.copy.next[kindNext] },
    checkIn,
    xp: { move: moveXp, sleep: sleepXp, explore: exploreXp, total: totalXp }
  };
}

export function todaySummary(state, now, rules) {
  const R = asRules(rules);
  const d = toDate(now);
  if (!R || !d || !gameDate(d, R)) return null;
  try {
    return summarize(state, d, R);
  } catch (e) {
    report('todaySummary', e);
    return null;
  }
}

/* ---------- AFT 自選目標差距 ---------- */
const clockText = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

export function aftGaps(state, rules) {
  const R = asRules(rules);
  if (!R) return null;
  try {
    const prs = isObj(state) && isObj(state.prs) ? state.prs : {};
    const C = R.copy.aft;
    const valueText = (it, v) => (it.unit === 'reps' ? fill(C.reps, { n: v }) : clockText(v));
    const items = R.aft.items.map((it) => {
      const list = Array.isArray(prs[it.key]) ? prs[it.key] : [];
      let best = null;
      for (const p of list) {
        const v = isObj(p) ? p[it.field] : undefined;
        if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || (it.better === 'lower' && v === 0)) continue;
        if (best === null || (it.better === 'lower' ? v < best : v > best)) best = v;
      }
      const raw = best === null ? null : it.better === 'lower' ? best - it.target : it.target - best;
      const gap = raw === null ? null : Math.max(0, Math.round(raw));
      const met = gap === 0;
      let gapText;
      if (best === null) gapText = C.none;
      else if (met) gapText = C.met;
      else if (it.unit === 'reps') gapText = fill(C.gapReps, { n: gap });
      else gapText = gap < 60 ? fill(C.gapSec, { n: gap }) : fill(C.gapClock, { clock: clockText(gap) });
      return {
        key: it.key, name: it.name, unit: it.unit, target: it.target, best, gap, met,
        bestText: best === null ? '—' : valueText(it, Math.round(best)),
        targetText: valueText(it, it.target),
        gapText
      };
    });
    return { title: C.title, subtitle: C.subtitle, items };
  } catch (e) {
    report('aftGaps', e);
    return null;
  }
}
