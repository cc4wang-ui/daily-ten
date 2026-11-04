/* Daily Ten — 晨間伸展：15 分鐘完整版（8 項）／5 分鐘短版（5 項）。清單每項有示範 Short 與文字口令。
   引導模式（#guide）：大倒數、項目名、口令、縮圖、進度條；時間到自動下一項；有換邊的項目在一半時提示；可暫停／略過／離開。
   完成（或直接標記完成）→ logStretch → 10 秒內可復原 → 回今日。 */
import { $, esc } from './dom.js';
import { icon } from './icons.js';
import { goTo } from './nav.js';
import { summary, rules, stretchData, videosData, v4, commit, now } from './model.js';
import { logStretch, removeStretch } from '../state/v4.js';
import { showToast, undoMs } from './toast.js';
import { videoFor, thumbHtml, linkHtml } from './videos.js';
import { gameDay } from '../game/core.js';
import { confetti } from './celebrate.js';

let run = null; // {items, idx, left, total, timer, paused, variant, startedAt}
export function guideOpen() { return !!run; }

const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const itemsFor = (variant) => stretchData().items.filter((it) => (variant === 'full' ? it.full : it.short) > 0).map((it) => ({ ...it, seconds: variant === 'full' ? it.full : it.short }));

export function renderStretch() {
  const sum = summary(), R = rules(), t = sum.today.stretch, w = sum.week.stretch;
  const full = itemsFor('full'), short = itemsFor('short');
  const status = t.done
    ? `<section class="card" style="background:var(--stretch-soft)"><div class="card-head"><h3 class="card-title" style="color:var(--stretch-ink)">今天完成了</h3><span class="tag stretch">+${t.variant === 'full' ? R.habits.stretch.xp.full : R.habits.stretch.xp.short} XP</span></div><p class="small" style="margin:0">${t.variant === 'full' ? `${R.stretch.fullMinutes} 分鐘完整版` : `${R.stretch.shortMinutes} 分鐘短版`} · 本週 ${w.count}/${w.target} 天${t.variant === 'short' ? ` · 想補完整版也可以，會改記成 ${R.habits.stretch.xp.full} XP` : ''}</p></section>`
    : `<section class="card"><div class="card-head"><h3 class="card-title">今天還沒伸展</h3><span class="tag">本週 ${w.count}/${w.target}</span></div>
      <button type="button" class="btn btn-primary stretch" id="st-start-full">${icon('play', { size: 20 })}開始 ${R.stretch.fullMinutes} 分鐘 <span class="sub">+${R.habits.stretch.xp.full} XP</span></button>
      <div class="btn-row"><button type="button" class="btn btn-secondary" id="st-start-short">${R.stretch.shortMinutes} 分鐘短版 · +${R.habits.stretch.xp.short} XP</button></div>
      <p class="small" style="margin:12px 0 0;text-align:center"><button type="button" class="link-btn" id="st-mark-full">已經做完了，直接記錄 ${R.stretch.fullMinutes} 分鐘</button></p></section>`;
  const list = `<h3 class="section-title">完整版 ${R.stretch.fullMinutes} 分鐘 · ${full.length} 項</h3><section class="card"><div class="list">${full.map((it, i) => rowHtml(it, i)).join('')}</div></section>
    <h3 class="section-title">短版 ${R.stretch.shortMinutes} 分鐘 · ${short.length} 項</h3><section class="card"><p class="small" style="margin:0">${short.map((it) => `${esc(it.name)} ${fmt(it.seconds)}`).join(' · ')}</p></section>
    <p class="small" style="text-align:center">示範影片是 YouTube 上該動作觀看數最高的教學 Short，會在 YouTube 開啟。沒有網路時照文字口令做。</p>`;
  $('stretch-body').innerHTML = status + list;
  if ($('st-start-full')) $('st-start-full').onclick = () => startGuide('full');
  if ($('st-start-short')) $('st-start-short').onclick = () => startGuide('short');
  if ($('st-mark-full')) $('st-mark-full').onclick = () => finish('full', 0, true);
}
function rowHtml(it, i) {
  const v = videoFor(videosData(), it.id);
  return `<div class="row">${thumbHtml(v, { label: `看 ${it.name} 示範` })}<div class="body"><p class="t">${i + 1}. ${esc(it.name)}${it.sides ? ' <span class="tag">左右</span>' : ''}</p><p class="s">${esc(it.cue)}</p>${v ? `<p class="s" style="margin-top:6px">${linkHtml(v)}</p>` : ''}</div><div class="r num">${fmt(it.seconds)}</div></div>`;
}

