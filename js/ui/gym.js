/* Daily Ten — 健身房：下一次課（Upper/Lower 輪替）、開始訓練（Hevy 風格組數表：上次／kg／次／勾選）、休息計時、完成總結、週計畫（自選 4 天）、紀錄。
   進行中的課存在 v4.gym.draft（每次變更都存），重新開 App 可以繼續。完成後 addGymSession → XP 由引擎推導。 */
import { $, esc } from './dom.js';
import { icon } from './icons.js';
import { goTo } from './nav.js';
import { summary, rules, gymData, videosData, v4, commit, now } from './model.js';
import { buildDraft, restSeconds, volumeOf, fmtDuration, templateFor } from '../game/gym.js';
import { sessionResult, gameDay } from '../game/core.js';
import { addGymSession, removeGymSession, newId } from '../state/v4.js';
import { isoLocal } from '../state/time.js';
import { showToast, undoMs } from './toast.js';
import { videoFor, thumbHtml, linkHtml } from './videos.js';
import { confetti } from './celebrate.js';

const WD = ['日', '一', '二', '三', '四', '五', '六'];
const num = (n) => Number(n || 0).toLocaleString('zh-Hant-TW');
let rest = null; // {left, total, timer}
let clockTimer = null;
export function sessionOpen() { return !$('session').hidden; }

