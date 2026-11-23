/* Daily Ten — v4 資料命名空間（redo-v1）。localStorage key 不變（daily-ten-state，容器仍是 v3；store／migrate／backup 原樣保留，
   不認得的欄位會原樣保留與匯入）。新版的三個習慣全部放在 state.v4：
   state.v4 = {
     version: 1,
     settings: { identity, gymDays: [1,2,4,5]（0=日…6=六，Cross 自選一週 4 天）, sound: true },
     gym: { sessions: [ { id, date, label, startedAt, finishedAt, exercises: [ { id, name, kind, sets: [ { weight, reps, done } ] } ] } ],
            draft: null | 進行中的課（同 session 形狀，finishedAt null）,
            swaps: { 原動作 id: 備用 id }（換動作，2026-11-08；刪掉一項＝換回原動作）,
            pick: 選填｜使用者指定的下一課標籤（上半身／腿日切換，2026-11-23；沒選就沒有這個欄位，完成一次課後刪掉） },
     stretch: { log: [ { date, variant: 'full'|'short', at: ISO, seconds } ],
                swaps: { 原項目 id: 備用 id }（換動作，2026-11-08；備用沿用原項目的秒數） },
     explore: { current: null | { taskId, weekStart, pickedAt }, log: [ { date, taskId, title, category, interest: 1–5|null, note, at } ], skipped: [taskId] },
     pauses: [ { from, to, kind } ],
     nutrition: { meals: { 'YYYY-MM-DD'（遊戲日）: [餐 id] }（營養工具卡，2026-11-19；別天的打勾不算＝隔天自動重置）,
                  weights: [ { date（遊戲日）, kg, at: ISO } ]（一天一筆，重記覆蓋）,
                  entries: { 'YYYY-MM-DD'（遊戲日）: [ { id, at: ISO, slot: 餐 id|null, name(1–40), kcal: 整數 1–5000,
                             proteinG|fatG: 整數 0–500|null, carbG: 整數 0–1000|null, source: 'photo'|'manual' } ] }
                           （實際吃的，2026-11-20 D30；每天最多 20 筆；只存文字與數字，照片不進 state） }
                 （舊資料沒有 nutrition 或 entries → fillMissing 補空值，只改記憶體；容器版本不升）,
     seen: { level, perfectDay, perfectWeek, achievements: [ids] }
   }
   第一次載入（state.v4 不存在）時由 ensureV4 建立，並把舊 Phase 0／1 的紀錄搬進來（冪等：只在 v4 不存在時做）：
     phase1.gymSets[{date,label,exercise,sets[{weight,reps}]}] → 依 date+label 合併成完整課（全部組數視為完成）；
     phase0.stretch{date: 'full'|'short'} → stretch.log；phase0.exploreTries[{date,taskId}] → explore.log（interest null）。
   parseV4(state) 回傳清理過的乾淨副本給引擎（壞資料過濾、不丟例外）。 */
import { isValidDateStr, isoLocal, isIsoWithOffset } from './time.js';

export const V4_VERSION = 1;
export const DEFAULT_IDENTITY = '我是獨立、自律、持續成長的人。';
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const fin = (v) => typeof v === 'number' && Number.isFinite(v);
const str = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');

export function defaultV4() {
  return {
    version: V4_VERSION,
    settings: { identity: DEFAULT_IDENTITY, gymDays: [1, 2, 4, 5], sound: true },
    gym: { sessions: [], draft: null, swaps: {} },
    stretch: { log: [], swaps: {} },
    explore: { current: null, log: [], skipped: [] },
    pauses: [],
    nutrition: { meals: {}, weights: [], entries: {} },
    seen: { level: null, perfectDay: null, perfectWeek: null, achievements: [] }
  };
}

