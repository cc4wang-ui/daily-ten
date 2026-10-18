/* Daily Ten — 同變式工作組的有限次數進階。
   純計算：不讀時鐘、不改 state/rules、不改 XP 或整體課表強度。
   canonicalMovement(name) → 去除組號的精確變式；非支援的編號工作組回 null。
   progressionFor({state, asOf, name, baseReps, requiredSets, rules})
     → {reps, baseReps, delta, reason, evidenceDays}；不支援或基準次數無效回 null。
   rules 是完整 game.json；asOf 是遊戲日 YYYY-MM-DD。evidenceDays 是支持目前
   加量與下一步連續成功的日期，不含中斷後已失效的未完成連續紀錄。
   reason: baseline / progressing / increased / held / reset / capped / invalid。

   只重播近期紀錄，從呼叫端提供的基準開始；原始證據離開視窗後須重新建立。
   正向證據只認 full/cycle 完成日；已知負向回報即使未完成課表也會重設。
   今天與未來的紀錄不參與，避免當次課表中途改變。不同基準不借用證據。
   沒有阻力或活動範圍資料，因此只調同一變式的次數，不推斷力量或難度升級。 */
// Core training must still load when optional game modules fail to load.
// These date-only helpers have no module dependency and never read the current clock.
function isValidDateStr(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function dayNumber(value) {
  return new Date(value + 'T00:00:00Z').getTime() / 86400000;
}

const MOVEMENTS = new Set([
  '伏地挺身', '伏地挺身 · 跪姿', '派克伏地挺身', '彈力帶肩上推',
  '彈力帶划船', '分腿蹲 · 左', '分腿蹲 · 右', '臀橋', '彈力帶羅馬尼亞硬舉'
]);

function workset(name) {
  if (typeof name !== 'string') return null;
  const match = /^(.*?) 第\s*([1-9]\d*)\s*組(.*)$/.exec(name);
  if (!match) return null;
  const variant = match[1] + match[3], ordinal = Number(match[2]);
  return MOVEMENTS.has(variant) && Number.isSafeInteger(ordinal) ? { variant, ordinal } : null;
}

export function canonicalMovement(name) {
  return workset(name)?.variant ?? null;
}

const positiveInteger = value => Number.isSafeInteger(value) && value > 0;
const nonnegativeInteger = value => Number.isSafeInteger(value) && value >= 0;

function validConfig(config, variant) {
  return config && positiveInteger(config.historyDays) && positiveInteger(config.requiredDays)
    && nonnegativeInteger(config.maxBonus) && positiveInteger(config.step)
    && positiveInteger(config.ceilings?.[variant]);
}

function validFeedback(record) {
  // Match the persisted feedback schema; malformed direct callers cannot supply evidence.
  return typeof record.id === 'string' && record.id.trim().length > 0 && record.id.length <= 60
    && positiveInteger(record.target) && record.target <= 999
    && nonnegativeInteger(record.actual) && record.actual <= 999
    && ['easy', 'okay', 'hard'].includes(record.effort)
    && typeof record.pain === 'boolean' && typeof record.form === 'boolean';
}

// An explicit negative remains meaningful even when other fields are incomplete.
function negativeFeedback(record) {
  return record.pain === true || record.form === false || record.effort === 'hard'
    || (positiveInteger(record.target) && nonnegativeInteger(record.actual) && record.actual < record.target);
}

export function progressionFor({ state, asOf, name, baseReps, requiredSets, rules } = {}) {
  const variant = canonicalMovement(name);
  if (!variant || !positiveInteger(baseReps)) return null;
  const baseline = { reps: baseReps, baseReps, delta: 0, reason: 'baseline', evidenceDays: [] };
  const config = rules?.trainingProgression;
  if (!isValidDateStr(asOf) || !positiveInteger(requiredSets) || !validConfig(config, variant)) {
    return { ...baseline, reason: 'invalid' };
  }
  const today = dayNumber(asOf);
  const recent = date => isValidDateStr(date) && dayNumber(date) < today
    && today - dayNumber(date) <= config.historyDays;
  const sessions = new Set((Array.isArray(state?.sessions) ? state.sessions : [])
    .filter(session => session && recent(session.date) && ['full', 'cycle'].includes(session.type))
    .map(session => session.date));
  const history = (Array.isArray(state?.game?.trainingFeedback) ? state.game.trainingFeedback : [])
    .filter(record => record && recent(record.date));
  const idCounts = new Map();
  for (const record of history) {
    if (typeof record.id === 'string') idCounts.set(record.id, (idCounts.get(record.id) || 0) + 1);
  }
  const days = new Map();
  for (const record of history) {
    const identity = workset(record.name);
    if (identity?.variant !== variant) continue;
    if (!days.has(record.date)) days.set(record.date, []);
    days.get(record.date).push({ record, ordinal: identity.ordinal });
  }

  // Never lower the provided baseline, including a baseline already above the ceiling.
  const ceiling = Math.max(baseReps, Math.min(config.ceilings[variant], baseReps + config.maxBonus));
  let reps = baseReps, reason = 'baseline', streak = [], earned = [];
  for (const date of [...days.keys()].sort()) {
    const entries = days.get(date);
    if (entries.some(({ record }) => negativeFeedback(record))) {
      reps = baseReps;
      streak = [];
      earned = [];
      reason = 'reset';
      continue;
    }
    if (!sessions.has(date)) continue;
    const ordinals = new Set(entries.map(entry => entry.ordinal));
    // A repeated block may repeat ordinals, but every occurrence must qualify.
    // Positive ordinals bounded by requiredSets with this cardinality cover 1..requiredSets.
    const success = ordinals.size === requiredSets
      && entries.every(({ record, ordinal }) => ordinal <= requiredSets
        && validFeedback(record) && idCounts.get(record.id) === 1
        && record.target === reps && record.actual >= record.target && record.effort === 'easy'
        && record.pain === false && record.form === true);
    if (!success) {
      streak = [];
      reason = 'held';
      continue;
    }
    if (reps >= ceiling) {
      reason = 'capped';
      continue;
    }
    streak.push(date);
    reason = 'progressing';
    if (streak.length >= config.requiredDays) {
      reps = Math.min(ceiling, reps + config.step);
      earned.push(...streak);
      streak = [];
      reason = reps >= ceiling ? 'capped' : 'increased';
    }
  }
  return { reps, baseReps, delta: reps - baseReps, reason, evidenceDays: [...earned, ...streak] };
}
