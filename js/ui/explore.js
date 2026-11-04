/* Daily Ten — 探索：本週一件新事物。任務池 data/explore.json；本週任務存 v4.explore.current；洗牌不重複；完成給 1–5 興趣分與一句話。 */
import { $, esc } from './dom.js';
import { icon } from './icons.js';
import { goTo } from './nav.js';
import { summary, rules, explorePool, v4, commit, now } from './model.js';
import { pickTask, taskById } from '../game/explore.js';
import { logExplore, removeExplore } from '../state/v4.js';
import { gameDay, weekStartOf } from '../game/core.js';
import { isoLocal } from '../state/time.js';
import { showToast, undoMs } from './toast.js';
import { confetti } from './celebrate.js';

function currentTask() {
  const ex = v4().explore, pool = explorePool();
  const ws = weekStartOf(gameDay(now(), rules()), rules());
  if (ex.current && ex.current.weekStart === ws && taskById(pool, ex.current.taskId)) return taskById(pool, ex.current.taskId);
  const t = pickTask(pool, ex.log, ex.skipped, ex.current ? ex.current.taskId : null);
  if (!t) return null;
  ex.current = { taskId: t.id, weekStart: ws, pickedAt: isoLocal(now()) };
  commit();
  return t;
}
function taskCard(t, done) {
  return `<section class="card" style="border-top:4px solid var(--explore)"><div class="card-head"><span class="tag explore">${esc(t.category)}</span><span class="tag">${esc(t.place)} · ${esc(t.time)} · ${esc(t.cost)}</span></div>
    <h2 style="margin:0 0 10px;font-size:var(--fs-xl);font-weight:900">${esc(t.title)}</h2>
    <p style="margin:0 0 6px"><b>兩分鐘版本：</b>${esc(t.twoMinute)}</p>
    <p style="margin:0 0 6px"><b>完成條件：</b>${esc(t.finish)}</p>
    <p class="small" style="margin:0 0 14px">${esc(t.hint)}</p>
    ${done ? '' : `<button type="button" class="btn btn-primary explore" id="ex-done">${icon('check', { size: 20 })}完成了 <span class="sub">+${rules().habits.explore.xp.complete} XP</span></button>
    <div class="btn-row"><button type="button" class="btn btn-secondary" id="ex-shuffle">${icon('shuffle', { size: 18 })}換一個</button></div>`}
  </section>`;
}
export function renderExplore() {
  const sum = summary(), w = sum.week.explore, ex = v4().explore;
  const t = currentTask();
  const log = [...ex.log].sort((a, b) => (a.date < b.date ? 1 : -1));
  const head = `<section class="card flat" style="display:flex;justify-content:space-between;align-items:center"><span>本週 <b class="num">${w.count}/${w.target}</b>${w.count >= w.target ? ' · 已達標' : ''}</span><span class="small">試過 ${log.length} 件 · ${new Set(log.map((e) => e.category).filter(Boolean)).size} 類</span></section>`;
  const body = t ? taskCard(t, false) : '<section class="card"><p>任務池用完了。</p></section>';
  const hist = log.length ? `<h3 class="section-title">試過的新事物</h3><section class="card"><div class="list">${log.slice(0, 30).map((e) => `<div class="row"><div class="body"><p class="t">${esc(e.title || e.taskId)}</p><p class="s">${esc(e.date)}${e.category ? ` · ${esc(e.category)}` : ''}${e.note ? ` · ${esc(e.note)}` : ''}</p></div><div class="r" style="color:var(--explore-ink)">${e.interest ? '★'.repeat(e.interest) : ''}</div></div>`).join('')}</div></section>` : '';
  $('explore-body').innerHTML = head + body + hist;
  if ($('ex-shuffle')) $('ex-shuffle').onclick = async () => { const n = pickTask(explorePool(), ex.log, ex.skipped, t.id); ex.current = { taskId: n.id, weekStart: weekStartOf(gameDay(now(), rules()), rules()), pickedAt: isoLocal(now()) }; await commit(); renderExplore(); };
  if ($('ex-done')) $('ex-done').onclick = () => openDone(t);
}
function openDone(t) {
  let stars = 0;
  const sh = $('sheet');
  sh.innerHTML = `<div class="panel" role="dialog" aria-modal="true" aria-labelledby="ex-sheet-t"><div class="grab"></div><h3 class="card-title" id="ex-sheet-t">${esc(t.title)}</h3><p class="small">有多有趣？1 顆＝算了，5 顆＝還想再做。</p>
    <div class="stars" role="group" aria-label="興趣分">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-n="${n}" aria-pressed="false" aria-label="${n} 分">★</button>`).join('')}</div>
    <div class="field" style="margin-top:12px"><label for="ex-note">一句話（選填）</label><input type="text" id="ex-note" maxlength="120" placeholder="例：比想像中難，但很好玩"></div>
    <div class="btn-row"><button type="button" class="btn" id="ex-cancel">取消</button><button type="button" class="btn btn-primary explore" id="ex-save" style="width:auto" disabled>記錄完成</button></div></div>`;
  sh.hidden = false;
  sh.querySelectorAll('.stars button').forEach((b) => { b.onclick = () => { stars = Number(b.dataset.n); sh.querySelectorAll('.stars button').forEach((x) => x.setAttribute('aria-pressed', String(Number(x.dataset.n) <= stars))); $('ex-save').disabled = false; }; });
  $('ex-cancel').onclick = () => { sh.hidden = true; sh.innerHTML = ''; };
  sh.onclick = (e) => { if (e.target === sh) $('ex-cancel').onclick(); };
  $('ex-save').onclick = async () => {
    const R = rules(), at = isoLocal(now());
    const entry = { date: gameDay(now(), R), taskId: t.id, title: t.title, category: t.category, interest: stars, note: $('ex-note').value.trim(), at };
    logExplore(v4(), entry);
    sh.hidden = true; sh.innerHTML = '';
    await commit();
    showToast(`探索完成 +${R.habits.explore.xp.complete} XP`, { ms: undoMs(), action: { label: '復原', run: async () => { removeExplore(v4(), at); v4().explore.current = { taskId: t.id, weekStart: weekStartOf(entry.date, R), pickedAt: at }; await commit(); goTo('s-home'); } } });
    goTo('s-home');
    confetti(1200);
  };
}