/* 從舊 Phase 0／1 搬資料；回傳搬了幾筆（給交付報告） */
export function migrateLegacy(state, v4) {
  const moved = { gym: 0, stretch: 0, explore: 0 };
  const p1 = isObj(state?.phase1) ? state.phase1 : {};
  if (Array.isArray(p1.gymSets)) {
    const groups = new Map();
    for (const e of p1.gymSets) {
      if (!isObj(e) || !isValidDateStr(e.date) || typeof e.exercise !== 'string') continue;
      const key = `${e.date}|${str(e.label, 20) || 'Upper A'}`;
      if (!groups.has(key)) groups.set(key, { id: `legacy-${key.replace('|', '-').replace(/\s/g, '')}`, date: e.date, label: str(e.label, 20) || 'Upper A', startedAt: null, finishedAt: `${e.date}T12:00:00+09:00`, exercises: [], legacy: true });
      const sets = (Array.isArray(e.sets) ? e.sets : []).filter((s) => isObj(s) && fin(s.weight) && Number.isInteger(s.reps) && s.reps > 0).map((s) => ({ weight: s.weight, reps: s.reps, done: true }));
      if (!sets.length) continue;
      groups.get(key).exercises.push({ id: legacyExerciseId(e.exercise), name: e.exercise, kind: 'compound', sets });
    }
    for (const g of groups.values()) if (g.exercises.length) { v4.gym.sessions.push(g); moved.gym += 1; }
  }
  const p0 = isObj(state?.phase0) ? state.phase0 : {};
  if (isObj(p0.stretch)) {
    for (const [d, v] of Object.entries(p0.stretch)) {
      if (!isValidDateStr(d) || (v !== 'full' && v !== 'short')) continue;
      v4.stretch.log.push({ date: d, variant: v, at: `${d}T08:00:00+09:00`, seconds: v === 'full' ? 900 : 300, legacy: true });
      moved.stretch += 1;
    }
  }
  if (Array.isArray(p0.exploreTries)) {
    for (const e of p0.exploreTries) {
      if (!isObj(e) || !isValidDateStr(e.date) || typeof e.taskId !== 'string') continue;
      v4.explore.log.push({ date: e.date, taskId: e.taskId, title: str(e.title, 60) || e.taskId, category: '', interest: null, note: '', at: `${e.date}T12:00:00+09:00`, legacy: true });
      moved.explore += 1;
    }
  }
  return moved;
}
const LEGACY_IDS = { '上斜臥推': 'incline-db-press', '平板臥推': 'bench-press', '側平舉': 'lateral-raise', '滑輪下拉': 'lat-pulldown', '上背划船（手肘外展）': 'upper-back-row', '二頭彎舉': 'bicep-curl', '三頭伸展': 'tricep-extension', '深蹲或腿推': 'squat', '羅馬尼亞硬舉（髖鉸鏈）': 'rdl', '提踵': 'calf-raise', '內收肌器械': 'adductor-machine', '腿後彎舉': 'leg-curl', '腿前伸展': 'leg-extension' };
function legacyExerciseId(name) { return LEGACY_IDS[name] || `legacy-${name.replace(/[^\p{L}\p{N}]+/gu, '-').toLowerCase()}`; }

/* 確保 state.v4 存在（只改記憶體；呼叫端決定要不要 saveState）。回傳 {v4, created, moved} */
export function ensureV4(state) {
  if (!isObj(state)) return { v4: defaultV4(), created: true, moved: null };
  if (isObj(state.v4) && isObj(state.v4.gym) && isObj(state.v4.stretch) && isObj(state.v4.explore)) {
    fillMissing(state.v4);
    return { v4: state.v4, created: false, moved: null };
  }
  const v4 = defaultV4();
  const moved = migrateLegacy(state, v4);
  state.v4 = v4;
  return { v4, created: true, moved };
}
function fillMissing(v4) {
  const d = defaultV4();
  if (!isObj(v4.settings)) v4.settings = d.settings;
  if (!Array.isArray(v4.settings.gymDays)) v4.settings.gymDays = d.settings.gymDays;
  if (typeof v4.settings.identity !== 'string') v4.settings.identity = d.settings.identity;
  if (!Array.isArray(v4.gym.sessions)) v4.gym.sessions = [];
  if (!('draft' in v4.gym)) v4.gym.draft = null;
  if (!isObj(v4.gym.swaps)) v4.gym.swaps = {};
  if (!Array.isArray(v4.stretch.log)) v4.stretch.log = [];
  if (!isObj(v4.stretch.swaps)) v4.stretch.swaps = {};
  if (!Array.isArray(v4.explore.log)) v4.explore.log = [];
  if (!Array.isArray(v4.explore.skipped)) v4.explore.skipped = [];
  if (!('current' in v4.explore)) v4.explore.current = null;
  if (!Array.isArray(v4.pauses)) v4.pauses = [];
  if (!isObj(v4.nutrition)) v4.nutrition = d.nutrition;
  if (!isObj(v4.nutrition.meals)) v4.nutrition.meals = {};
  if (!Array.isArray(v4.nutrition.weights)) v4.nutrition.weights = [];
  if (!isObj(v4.nutrition.entries)) v4.nutrition.entries = {};
  if (!isObj(v4.seen)) v4.seen = d.seen;
  if (!Array.isArray(v4.seen.achievements)) v4.seen.achievements = [];
}

