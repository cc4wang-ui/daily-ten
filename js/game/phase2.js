/* Daily Ten — Phase 2（純函式、決定性：不讀時鐘、不碰 DOM／localStorage／網路、不改動 state）
   權威：~/workspace/daily-ten-complete.md §0（優先於研究建議）。與 Phase 0／Phase 1／engine 的分工：
     - XP、等級、Perfect Day、d16 規則：仍由 js/game/engine.js、rewards.js、data/game.json 決定，
       本模組一律不改、不重算、不寫入任何 XP 相關欄位；匯入本身不寫 session、不計 XP。
     - 健身房順序與預填／PR：沿用 js/game/phase0.js（nextGym）與 js/game/phase1.js
       （lastSetsFor／prefillSets、isNewPr／bestPr）；匯入的組數以 phase1.gymSets 的形狀寫入
       （{date, label:'', exercise, sets:[{weight, reps}]}，weight 一律為 kg），
       讓 Phase 1 的預填與 PR 清單直接吃到匯入紀錄，不另開一張表。
     - 本模組只推導 Phase 2 新增的東西：Strong／Hevy CSV 解析與去重合併、匯入 PR 衍生、
       量測儀表板數字（28 天活動率、健身房量／居家量分開、睡眠趨勢、滾動 30 天觀察）、
       無障礙規則常數（供測試對照 CSS）。
   邊界（必須對使用者明說）：
     PHASE2_BOUNDARY：健身房模板仍是草案，正式出貨前須教練驗證簽核（未簽核，不假裝已簽）；
     滾動 30 天數字只是滾動觀察，不是同批回訪率的驗證結論，也不設 4 週內驗完的硬門檻；
     砍功能門檻為每週使用率低於 10% 才考慮，僅註明，本版不刪除任何現有功能；
     居家量以次數計，絕不換算成 kg、絕不與健身房量合併成一個數字；
     匯入不計 XP、不改既有 session 的計分；PR 仍非 XP。
   state.phase2 形狀（全部選填、缺漏當空；壞資料過濾掉，不丟例外）：
     { imports: [{format:'strong'|'hevy', addedSets, duplicateSets, totalSets, firstDate, lastDate}] }
   對外：
     PHASE2_BOUNDARY, CUT_THRESHOLD_TEXT, LB_TO_KG, convertLbToKg,
     parseCsvText, parseImportCsv, setFingerprint, mergeImportedSets, applyImportPrs,
     parsePhase2, makeImportRecord, dashboardMetrics */
import { parsePhase0 } from './phase0.js';
import { parsePhase1, isNewPr, bestPr } from './phase1.js';

export const PHASE2_BOUNDARY = 'Phase 2：健身房模板仍是草案，正式出貨前須教練驗證簽核；滾動 30 天數字只是滾動觀察，不是已驗證的回訪率結論；匯入不計 XP、不改既有 session 的計分；PR 仍非 XP。';
export const CUT_THRESHOLD_TEXT = '砍功能門檻：每週使用率低於 10% 才考慮砍功能；本版僅註明此門檻，不刪除任何現有功能。';
export const LB_TO_KG = 0.45359237;
export const MAX_CSV_ROWS = 20000;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isFiniteNum = (n) => typeof n === 'number' && Number.isFinite(n);
const isValidDateStr = (s) => typeof s === 'string' && DATE_RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
const dayNumber = (s) => Math.floor(Date.parse(`${s}T00:00:00Z`) / 86400000);
const dayNumberToStr = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
const roundKg = (kg) => Math.round(kg * 100) / 100;

export function convertLbToKg(lb) {
  if (!isFiniteNum(lb)) return null;
  return Math.round(lb * LB_TO_KG * 10) / 10;
}

