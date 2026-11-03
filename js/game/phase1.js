/* Daily Ten — Phase 1 健身房 MVP（純函式、決定性：不讀時鐘、不碰 DOM／localStorage／網路、不改動 state）
   權威：~/workspace/daily-ten-complete.md §0（優先於研究建議）。與 Phase 0／engine 的分工：
     - XP、等級、Perfect Day、d16 規則：仍由 js/game/engine.js、rewards.js、data/game.json 決定，
       本模組一律不改、不重算、不寫入任何 XP 相關欄位。
     - 健身房順序：沿用 js/game/phase0.js 的 nextGym（完整課才推進，漏掉／改居家／最小課／散步都不推進）。
     - 本模組只推導 Phase 1 新增的東西：預填記錄、雙重漸進建議、可暫停計時器狀態、
       PR 清單（mode 分開）、健身房達標率 x/4、Plan 頁變更守門、疼痛暫停進步。
   邊界（必須對使用者明說）：
     PHASE1_BOUNDARY：健身房模板仍是草案，正式出貨前須教練驗證簽核（未簽核，不假裝已簽）；
     A/B 目前內容相同（Upper A＝Upper B、Lower A＝Lower B），順序名稱照走，不發明 A/B 差異；
     PR 仍非 XP；雙重漸進一次只建議一種改變，絕不同時建議加重量、組數、天數。
   state.phase1 形狀（全部選填、缺漏當空；壞資料過濾掉，不丟例外）：
     { gymSets: [{date, label, exercise, sets: [{weight, reps}]}],
       prs: [{date, exercise, mode: 'gym'|'home', kind: 'weight'|'reps', value}],
       plan: { suggestedDays: [0-6], swaps: {label: {from, to}}} }
   對外：
     PHASE1_BOUNDARY, MUSCLE_GROUPS, parsePhase1, templateSets, templateForLabel,
     lastSetsFor, prefillSets, parseRepRange, progressionSuggestion, restSeconds,
     tickRest, formatRest, isNewPr, bestPr, prsByMode, combinedPrList,
     countsAsFullGym, weekGymAdherence, groupOf, canSwap, validatePlanChange,
     applyPlanChange, progressionHeld */
import { GYM_SEQUENCE, GYM_TEMPLATES, weekGymCount } from './phase0.js';

export const PHASE1_BOUNDARY = 'Phase 1：健身房模板仍是草案，正式出貨前須教練驗證簽核；A/B 目前內容相同，不發明差異；PR 仍非 XP；雙重漸進一次只建議一種改變。';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isValidDateStr = (s) => typeof s === 'string' && DATE_RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isFiniteNum = (n) => typeof n === 'number' && Number.isFinite(n);

/* 同肌群對照：互換＝同一組內兩動作位置對調（取代會造成同一動作重複出現，故不採用取代語義）。
   chest：上斜↔平板；back：滑輪下拉↔上背划船；posterior：髖鉸鏈↔腿後彎舉；quads：深蹲或腿推↔腿前伸展。
   側平舉、二頭、三頭、提踵、內收肌器械在同組內無其他動作，故目前無可換對象（不是 bug，是保守分組）。 */
export const MUSCLE_GROUPS = Object.freeze({
  chest: Object.freeze(['上斜臥推', '平板臥推']),
  shoulder: Object.freeze(['側平舉']),
  back: Object.freeze(['滑輪下拉', '上背划船（手肘外展）']),
  biceps: Object.freeze(['二頭彎舉']),
  triceps: Object.freeze(['三頭伸展']),
  quads: Object.freeze(['深蹲或腿推', '腿前伸展']),
  posterior: Object.freeze(['羅馬尼亞硬舉（髖鉸鏈）', '腿後彎舉']),
  calf: Object.freeze(['提踵']),
  adductor: Object.freeze(['內收肌器械']),
});
const ALL_TEMPLATE_EXERCISES = [...GYM_TEMPLATES.upper, ...GYM_TEMPLATES.lower].map((e) => e.name);

export function groupOf(exercise) {
  for (const [g, names] of Object.entries(MUSCLE_GROUPS)) if (names.includes(exercise)) return g;
  return null;
}
export function canSwap(from, to) {
  if (typeof from !== 'string' || typeof to !== 'string' || from === to) return false;
  if (!ALL_TEMPLATE_EXERCISES.includes(from) || !ALL_TEMPLATE_EXERCISES.includes(to)) return false;
  const g = groupOf(from);
  return g !== null && g === groupOf(to);
}

