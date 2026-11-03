/* Daily Ten — Phase 1 健身房面板（js/ui/home.js 呼叫 renderPhase1Panel(rerender)）
   注意：本面板不改 engine 的 XP／等級／Perfect Day，不寫 session。
   - 「儲存本課」只寫 state.phase1.gymSets（重量／次數）與新 PR（mode gym），不計 XP；
     完成整課、推進順序仍按 Phase 0 的「完成健身房課」按鈕（寫 session full＋gymLog）。
   - 疼痛：當天 phase0.pain 有該動作時，該列停用、進步暫停（沿用 Phase 0 旗標）。
   - Plan 區只能改建議日與同肌群互換；沒有改組數／動作庫的輸入，守門由 js/game/phase1.js 執行。
   - 組間計時器可暫停／繼續：暫停時不扣秒（tickRest），不是無法暫停的倒數。
   - 模板仍是草案，教練簽核為外部未完成項；A/B 目前內容相同。 */
import { getState, saveState } from '../state/store.js';
import { $ } from './dom.js';
import { todayKey } from './game.js';
import { showToast } from './toast.js';
import { parsePhase0, nextGym } from '../game/phase0.js';
import {
  parsePhase1, templateForLabel, templateSets, lastSetsFor, prefillSets,
  progressionSuggestion, restSeconds, tickRest, formatRest,
  isNewPr, combinedPrList, prsByMode, weekGymAdherence,
  MUSCLE_GROUPS, groupOf, canSwap, applyPlanChange, progressionHeld,
  PHASE1_BOUNDARY,
} from '../game/phase1.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ensure = (st) => { if (!st.phase1 || typeof st.phase1 !== 'object' || Array.isArray(st.phase1)) st.phase1 = {}; return st.phase1; };
const save = () => { try { saveState(); } catch (e) { /* 儲存失敗時畫面仍顯示當次操作 */ } };
const DOW = ['日', '一', '二', '三', '四', '五', '六'];

/* 組間計時器狀態（模組內，不進 state、不進 XP）：暫停時 tick 不扣秒。 */
const timer = { totalMs: restSeconds('compound') * 1000, remainingMs: restSeconds('compound') * 1000, running: false, paused: false, kind: 'compound' };
let timerInterval = null;
function timerDisplay() {
  const el = $('p1-timer-show');
  if (el) el.textContent = formatRest(timer.remainingMs) + (timer.paused ? '（已暫停）' : timer.running ? '（計時中）' : '');
}
function ensureTimerInterval() {
  if (timerInterval) return;
  timerInterval = setInterval(() => {
    if (!timer.running || timer.paused) return;
    timer.remainingMs = tickRest(timer.remainingMs, 250, false);
    if (timer.remainingMs <= 0) { timer.running = false; try { showToast('組間休息結束'); } catch (e) { /* toast 失敗不影響計時 */ } }
    timerDisplay();
  }, 250);
}

function displayTemplate(tpl, swap) {
  if (!swap) return tpl;
  // 互換＝位置對調：from 格位顯示 to，to 格位顯示 from，不產生重複動作。
  return tpl.map((e) => {
    if (e.name === swap.from) return { ...e, name: swap.to, swappedFrom: swap.from };
    if (e.name === swap.to) return { ...e, name: swap.from, swappedFrom: swap.to };
    return e;
  });
}

