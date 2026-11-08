/* Daily Ten — 晨間伸展：15 分鐘完整版（8 項）／5 分鐘短版（5 項）。清單每項有示範 Short 與文字口令。
   引導模式（#guide）：大倒數、項目名、口令、縮圖、進度條；時間到自動下一項；有換邊的項目在一半時提示；可暫停／略過／離開。
   完成（或直接標記完成）→ logStretch → 10 秒內可復原 → 回今日。 */
import { $, esc } from './dom.js';
import { icon } from './icons.js';
import { goTo } from './nav.js';
import { summary, rules, stretchData, videosData, swapsData, v4, commit, now } from './model.js';
import { stretchAlternatives, resolveStretchItem } from '../game/swap.js';
import { logStretch, removeStretch } from '../state/v4.js';
import { showToast, undoMs } from './toast.js';
import { videoFor, thumbHtml, linkHtml } from './videos.js';
import { gameDay } from '../game/core.js';
import { confetti } from './celebrate.js';

let run = null; // {items, idx, left, total, timer, paused, variant, startedAt, itemDeadline, endDeadline, pausedAt}
let listSwapOpen = null; // 清單頁：哪個原項目的備用清單打開中（原項目 id）
let guideSwapOpen = false; // 引導中：備用清單是否打開
export function guideOpen() { return !!run; }

const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
/* 備用沿用原項目的秒數（總時間與 XP 不變）；對應表在 v4().stretch.swaps。 */
const itemsFor = (variant) => stretchData().items.filter((it) => (variant === 'full' ? it.full : it.short) > 0).map((it) => { const r = resolveStretchItem(it, v4().stretch.swaps || {}, swapsData()); return { ...r, seconds: variant === 'full' ? r.full : r.short }; });

/* 換伸展備用清單（清單頁與引導共用）：原項目的備用＋換回原項目。 */
function stretchPanelHtml(origId, currentId, origName) {
  const alts = stretchAlternatives(swapsData(), origId);
  const restore = currentId !== origId ? `<button type="button" class="btn swap-opt" data-restore="1"><span class="swap-name">換回原項目：${esc(origName)}</span></button>` : '';
  return `<div class="swap-panel"><p class="swap-title">換成備用伸展（同一部位）</p>${restore}${alts.map((a) => `<button type="button" class="btn swap-opt" data-alt="${esc(a.id)}"${a.id === currentId ? ' disabled' : ''}><span class="swap-name">${esc(a.name)}${a.id === currentId ? '（目前）' : ''}${a.sides ? ' · 左右' : ''}</span><span class="swap-cue">${esc(a.cue)}</span></button>`).join('')}</div>`;
}
function wireStretchPanel(scope, onPick) {
  scope.querySelectorAll('.swap-opt[data-alt]').forEach((b) => { b.onclick = () => onPick(b.dataset.alt); });
  scope.querySelectorAll('.swap-opt[data-restore]').forEach((b) => { b.onclick = () => onPick(null); });
}
async function swapStretchItem(origId, altId) {
  const swaps = v4().stretch.swaps || (v4().stretch.swaps = {});
  if (altId === null) delete swaps[origId]; else swaps[origId] = altId;
  listSwapOpen = null;
  await commit();
  renderStretch();
  if (altId === null) showToast('已換回原項目');
  else { const a = stretchAlternatives(swapsData(), origId).find((x) => x.id === altId); showToast(a ? `已換成 ${a.name}` : '已更換項目'); }
}
/* 全部換回：一次清掉健身房＋伸展的全部對應表（見 gym.js 同名函式；伸展頁的按鈕與健身房頁共用同一動作）。 */
async function resetAllSwaps() {
  const g = Object.keys(v4().gym.swaps || {}).length;
  const s = Object.keys(v4().stretch.swaps || {}).length;
  if (g + s === 0) return;
  if (!confirm(`確定要把全部換動作換回原動作嗎？（健身房 ${g} 項、伸展 ${s} 項）`)) return;
  v4().gym.swaps = {};
  v4().stretch.swaps = {};
  listSwapOpen = null;
  await commit();
  renderStretch();
  showToast('已全部換回原動作');
}

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
  const swapCount = Object.keys(v4().gym.swaps || {}).length + Object.keys(v4().stretch.swaps || {}).length;
  const resetAll = swapCount > 0 ? `<p style="text-align:center;margin:12px 0 0"><button type="button" class="btn btn-secondary" id="st-reset-swaps">全部換回原動作（${swapCount} 項已換）</button></p>` : '';
  $('stretch-body').innerHTML = status + list + resetAll;
  if ($('st-start-full')) $('st-start-full').onclick = () => startGuide('full');
  if ($('st-start-short')) $('st-start-short').onclick = () => startGuide('short');
  if ($('st-mark-full')) $('st-mark-full').onclick = () => finish('full', 0, true);
  $('stretch-body').querySelectorAll('[data-st-swap]').forEach((b) => { b.onclick = () => { listSwapOpen = listSwapOpen === b.dataset.stSwap ? null : b.dataset.stSwap; renderStretch(); }; });
  const lp = $('stretch-body').querySelector('.swap-panel');
  if (lp && listSwapOpen) wireStretchPanel(lp, (altId) => swapStretchItem(listSwapOpen, altId));
  if ($('st-reset-swaps')) $('st-reset-swaps').onclick = () => resetAllSwaps();
}
function rowHtml(it, i) {
  const v = videoFor(videosData(), it.id), v2 = it.video2 ? videoFor(videosData(), it.video2) : null;
  const origId = it.swappedFrom || it.id;
  const orig = stretchData().items.find((x) => x.id === origId);
  const panel = listSwapOpen === origId ? stretchPanelHtml(origId, it.id, orig ? orig.name : it.name) : '';
  return `<div class="row">${thumbHtml(v, { label: `看 ${it.name} 示範` })}<div class="body"><p class="t">${i + 1}. ${esc(it.name)}${it.sides ? ' <span class="tag">左右</span>' : ''}${it.swappedFrom ? ' <span class="tag">已替換</span>' : ''}</p><p class="s">${esc(it.cue)}</p>${v ? `<p class="s" style="margin-top:6px">${linkHtml(v, v2 ? '兒童式示範' : '看示範 Short')}${v2 ? ` ${linkHtml(v2, '下犬式示範')}` : ''}</p>` : ''}</div><div class="r num">${fmt(it.seconds)}</div><button type="button" class="btn btn-sm swap-btn" data-st-swap="${esc(origId)}" aria-label="換 ${esc(it.name)}">換</button></div>${panel}`;
}