/* 模板組數：數字即該數；'2–3'／'2-3' 字串為 min–max，預設取 min。 */
export function templateSets(tplExercise) {
  const s = tplExercise && tplExercise.sets;
  if (Number.isInteger(s) && s >= 1 && s <= 10) return { min: s, max: s, default: s };
  if (typeof s === 'string') {
    const m = /^(\d{1,2})\s*[–-]\s*(\d{1,2})$/.exec(s.trim());
    if (m) {
      const min = Number(m[1]), max = Number(m[2]);
      if (min >= 1 && max >= min && max <= 10) return { min, max, default: min };
    }
  }
  return { min: 2, max: 2, default: 2 };
}

export function templateForLabel(label) {
  const idx = GYM_SEQUENCE.indexOf(label);
  if (idx < 0) return { label: 'Upper A', type: 'upper', template: GYM_TEMPLATES.upper };
  const type = idx % 2 === 0 ? 'upper' : 'lower';
  return { label, type, template: GYM_TEMPLATES[type] };
}

function cleanSets(sets) {
  if (!Array.isArray(sets)) return null;
  const out = sets
    .filter((s) => isObj(s) && isFiniteNum(s.weight) && s.weight >= 0 && s.weight <= 1000
      && Number.isInteger(s.reps) && s.reps >= 1 && s.reps <= 999)
    .map((s) => ({ weight: s.weight, reps: s.reps }));
  return out.length > 0 && out.length <= 10 ? out : null;
}