export function renderGym() {
  const sum = summary(), R = rules(), G = gymData(), t = sum.today.gym, w = sum.week.gym;
  const draft = v4().gym.draft;
  const tpl = templateFor(t.nextLabel, G);
  const top = draft
    ? `<section class="card" style="border-top:4px solid var(--gym)"><div class="card-head"><h3 class="card-title">進行中：${esc(draft.label)}</h3><span class="tag gym">未完成</span></div><p class="small">${esc(draft.date)} 開始的課還沒結束。</p><button type="button" class="btn btn-primary gym" id="gym-resume">${icon('play', { size: 20 })}繼續訓練</button><div class="btn-row"><button type="button" class="btn btn-ghost" id="gym-discard">放棄這次</button></div></section>`
    : t.done
      ? `<section class="card" style="background:var(--gym-soft)"><div class="card-head"><h3 class="card-title" style="color:var(--gym-ink)">今天完成了：${esc(t.session.label)}</h3><span class="tag gym">+${R.habits.gym.xp.complete} XP</span></div><p class="small" style="margin:0">${num(t.session.volume)} kg · ${t.session.done} 組 · 本週 ${w.count}/${w.target}</p></section>`
      : `<section class="card"><div class="card-head"><div><h3 class="card-title">下一次：${esc(tpl.label)}</h3><p class="card-sub">${tpl.type === 'upper' ? '上肢' : '下肢'} · ${tpl.exercises.length} 個動作 · 本週 ${w.count}/${w.target}</p></div><span class="tag gym">+${R.habits.gym.xp.complete} XP</span></div>
        <button type="button" class="btn btn-primary gym" id="gym-start">${icon('play', { size: 20 })}開始訓練</button></section>`;
  const list = `<h3 class="section-title">${esc(tpl.label)} 課表</h3><section class="card"><div class="list">${tpl.exercises.map((e, i) => { const v = videoFor(videosData(), e.id); return `<div class="row">${thumbHtml(v, { label: `看 ${e.name} 示範` })}<div class="body"><p class="t">${i + 1}. ${esc(e.name)}</p><p class="s">${esc(String(e.sets))} 組 × ${esc(e.reps)} 下 · ${e.kind === 'compound' ? '複合' : '孤立'}</p>${v ? `<p class="s" style="margin-top:6px">${linkHtml(v)}</p>` : ''}</div></div>`; }).join('')}</div><p class="small" style="margin:12px 0 0">${esc(G.general)}</p></section>`;
  const days = v4().settings.gymDays || [];
  const plan = `<h3 class="section-title">我的健身房日（選 ${R.habits.gym.weeklyTarget} 天）</h3><section class="card"><div class="days" role="group" aria-label="健身房日">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<button type="button" data-d="${d}" aria-pressed="${days.includes(d)}">${WD[d]}</button>`).join('')}</div><p class="small" style="margin:10px 0 0">只是提醒自己排哪幾天；哪天去都算，順序 Upper A → Lower A → Upper B → Lower B 只在完成一次課後往前。</p></section>`;
  const hist = sum.sessions.length ? `<h3 class="section-title">紀錄</h3><section class="card"><div class="list">${[...sum.sessions].reverse().slice(0, 12).map((s) => `<div class="row"><div class="body"><p class="t">${esc(s.label)}${s.result === 'partial' ? ' <span class="tag">部分</span>' : ''}</p><p class="s">${esc(s.date)} · ${s.done} 組 · ${num(s.volume)} kg${s.startedAt && s.finishedAt ? ` · ${fmtDuration(s.startedAt, s.finishedAt)}` : ''}</p></div><div class="r" style="color:var(--gym-ink)">+${s.result === 'complete' ? R.habits.gym.xp.complete : R.habits.gym.xp.partial}</div></div>`).join('')}</div></section>` : '';
  $('gym-body').innerHTML = top + list + plan + hist;
  if ($('gym-start')) $('gym-start').onclick = () => start(tpl.label);
  if ($('gym-resume')) $('gym-resume').onclick = () => openSession();
  if ($('gym-discard')) $('gym-discard').onclick = async () => { if (!confirm('放棄這次訓練？已填的數字會清掉。')) return; v4().gym.draft = null; await commit(); renderGym(); };
  $('gym-body').querySelectorAll('.days button').forEach((b) => { b.onclick = async () => { const d = Number(b.dataset.d); const set = new Set(v4().settings.gymDays || []); if (set.has(d)) set.delete(d); else set.add(d); v4().settings.gymDays = [...set].sort(); await commit(); renderGym(); }; });
}

async function start(label) {
  const R = rules();
  const d = buildDraft(label, gymData(), summary().sessions, R, { id: newId('gym', now()), date: gameDay(now(), R), startedAt: isoLocal(now()) });
  v4().gym.draft = d;
  await commit();
  openSession();
}
const draft = () => v4().gym.draft;

function openSession() {
  if (!draft()) return;
  $('session').hidden = false;
  paintSession();
  clearInterval(clockTimer);
  clockTimer = setInterval(() => { const el = $('ss-clock'); if (el && draft()) el.textContent = elapsed(); }, 1000);
}
function elapsed() { const d = draft(); const ms = now().getTime() - Date.parse(d.startedAt); const m = Math.max(0, Math.floor(ms / 60000)); return `${m} 分`; }
function closeSession() { clearInterval(clockTimer); stopRest(); $('session').hidden = true; $('session').innerHTML = ''; }

function paintSession() {
  const d = draft();
  const exHtml = d.exercises.map((ex, ei) => {
    const v = videoFor(videosData(), ex.id);
    return `<section class="card ex" data-ei="${ei}"><div class="ex-head">${thumbHtml(v, { label: `看 ${ex.name} 示範` })}<div style="flex:1;min-width:0"><p class="name">${esc(ex.name)}</p><p class="sub">${esc(ex.reps)} 下${ex.cue ? ` · ${esc(ex.cue)}` : ''}</p></div></div>
      ${ex.suggestion ? `<p class="sugg">${esc(ex.suggestion)}</p>` : ''}
      <table class="sets"><thead><tr><th>組</th><th>上次</th><th>kg</th><th>次</th><th><span class="sr-only">完成</span>✓</th></tr></thead><tbody>
      ${ex.sets.map((s, si) => `<tr class="${s.done ? 'done' : ''}" data-si="${si}"><td class="num">${si + 1}</td><td class="prev num">${ex.last && ex.last[si] ? `${ex.last[si].weight}×${ex.last[si].reps}` : (ex.last && ex.last.length ? `${ex.last[ex.last.length - 1].weight}×${ex.last[ex.last.length - 1].reps}` : '—')}</td>
        <td><input type="number" inputmode="decimal" step="0.5" min="0" max="1000" value="${s.weight || ''}" placeholder="0" data-k="weight" aria-label="第 ${si + 1} 組重量"></td>
        <td><input type="number" inputmode="numeric" step="1" min="0" max="999" value="${s.reps || ''}" placeholder="0" data-k="reps" aria-label="第 ${si + 1} 組次數"></td>
        <td><button type="button" class="ok" aria-pressed="${s.done}" aria-label="第 ${si + 1} 組完成">${icon('check', { size: 20 })}</button></td></tr>`).join('')}
      </tbody></table><button type="button" class="btn btn-sm add-set" data-add="${ei}">${icon('plus', { size: 16 })}加一組</button></section>`;
  }).join('');
  $('session').innerHTML = `<div class="inner"><div class="bar"><button type="button" class="icon-btn" id="ss-exit" aria-label="先離開（會保留進度）">${icon('back')}</button><h2>${esc(d.label)}</h2><span class="timer num" id="ss-clock">${elapsed()}</span></div>
    ${exHtml}
    <button type="button" class="btn btn-primary gym" id="ss-finish">${icon('check', { size: 20 })}完成訓練</button>
    <p class="small" style="text-align:center;margin-top:12px">${esc(rules().progression.rule)}</p></div>`;
  $('ss-exit').onclick = () => { closeSession(); goTo('s-gym'); };
  $('ss-finish').onclick = finish;
  $('session').querySelectorAll('.ex').forEach((card) => {
    const ei = Number(card.dataset.ei);
    card.querySelectorAll('tr[data-si]').forEach((tr) => {
      const si = Number(tr.dataset.si);
      tr.querySelectorAll('input').forEach((inp) => { inp.onchange = async () => { const v = Number(inp.value); d.exercises[ei].sets[si][inp.dataset.k] = Number.isFinite(v) && v >= 0 ? v : 0; await commit(); }; });
      tr.querySelector('.ok').onclick = async () => {
        const s = d.exercises[ei].sets[si];
        tr.querySelectorAll('input').forEach((inp) => { const v = Number(inp.value); s[inp.dataset.k] = Number.isFinite(v) && v >= 0 ? v : 0; });
        s.done = !s.done;
        tr.classList.toggle('done', s.done);
        tr.querySelector('.ok').setAttribute('aria-pressed', String(s.done));
        await commit();
        if (s.done) startRest(restSeconds(d.exercises[ei].kind, rules()));
      };
    });
    card.querySelector('[data-add]').onclick = async () => { const sets = d.exercises[ei].sets; if (sets.length >= 10) return; const last = sets[sets.length - 1]; sets.push({ weight: last ? last.weight : 0, reps: last ? last.reps : 0, done: false }); await commit(); paintSession(); };
  });
}

/* ---------- 休息計時 ---------- */
function startRest(sec) {
  stopRest();
  rest = { left: sec, total: sec, timer: null };
  const el = document.createElement('div');
  el.className = 'rest'; el.id = 'rest'; el.setAttribute('role', 'timer');
  el.innerHTML = `<i class="prog"></i><div><div class="l">休息</div><div class="t num" id="rest-t">${fmt(sec)}</div></div><div style="display:flex;gap:8px"><button type="button" class="btn" id="rest-add">+30 秒</button><button type="button" class="btn" id="rest-skip">略過</button></div>`;
  $('session').appendChild(el);
  $('rest-add').onclick = () => { rest.left += 30; rest.total += 30; paintRest(); };
  $('rest-skip').onclick = stopRest;
  rest.timer = setInterval(() => { rest.left -= 1; if (rest.left <= 0) { stopRest(); beep(); return; } paintRest(); }, 1000);
}
function paintRest() { const t = $('rest-t'); if (t) t.textContent = fmt(rest.left); const p = $('rest') && $('rest').querySelector('.prog'); if (p) p.style.setProperty('--p', (rest.left / rest.total).toFixed(3)); }
function stopRest() { if (rest && rest.timer) clearInterval(rest.timer); rest = null; const el = $('rest'); if (el) el.remove(); }
const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
function beep() {
  if (v4().settings.sound === false) return;
  try { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; const ac = beep.ac || (beep.ac = new AC()); const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = 660; g.gain.value = .1; o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + .25); } catch (e) { /* 沒聲音也沒關係 */ }
}

/* ---------- 完成 ---------- */
async function finish() {
  const d = draft(), R = rules();
  const r = sessionResult(d, R);
  if (r.result === 'none') { showToast('還沒有勾選任何一組。勾選完成的組數再按完成。'); return; }
  const before = summary();
  const session = { ...d, finishedAt: isoLocal(now()), exercises: d.exercises.map((ex) => ({ id: ex.id, name: ex.name, kind: ex.kind, sets: ex.sets.map((s) => ({ weight: s.weight, reps: s.reps, done: s.done })) })) };
  delete session.type;
  addGymSession(v4(), session);
  await commit();
  const after = summary();
  const newPrs = after.prs.filter((p) => p.sessionId === session.id);
  const xp = after.xp.total - before.xp.total;
  closeSession();
  const sh = $('sheet');
  sh.innerHTML = `<div class="panel summary" role="dialog" aria-modal="true" aria-labelledby="gs-t"><div class="grab"></div><h3 class="card-title" id="gs-t">${esc(session.label)} 完成</h3><div class="big num" style="color:var(--gym-ink)">+${xp} XP</div>
    <div class="tiles"><div class="tile"><p class="k">訓練量</p><p class="v num">${num(r.volume)}<small> kg</small></p></div><div class="tile"><p class="k">完成組數</p><p class="v num">${r.done}<small> / ${r.total}</small></p></div><div class="tile"><p class="k">時間</p><p class="v num">${esc(fmtDuration(session.startedAt, session.finishedAt) || '—')}</p></div><div class="tile"><p class="k">本週</p><p class="v num">${after.week.gym.count}<small> / ${after.week.gym.target}</small></p></div></div>
    ${newPrs.length ? `<p><b>PR！</b>${newPrs.map((p) => `${esc(p.name)} ${p.weight} kg × ${p.reps}`).join('、')}</p>` : ''}
    ${r.result === 'partial' ? `<p class="small">這次算部分完成（+${R.habits.gym.xp.partial} XP）：有動作一組都沒勾。下次也可以只做保底版。</p>` : ''}
    <button type="button" class="btn btn-primary gym" id="gs-ok">太好了</button></div>`;
  sh.hidden = false;
  confetti(1400);
  $('gs-ok').onclick = () => {
    sh.hidden = true; sh.innerHTML = '';
    showToast(`健身房完成 +${xp} XP`, { ms: undoMs(), action: { label: '復原', run: async () => { removeGymSession(v4(), session.id); v4().gym.draft = { ...session, finishedAt: null, exercises: d.exercises }; await commit(); goTo('s-gym'); } } });
    goTo('s-home');
  };
}