/* ---------- 引導 ----------
   倒數一律由 deadline 換算（2026-11-08 S1：與健身房休息同一招，取代每秒 -1 累加；
   分頁隱藏被節流也不會落後真實時間）。暫停時期限凍結，繼續時往後移暫停的秒數。
   不變量（B1 修復，2026-11-09）：left／elapsed 永遠等於「deadline 對上有效現在時間」，
   有效現在時間＝暫停時是 pausedAt，否則是 Date.now()。syncRun() 不再因暫停提早 return，
   tick() 仍在暫停時提早 return；advance() 設新期限也用有效現在時間——暫停中略過時
   若用真實現在時間，新項目的期限會被往後推，等恢復後就多算暫停等待的秒數。 */
const effectiveNow = () => (run && run.paused && run.pausedAt != null ? run.pausedAt : Date.now());
function syncRun() {
  if (!run) return;
  const t = effectiveNow();
  run.left = Math.max(0, Math.ceil((run.itemDeadline - t) / 1000));
  run.elapsed = run.total - Math.max(0, Math.ceil((run.endDeadline - t) / 1000));
}
function startGuide(variant) {
  const items = itemsFor(variant);
  const total = items.reduce((a, b) => a + b.seconds, 0);
  const t0 = Date.now();
  run = { items, idx: 0, left: items[0].seconds, total, elapsed: 0, timer: null, paused: false, variant, startedAt: now(), sideSaid: false, itemDeadline: t0 + items[0].seconds * 1000, endDeadline: t0 + total * 1000, pausedAt: null };
  guideSwapOpen = false;
  $('guide').hidden = false;
  paint();
  run.timer = setInterval(tick, 1000);
}
function paint() {
  syncRun();
  const it = run.items[run.idx], v = videoFor(videosData(), it.id), next = run.items[run.idx + 1];
  const origId = it.swappedFrom || it.id;
  const orig = stretchData().items.find((x) => x.id === origId);
  const panel = guideSwapOpen ? stretchPanelHtml(origId, it.id, orig ? orig.name : it.name) : '';
  const half = it.sides && run.left <= Math.ceil(it.seconds / 2);
  $('guide').innerHTML = `<div class="inner guide"><div class="bar"><button type="button" class="icon-btn" id="g-exit" aria-label="離開">${icon('close')}</button><span class="timer num">剩 ${fmt(Math.max(0, run.total - run.elapsed))}</span><span style="width:44px"></span></div>
    <div class="ringbar" aria-hidden="true"><i style="--p:${(run.elapsed / run.total).toFixed(3)}"></i></div>
    <p class="step">第 ${run.idx + 1} / ${run.items.length} 項${it.sides ? (half ? ' · 換邊' : ' · 第一邊') : ''}</p>
    <h2>${esc(it.name)}</h2>
    ${thumbHtml(v, { cls: 'thumb', label: `看 ${it.name} 示範` })}
    <div class="count num${half ? ' side' : ''}" aria-live="off">${fmt(run.left)}</div>
    <p class="cue">${esc(it.cue)}</p>
    <p class="next">${next ? `下一項：${esc(next.name)} ${fmt(next.seconds)}` : '最後一項'}</p>
    <div class="btn-row"><button type="button" class="btn" id="g-pause">${icon(run.paused ? 'play' : 'pause', { size: 20 })}${run.paused ? '繼續' : '暫停'}</button><button type="button" class="btn" id="g-skip">${icon('skip', { size: 20 })}下一項</button><button type="button" class="btn" id="g-swap">換動作</button></div>
    ${panel}
    <p class="small" style="margin-top:16px"><button type="button" class="link-btn" id="g-done-now">全部做完了，直接記錄</button></p></div>`;
  $('g-exit').onclick = exit;
  $('g-pause').onclick = () => {
    if (!run.paused) { run.paused = true; run.pausedAt = Date.now(); }
    else { const dt = Date.now() - (run.pausedAt || Date.now()); run.itemDeadline += dt; run.endDeadline += dt; run.pausedAt = null; run.paused = false; syncRun(); }
    paint();
  };
  $('g-skip').onclick = () => advance();
  $('g-swap').onclick = () => { guideSwapOpen = !guideSwapOpen; paint(); };
  const gp = $('guide').querySelector('.swap-panel');
  if (gp) wireStretchPanel(gp, (altId) => swapGuideItem(altId));
  $('g-done-now').onclick = () => finish(run.variant, run.elapsed, false);
}
/* 引導中換動作：只換「做什麼」，不換「做多久」——目前這一項的剩餘秒數與總期限都不動；
   對應表寫進 state（下次引導沿用），目前這一項原地換掉。 */