export function parsePhase1(state) {
  const raw = isObj(state) && isObj(state.phase1) ? state.phase1 : {};
  const gymSets = Array.isArray(raw.gymSets) ? raw.gymSets.flatMap((e) => {
    if (!isObj(e) || !isValidDateStr(e.date) || typeof e.exercise !== 'string' || !e.exercise) return [];
    const sets = cleanSets(e.sets);
    if (!sets) return [];
    return [{ date: e.date, label: typeof e.label === 'string' ? e.label : '', exercise: e.exercise, sets }];
  }) : [];
  const prs = Array.isArray(raw.prs) ? raw.prs.flatMap((e) => {
    if (!isObj(e) || !isValidDateStr(e.date) || typeof e.exercise !== 'string' || !e.exercise) return [];
    if (e.mode !== 'gym' && e.mode !== 'home') return [];
    if (e.kind !== 'weight' && e.kind !== 'reps') return [];
    if (!isFiniteNum(e.value) || e.value < 0 || e.value > 10000) return [];
    return [{ date: e.date, exercise: e.exercise, mode: e.mode, kind: e.kind, value: e.value }];
  }) : [];
  let plan = { suggestedDays: [], swaps: {} };
  if (isObj(raw.plan)) {
    const days = Array.isArray(raw.plan.suggestedDays)
      ? [...new Set(raw.plan.suggestedDays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b)
      : [];
    const swaps = {};
    if (isObj(raw.plan.swaps)) {
      for (const [label, sw] of Object.entries(raw.plan.swaps)) {
        if (GYM_SEQUENCE.includes(label) && isObj(sw) && typeof sw.from === 'string' && typeof sw.to === 'string') {
          swaps[label] = { from: sw.from, to: sw.to };
        }
      }
    }
    plan = { suggestedDays: days, swaps };
  }
  return { gymSets, prs, plan };
}

/* 預填：取該動作最近一次（日期 ≤ today，若未給 today 則取全部最近一次）的各組重量／次數，
   組數夾在模板 min–max 之間；沒有紀錄時回傳全空組（重量／次數由使用者填，UI 另顯示次數範圍）。 */
export function lastSetsFor(gymSets, exercise, today = null) {
  if (!Array.isArray(gymSets) || typeof exercise !== 'string') return null;
  const rows = gymSets
    .filter((e) => e && e.exercise === exercise && (!today || e.date <= today))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return rows.length ? rows[rows.length - 1].sets : null;
}
export function prefillSets(tplExercise, lastSets) {
  const { min, max, default: def } = templateSets(tplExercise);
  const blank = () => ({ weight: null, reps: null });
  if (!Array.isArray(lastSets) || lastSets.length === 0) return Array.from({ length: def }, blank);
  const n = Math.min(Math.max(lastSets.length, min), max);
  const out = [];
  for (let i = 0; i < n; i++) {
    const s = lastSets[i];
    out.push(s && isFiniteNum(s.weight) && Number.isInteger(s.reps) ? { weight: s.weight, reps: s.reps } : blank());
  }
  return out;
}

export function parseRepRange(repStr) {
  if (typeof repStr !== 'string') return null;
  const m = /(\d{1,3})\s*[–-]\s*(\d{1,3})/.exec(repStr);
  if (!m) return null;
  const lo = Number(m[1]), hi = Number(m[2]);
  return lo >= 1 && hi >= lo ? { lo, hi } : null;
}
const RANGE_FOR_KIND = { compound: { lo: 6, hi: 10 }, isolation: { lo: 10, hi: 15 } };

/* 雙重漸進（一次只回一種 action，絕不同時加重量／組數／天數）：
   疼痛暫停 > 動作不順暫停 > 無有效次數暫停 > 未達下限暫停 > 全組達頂且動作好 → 加最小增量（上肢 2.5／下肢 5）
   > 其餘在範圍內 → 先加次數。保留 1–2 下餘力是前提假設，由 UI 的勾選（formGood）承載，不在此捏造。 */
export function progressionSuggestion(input) {
  const inp = isObj(input) ? input : {};
  const kind = inp.kind === 'isolation' ? 'isolation' : 'compound';
  const body = inp.body === 'lower' ? 'lower' : 'upper';
  const range = RANGE_FOR_KIND[kind];
  const hold = (reason) => ({ action: 'hold', incrementKg: 0, range, singleAction: true, reason });
  if (inp.painHeld === true) return hold('疼痛：今日該動作停用、進步暫停');
  if (inp.formGood === false) return hold('動作不順：先穩住目前重量與動作品質，不加重量');
  const reps = Array.isArray(inp.reps) ? inp.reps.filter((r) => Number.isInteger(r) && r >= 1 && r <= 999) : [];
  if (reps.length === 0) return hold('尚無有效次數：先記錄本課重量／次數再建議');
  if (reps.some((r) => r < range.lo)) return hold(`未達次數範圍下限（${range.lo} 下）：先以目前重量做到範圍內`);
  if (reps.every((r) => r >= range.hi)) {
    const incrementKg = body === 'lower' ? 5 : 2.5;
    return { action: 'add-weight', incrementKg, range, singleAction: true, reason: `全組達範圍頂（${range.hi} 下）且動作好：建議下次加最小增量約 ${incrementKg} kg，不同時加組數或天數` };
  }
  return { action: 'add-reps', incrementKg: 0, range, singleAction: true, reason: `在範圍內但未全組達頂：先加次數，朝 ${range.hi} 下前進，不加重量` };
}

/* 組間計時：複合約 2–3 分鐘取中 150 秒、孤立約 60–90 秒取中 75 秒；暫停時 tick 不扣秒。 */
export function restSeconds(kind) {
  if (kind === 'compound') return 150;
  if (kind === 'isolation') return 75;
  return 90;
}
export function tickRest(remainingMs, stepMs, paused) {
  if (!isFiniteNum(remainingMs) || !isFiniteNum(stepMs)) return 0;
  if (paused === true) return Math.max(0, remainingMs);
  return Math.max(0, remainingMs - stepMs);
}
export function formatRest(ms) {
  const total = Math.max(0, Math.ceil((isFiniteNum(ms) ? ms : 0) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/* PR：同一張表＋mode 欄位，顯示與計分分開。key＝mode＋exercise＋kind。
   第一次紀錄只是基準，不算新 PR；只有嚴格優於舊最佳才算新 PR；PR 仍非 XP。 */
function prKey(mode, exercise, kind) { return `${mode}\n${exercise}\n${kind}`; }
export function bestPr(prList, mode, exercise, kind) {
  if (!Array.isArray(prList)) return null;
  let best = null;
  for (const p of prList) {
    if (p && p.mode === mode && p.exercise === exercise && p.kind === kind && isFiniteNum(p.value)) {
      if (best === null || p.value > best) best = p.value;
    }
  }
  return best;
}
export function isNewPr(prList, candidate) {
  if (!isObj(candidate) || typeof candidate.exercise !== 'string' || !candidate.exercise) return false;
  if (candidate.mode !== 'gym' && candidate.mode !== 'home') return false;
  if (candidate.kind !== 'weight' && candidate.kind !== 'reps') return false;
  if (!isFiniteNum(candidate.value)) return false;
  const prev = bestPr(Array.isArray(prList) ? prList : [], candidate.mode, candidate.exercise, candidate.kind);
  if (prev === null) return false; // 第一次只是基準
  return candidate.value > prev;
}
export function prsByMode(prList, mode) {
  if (!Array.isArray(prList)) return [];
  return prList.filter((p) => p && p.mode === mode);
}
/* 既有居家 PR（state.prs 各桶）＋Phase 1 健身房 PR，合併顯示但絕不合併計分：
   HRP（prs.hrp，reps）與 push-up max（prs.pushup，v）是不同 exercise key，分開存、分開比。 */
export function combinedPrList(state, parsedPhase1) {
  const p1 = parsedPhase1 || parsePhase1(state);
  const out = [...p1.prs];
  const legacy = isObj(state) && isObj(state.prs) ? state.prs : {};
  const push = (arr, exercise, kind, field) => {
    if (!Array.isArray(arr)) return;
    for (const e of arr) {
      if (isObj(e) && isValidDateStr(e.date) && isFiniteNum(e[field])) {
        out.push({ date: e.date, exercise, mode: 'home', kind, value: e[field] });
      }
    }
  };
  push(legacy.hrp, 'HRP', 'reps', 'reps');
  push(legacy.pushup, 'push-up max', 'reps', 'v');
  push(legacy.plank, 'Plank', 'time', 'sec');
  push(legacy.run2mi, '2 英里跑', 'time', 'sec');
  return out;
}

/* 達標率：只計完整健身房課（phase0 gymLog mode gym）；最小課、散步、居家、伸展一律不計。 */
export function countsAsFullGym(mode) { return mode === 'gym'; }
export function weekGymAdherence(parsedPhase0, today) {
  const count = parsedPhase0 ? weekGymCount(parsedPhase0, today) : 0;
  return { count, denominator: 4, text: `${count}/4`, countsOnlyFull: true };
}

/* Plan 守門：只能改建議日與同肌群 swaps；組數／動作庫／模板／其他一律拒絕，且 apply 時原 plan 不變。 */
export function validatePlanChange(plan, change) {
  if (!isObj(change) || typeof change.type !== 'string') return { ok: false, reason: '變更格式無效' };
  if (change.type === 'suggestedDays') {
    if (!Array.isArray(change.days) || change.days.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
      return { ok: false, reason: '建議日須為 0–6 的星期數字' };
    }
    return { ok: true, reason: '建議日可改（不固定星期，由使用者自選）' };
  }
  if (change.type === 'swap') {
    if (!GYM_SEQUENCE.includes(change.label)) return { ok: false, reason: '課表標籤無效' };
    if (!canSwap(change.from, change.to)) return { ok: false, reason: '只能同肌群互換，且換入動作須在動作庫內' };
    return { ok: true, reason: '同肌群互換可改' };
  }
  if (change.type === 'sets') return { ok: false, reason: 'Plan 頁不能改組數' };
  if (change.type === 'exercises' || change.type === 'library' || change.type === 'template') {
    return { ok: false, reason: 'Plan 頁不能改動作庫' };
  }
  return { ok: false, reason: 'Plan 頁不支援此種變更（不做自訂課表）' };
}
export function applyPlanChange(plan, change) {
  const v = validatePlanChange(plan, change);
  if (!v.ok) return plan;
  const base = isObj(plan) ? plan : { suggestedDays: [], swaps: {} };
  if (change.type === 'suggestedDays') {
    return { suggestedDays: [...new Set(change.days)].sort((a, b) => a - b), swaps: { ...(base.swaps || {}) } };
  }
  return {
    suggestedDays: Array.isArray(base.suggestedDays) ? [...base.suggestedDays] : [],
    swaps: { ...(base.swaps || {}), [change.label]: { from: change.from, to: change.to } },
  };
}

/* 疼痛暫停進步：接受 parsePhase0 結果或原始 pain 陣列；任一動作當天回報疼痛即 hold。 */
export function progressionHeld(painSource, date, exercise) {
  const list = Array.isArray(painSource) ? painSource : (isObj(painSource) && Array.isArray(painSource.pain) ? painSource.pain : []);
  return list.some((p) => isObj(p) && p.date === date && p.exercise === exercise);
}
