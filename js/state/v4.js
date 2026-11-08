/* Daily Ten — v4 資料命名空間（redo-v1）。localStorage key 不變（daily-ten-state，容器仍是 v3；store／migrate／backup 原樣保留，
   不認得的欄位會原樣保留與匯入）。新版的三個習慣全部放在 state.v4：
   state.v4 = {
     version: 1,
     settings: { identity, gymDays: [1,2,4,5]（0=日…6=六，Cross 自選一週 4 天）, sound: true },
     gym: { sessions: [ { id, date, label, startedAt, finishedAt, exercises: [ { id, name, kind, sets: [ { weight, reps, done } ] } ] } ],
            draft: null | 進行中的課（同 session 形狀，finishedAt null） },
     stretch: { log: [ { date, variant: 'full'|'short', at: ISO, seconds } ] },
     explore: { current: null | { taskId, weekStart, pickedAt }, log: [ { date, taskId, title, category, interest: 1–5|null, note, at } ], skipped: [taskId] },
     pauses: [ { from, to, kind } ],
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
    gym: { sessions: [], draft: null },
    stretch: { log: [] },
    explore: { current: null, log: [], skipped: [] },
    pauses: [],
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
  if (!Array.isArray(v4.stretch.log)) v4.stretch.log = [];
  if (!Array.isArray(v4.explore.log)) v4.explore.log = [];
  if (!Array.isArray(v4.explore.skipped)) v4.explore.skipped = [];
  if (!('current' in v4.explore)) v4.explore.current = null;
  if (!Array.isArray(v4.pauses)) v4.pauses = [];
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
    gym: { sessions, draft: isObj(raw.gym?.draft) ? cleanSession(raw.gym.draft) : null, sequence: ['Upper A', 'Lower A', 'Upper B', 'Lower B'] },
    stretch: { log: stretchLog },
    explore: { current, log: exploreLog, skipped: Array.isArray(raw.explore?.skipped) ? raw.explore.skipped.filter((x) => typeof x === 'string') : [] },
    pauses,
    seen: { level: Number.isInteger(seen.level) ? seen.level : null, perfectDay: isValidDateStr(seen.perfectDay) ? seen.perfectDay : null, perfectWeek: isValidDateStr(seen.perfectWeek) ? seen.perfectWeek : null, achievements: Array.isArray(seen.achievements) ? seen.achievements.filter((x) => typeof x === 'string') : [] }
  };
}

/* ---------- 寫入（只改記憶體中的 state.v4；呼叫端 saveState） ---------- */
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
export function addGymSession(v4, session) { v4.gym.sessions.push(session); v4.gym.draft = null; }
export function removeGymSession(v4, id) { v4.gym.sessions = v4.gym.sessions.filter((s) => s && s.id !== id); }
export function logExplore(v4, entry) { v4.explore.log.push(entry); v4.explore.current = null; }
export function removeExplore(v4, at) { v4.explore.log = v4.explore.log.filter((e) => e && e.at !== at); }
export function newId(prefix, now = new Date()) { return `${prefix}-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 6)}`; }
