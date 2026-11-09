/* Daily Ten — 健身房：下一次課（Upper/Lower 輪替）、開始訓練（Hevy 風格組數表：上次／kg／次／勾選）、休息計時、完成總結、週計畫（自選 4 天）、紀錄。
   進行中的課存在 v4.gym.draft（每次變更都存），重新開 App 可以繼續。完成後 addGymSession → XP 由引擎推導。 */
import { $, esc } from './dom.js';
import { icon } from './icons.js';
import { goTo } from './nav.js';
import { summary, rules, gymData, videosData, swapsData, v4, commit, now } from './model.js';
import { buildDraft, buildExercise, restSeconds, fmtDuration, templateFor } from '../game/gym.js';
import { gymAlternatives, resolveGymTemplate } from '../game/swap.js';
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
let listSwapOpen = null; // 課表預覽頁：哪個原動作的備用清單打開中（原動作 id）
let swapOpen = null; // 進行中的課：哪個動作的備用清單打開中（exercise index）
export function sessionOpen() { return !$('session').hidden; }

/* 換動作備用清單（課表預覽與進行中的課共用）：原動作的備用＋換回原動作。
   currentId 是目前在用的動作 id（原動作或已換上的備用）；origName 是原動作名。 */
function swapPanelHtml(origId, currentId, origName) {
  const alts = gymAlternatives(swapsData(), origId);
  const restore = currentId !== origId ? `<button type="button" class="btn swap-opt" data-restore="1"><span class="swap-name">換回原動作：${esc(origName)}</span></button>` : '';
  return `<div class="swap-panel"><p class="swap-title">換成備用動作（同肌群）</p>${restore}${alts.map((a) => `<button type="button" class="btn swap-opt" data-alt="${esc(a.id)}"${a.id === currentId ? ' disabled' : ''}><span class="swap-name">${esc(a.name)}${a.id === currentId ? '（目前）' : ''}</span><span class="swap-meta">${esc(String(a.sets))} 組 × ${esc(a.reps)} 下 · ${a.kind === 'compound' ? '複合' : '孤立'}</span><span class="swap-cue">${esc(a.cue)}</span></button>`).join('')}</div>`;
}
function wireSwapPanel(scope, onPick) {
  scope.querySelectorAll('.swap-opt[data-alt]').forEach((b) => { b.onclick = () => onPick(b.dataset.alt); });
  scope.querySelectorAll('.swap-opt[data-restore]').forEach((b) => { b.onclick = () => onPick(null); });
}

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
  const swapsMap = v4().gym.swaps || {};
  const list = `<h3 class="section-title">${esc(tpl.label)} 課表</h3><section class="card"><div class="list">${tpl.exercises.map((e, i) => {
    const eff = resolveGymTemplate(e, swapsMap, swapsData());
    const v = videoFor(videosData(), eff.id);
    const panel = listSwapOpen === e.id ? swapPanelHtml(e.id, eff.id, e.name) : '';
    return `<div class="row">${thumbHtml(v, { label: `看 ${eff.name} 示範` })}<div class="body"><p class="t">${i + 1}. ${esc(eff.name)}${eff.swappedFrom ? ' <span class="tag">已替換</span>' : ''}</p><p class="s">${esc(String(eff.sets))} 組 × ${esc(eff.reps)} 下 · ${eff.kind === 'compound' ? '複合' : '孤立'}</p>${v ? `<p class="s" style="margin-top:6px">${linkHtml(v)}${eff.alt && videoFor(videosData(), eff.alt) ? ` ${linkHtml(videoFor(videosData(), eff.alt), '腿推示範')}` : ''}</p>` : ''}</div><button type="button" class="btn btn-sm swap-btn" data-list-swap="${esc(e.id)}" aria-label="換 ${esc(eff.name)}">換</button></div>${panel}`;
  }).join('')}</div><p class="small" style="margin:12px 0 0">${esc(G.general)}</p></section>`;
  const days = v4().settings.gymDays || [];
  const swapCount = Object.keys(v4().gym.swaps || {}).length + Object.keys(v4().stretch.swaps || {}).length;
  const resetAll = swapCount > 0 ? `<p style="text-align:center;margin:12px 0 0"><button type="button" class="btn btn-secondary" id="gym-reset-swaps">全部換回原動作（${swapCount} 項已換）</button></p>` : '';
  const plan = `<h3 class="section-title">我的健身房日（選 ${R.habits.gym.weeklyTarget} 天）</h3><section class="card"><div class="days" role="group" aria-label="健身房日">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<button type="button" data-d="${d}" aria-pressed="${days.includes(d)}">${WD[d]}</button>`).join('')}</div><p class="small" style="margin:10px 0 0">只是提醒自己排哪幾天；哪天去都算，順序 Upper A → Lower A → Upper B → Lower B 只在完成一次課後往前。</p></section>`;
  const hist = sum.sessions.length ? `<h3 class="section-title">紀錄</h3><section class="card"><div class="list">${[...sum.sessions].reverse().slice(0, 12).map((s) => `<div class="row"><div class="body"><p class="t">${esc(s.label)}${s.result === 'partial' ? ' <span class="tag">部分</span>' : ''}</p><p class="s">${esc(s.date)} · ${s.done} 組 · ${num(s.volume)} kg${s.startedAt && s.finishedAt ? ` · ${fmtDuration(s.startedAt, s.finishedAt)}` : ''}</p></div><div class="r" style="color:var(--gym-ink)">+${s.result === 'complete' ? R.habits.gym.xp.complete : R.habits.gym.xp.partial}</div></div>`).join('')}</div></section>` : '';
  $('gym-body').innerHTML = top + list + resetAll + plan + hist;
  if ($('gym-start')) $('gym-start').onclick = () => start(tpl.label);
  if ($('gym-resume')) $('gym-resume').onclick = () => openSession();
  if ($('gym-discard')) $('gym-discard').onclick = async () => { if (!confirm('放棄這次訓練？已填的數字會清掉。')) return; stopRest(); v4().gym.draft = null; await commit(); renderGym(); };
  $('gym-body').querySelectorAll('[data-list-swap]').forEach((b) => { b.onclick = () => { listSwapOpen = listSwapOpen === b.dataset.listSwap ? null : b.dataset.listSwap; renderGym(); }; });
  const lp = $('gym-body').querySelector('.swap-panel');
  if (lp && listSwapOpen) wireSwapPanel(lp, (altId) => swapTemplate(listSwapOpen, altId));
  $('gym-body').querySelectorAll('.days button').forEach((b) => { b.onclick = async () => { const d = Number(b.dataset.d); const set = new Set(v4().settings.gymDays || []); if (set.has(d)) set.delete(d); else set.add(d); v4().settings.gymDays = [...set].sort(); await commit(); renderGym(); }; });
  if ($('gym-reset-swaps')) $('gym-reset-swaps').onclick = () => resetAllSwaps();
}

async function start(label) {
  const R = rules();
  const d = buildDraft(label, gymData(), summary().sessions, R, { id: newId('gym', now()), date: gameDay(now(), R), startedAt: isoLocal(now()), swaps: v4().gym.swaps || {}, swapsData: swapsData() });
  v4().gym.draft = d;
  await commit();
  openSession();
}
/* 全部換回：一次清掉健身房＋伸展的全部對應表（持久偏好的復原出口；逐項換回 21 項不夠）。
   先問一次（寫明各幾項）；清完 commit，重整後也維持換回來的狀態。
   進行中的課不受影響（草稿已按換好的動作建好，只影響下一次開課與清單）。 */
async function resetAllSwaps() {
  const g = Object.keys(v4().gym.swaps || {}).length;
  const s = Object.keys(v4().stretch.swaps || {}).length;
  if (g + s === 0) return;
  if (!confirm(`確定要把全部換動作換回原動作嗎？（健身房 ${g} 項、伸展 ${s} 項）`)) return;
  v4().gym.swaps = {};
  v4().stretch.swaps = {};
  listSwapOpen = null;
  await commit();
  renderGym();
  showToast('已全部換回原動作');
}
/* 課表預覽頁換動作：只改對應表（下一次開課才生效；進行中的課不受影響），不動課表本身。 */
async function swapTemplate(origId, altId) {
  const swaps = v4().gym.swaps || (v4().gym.swaps = {});
  if (altId === null) delete swaps[origId]; else swaps[origId] = altId;
  listSwapOpen = null;
  await commit();
  renderGym();
  if (altId === null) showToast('已換回原動作');
  else { const a = gymAlternatives(swapsData(), origId).find((x) => x.id === altId); showToast(a ? `已換成 ${a.name}` : '已更換動作'); }
}
/* 進行中的課換動作：寫對應表（下次開課沿用）、原地重建該動作（依備用動作查上次紀錄與漸進建議），
   再重畫課表。#rest 掛在 document.body，重畫課表碰不到它（2026-11-08 修復）；倒數照 deadline 繼續走。
   已完成的組數會被清掉，換之前先問一次。 */
async function swapExercise(ei, altId) {
  const d = draft(); if (!d) return;
  const ex = d.exercises[ei]; if (!ex) return;
  const origId = ex.swappedFrom || ex.id;
  const tpl = templateFor(d.label, gymData()).exercises.find((e) => e.id === origId);
  if (!tpl) return;
  const targetDiffers = altId === null ? !!ex.swappedFrom : altId !== ex.id;
  const doneCount = ex.sets.filter((s) => s.done).length;
  if (targetDiffers && doneCount > 0) {
    if (!confirm(`這個動作已經完成 ${doneCount} 組，換掉會清掉這些組數，確定要換嗎？`)) return;
  }
  const swaps = v4().gym.swaps || (v4().gym.swaps = {});
  if (altId === null) delete swaps[origId]; else swaps[origId] = altId;
  const resolved = resolveGymTemplate(tpl, swaps, swapsData());
  d.exercises[ei] = buildExercise(resolved, summary().sessions, d.type, rules());
  swapOpen = null;
  await commit();
  paintSession();
  showToast(altId === null ? `已換回${tpl.name}` : `已換成 ${resolved.name}`);
}
const draft = () => v4().gym.draft;

function openSession() {
  if (!draft()) return;
  swapOpen = null;
  $('session').hidden = false;
  paintSession();
  clearInterval(clockTimer);
  clockTimer = setInterval(() => { const el = $('ss-clock'); if (el && draft()) el.textContent = elapsed(); }, 1000);
  resumeRest();
}
function elapsed() { const d = draft(); const ms = now().getTime() - Date.parse(d.startedAt); const m = Math.max(0, Math.floor(ms / 60000)); return `${m} 分`; }
function closeSession() { swapOpen = null; clearInterval(clockTimer); suspendRest(); $('session').hidden = true; $('session').innerHTML = ''; }

function paintSession() {
  const d = draft();
  const exHtml = d.exercises.map((ex, ei) => {
    const v = videoFor(videosData(), ex.id);
    const origId = ex.swappedFrom || ex.id;
    const tplEx = templateFor(d.label, gymData()).exercises.find((e) => e.id === origId);
    const panel = swapOpen === ei ? swapPanelHtml(origId, ex.id, tplEx ? tplEx.name : ex.name) : '';
    return `<section class="card ex" data-ei="${ei}"><div class="ex-head">${thumbHtml(v, { label: `看 ${ex.name} 示範` })}<div style="flex:1;min-width:0"><p class="name">${esc(ex.name)}${ex.swappedFrom ? ' <span class="tag">已替換</span>' : ''}</p><p class="sub">${esc(ex.reps)} 下${ex.cue ? ` · ${esc(ex.cue)}` : ''}</p></div><button type="button" class="btn btn-sm swap-btn" data-swap="${ei}" aria-label="換 ${esc(ex.name)}">換動作</button></div>
      ${ex.suggestion ? `<p class="sugg">${esc(ex.suggestion)}</p>` : ''}${panel}
      <table class="sets"><thead><tr><th>組</th><th>上次</th><th>kg</th><th>次</th><th><span class="sr-only">完成</span>✓</th></tr></thead><tbody>
      ${ex.sets.map((s, si) => `<tr class="${s.done ? 'done' : ''}" data-si="${si}"><td class="num">${si + 1}</td><td class="prev num">${ex.last && ex.last[si] ? `${ex.last[si].weight}×${ex.last[si].reps}` : (ex.last && ex.last.length ? `${ex.last[ex.last.length - 1].weight}×${ex.last[ex.last.length - 1].reps}` : '—')}</td>
        <td><input type="number" inputmode="decimal" step="0.5" min="0" max="1000" value="${s.weight || ''}" placeholder="0" data-k="weight" aria-label="第 ${si + 1} 組重量"></td>
        <td><input type="number" inputmode="numeric" step="1" min="0" max="999" value="${s.reps || ''}" placeholder="0" data-k="reps" aria-label="第 ${si + 1} 組次數"></td>
        <td><button type="button" class="ok" aria-pressed="${s.done}" aria-label="第 ${si + 1} 組完成">${icon('check', { size: 20 })}</button></td></tr>`).join('')}
      </tbody></table><button type="button" class="btn btn-sm add-set" data-add="${ei}">${icon('plus', { size: 16 })}加一組</button></section>`;
  }).join('');
  $('session').innerHTML = `<div class="inner${swapOpen !== null ? ' swap-open' : ''}"><div class="bar"><button type="button" class="icon-btn" id="ss-exit" aria-label="先離開（會保留進度）">${icon('back')}</button><h2>${esc(d.label)}</h2><span class="timer num" id="ss-clock">${elapsed()}</span></div>
    ${exHtml}
    <button type="button" class="btn btn-primary gym" id="ss-finish">${icon('check', { size: 20 })}完成訓練</button>
    <p class="small" style="text-align:center;margin-top:12px">${esc(rules().progression.rule)}</p></div>`;
  $('ss-exit').onclick = () => { closeSession(); goTo('s-gym'); };
  $('ss-finish').onclick = finish;
  if (swapOpen !== null) { const p = $('session').querySelector('.swap-panel'); if (p) p.scrollIntoView({ block: 'nearest' }); }
  $('session').querySelectorAll('.ex').forEach((card) => {
    const ei = Number(card.dataset.ei);
    card.querySelector('[data-swap]').onclick = () => { swapOpen = swapOpen === ei ? null : ei; paintSession(); };
    const panel = card.querySelector('.swap-panel');
    if (panel) wireSwapPanel(panel, (altId) => swapExercise(ei, altId));
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
        if (s.done) await startRest(restSeconds(d.exercises[ei].kind, rules()));
      };
    });
    card.querySelector('[data-add]').onclick = async () => { const sets = d.exercises[ei].sets; if (sets.length >= 10) return; const last = sets[sets.length - 1]; sets.push({ weight: last ? last.weight : 0, reps: last ? last.reps : 0, done: false }); await commit(); paintSession(); };
  });
}

/* ---------- 休息計時 ----------
   2026-11-08 修復（組間休息倒數消失）：兩個根因。
   (1) #rest 原本是 #session 的子元素，paintSession() 整頁 innerHTML 重繪
       （「加一組」按鈕）會直接摧毀它，但 module 層的 rest.timer 還活著、
       paintRest() 對著不存在的元素空轉——倒數顯示消失，計時卻在背景跑。
       解法：#rest 是 position:fixed 的底部 bar，改掛在 document.body 下，
       課表重繪再也碰不到它。
   (2) closeSession()（「先離開」）直接 stopRest()，回來開課時休息狀態已死。
       解法：休息狀態以絕對期限（deadline）存在 draft.rest，離開只收起顯示、
       回來（openSession）按期限重建；期限到了才視為休息結束。
   倒數一律由 deadline 換算，不靠每秒 -1 累加：分頁隱藏時瀏覽器節流
   interval 也不會讓顯示落後真實時間。 */
function restLeft() { return rest ? Math.max(0, Math.ceil((rest.deadline - Date.now()) / 1000)) : 0; }
function persistRest() {
  const d = draft();
  if (!d || !rest) return Promise.resolve(false);
  d.rest = { deadline: rest.deadline, total: rest.total };
  return commit();
}
function clearPersistedRest() {
  const d = draft();
  if (d && d.rest) { delete d.rest; commit(); }
}
function renderRest() {
  if (!rest) return;
  let el = $('rest');
  if (!el) {
    el = document.createElement('div');
    el.className = 'rest'; el.id = 'rest'; el.setAttribute('role', 'timer');
    el.innerHTML = `<i class="prog"></i><div><div class="l">休息</div><div class="t num" id="rest-t">${fmt(rest.left)}</div></div><div style="display:flex;gap:8px"><button type="button" class="btn" id="rest-add">+30 秒</button><button type="button" class="btn" id="rest-skip">略過</button></div>`;
    document.body.appendChild(el);
    $('rest-add').onclick = () => {
      if (!rest) return;
      rest.deadline += 30000; rest.total += 30; rest.left = restLeft(); paintRest(); persistRest();
    };
    $('rest-skip').onclick = () => stopRest();
  }
  paintRest();
}
function tickRest() {
  if (!rest) return;
  rest.left = restLeft();
  if (rest.left <= 0) { stopRest(); beep(); return; }
  paintRest();
}
function startRest(sec) {
  stopRest();
  rest = { left: sec, total: sec, deadline: Date.now() + sec * 1000, timer: null };
  renderRest();
  const saved = persistRest();
  rest.timer = setInterval(tickRest, 1000);
  return saved;
}
/* 休息真正結束（略過／時間到／完成／放棄）：清掉顯示、計時與 draft 紀錄。 */
function stopRest() {
  if (rest && rest.timer) clearInterval(rest.timer);
  rest = null;
  const el = $('rest'); if (el) el.remove();
  clearPersistedRest();
}
/* 暫時離開課表（「先離開」）：只收起顯示與計時，draft.rest 留著，回來再續。 */
function suspendRest() {
  if (rest && rest.timer) clearInterval(rest.timer);
  rest = null;
  const el = $('rest'); if (el) el.remove();
}
/* 回到課表：draft.rest 期限還在就重建倒數；期限已過視為休息結束，不顯示。 */
function resumeRest() {
  const d = draft();
  const saved = d && d.rest;
  if (!saved || !Number.isFinite(saved.deadline) || saved.deadline <= Date.now()) {
    if (saved) clearPersistedRest();
    return false;
  }
  rest = { left: 0, total: saved.total, deadline: saved.deadline, timer: null };
  rest.left = restLeft();
  if (rest.left <= 0) { rest = null; clearPersistedRest(); return false; }
  renderRest();
  rest.timer = setInterval(tickRest, 1000);
  return true;
}
function paintRest() { if (!rest) return; const t = $('rest-t'); if (t) t.textContent = fmt(rest.left); const p = $('rest') && $('rest').querySelector('.prog'); if (p) p.style.setProperty('--p', (rest.left / rest.total).toFixed(3)); }
const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
function beep() {
  if (v4().settings.sound === false) return;
  try { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; const ac = beep.ac || (beep.ac = new AC()); const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = 660; g.gain.value = .1; o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + .25); } catch { /* 沒聲音也沒關係 */ }
}

/* ---------- 完成 ---------- */
async function finish() {
  const d = draft(), R = rules();
  const r = sessionResult(d, R);
  if (r.result === 'none') { showToast('還沒有勾選任何一組。勾選完成的組數再按完成。'); return; }
  const before = summary();
  const session = { ...d, finishedAt: isoLocal(now()), exercises: d.exercises.map((ex) => ({ id: ex.id, name: ex.name, kind: ex.kind, sets: ex.sets.map((s) => ({ weight: s.weight, reps: s.reps, done: s.done })) })) };
  delete session.type;
  delete session.rest; // 休息是進行中的草稿狀態，完成的課不帶它
  addGymSession(v4(), session);
  await commit();
  const after = summary();
  const newPrs = after.prs.filter((p) => p.sessionId === session.id);
  const xp = after.xp.total - before.xp.total;
  const bonusLines = after.xp.events.filter((e) => e.date === session.date && e.kind !== 'gym' && e.kind !== 'pr' && !before.xp.events.some((b) => b.date === e.date && b.kind === e.kind && b.habit === e.habit)).map((e) => `${e.label} +${e.xp}`);
  closeSession();
  const sh = $('sheet');
  sh.innerHTML = `<div class="panel summary" role="dialog" aria-modal="true" aria-labelledby="gs-t"><div class="grab"></div><h3 class="card-title" id="gs-t">${esc(session.label)} 完成</h3><div class="big num" style="color:var(--gym-ink)">+${xp} XP</div>${bonusLines.length ? `<p class="small" style="margin:-6px 0 10px">含 ${esc(bonusLines.join('、'))}</p>` : ''}
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