/* ---------- CSV 文字解析（支援引號、引號內逗號／換行、"" 跳脫） ---------- */
export function parseCsvText(text) {
  if (typeof text !== 'string') return { rows: [], error: 'CSV 不是文字' };
  const src = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [], cell = '', inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += c;
    } else if (c === '"') {
      if (cell === '') inQuotes = true;
      else cell += c;
    } else if (c === ',') {
      row.push(cell); cell = '';
    } else if (c === '\n') {
      row.push(cell); rows.push(row); row = []; cell = '';
    } else if (c === '\r') {
      // \r\n 由 \n 收尾；單獨 \r 也當換行
      if (src[i + 1] !== '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    } else cell += c;
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }
  if (inQuotes) return { rows, error: 'CSV 引號未閉合：有一格的引號沒有收尾，請檢查匯出檔是否完整' };
  return { rows, error: null };
}

const normKey = (h) => String(h).trim().toLowerCase().replace(/[\s_\-]+/g, '').replace(/\(.*?\)/g, '');
const headerUnit = (h) => {
  const s = String(h).toLowerCase();
  if (/\(\s*kg\s*\)/.test(s) || /\bkg\b/.test(s)) return 'kg';
  if (/\(\s*lbs?\s*\)/.test(s) || /\bpounds?\b/.test(s) || /\blbs?\b/.test(s)) return 'lb';
  return null;
};

/* 欄位對照：回傳 {date, exercise, setIndex, weight, weightUnit, reps, setType, unitCol}（欄位序號，未找到為 -1）。
   weightUnit：欄位標題本身帶的單位（Weight (kg)／weight_kg／weight_lbs），優先於 Strong 預設單位，
   但每列的 Unit 欄位（若有）又優先於標題單位。 */
function mapColumns(headers) {
  const cols = { date: -1, exercise: -1, setIndex: -1, weight: -1, weightUnit: null, reps: -1, setType: -1, unitCol: -1 };
  headers.forEach((h, i) => {
    const k = normKey(h);
    if (cols.date < 0 && (k === 'date' || k === 'starttime' || k === 'datetime' || k === 'workoutdate')) cols.date = i;
    else if (cols.exercise < 0 && (k === 'exercisename' || k === 'exercisetitle' || k === 'exercise')) cols.exercise = i;
    else if (cols.setIndex < 0 && (k === 'setorder' || k === 'setindex' || k === 'set')) cols.setIndex = i;
    else if (cols.weight < 0 && (k === 'weight' || k === 'weightkg' || k === 'weightlbs' || k === 'weightlb')) {
      cols.weight = i;
      cols.weightUnit = k === 'weightkg' ? 'kg' : (k === 'weightlbs' || k === 'weightlb') ? 'lb' : headerUnit(h);
    }
    else if (cols.reps < 0 && (k === 'reps' || k === 'rep')) cols.reps = i;
    else if (cols.setType < 0 && (k === 'settype' || k === 'type')) cols.setType = i;
    else if (cols.unitCol < 0 && (k === 'weightunit' || k === 'unit' || k === 'units')) cols.unitCol = i;
  });
  return cols;
}

