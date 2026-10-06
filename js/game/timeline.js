/* Daily Ten — 每日進度時間線（擁有者：game-designer）：Perfect Day、Freeze、D19 回歸任務、額外 XP（bonus）
   純函式、決定性：不讀時鐘（todayNum 由 engine 從 now 算好傳入）、不碰 DOM／localStorage／網路、不改動傳入的資料。
   一律由紀錄推導、每次重算（d6）：不讀 game.freezeTokens、game.perfectDays 等舊欄位，也不寫回 state。
   只看「今天（含）以前」的日子；今天以後的紀錄（裝置時鐘或時區造成）等那一天到了才算。
   數值全部來自 data/game.json（perfectDay、freeze、returnQuest、streak），理由見 _notes.decisions d9–d12。

   對外：
     dayFacts(moveIdx, sleepIdx, todayNum, pillarsFor)
       → Map(dayNum → { done:{move, sleep, explore}, xp, need:[...], have:[...], count })
         moveIdx／sleepIdx：js/habits 的 moveDays／sleepDays；pillarsFor(dayNum) → 那一天已解鎖的支柱
         xp＝那一天各支柱的基礎 XP 合計（不含 bonus）；count＝那一天完成的已解鎖支柱數
     perfectDays(facts)                   → Set(dayNum)：已解鎖的支柱全完成的日子（d9）
     freezeStreak(dayNums, todayNum, R)   → { days, best, frozenDays, lastNum, tokens, earned, used:[dayNum], recent:[dayNum] }（d10）
     returnQuest(facts, todayNum, R)      → { stage, breakDays, badgeNum, boostNum, untilNum, badges, boosts,
                                             boostXp, boostToday }（d12）
     weekStartNum(todayNum, startsOn)     → 本週第一天的 dayNum（startsOn：0 = 週日 … 6 = 週六） */
import { dayNumber, dayNumberToStr, weekdayOf } from './day.js';

/* ---------- 每日事實 ---------- */
function factOf(map, n) {
  let f = map.get(n);
  if (!f) {
    f = { done: { move: false, sleep: false, explore: false }, xp: 0, need: [], have: [], count: 0 };
    map.set(n, f);
  }
  return f;
}

export function dayFacts(moveIdx, sleepIdx, todayNum, pillarsFor) {
  const out = new Map();
  for (const [date, v] of moveIdx) {
    const n = dayNumber(date);
    if (!(n <= todayNum)) continue;
    const f = factOf(out, n);
    f.done.move = true;
    f.xp += v.xp;
  }
  for (const [date, v] of sleepIdx) {
    const n = dayNumber(date);
    if (!(n <= todayNum)) continue;
    const f = factOf(out, n);
    f.done.sleep = true;
    f.xp += v.score.total;
  }
  for (const [n, f] of out) {
    f.need = pillarsFor(n);
    f.have = f.need.filter((p) => f.done[p]);
    f.count = f.have.length;
  }
  return out;
}

/* ---------- Perfect Day（d9） ---------- */
export function perfectDays(facts) {
  const out = new Set();
  for (const [n, f] of facts) if (f.need.length > 0 && f.count === f.need.length) out.add(n);
  return out;
}

/* ---------- 連續天數＋Freeze（d10） ----------
   dayNums：符合首頁連續天數（streak.home）的日子，任意順序、可重複；只取 ≤ todayNum。
   - 連續天數 days＝目前這一段「實際有做」的天數；Freeze 補上的日子把前後接起來，但不加天數（frozenDays 另計）。
   - 每段實際天數達 earnEvery 的倍數 → 得 1 張（持有已達 max 就不再加）。
   - 漏掉的日子：整段空檔 ≤ 持有張數才自動使用並接上；補不滿就不用（張數保留），這一段結束。
   - 今天還沒結束：昨天以前的空檔照上面的規則先用（顯示為已使用）；今天本身不算漏掉。 */
