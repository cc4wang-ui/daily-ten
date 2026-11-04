/* Daily Ten — 健身房規則（純函式）：課表模板、下一次課、上次數字預填、雙重漸進建議、休息秒數。
   模板在 data/gym.json；A＝B（不發明差異）。進階規則：全部正式組都做到次數範圍頂端才加最小增量，否則先加次數。 */
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function setCount(tplSets) {
  if (Number.isInteger(tplSets)) return Math.max(1, Math.min(10, tplSets));
  const m = typeof tplSets === 'string' ? /^(\d{1,2})\s*[–-]\s*(\d{1,2})$/.exec(tplSets.trim()) : null;
  return m ? Math.max(1, Number(m[1])) : 2;
}
export function repRange(reps) {
  const m = typeof reps === 'string' ? /^(\d{1,3})\s*[–-]\s*(\d{1,3})$/.exec(reps.trim()) : null;
  return m ? { min: Number(m[1]), max: Number(m[2]) } : { min: 6, max: 10 };
}
export function templateFor(label, gymData) {
  const seq = gymData.sequence;
  const idx = seq.indexOf(label);
  const type = idx >= 0 && idx % 2 === 1 ? 'lower' : 'upper';
  return { label: idx >= 0 ? label : seq[0], type, exercises: gymData.templates[type] };
}
/* 最近一次同動作的組數（任一課）。回 [{weight,reps}] 或 null */
export function lastSetsFor(sessions, exerciseId) {
  for (let i = sessions.length - 1; i >= 0; i--) {
    const s = sessions[i];
    const ex = (s.exercises || []).find((e) => e.id === exerciseId);
    if (!ex) continue;
    const done = (ex.sets || []).filter((st) => st.done && (st.weight > 0 || st.reps > 0));
    if (done.length) return done.map((st) => ({ weight: st.weight, reps: st.reps }));
  }
  return null;
}
/* 漸進建議：所有上次組數都做到頂端 → 建議加最小增量；否則建議加次數（一次只建議一種改變） */
export function progression(tpl, lastSets, type, rules) {
  if (!lastSets || !lastSets.length) return { kind: 'start', text: '第一次：選一個能做到次數範圍下限、還留 1–2 下餘力的重量。' };
  const r = repRange(tpl.reps);
  const allTop = lastSets.every((s) => s.reps >= r.max);
  const w = Math.max(...lastSets.map((s) => s.weight));
  if (allTop) {
    const inc = type === 'lower' ? rules.progression.lowerIncrementKg : rules.progression.upperIncrementKg;
    return { kind: 'weight', text: `上次全部做到 ${r.max} 下：這次加 ${inc} kg（${w + inc} kg），次數回到 ${r.min}。`, weight: w + inc, reps: r.min };
  }
  const minReps = Math.min(...lastSets.map((s) => s.reps));
  return { kind: 'reps', text: `重量不變（${w} kg），每組比上次多 1 下（目標 ${Math.min(minReps + 1, r.max)}）。`, weight: w, reps: Math.min(minReps + 1, r.max) };
}
/* 開新課：每個動作預填上次的重量與次數（未勾選） */
export function buildDraft(label, gymData, sessions, rules, { id, date, startedAt }) {
  const t = templateFor(label, gymData);
  const exercises = t.exercises.map((tpl) => {
    const last = lastSetsFor(sessions, tpl.id);
    const n = Math.max(setCount(tpl.sets), last ? last.length : 0);
    const sug = progression(tpl, last, t.type, rules);
    const sets = Array.from({ length: Math.min(n, 10) }, (_, i) => {
      const prev = last ? last[Math.min(i, last.length - 1)] : null;
      return { weight: prev ? prev.weight : 0, reps: prev ? prev.reps : 0, done: false };
    });
    return { id: tpl.id, name: tpl.name, kind: tpl.kind, reps: tpl.reps, cue: tpl.cue, alt: tpl.alt || null, suggestion: sug.text, last: last || null, sets };
  });
  return { id, date, label: t.label, type: t.type, startedAt, finishedAt: null, exercises };
}
export function restSeconds(kind, rules) { return kind === 'isolation' ? rules.rest.isolationSec : rules.rest.compoundSec; }
export function volumeOf(session) {
  let v = 0;
  for (const ex of session.exercises || []) for (const s of ex.sets || []) if (s.done) v += (s.weight || 0) * (s.reps || 0);
  return Math.round(v);
}
export function fmtDuration(startIso, endIso) {
  const a = Date.parse(startIso), b = Date.parse(endIso);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return '';
  const m = Math.round((b - a) / 60000);
  return m >= 60 ? `${Math.floor(m / 60)} 小時 ${m % 60} 分` : `${m} 分`;
}