async function swapGuideItem(altId) {
  const it = run.items[run.idx];
  const origId = it.swappedFrom || it.id;
  const swaps = v4().stretch.swaps || (v4().stretch.swaps = {});
  if (altId === null) delete swaps[origId]; else swaps[origId] = altId;
  await commit();
  const orig = stretchData().items.find((x) => x.id === origId);
  if (!orig) return;
  const resolved = resolveStretchItem(orig, swaps, swapsData());
  run.items[run.idx] = { ...resolved, seconds: it.seconds };
  run.sideSaid = false;
  guideSwapOpen = false;
  paint();
  showToast(altId === null ? `已換回${orig.name}` : `已換成 ${resolved.name}`);
}
function tick() {
  if (!run || run.paused) return;
  syncRun();
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
  syncRun();
  for (;;) {
    const skipped = run.left > 0;
    if (skipped) run.endDeadline -= run.left * 1000; // 跳過：把剩下的秒數從總時間扣掉（舊行為：elapsed += left）
    if (run.idx + 1 >= run.items.length) { syncRun(); finish(run.variant, run.elapsed, false); return; }
    const prevDeadline = run.itemDeadline;
    run.idx += 1;
    // 下一項的期限：跳過＝從有效現在開始算；自然結束＝接著上一項的期限（分頁隱藏一次跳過多項時連鎖推進，不會超時）。
    run.itemDeadline = skipped ? effectiveNow() + run.items[run.idx].seconds * 1000 : prevDeadline + run.items[run.idx].seconds * 1000;
    run.sideSaid = false; guideSwapOpen = false;
    syncRun();
    if (run.left > 0) break; // 新項目期限還在：停下來等它；已過：繼續推進
  }
  beep(1); paint();
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