export function renderPhase1Panel(rerender) {
  const host = $('p1');
  if (!host) return;
  const st = getState();
  if (!st) { host.hidden = true; return; }
  host.hidden = false;
  const today = todayKey();
  const p0 = parsePhase0(st);
  const p1 = parsePhase1(st);
  const gym = nextGym(p0, today);
  const tpl = templateForLabel(gym.label);
  const swap = p1.plan.swaps[gym.label] || null;
  const shown = displayTemplate(tpl.template, swap);
  const adh = weekGymAdherence(p0, today);
  const held = new Set(p0.pain.filter((x) => x.date === today).map((x) => x.exercise));
  const combined = combinedPrList(st, p1);
  const gymPrs = prsByMode(combined, 'gym').slice(-10).reverse();
  const homePrs = prsByMode(combined, 'home').slice(-10).reverse();
  const prLine = (p) => `<div class="prline"><span>${esc(p.date)}</span> ${esc(p.exercise)} <b class="num">${esc(String(p.value))}${p.kind === 'weight' ? ' kg' : p.kind === 'time' ? ' 秒' : ' 下'}</b></div>`;

  const exerciseRows = shown.map((e, ei) => {
    const last = lastSetsFor(p1.gymSets, e.name, today);
    const pre = prefillSets(e, last);
    const isHeld = held.has(e.name);
    const setFields = pre.map((s, si) => `
      <span class="p1-set" data-set="${si}"><input type="number" class="p1-w" data-ex="${ei}" data-set="${si}" min="0" step="0.5" inputmode="decimal" placeholder="重量 kg" value="${s.weight === null ? '' : esc(String(s.weight))}" ${isHeld ? 'disabled' : ''} aria-label="${esc(e.name)}第${si + 1}組重量"> kg
      <input type="number" class="p1-r" data-ex="${ei}" data-set="${si}" min="1" max="999" inputmode="numeric" placeholder="次數" value="${s.reps === null ? '' : esc(String(s.reps))}" ${isHeld ? 'disabled' : ''} aria-label="${esc(e.name)}第${si + 1}組次數"> 下</span>`).join(' ');
    return `<li class="p1-ex" data-ex="${ei}" data-kind="${esc(e.kind)}" data-body="${tpl.type === 'upper' ? 'upper' : 'lower'}" data-name="${esc(e.name)}">
      <b>${esc(e.name)}${e.swappedFrom ? `（由 ${esc(e.swappedFrom)} 互換）` : ''}</b> · ${esc(String(e.sets))} 組 · ${esc(e.rep)} 下
      ${isHeld ? '<span class="p1-held-note">疼痛，今日停用、進步暫停</span>' : ''}
      <span class="p1-sets">${setFields}</span>
      ${templateSets(e).max > templateSets(e).min ? `<button type="button" class="btn-sub p1-addset" data-ex="${ei}">＋1 組</button><button type="button" class="btn-sub p1-rmset" data-ex="${ei}">－1 組</button>` : ''}
      <label class="p1-good"><input type="checkbox" class="p1-form" data-ex="${ei}" checked ${isHeld ? 'disabled' : ''}> 動作順暢、保留 1–2 下餘力</label>
      <span class="p1-sug small" data-sug="${ei}">${isHeld ? '疼痛：今日該動作停用、進步暫停' : last ? `上次：${last.map((s) => `${s.weight} kg × ${s.reps}`).join('、')}（已預填，可直接改數字）` : '尚無上次紀錄，填入數字即可開始'}</span>
    </li>`;
  }).join('');

  const swapOptions = (label) => {
    const t = templateForLabel(label);
    const cur = p1.plan.swaps[label] || null;
    const fromVal = cur ? cur.from : t.template[0].name;
    const alts = (MUSCLE_GROUPS[groupOf(fromVal)] || []).filter((n) => n !== fromVal);
    return `<div class="p1-swap-group" data-label="${esc(label)}"><b>${esc(label)}</b>
      <label class="field"><span>換出</span><select class="p1-swap-from" data-label="${esc(label)}">${t.template.map((e) => `<option value="${esc(e.name)}" ${e.name === fromVal ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select></label>
      <label class="field"><span>換入（同肌群）</span><select class="p1-swap-to" data-label="${esc(label)}"><option value="">不換</option>${alts.map((a) => `<option value="${esc(a)}" ${cur && cur.to === a ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select></label>
      <span class="small">互換＝兩動作位置對調，不改組數。</span></div>`;
  };

  host.innerHTML = `
    <h2>Phase 1 · 健身房課表</h2>
    <p class="small">${esc(PHASE1_BOUNDARY)}</p>
    <h3>下一課：${esc(gym.label)}（${tpl.type === 'upper' ? '上肢' : '下肢'}）</h3>
    <p class="small">本週健身房達標率 ${esc(adh.text)} · 只計完整健身房課；最小課、散步、晨間伸展不計。順序 ${esc(gym.label)}（已完成 ${gym.count} 次完整健身房課），漏掉或改居家都保留序位、不補雙倍。</p>
    <ul class="p1-list">${exerciseRows}</ul>
    <p class="small">次數範圍：複合 6–10、孤立 10–15；達範圍頂且動作好才建議加最小增量（上肢約 2.5 kg、下肢約 5 kg），否則先加次數；一次只建議一種改變。</p>
    <div class="p1-row"><button type="button" class="btn-main" id="p1-save">儲存本課重量／次數</button></div>
    <p class="small">儲存只記重量／次數與 PR，不計 XP；完成整課、推進順序請按 Phase 0 的「完成健身房課」。填入數字後，下方建議會即時更新。</p>
    <h3>組間計時器（可暫停）</h3>
    <div class="p1-row">
      <button type="button" class="btn-sub p1-rest-kind" data-kind="compound">複合 2:30</button>
      <button type="button" class="btn-sub p1-rest-kind" data-kind="isolation">孤立 1:15</button>
      <button type="button" class="btn-main" id="p1-timer-start">開始</button>
      <button type="button" class="btn-sub" id="p1-timer-pause">暫停</button>
      <button type="button" class="btn-sub" id="p1-timer-reset">重設</button>
    </div>
    <p class="p1-timer" id="p1-timer-show">${formatRest(timer.remainingMs)}</p>
    <h3>PR 清單（居家與健身房分開看，PR 非 XP）</h3>
    <p class="small">健身房 PR 以重量計；HRP 與 push-up max 分開存、分開比，不混成同一指標。</p>
    <h4>健身房</h4>${gymPrs.length ? gymPrs.map(prLine).join('') : '<p class="small">尚無健身房 PR（第一次紀錄只是基準，不算新 PR）。</p>'}
    <h4>居家</h4>${homePrs.length ? homePrs.map(prLine).join('') : '<p class="small">尚無居家 PR。</p>'}
    <h3>Plan：建議日與同肌群互換</h3>
    <p class="small">Plan 頁只能改建議日與同肌群互換，不能改組數／動作庫，也沒有自訂課表輸入。建議日不固定星期，由你自選。</p>
    <div class="p1-row">${DOW.map((d, i) => `<label class="p1-day"><input type="checkbox" class="p1-day-cb" value="${i}" ${p1.plan.suggestedDays.includes(i) ? 'checked' : ''}> 週${d}</label>`).join('')}</div>
    <div class="p1-row"><button type="button" class="btn-sub" id="p1-days-save">儲存建議日</button></div>
    <div class="p1-swaps">${['Upper A', 'Lower A', 'Upper B', 'Lower B'].map((label) => swapOptions(label)).join('')}</div>
    <div class="p1-row"><button type="button" class="btn-sub" id="p1-swaps-save">儲存互換</button></div>
    <p class="small">改 Plan 會重新整理畫面；若本課數字尚未儲存，請先按「儲存本課重量／次數」。</p>`;

  /* 即時雙重漸進建議：讀 DOM，不重新整理（避免洗掉未儲存的輸入）。 */
  const recompute = (ei) => {
    const li = host.querySelector(`.p1-ex[data-ex="${ei}"]`);
    if (!li) return;
    const sugEl = li.querySelector(`[data-sug="${ei}"]`);
    if (!sugEl) return;
    const name = li.dataset.name;
    if (held.has(name)) { sugEl.textContent = '疼痛：今日該動作停用、進步暫停'; return; }
    const reps = [...li.querySelectorAll('.p1-r')].map((i) => Number(i.value)).filter((n) => Number.isInteger(n) && n >= 1);
    const formGood = !!li.querySelector('.p1-form')?.checked;
    const s = progressionSuggestion({ kind: li.dataset.kind, body: li.dataset.body, reps, formGood, painHeld: false });
    sugEl.textContent = s.reason;
  };
  host.querySelectorAll('.p1-r, .p1-form').forEach((el) => { el.addEventListener('input', () => recompute(el.dataset.ex)); el.addEventListener('change', () => recompute(el.dataset.ex)); });

  /* 下肢 2–3 組：DOM 層增減組數（不洗掉其他輸入），儲存時以 DOM 為準。 */
  host.querySelectorAll('.p1-addset').forEach((b) => { b.onclick = () => {
    const li = host.querySelector(`.p1-ex[data-ex="${b.dataset.ex}"]`); if (!li) return;
    const setsEl = li.querySelector('.p1-sets'); const cur = setsEl.querySelectorAll('.p1-set').length;
    const tplEx = shown[Number(b.dataset.ex)]; if (!tplEx || cur >= templateSets(tplEx).max) return;
    const span = document.createElement('span'); span.className = 'p1-set'; span.dataset.set = String(cur);
    span.innerHTML = `<input type="number" class="p1-w" data-ex="${b.dataset.ex}" data-set="${cur}" min="0" step="0.5" inputmode="decimal" placeholder="重量 kg"> kg <input type="number" class="p1-r" data-ex="${b.dataset.ex}" data-set="${cur}" min="1" max="999" inputmode="numeric" placeholder="次數"> 下`;
    setsEl.appendChild(span);
    span.querySelectorAll('.p1-r').forEach((el) => el.addEventListener('input', () => recompute(b.dataset.ex)));
  }; });
  host.querySelectorAll('.p1-rmset').forEach((b) => { b.onclick = () => {
    const li = host.querySelector(`.p1-ex[data-ex="${b.dataset.ex}"]`); if (!li) return;
    const setsEl = li.querySelector('.p1-sets'); const all = setsEl.querySelectorAll('.p1-set');
    const tplEx = shown[Number(b.dataset.ex)]; if (!tplEx || all.length <= templateSets(tplEx).min) return;
    all[all.length - 1].remove(); recompute(b.dataset.ex);
  }; });

  $('p1-save').onclick = () => {
    const p = ensure(st);
    const logs = Array.isArray(p.gymSets) ? p.gymSets : (p.gymSets = []);
    const prs = Array.isArray(p.prs) ? p.prs : (p.prs = []);
    const saved = []; const newPrs = [];
    host.querySelectorAll('.p1-ex').forEach((li) => {
      const name = li.dataset.name; if (held.has(name)) return;
      const sets = [];
      li.querySelectorAll('.p1-set').forEach((sp) => {
        const w = Number(sp.querySelector('.p1-w')?.value); const r = Number(sp.querySelector('.p1-r')?.value);
        if (Number.isFinite(w) && w >= 0 && Number.isInteger(r) && r >= 1) sets.push({ weight: w, reps: r });
      });
      if (!sets.length) return;
      const idx = logs.findIndex((e) => e && e.date === today && e.exercise === name);
      const entry = { date: today, label: gym.label, exercise: name, sets };
      if (idx >= 0) logs[idx] = entry; else logs.push(entry);
      saved.push(name);
      const maxW = Math.max(...sets.map((s) => s.weight));
      const cand = { date: today, exercise: name, mode: 'gym', kind: 'weight', value: maxW };
      if (isNewPr(prs, cand)) { prs.push(cand); newPrs.push(name); }
      else if (!prs.some((x) => x && x.mode === 'gym' && x.exercise === name && x.kind === 'weight')) prs.push(cand); // 第一次只是基準
    });
    if (!saved.length) { showToast('沒有可儲存的組數：請先填重量與次數'); return; }
    save();
    showToast(newPrs.length ? `已儲存！新 PR：${newPrs.join('、')}（PR 非 XP）` : '已儲存本課重量／次數（PR 非 XP）');
    if (typeof rerender === 'function') rerender();
  };

  host.querySelectorAll('.p1-rest-kind').forEach((b) => { b.onclick = () => {
    timer.kind = b.dataset.kind; timer.totalMs = restSeconds(timer.kind) * 1000;
    timer.remainingMs = timer.totalMs; timer.running = false; timer.paused = false; timerDisplay();
  }; });
  $('p1-timer-start').onclick = () => { ensureTimerInterval(); timer.running = true; timer.paused = false; timerDisplay(); };
  $('p1-timer-pause').onclick = () => {
    if (!timer.running) return;
    timer.paused = !timer.paused;
    $('p1-timer-pause').textContent = timer.paused ? '繼續' : '暫停';
    timerDisplay();
  };
  $('p1-timer-reset').onclick = () => { timer.running = false; timer.paused = false; timer.remainingMs = timer.totalMs; $('p1-timer-pause').textContent = '暫停'; timerDisplay(); };
  ensureTimerInterval(); timerDisplay();

  $('p1-days-save').onclick = () => {
    const days = [...host.querySelectorAll('.p1-day-cb:checked')].map((c) => Number(c.value));
    const next = applyPlanChange(p1.plan, { type: 'suggestedDays', days });
    const p = ensure(st); p.plan = next; save(); showToast('建議日已儲存（不固定星期）');
    if (typeof rerender === 'function') rerender();
  };
  /* 換出改變時，換入選單只留同肌群選項（存檔時仍由 canSwap 再驗一次）。 */
  host.querySelectorAll('.p1-swap-from').forEach((sel) => { sel.addEventListener('change', () => {
    const group = host.querySelector(`.p1-swap-group[data-label="${sel.dataset.label}"]`);
    const toSel = group && group.querySelector('.p1-swap-to'); if (!toSel) return;
    const alts = (MUSCLE_GROUPS[groupOf(sel.value)] || []).filter((n) => n !== sel.value);
    toSel.innerHTML = '<option value="">不換</option>' + alts.map((a) => `<option value="${esc(a)}">${esc(a)}</option>`).join('');
  }); });

  $('p1-swaps-save').onclick = () => {
    const p = ensure(st);
    const nextSwaps = { ...p1.plan.swaps };
    const msgs = [];
    host.querySelectorAll('.p1-swap-group').forEach((group) => {
      const label = group.dataset.label;
      const from = group.querySelector('.p1-swap-from')?.value;
      const to = group.querySelector('.p1-swap-to')?.value;
      if (!to) { delete nextSwaps[label]; return; }
      if (!canSwap(from, to)) { msgs.push(`${from} 不能換成 ${to}（須同肌群）`); return; }
      nextSwaps[label] = { from, to };
    });
    p.plan = { suggestedDays: p1.plan.suggestedDays, swaps: nextSwaps }; save();
    showToast(msgs.length ? msgs.join('；') : '互換已儲存（同肌群位置對調）');
    if (typeof rerender === 'function') rerender();
  };
};