/* ---------- 清理後的副本（引擎用） ---------- */
export function cleanSession(s) {
  if (!isObj(s) || !isValidDateStr(s.date)) return null;
  const exercises = (Array.isArray(s.exercises) ? s.exercises : []).map((ex) => {
    if (!isObj(ex) || typeof ex.id !== 'string') return null;
    const sets = (Array.isArray(ex.sets) ? ex.sets : []).map((st) => (isObj(st) ? { weight: fin(st.weight) && st.weight >= 0 ? st.weight : 0, reps: Number.isInteger(st.reps) && st.reps >= 0 ? st.reps : 0, done: st.done === true } : null)).filter(Boolean).slice(0, 10);
    return { id: ex.id, name: str(ex.name, 40) || ex.id, kind: ex.kind === 'isolation' ? 'isolation' : 'compound', sets };
  }).filter(Boolean).slice(0, 20);
  const finishedAt = isIsoWithOffset(s.finishedAt) ? s.finishedAt : null;
  // draft 的進行中休息（2026-11-08 修復）：只保留給未完成的草稿，期限與總秒數
  // 須為合法數字；完成的課不帶 rest（finish() 也會先刪掉）。
  const rest = !finishedAt && isObj(s.rest) && Number.isFinite(s.rest.deadline) && Number.isInteger(s.rest.total) && s.rest.total > 0 ? { deadline: s.rest.deadline, total: s.rest.total } : null;
  return { id: str(s.id, 80) || `${s.date}-${str(s.label, 20)}`, date: s.date, label: str(s.label, 20) || 'Upper A', startedAt: isIsoWithOffset(s.startedAt) ? s.startedAt : null, finishedAt, exercises, ...(rest ? { rest } : {}) };
}
const GYM_SEQUENCE = ['Upper A', 'Lower A', 'Upper B', 'Lower B'];
export function parseV4(state) {
  const raw = isObj(state?.v4) ? state.v4 : defaultV4();
  const d = defaultV4();
  const settings = isObj(raw.settings) ? raw.settings : d.settings;
  const gymDays = Array.isArray(settings.gymDays) ? [...new Set(settings.gymDays.filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort() : d.settings.gymDays;
  const sessions = (Array.isArray(raw.gym?.sessions) ? raw.gym.sessions : []).map(cleanSession).filter((s) => s && s.finishedAt !== null).slice(-5000);
  const stretchLog = (Array.isArray(raw.stretch?.log) ? raw.stretch.log : []).filter((e) => isObj(e) && isValidDateStr(e.date) && (e.variant === 'full' || e.variant === 'short')).map((e) => ({ date: e.date, variant: e.variant, at: typeof e.at === 'string' ? e.at : null, seconds: fin(e.seconds) ? e.seconds : 0 }));
  const exploreLog = (Array.isArray(raw.explore?.log) ? raw.explore.log : []).filter((e) => isObj(e) && isValidDateStr(e.date) && typeof e.taskId === 'string').map((e) => ({ date: e.date, taskId: e.taskId, title: str(e.title, 60), category: str(e.category, 20), interest: Number.isInteger(e.interest) && e.interest >= 1 && e.interest <= 5 ? e.interest : null, note: str(e.note, 500), at: typeof e.at === 'string' ? e.at : null }));
  const pauses = (Array.isArray(raw.pauses) ? raw.pauses : []).filter((p) => isObj(p) && isValidDateStr(p.from) && isValidDateStr(p.to) && p.from <= p.to).map((p) => ({ from: p.from, to: p.to, kind: str(p.kind, 20) || 'rest' }));
  const current = isObj(raw.explore?.current) && typeof raw.explore.current.taskId === 'string' ? { taskId: raw.explore.current.taskId, weekStart: isValidDateStr(raw.explore.current.weekStart) ? raw.explore.current.weekStart : null } : null;
  const seen = isObj(raw.seen) ? raw.seen : d.seen;
  return {
    settings: { identity: str(settings.identity, 80) || d.settings.identity, gymDays, sound: settings.sound !== false },
    gym: { sessions, draft: isObj(raw.gym?.draft) ? cleanSession(raw.gym.draft) : null, sequence: GYM_SEQUENCE, pick: GYM_SEQUENCE.includes(raw.gym?.pick) ? raw.gym.pick : null },
    stretch: { log: stretchLog },
    explore: { current, log: exploreLog, skipped: Array.isArray(raw.explore?.skipped) ? raw.explore.skipped.filter((x) => typeof x === 'string') : [] },
    pauses,
    nutrition: parseNutrition(raw.nutrition),
    seen: { level: Number.isInteger(seen.level) ? seen.level : null, perfectDay: isValidDateStr(seen.perfectDay) ? seen.perfectDay : null, perfectWeek: isValidDateStr(seen.perfectWeek) ? seen.perfectWeek : null, achievements: Array.isArray(seen.achievements) ? seen.achievements.filter((x) => typeof x === 'string') : [] }
  };
}

/* 營養：壞資料過濾、不丟例外。體重只收 20–400 kg 的有限數字（畫面再依 data/nutrition.json 的範圍把關）；同一天取最後一筆；依日期排序。
   entries（實際吃的）：日期不是真實的 YYYY-MM-DD → 整天丟掉；每筆要有 id、名稱（去空白後 1–40 字，太長截斷）、kcal（四捨五入後 1–5000）才留；
   三大營養素不是數字或超出範圍 → null（不猜）；slot 不是字串 → null；source 不是 'photo' 就當 'manual'；at 不是含 offset 的 ISO → null；
   同一天 id 重複只留第一筆；每天最多留前 20 筆；不認得的欄位（例如圖片）一律不帶出。 */
export const ENTRY_LIMITS = Object.freeze({ perDay: 20, nameMax: 40, kcal: [1, 5000], proteinG: [0, 500], fatG: [0, 500], carbG: [0, 1000] });
const entryName = (v) => (typeof v === 'string' ? [...v.trim()].slice(0, ENTRY_LIMITS.nameMax).join('').trim() : '');
const entryKcal = (v) => { const n = fin(v) ? Math.round(v) : NaN; return n >= ENTRY_LIMITS.kcal[0] && n <= ENTRY_LIMITS.kcal[1] ? n : null; };
const entryMacro = (v, [min, max]) => { const n = fin(v) ? Math.round(v) : NaN; return n >= min && n <= max ? n : null; };
const entrySlot = (v) => (typeof v === 'string' && v.length > 0 && v.length <= 40 ? v : null);
function cleanEntry(e) {
  if (!isObj(e) || typeof e.id !== 'string' || !e.id || e.id.length > 40) return null;
  const name = entryName(e.name);
  const kcal = entryKcal(e.kcal);
  if (!name || kcal === null) return null;
  return { id: e.id, at: isIsoWithOffset(e.at) ? e.at : null, slot: entrySlot(e.slot), name, kcal, proteinG: entryMacro(e.proteinG, ENTRY_LIMITS.proteinG), fatG: entryMacro(e.fatG, ENTRY_LIMITS.fatG), carbG: entryMacro(e.carbG, ENTRY_LIMITS.carbG), source: e.source === 'photo' ? 'photo' : 'manual' };
}
export function parseNutrition(raw) {
  const meals = {};
  if (isObj(raw?.meals)) {
    for (const [d, ids] of Object.entries(raw.meals)) {
      if (!isValidDateStr(d) || !Array.isArray(ids)) continue;
      const clean = [...new Set(ids.filter((x) => typeof x === 'string' && x.length > 0 && x.length <= 40))].slice(0, 20);
      if (clean.length) meals[d] = clean;
    }
  }
  const byDate = new Map();
  for (const w of Array.isArray(raw?.weights) ? raw.weights : []) {
    if (!isObj(w) || !isValidDateStr(w.date) || !fin(w.kg) || w.kg < 20 || w.kg > 400) continue;
    byDate.set(w.date, { date: w.date, kg: w.kg, at: typeof w.at === 'string' ? w.at : null });
  }
  const weights = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-5000);
  const entries = {};
  if (isObj(raw?.entries)) {
    for (const [d, list] of Object.entries(raw.entries)) {
      if (!isValidDateStr(d) || !Array.isArray(list)) continue;
      const seen = new Set();
      const clean = [];
      for (const e of list) {
        if (clean.length >= ENTRY_LIMITS.perDay) break;
        const c = cleanEntry(e);
        if (!c || seen.has(c.id)) continue;
        seen.add(c.id);
        clean.push(c);
      }
      if (clean.length) entries[d] = clean;
    }
  }
  return { meals, weights, entries };
}

/* ---------- 寫入（只改記憶體中的 state.v4；呼叫端 saveState） ---------- */
/* 營養打勾：1 次點擊切換；回傳切換後是否已打勾 */
export function toggleMeal(v4, date, mealId) {
  fillMissing(v4);
  const list = Array.isArray(v4.nutrition.meals[date]) ? v4.nutrition.meals[date] : [];
  const on = !list.includes(mealId);
  const next = on ? [...list, mealId] : list.filter((x) => x !== mealId);
  if (next.length) v4.nutrition.meals[date] = next; else delete v4.nutrition.meals[date];
  return on;
}
/* 實際吃的：加一筆，回傳 id；不合格（日期不對、名稱去空白後是空的、kcal 四捨五入後不在 1–5000、當天已滿 20 筆）→ 回 null，什麼都不寫。
   數字四捨五入成整數；三大營養素不是數字或超出範圍 → null。slot 有值時，同時把該餐在 meals[date] 的打勾拿掉（避免重複計算）。
   當天原本的清單若有壞項目（不是物件、沒有 id）會順手清掉；合格與否仍由 parseNutrition 把關。 */
export function addEntry(v4, { date, slot = null, name, kcal, proteinG = null, fatG = null, carbG = null, source = 'manual', now = new Date() } = {}) {
  fillMissing(v4);
  const cleanName = entryName(name);
  const cleanKcal = entryKcal(kcal);
  if (!isValidDateStr(date) || !cleanName || cleanKcal === null) return null;
  const day = (Array.isArray(v4.nutrition.entries[date]) ? v4.nutrition.entries[date] : []).filter((e) => isObj(e) && typeof e.id === 'string');
  if (day.length >= ENTRY_LIMITS.perDay) return null;
  const ids = new Set(day.map((e) => e.id));
  const base = `e-${now.getTime().toString(36)}`;
  let n = day.length;
  let id = `${base}-${n}`;
  while (ids.has(id)) { n += 1; id = `${base}-${n}`; }
  const cleanSlot = entrySlot(slot);
  day.push({ id, at: isoLocal(now), slot: cleanSlot, name: cleanName, kcal: cleanKcal, proteinG: entryMacro(proteinG, ENTRY_LIMITS.proteinG), fatG: entryMacro(fatG, ENTRY_LIMITS.fatG), carbG: entryMacro(carbG, ENTRY_LIMITS.carbG), source: source === 'photo' ? 'photo' : 'manual' });
  v4.nutrition.entries[date] = day;
  if (cleanSlot !== null && Array.isArray(v4.nutrition.meals[date])) {
    const rest = v4.nutrition.meals[date].filter((x) => x !== cleanSlot);
    if (rest.length) v4.nutrition.meals[date] = rest; else delete v4.nutrition.meals[date];
  }
  return id;
}
/* 實際吃的：刪一筆，回傳是否刪到（不會把打勾加回去；當天刪光就拿掉那個日期） */
export function removeEntry(v4, date, id) {
  fillMissing(v4);
  const day = v4.nutrition.entries[date];
  if (!Array.isArray(day) || typeof id !== 'string') return false;
  const rest = day.filter((e) => !(isObj(e) && e.id === id));
  if (rest.length === day.length) return false;
  if (rest.length) v4.nutrition.entries[date] = rest; else delete v4.nutrition.entries[date];
  return true;
}
/* 體重：一天一筆，重記覆蓋；kg 為 null 時刪掉當天那筆 */
export function setWeight(v4, { date, kg, now = new Date() }) {
  fillMissing(v4);
  v4.nutrition.weights = v4.nutrition.weights.filter((w) => !(isObj(w) && w.date === date));
  if (fin(kg)) { v4.nutrition.weights.push({ date, kg, at: isoLocal(now) }); v4.nutrition.weights.sort((a, b) => (String(a?.date) < String(b?.date) ? -1 : 1)); }
}
export function logStretch(v4, { date, variant, now = new Date(), seconds = 0 }) {
  const idx = v4.stretch.log.findIndex((e) => e && e.date === date);
  const entry = { date, variant, at: isoLocal(now), seconds };
  if (idx >= 0) {
    const prev = v4.stretch.log[idx];
    if (prev.variant === 'full' && variant === 'short') return prev; // 已有完整版就不降級
    v4.stretch.log[idx] = entry;
  } else v4.stretch.log.push(entry);
  return entry;
}
export function removeStretch(v4, date) {
  const idx = v4.stretch.log.findIndex((e) => e && e.date === date);
  if (idx >= 0) v4.stretch.log.splice(idx, 1);
}
export function addGymSession(v4, session) { v4.gym.sessions.push(session); v4.gym.draft = null; delete v4.gym.pick; }
export function removeGymSession(v4, id) { v4.gym.sessions = v4.gym.sessions.filter((s) => s && s.id !== id); }
export function logExplore(v4, entry) { v4.explore.log.push(entry); v4.explore.current = null; }
export function removeExplore(v4, at) { v4.explore.log = v4.explore.log.filter((e) => e && e.at !== at); }
export function newId(prefix, now = new Date()) { return `${prefix}-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 6)}`; }