function parseCsvDate(raw) {
  const s = String(raw).trim();
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) {
    const d = `${m[1]}-${m[2]}-${m[3]}`;
    return isValidDateStr(d) ? d : null;
  }
  m = /^(\d{4})\/(\d{2})\/(\d{2})/.exec(s);
  if (m) {
    const d = `${m[1]}-${m[2]}-${m[3]}`;
    return isValidDateStr(d) ? d : null;
  }
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) {
    const d = `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
    return isValidDateStr(d) ? d : null;
  }
  return null;
}

const rowUnit = (raw) => {
  const s = String(raw).trim().toLowerCase();
  if (s === 'kg' || s === 'kilogram' || s === 'kilograms') return 'kg';
  if (s === 'lb' || s === 'lbs' || s === 'pound' || s === 'pounds') return 'lb';
  return null;
};

/* ---------- Strong／Hevy CSV 解析 ----------
   回傳 {ok, format, entries, totalRows, validSets, skipped, errors}：
     - format：'strong'｜'hevy'｜null（無法辨識／空檔／標題缺欄位時為 null）
     - entries：[{date, label:'', exercise, sets:[{weight, reps}]}]，按日期、動作排序；
       weight 一律為 kg（lb 已換算，換算到小數 1 位；kg 原值保留到小數 2 位）。
     - skipped：{empty, warmup, nonStrength}——空列、Hevy 熱身組、只有距離／時間的非肌力列，
       皆計數回報，不靜默丟失；其餘不合規的列一律進 errors（列號＋原因），不匯入。
     - ok 為 false 時 entries 為空，UI 不得寫入；ok 為 true 但 entries 為空時亦不得寫入
       （例如全是熱身組／非肌力列，UI 須把 skipped 數字說清楚）。
   opts.strongUnit：Strong 檔重量欄未標單位時使用的單位（'kg'｜'lb'）；未給且遇上
   未標單位的 Strong 重量列時，該列進 errors（明確報錯，不猜單位）。 */
export function parseImportCsv(text, opts = {}) {
  const empty = { ok: false, format: null, entries: [], totalRows: 0, validSets: 0, skipped: { empty: 0, warmup: 0, nonStrength: 0 }, errors: [] };
  if (typeof text !== 'string' || text.trim() === '') {
    return { ...empty, errors: [{ row: 0, message: 'CSV 是空的：請貼上 Strong 或 Hevy 匯出的 CSV 內容，或選擇 CSV 檔案' }] };
  }
  const { rows, error: csvError } = parseCsvText(text);
  if (csvError) return { ...empty, errors: [{ row: 0, message: csvError }] };
  if (rows.length < 2) {
    return { ...empty, errors: [{ row: 0, message: 'CSV 只有標題列、沒有資料列：請確認匯出檔包含訓練紀錄' }] };
  }
  const headers = rows[0].map((h) => String(h).trim());
  const keys = headers.map(normKey);
  const isHevy = keys.includes('exercisetitle') || keys.includes('weightkg') || keys.includes('starttime');
  const isStrong = keys.includes('exercisename') || keys.includes('workoutname');
  const format = isHevy ? 'hevy' : isStrong ? 'strong' : null;
  if (!format) {
    return { ...empty, errors: [{ row: 1, message: `無法辨識的 CSV 格式：標題須為 Strong 匯出（Exercise Name、Weight、Reps）或 Hevy 匯出（exercise_title、weight_kg、reps）；目前標題為：${headers.join('、') || '（空白）'}` }] };
  }
  const cols = mapColumns(headers);
  const missing = [];
  if (cols.date < 0) missing.push('日期（Date／start_time）');
  if (cols.exercise < 0) missing.push('動作（Exercise Name／exercise_title）');
  if (cols.weight < 0) missing.push('重量（Weight／weight_kg）');
  if (cols.reps < 0) missing.push('次數（Reps／reps）');
  if (missing.length) {
    return { ...empty, format, errors: [{ row: 1, message: `${format === 'strong' ? 'Strong' : 'Hevy'} CSV 缺少必要欄位：${missing.join('、')}，請確認匯出時未刪欄位` }] };
  }
  const dataRows = rows.slice(1);
  if (dataRows.length > MAX_CSV_ROWS) {
    return { ...empty, format, errors: [{ row: 0, message: `CSV 資料列過多（${dataRows.length} 列，上限 ${MAX_CSV_ROWS} 列）：請分批匯出再匯入` }] };
  }
  const errors = [];
  const skipped = { empty: 0, warmup: 0, nonStrength: 0 };
  const groups = new Map(); // key: date\nexercise -> {date, exercise, sets:[{weight, reps, order, setIndex}]}
  const strongUnit = opts && (opts.strongUnit === 'lb' ? 'lb' : opts.strongUnit === 'kg' ? 'kg' : null);
  dataRows.forEach((r, idx) => {
    const lineNo = idx + 2; // 標題列是第 1 列
    const cell = (i) => (i >= 0 && i < r.length ? String(r[i]).trim() : '');
    if (r.every((c) => String(c).trim() === '')) { skipped.empty++; return; }
    const setType = cols.setType >= 0 ? cell(cols.setType).toLowerCase() : '';
    if (setType === 'warmup' || setType === 'warm-up') { skipped.warmup++; return; }
    const dateRaw = cell(cols.date), exercise = cell(cols.exercise);
    const weightRaw = cell(cols.weight), repsRaw = cell(cols.reps);
    if (!exercise) { errors.push({ row: lineNo, message: '動作名稱空白' }); return; }
    const date = parseCsvDate(dateRaw);
    if (!date) { errors.push({ row: lineNo, message: `日期無法辨識（${dateRaw || '空白'}）：須為 YYYY-MM-DD 或含該日期的日期時間` }); return; }
    if (weightRaw === '' && repsRaw === '') { skipped.nonStrength++; return; } // 只有距離／時間的列（有氧等），不是肌力組
    if (repsRaw === '') { errors.push({ row: lineNo, message: '次數空白：肌力組須有次數才能匯入' }); return; }
    const reps = Number(repsRaw);
    if (!Number.isInteger(reps) || reps < 1 || reps > 999) { errors.push({ row: lineNo, message: `次數無效（${repsRaw}）：須為 1–999 的整數` }); return; }
    let weightKg;
    if (weightRaw === '') {
      weightKg = 0; // 徒手組：重量空白視為 0 kg，不報錯（Hevy 徒手組常見）
    } else {
      const w = Number(weightRaw);
      if (!Number.isFinite(w) || w < 0) { errors.push({ row: lineNo, message: `重量無效（${weightRaw}）：須為 ≥ 0 的數字` }); return; }
      const perRowUnit = cols.unitCol >= 0 ? rowUnit(cell(cols.unitCol)) : null;
      const unit = perRowUnit || cols.weightUnit || (format === 'hevy' ? 'kg' : strongUnit);
      if (!unit) { errors.push({ row: lineNo, message: '重量單位不明：Strong 檔案未標示 kg／lb，請在匯入時選擇重量單位後再匯入' }); return; }
      weightKg = unit === 'lb' ? convertLbToKg(w) : roundKg(w);
      if (weightKg === null || weightKg > 1000) { errors.push({ row: lineNo, message: `重量換算後超出範圍（${weightRaw} ${unit}）：須 ≤ 1000 kg` }); return; }
    }
    const setRaw = cols.setIndex >= 0 ? cell(cols.setIndex) : '';
    const setIndex = setRaw === '' ? null : Number(setRaw);
    const key = `${date}\n${exercise}`;
    if (!groups.has(key)) groups.set(key, { date, exercise, sets: [] });
    groups.get(key).sets.push({ weight: weightKg, reps, order: idx, setIndex: Number.isInteger(setIndex) ? setIndex : null });
  });
  const entries = [...groups.values()].map((g) => {
    const sets = g.sets
      .sort((a, b) => (a.setIndex === null && b.setIndex === null ? a.order - b.order
        : a.setIndex === null ? 1 : b.setIndex === null ? -1
        : a.setIndex - b.setIndex || a.order - b.order))
      .map((s) => ({ weight: s.weight, reps: s.reps }));
    return { date: g.date, label: '', exercise: g.exercise, sets };
  }).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.exercise < b.exercise ? -1 : a.exercise > b.exercise ? 1 : 0));
  const validSets = entries.reduce((n, e) => n + e.sets.length, 0);
  return { ok: entries.length > 0, format, entries, totalRows: dataRows.length, validSets, skipped, errors };
}

/* ---------- 去重合併（不改動輸入） ----------
   指紋不含組序，只含日期＋動作＋重量＋次數的多重集合：同一天同一動作做 3 組 40×8，
   既有已有 2 組時，匯入的 3 組只算 2 組重複、1 組新增；整筆檔案重匯一次時新增為 0。
   回傳 {gymSets, addedSets, duplicateSets, addedEntries, totalImportedSets}。 */
export function setFingerprint(date, exercise, weight, reps) {
  const w = isFiniteNum(weight) ? Math.round(weight * 100) / 100 : weight;
  return `${date}\n${exercise}\n${w}\n${reps}`;
}
export function mergeImportedSets(existingGymSets, importedEntries) {
  const base = Array.isArray(existingGymSets) ? existingGymSets : [];
  const gymSets = base.map((e) => (isObj(e) ? { ...e, sets: Array.isArray(e.sets) ? e.sets.map((s) => ({ ...s })) : [] } : e));
  const counts = new Map();
  for (const e of gymSets) {
    if (!isObj(e) || !isValidDateStr(e.date) || typeof e.exercise !== 'string') continue;
    for (const s of (Array.isArray(e.sets) ? e.sets : [])) {
      if (!isObj(s) || !isFiniteNum(s.weight) || !Number.isInteger(s.reps)) continue;
      const k = setFingerprint(e.date, e.exercise, s.weight, s.reps);
      counts.set(k, (counts.get(k) || 0) + 1);
    }
  }
  let addedSets = 0, duplicateSets = 0, addedEntries = 0, totalImportedSets = 0;
  for (const entry of (Array.isArray(importedEntries) ? importedEntries : [])) {
    if (!isObj(entry) || !isValidDateStr(entry.date) || typeof entry.exercise !== 'string' || !entry.exercise) continue;
    const validSets = (Array.isArray(entry.sets) ? entry.sets : []).filter((s) => isObj(s) && isFiniteNum(s.weight) && s.weight >= 0 && s.weight <= 1000 && Number.isInteger(s.reps) && s.reps >= 1 && s.reps <= 999);
    totalImportedSets += validSets.length;
    const fresh = [];
    for (const s of validSets) {
      const k = setFingerprint(entry.date, entry.exercise, s.weight, s.reps);
      if ((counts.get(k) || 0) > 0) { counts.set(k, counts.get(k) - 1); duplicateSets++; }
      else { counts.set(k, (counts.get(k) || 0) + 1); fresh.push({ weight: s.weight, reps: s.reps }); addedSets++; }
    }
    if (fresh.length === 0) continue;
    const idx = gymSets.findIndex((e) => isObj(e) && e.date === entry.date && e.exercise === entry.exercise);
    if (idx >= 0) gymSets[idx] = { ...gymSets[idx], sets: [...(Array.isArray(gymSets[idx].sets) ? gymSets[idx].sets : []), ...fresh] };
    else { gymSets.push({ date: entry.date, label: '', exercise: entry.exercise, sets: fresh }); addedEntries++; }
  }
  return { gymSets, addedSets, duplicateSets, addedEntries, totalImportedSets };
}

/* ---------- 匯入 PR 衍生（沿用 Phase 1 規則：第一次只是基準、嚴格優於舊最佳才算新 PR） ----------
   體重 0 的徒手組不產生重量 PR。回傳 {prs, newPrs, baselines}，prs 為新陣列，不改動輸入。 */
export function applyImportPrs(existingPrs, importedEntries) {
  const prs = Array.isArray(existingPrs) ? existingPrs.map((p) => ({ ...p })) : [];
  const newPrs = [], baselines = [];
  for (const entry of (Array.isArray(importedEntries) ? importedEntries : [])) {
    if (!isObj(entry) || !isValidDateStr(entry.date) || typeof entry.exercise !== 'string' || !entry.exercise) continue;
    const weights = (Array.isArray(entry.sets) ? entry.sets : []).filter((s) => isObj(s) && isFiniteNum(s.weight)).map((s) => s.weight);
    if (!weights.length) continue;
    const maxW = Math.max(...weights);
    if (maxW <= 0) continue;
    const cand = { date: entry.date, exercise: entry.exercise, mode: 'gym', kind: 'weight', value: maxW };
    const prev = bestPr(prs, 'gym', entry.exercise, 'weight');
    if (prev === null) { prs.push(cand); baselines.push(cand); }
    else if (isNewPr(prs, cand)) { prs.push(cand); newPrs.push(cand); }
  }
  return { prs, newPrs, baselines };
}

/* ---------- state.phase2 ---------- */
export function parsePhase2(state) {
  const raw = isObj(state) && isObj(state.phase2) ? state.phase2 : {};
  const imports = Array.isArray(raw.imports) ? raw.imports.flatMap((e) => {
    if (!isObj(e) || (e.format !== 'strong' && e.format !== 'hevy')) return [];
    const num = (v) => Number.isInteger(v) && v >= 0 ? v : 0;
    return [{
      format: e.format,
      addedSets: num(e.addedSets), duplicateSets: num(e.duplicateSets), totalSets: num(e.totalSets),
      firstDate: isValidDateStr(e.firstDate) ? e.firstDate : null,
      lastDate: isValidDateStr(e.lastDate) ? e.lastDate : null,
    }];
  }) : [];
  return { imports };
}
export function makeImportRecord(format, mergeResult, entries) {
  const dates = (Array.isArray(entries) ? entries : []).map((e) => e.date).filter(isValidDateStr).sort();
  return {
    format: format === 'hevy' ? 'hevy' : 'strong',
    addedSets: mergeResult ? mergeResult.addedSets : 0,
    duplicateSets: mergeResult ? mergeResult.duplicateSets : 0,
    totalSets: mergeResult ? mergeResult.totalImportedSets : 0,
    firstDate: dates.length ? dates[0] : null,
    lastDate: dates.length ? dates[dates.length - 1] : null,
  };
}

/* ---------- 量測儀表板（只讀推導，不寫 state、不計 XP） ----------
   活動日＝session（排除 rest 恢復日）或 phase0 gymLog（gym／home／minimum／walk 皆計活動日，
   與 phase0Day 的 activityDay 一致）任一出現的日期；28 天分母固定為 28 個日曆天，
   暫停日不偷偷扣掉分母，另列 pausedDays 供對照。
   健身房量＝phase1 gymSets 的 Σ重量(kg)×次數；居家量＝game.trainingFeedback 的 Σ實際次數（單位：下），
   兩者絕不合併、居家量絕不換算成 kg（彈力帶阻力標記本來就不能換算公斤）。
   睡眠＝body.sleep（v 小時）優先，缺漏時以 habits.sleep.log 的熄燈→起床時數補；同一天以 body 為準，不重複計。
   滾動 30 天＝最近 30 個日曆天有活動的天數／30，僅為滾動觀察，不是同批回訪率驗證結論。 */
const WEEK_LABELS = ['近 7 天', '8–14 天前', '15–21 天前', '22–28 天前'];
function bucketOf(todayNum, dateNum) {
  const d = todayNum - dateNum;
  if (d < 0 || d > 27) return -1;
  return Math.floor(d / 7);
}
export function dashboardMetrics(state, today) {
  const empty = {
    today: null, from28: null, to28: null, from30: null,
    activity: { activeDays: 0, days: 28, rate: 0, ratePct: 0, pausedDays: 0 },
    gymVolume: { totalKg: 0, days: 0, weekly: WEEK_LABELS.map((label) => ({ label, kg: 0 })) },
    homeVolume: { totalReps: 0, reports: 0, weekly: WEEK_LABELS.map((label) => ({ label, reps: 0 })) },
    sleep: { points: 0, avgHours: null, latest: null, weekly: WEEK_LABELS.map((label) => ({ label, avgHours: null, points: 0 })) },
    retention30: { activeDays: 0, days: 30, rate: 0, ratePct: 0, note: '滾動觀察：最近 30 天有活動的天數比例，非同批回訪率驗證結論，不設 4 週內驗完的硬門檻。' },
  };
  if (!isValidDateStr(today)) return empty;
  const todayNum = dayNumber(today);
  const from28 = dayNumberToStr(todayNum - 27), from30 = dayNumberToStr(todayNum - 29);
  const p0 = parsePhase0(state);
  const p1 = parsePhase1(state);
  const st = isObj(state) ? state : {};
  const activity = new Set();
  if (Array.isArray(st.sessions)) {
    for (const s of st.sessions) {
      if (isObj(s) && isValidDateStr(s.date) && s.type !== 'rest') activity.add(s.date);
    }
  }
  for (const e of p0.gymLog) activity.add(e.date);
  const inWindow = (d, days) => dayNumber(d) <= todayNum && dayNumber(d) >= todayNum - (days - 1);
  const active28 = [...activity].filter((d) => inWindow(d, 28));
  const active30 = [...activity].filter((d) => inWindow(d, 30));
  const pausedSet = new Set();
  for (const p of p0.pauses) {
    let n = dayNumber(p.from);
    const end = dayNumber(p.to);
    for (let guard = 0; n <= end && guard < 400; n++, guard++) {
      const d = dayNumberToStr(n);
      if (inWindow(d, 28)) pausedSet.add(d);
    }
  }
  // 健身房量
  const gymWeekly = WEEK_LABELS.map((label) => ({ label, kg: 0 }));
  let gymTotal = 0;
  const gymDays = new Set();
  for (const e of p1.gymSets) {
    if (!inWindow(e.date, 28)) continue;
    const b = bucketOf(todayNum, dayNumber(e.date));
    if (b < 0) continue;
    gymDays.add(e.date);
    for (const s of e.sets) {
      const v = roundKg(s.weight * s.reps);
      gymTotal = roundKg(gymTotal + v);
      gymWeekly[b].kg = roundKg(gymWeekly[b].kg + v);
    }
  }
  // 居家量（次數）
  const homeWeekly = WEEK_LABELS.map((label) => ({ label, reps: 0 }));
  let homeTotal = 0, homeReports = 0;
  const feedback = isObj(st.game) && Array.isArray(st.game.trainingFeedback) ? st.game.trainingFeedback : [];
  for (const r of feedback) {
    if (!isObj(r) || !isValidDateStr(r.date) || !inWindow(r.date, 28)) continue;
    if (!Number.isInteger(r.actual) || r.actual < 0 || r.actual > 999) continue;
    const b = bucketOf(todayNum, dayNumber(r.date));
    if (b < 0) continue;
    homeReports++;
    homeTotal += r.actual;
    homeWeekly[b].reps += r.actual;
  }
  // 睡眠
  const sleepMap = new Map();
  const bodySleep = isObj(st.body) && Array.isArray(st.body.sleep) ? st.body.sleep : [];
  for (const e of bodySleep) {
    if (isObj(e) && isValidDateStr(e.date) && isFiniteNum(e.v) && e.v > 0 && e.v <= 24 && inWindow(e.date, 28)) sleepMap.set(e.date, e.v);
  }
  const sleepLog = isObj(st.habits) && isObj(st.habits.sleep) && Array.isArray(st.habits.sleep.log) ? st.habits.sleep.log : [];
  for (const e of sleepLog) {
    if (!isObj(e) || !isValidDateStr(e.date) || sleepMap.has(e.date) || !inWindow(e.date, 28)) continue;
    const lo = Date.parse(e.lightsOut), wa = Date.parse(e.wake);
    if (!Number.isFinite(lo) || !Number.isFinite(wa)) continue;
    const h = (wa - lo) / 3600000;
    if (h > 0 && h <= 24) sleepMap.set(e.date, Math.round(h * 10) / 10);
  }
  const sleepWeekly = WEEK_LABELS.map((label) => ({ label, avgHours: null, points: 0 }));
  const sleepSums = [0, 0, 0, 0], sleepCounts = [0, 0, 0, 0];
  let sleepSum = 0;
  for (const [d, h] of sleepMap) {
    const b = bucketOf(todayNum, dayNumber(d));
    if (b < 0) continue;
    sleepSum += h; sleepSums[b] += h; sleepCounts[b]++;
  }
  sleepWeekly.forEach((w, i) => {
    w.points = sleepCounts[i];
    w.avgHours = sleepCounts[i] ? Math.round((sleepSums[i] / sleepCounts[i]) * 10) / 10 : null;
  });
  const sleepDates = [...sleepMap.keys()].sort();
  const latest = sleepDates.length ? { date: sleepDates[sleepDates.length - 1], hours: sleepMap.get(sleepDates[sleepDates.length - 1]) } : null;
  const rate28 = active28.length / 28, rate30 = active30.length / 30;
  return {
    today, from28, to28: today, from30,
    activity: { activeDays: active28.length, days: 28, rate: rate28, ratePct: Math.round(rate28 * 1000) / 10, pausedDays: pausedSet.size },
    gymVolume: { totalKg: gymTotal, days: gymDays.size, weekly: gymWeekly },
    homeVolume: { totalReps: homeTotal, reports: homeReports, weekly: homeWeekly },
    sleep: { points: sleepMap.size, avgHours: sleepMap.size ? Math.round((sleepSum / sleepMap.size) * 10) / 10 : null, latest, weekly: sleepWeekly },
    retention30: { activeDays: active30.length, days: 30, rate: rate30, ratePct: Math.round(rate30 * 1000) / 10, note: empty.retention30.note },
  };
}