export function freezeStreak(dayNums, todayNum, R) {
  const F = R.freeze;
  const nums = [...new Set(dayNums)].filter((n) => n <= todayNum).sort((a, b) => a - b);
  let tokens = 0;
  let earned = 0;
  const used = [];
  let run = 0;
  let runFrozen = 0;
  let best = 0;
  let prev = null;
  for (const n of nums) {
    if (prev !== null) {
      const gap = n - prev - 1;
      if (gap > 0) {
        if (gap <= tokens) {
          tokens -= gap;
          for (let k = prev + 1; k < n; k++) used.push(k);
          runFrozen += gap;
        } else {
          run = 0;
          runFrozen = 0;
        }
      }
    }
    run += 1;
    if (run % F.earnEvery === 0 && tokens < F.max) {
      tokens += 1;
      earned += 1;
    }
    if (run > best) best = run;
    prev = n;
  }
  let days = 0;
  let frozenDays = 0;
  if (prev !== null) {
    const gap = todayNum - prev - 1;
    if (gap <= 0) {
      days = run;
      frozenDays = runFrozen;
    } else if (gap <= tokens) {
      tokens -= gap;
      for (let k = prev + 1; k < todayNum; k++) used.push(k);
      days = run;
      frozenDays = runFrozen + gap;
    }
  }
  /* 最近一次使用：緊接在今天之前、連續被補上的日子（昨天、前天…） */
  const usedSet = new Set(used);
  const recent = [];
  for (let k = todayNum - 1; usedSet.has(k); k--) recent.unshift(k);
  return { days, best, frozenDays, lastNum: prev, tokens, earned, used, recent };
}

/* ---------- D19 回歸任務（d12） ----------
   活躍日＝至少完成 1 個已解鎖支柱的日子。
   - 中斷：連續 breakDays 天以上沒有活躍日（之前要有過活躍日，第一次使用不算）。
   - 回歸徽章：中斷後第一個活躍日（不管中斷幾天，回來就有）。
   - 加成：徽章當天起 windowDays 天內，第一個「完成 min(boostMinPillars, 已解鎖支柱數) 個支柱」的日子，
     那天的基礎 XP ×multiplier（多出來的放 bonus）；每次中斷只給一次，下一次中斷重新計算。 */
export function returnQuest(facts, todayNum, R) {
  const Q = R.returnQuest;
  const nums = [...facts.keys()].filter((n) => n <= todayNum && facts.get(n).count >= 1).sort((a, b) => a - b);
  let last = null;
  let quest = null;
  let badges = 0;
  let boosts = 0;
  let boostXp = 0;
  let boostToday = 0;
  for (const n of nums) {
    const f = facts.get(n);
    if (last !== null && n - last - 1 >= Q.breakDays) {
      badges += 1;
      quest = { badgeNum: n, untilNum: n + Q.windowDays - 1, boostNum: null, breakDays: n - last - 1 };
    }
    const need = Math.min(Q.boostMinPillars, f.need.length);
    if (quest && quest.boostNum === null && n <= quest.untilNum && need > 0 && f.count >= need) {
      quest.boostNum = n;
      boosts += 1;
      const extra = Math.max(0, Math.round(f.xp * (Q.multiplier - 1)));
      boostXp += extra;
      if (n === todayNum) boostToday = extra;
    }
    last = n;
  }
  const todayActive = last === todayNum;
  const open = !!quest && quest.boostNum === null && todayNum <= quest.untilNum;
  let stage = 'none';
  if (todayActive) {
    if (quest && quest.boostNum === todayNum) stage = 'boost';
    else if (open) stage = 'badge';
  } else if (last !== null && todayNum - last - 1 >= Q.breakDays) {
    stage = 'return';
  } else if (open) {
    stage = 'badge';
  }
  const inQuest = stage === 'badge' || stage === 'boost';
  return {
    stage,
    breakDays: stage === 'return' ? todayNum - last - 1 : inQuest ? quest.breakDays : 0,
    badgeNum: inQuest ? quest.badgeNum : null,
    boostNum: stage === 'boost' ? quest.boostNum : null,
    untilNum: inQuest ? quest.untilNum : null,
    badges, boosts, boostXp, boostToday
  };
}

/* ---------- 週 ---------- */
export function weekStartNum(todayNum, startsOn) {
  return todayNum - ((weekdayOf(dayNumberToStr(todayNum)) - startsOn + 7) % 7);
}
