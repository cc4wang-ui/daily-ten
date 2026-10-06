/* Daily Ten — D6 自動降量（擁有者：game-designer）
   純函式：不讀時鐘、不碰 DOM／localStorage／網路、不改動 state；欄位缺漏或型別錯都不丟例外。
   依「今天的早安打卡」判斷（data/game.json 的 deload，理由見 _notes.decisions d11）：
     - short：睡眠時數 < shortSleepMin 分（360 = 6 小時；359 降、360 不降；時數無法計算時不判斷）
     - late ：熄燈晚於時段（就寢目標＋windowMin）≥ lateLightsOutMin 分（89 不降、90 降）
     兩個都符合時 reason 取 short（reasons 兩個都列）。沒打卡就不降。
   降量：今天的課表預設降 step 級，最低 minLevel；本來就在最低級時不降（active false，triggered 仍為 true）。
   恢復：Cross 按「恢復 L{n}」→ data-guardian 寫入 game.deload.restoredOn（js/state/game.js 的 setDeloadRestored(date)），
         只對那一天有效；這裡只讀，而且只經過 data-guardian 的純函式 isDeloadRestored（js/state/schema.js，不丟例外、
         不改動 state；不 import store.js，engine 仍可在 Node 單元測試）。

   對外：
     courseLevel(state, rules)  → 課表強度（state.level，整數 ≥ minLevel）| null
     deloadFor(state, date, sleepDay, moveDone, rules) → {
       active,          // 今天的課表預設降一級（觸發、還能降、沒按恢復、今天還沒練）
       reason,          // 'short' | 'late' | null（觸發時才有）
       reasons,         // ['short', 'late'] 中符合的
       triggered,       // 條件符合（不管還能不能降、有沒有按恢復）
       fromLevel, toLevel, planLevel,   // 原本強度、降一級後、今天實際預設（active ? toLevel : fromLevel）
       restored,        // 今天按過「恢復」
       sleepMin, lateMin,               // 昨晚睡眠分鐘數／熄燈晚於時段的分鐘數（無法判斷時 null）
       label,           // 卡片文字：active 時是降量說明、今天按過恢復時是「已恢復 L{n}」；其他（含今天已練）null
       restoreLabel,    // 「恢復 L{n}」按鈕文字；只在 active 時有
       date
     } */
import { asRules, fill } from '../game/rules.js';
import { isValidDateStr } from '../game/day.js';
import { isDeloadRestored } from '../state/schema.js';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function courseLevel(state, rules) {
  const R = asRules(rules);
  if (!R || !isObj(state)) return null;
  const lv = state.level;
  return Number.isInteger(lv) && lv >= R.deload.minLevel ? lv : null;
}

/* 分鐘數 → 「5 小時 24 分」「45 分鐘」 */
function durText(min, C) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? fill(C.hm, { h, m }) : fill(C.m, { m });
}

export function deloadFor(state, date, sleepDay, moveDone, rules) {
  const R = asRules(rules);
  const none = {
    active: false, reason: null, reasons: [], triggered: false, fromLevel: null, toLevel: null, planLevel: null,
    restored: false, sleepMin: null, lateMin: null, label: null, restoreLabel: null, date: isValidDateStr(date) ? date : null
  };
  if (!R) return none;
  const D = R.deload;
  const C = R.copy.deload;
  const fromLevel = courseLevel(state, R);
  const toLevel = fromLevel === null ? null : Math.max(D.minLevel, fromLevel - D.step);
  const restored = isDeloadRestored(state, date);
  const base = { ...none, fromLevel, toLevel, planLevel: fromLevel, restored };

  const score = isObj(sleepDay) && isObj(sleepDay.score) ? sleepDay.score : null;
  if (!score) return base;
  const dur = isObj(score.duration) ? score.duration : {};
  const lo = isObj(score.lightsOut) ? score.lightsOut : {};
  const sleepMin = dur.status !== 'none' && Number.isFinite(dur.minutes) ? dur.minutes : null;
  const lateMin = lo.status !== 'none' && lo.side === 'late' && Number.isFinite(lo.offMin) ? lo.offMin : null;
  const reasons = [];
  if (sleepMin !== null && sleepMin < D.shortSleepMin) reasons.push('short');
  if (lateMin !== null && lateMin >= D.lateLightsOutMin) reasons.push('late');
  const triggered = reasons.length > 0;
  const reason = triggered ? reasons[0] : null;
  /* 卡片：觸發、還能降、今天還沒練；按過恢復時改成「已恢復」的文字（不再有恢復按鈕） */
  const card = triggered && fromLevel !== null && toLevel < fromLevel && !moveDone;
  const active = card && !restored;
  let label = null;
  if (card && restored) label = fill(C.restored, { from: fromLevel });
  else if (active) label = fill(reason === 'short' ? C.short : C.late, { dur: durText(reason === 'short' ? sleepMin : lateMin, C), to: toLevel, from: fromLevel });
  return {
    ...base,
    active, reason, reasons, triggered,
    planLevel: active ? toLevel : fromLevel,
    sleepMin, lateMin, label,
    restoreLabel: active ? fill(C.restore, { from: fromLevel }) : null
  };
}