/* ---------- 引導 ---------- */
function startGuide(variant) {
  const items = itemsFor(variant);
  run = { items, idx: 0, left: items[0].seconds, total: items.reduce((a, b) => a + b.seconds, 0), elapsed: 0, timer: null, paused: false, variant, startedAt: now(), sideSaid: false };
  $('guide').hidden = false;
  paint();
  run.timer = setInterval(tick, 1000);
}
function paint() {
  const it = run.items[run.idx], v = videoFor(videosData(), it.id), next = run.items[run.idx + 1];
  const half = it.sides && run.left <= Math.ceil(it.seconds / 2);
  $('guide').innerHTML = `<div class="inner guide"><div class="bar"><button type="button" class="icon-btn" id="g-exit" aria-label="離開">${icon('close')}</button><span class="timer num">剩 ${fmt(Math.max(0, run.total - run.elapsed))}</span><span style="width:44px"></span></div>
    <div class="ringbar" aria-hidden="true"><i style="--p:${(run.elapsed / run.total).toFixed(3)}"></i></div>
    <p class="step">第 ${run.idx + 1} / ${run.items.length} 項${it.sides ? (half ? ' · 換邊' : ' · 第一邊') : ''}</p>
    <h2>${esc(it.name)}</h2>
    ${thumbHtml(v, { cls: 'thumb', label: `看 ${it.name} 示範` })}
    <div class="count num${half ? ' side' : ''}" aria-live="off">${fmt(run.left)}</div>
    <p class="cue">${esc(it.cue)}</p>
    <p class="next">${next ? `下一項：${esc(next.name)} ${fmt(next.seconds)}` : '最後一項'}</p>
    <div class="btn-row"><button type="button" class="btn" id="g-pause">${icon(run.paused ? 'play' : 'pause', { size: 20 })}${run.paused ? '繼續' : '暫停'}</button><button type="button" class="btn" id="g-skip">${icon('skip', { size: 20 })}下一項</button></div>
    <p class="small" style="margin-top:16px"><button type="button" class="link-btn" id="g-done-now">全部做完了，直接記錄</button></p></div>`;
  $('g-exit').onclick = exit;
  $('g-pause').onclick = () => { run.paused = !run.paused; paint(); };
  $('g-skip').onclick = () => advance();
  $('g-done-now').onclick = () => finish(run.variant, run.elapsed, false);
}
function tick() {
  if (!run || run.paused) return;
  run.left -= 1; run.elapsed += 1;
  const it = run.items[run.idx];
  if (it.sides && !run.sideSaid && run.left <= Math.ceil(it.seconds / 2)) { run.sideSaid = true; beep(2); }
  if (run.left <= 0) { advance(); return; }
  const c = $('guide').querySelector('.count');
  if (c) { c.textContent = fmt(run.left); c.classList.toggle('side', !!(it.sides && run.left <= Math.ceil(it.seconds / 2))); }
  const bar = $('guide').querySelector('.ringbar i'); if (bar) bar.style.setProperty('--p', (run.elapsed / run.total).toFixed(3));
  const tm = $('guide').querySelector('.timer'); if (tm) tm.textContent = `剩 ${fmt(Math.max(0, run.total - run.elapsed))}`;
  const st = $('guide').querySelector('.step'); if (st) st.textContent = `第 ${run.idx + 1} / ${run.items.length} 項${it.sides ? (run.left <= Math.ceil(it.seconds / 2) ? ' · 換邊' : ' · 第一邊') : ''}`;
}
function advance() {
  run.elapsed += Math.max(0, run.left); run.left = 0;
  if (run.idx + 1 >= run.items.length) { finish(run.variant, run.elapsed, false); return; }
  run.idx += 1; run.left = run.items[run.idx].seconds; run.sideSaid = false; beep(1); paint();
}
function exit() { stop(); goTo('s-stretch'); }
function stop() { if (run && run.timer) clearInterval(run.timer); run = null; $('guide').hidden = true; $('guide').innerHTML = ''; }
function beep(times) {
  if (v4().settings.sound === false) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ac = beep.ac || (beep.ac = new AC());
    for (let i = 0; i < times; i++) { const o = ac.createOscillator(), g = ac.createGain(); o.frequency.value = 880; g.gain.value = .08; o.connect(g); g.connect(ac.destination); const t = ac.currentTime + i * .18; o.start(t); o.stop(t + .12); }
  } catch (e) { /* 沒聲音也沒關係 */ }
}
async function finish(variant, seconds, direct) {
  const R = rules();
  const date = gameDay(now(), R);
  const prev = v4().stretch.log.find((e) => e && e.date === date);
  const before = prev ? { ...prev } : null;
  logStretch(v4(), { date, variant, now: now(), seconds });
  stop();
  await commit();
  const xp = variant === 'full' ? R.habits.stretch.xp.full : R.habits.stretch.xp.short;
  showToast(`伸展完成 +${xp} XP`, { ms: undoMs(), action: { label: '復原', run: async () => { if (before) { removeStretch(v4(), date); v4().stretch.log.push(before); } else removeStretch(v4(), date); await commit(); goTo('s-home'); } } });
  goTo('s-home');
  if (!direct) confetti(1200);
}
