/* Daily Ten — 營養（工具卡，不是第四個習慣：不計 XP、不算連續、不進成就、沒有慶祝）。
   今日頁入口卡 nutritionCard() → 畫面 s-nutrition：熱量環＋三大營養素、5 餐、早上體重 1 欄、最近 28 天內的體重趨勢線、7 天平均與每週調整建議。
   數字與文案全部來自 data/nutrition.json；計算在 js/game/nutrition.js；寫入在 js/state/v4.js。
   2026-11-20 D30「記實際吃的」（契約 runs/photo-kcal/contract.md）：
   - 熱量環、入口卡顯示「實際攝取」＝打勾的建議餐＋所有實際紀錄；顯示還差多少 kcal、蛋白質還差幾 g。什麼都沒記時畫面與改版前相同。
   - 每一餐三種記法：照建議吃了（左邊圓圈，1 次點擊，再點一次取消，照舊）；右邊相機鈕開面板 → 拍照估算或手動輸入。另有「加一筆其他」（不屬於 5 餐）。
   - 一餐有實際紀錄時用實際紀錄計算，打勾鈕變成「已記」狀態（aria-disabled，點了不做事），不重複計算。每筆紀錄可移除。
   - 拍照估算是全 App 唯一會連線的地方（js/ui/meal-photo.js）：縮圖 → 同網域 photo.endpoint → 品項與數字 → 少一點／剛好／多一點 → 儲存。
     照片不保存在任何地方。離線、逾時、額度用完、看不出是餐點、其他錯誤：顯示中性訊息並直接給手動輸入，不丟例外。估算值一律標「估算」。
   遊戲日（04:00 換日）為 key，換日後自然是空的。語氣中性：沒記就只是沒記。
   畫面開著跨過 04:00：打勾、開面板、移除若發現日期已換，第一次點擊只重畫成新的一天，不寫入；體重與實際紀錄以「儲存當下」的遊戲日存。
   2026-11-19 外觀改版：專屬主色 --nutri；入口卡與習慣列同款；圖表全部是原生 SVG／CSS，不加套件，不加動畫。 */
import { $, esc } from './dom.js';
import { icon } from './icons.js';
import { goTo } from './nav.js';
import { rules, nutritionData, v4, commit, now } from './model.js';
import { parseNutrition, toggleMeal, setWeight, addEntry, removeEntry, ENTRY_LIMITS } from '../state/v4.js';
import { gameDay } from '../game/core.js';
import { mealDay, weightTrend, scaleEstimate } from '../game/nutrition.js';
import { estimateMeal } from './meal-photo.js';

const DAY_MS = 86400000;
const TREND_DAYS = 28;
const num = (n) => Number(n || 0).toLocaleString('en-US');
const kg1 = (n) => Number(n).toFixed(1);
const signed = (n) => `${n < 0 ? '−' : '+'}${Math.abs(n).toFixed(2)}`;
const today = () => gameDay(now(), rules());
const ratio = (a, b) => (b ? Math.max(0, Math.min(1, a / b)) : 0);
const dayDiff = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY_MS);

/* 今日頁的入口卡（home.js 會幫 [data-s] 接上 goTo）。樣式與習慣列相同，但不是 .habit（不算習慣）。 */
export function nutritionCard() {
  const cfg = nutritionData();
  if (!cfg || !cfg.target) return '';
  const day = mealDay(parseNutrition(v4().nutrition), today(), cfg);
  const all = day.meals.length > 0 && day.count === day.meals.length;
  return `<button type="button" class="tool nutri${all ? ' done' : ''}" id="nut-open" data-s="s-nutrition">`
    + `<span class="nut-dial" style="--p:${ratio(day.kcal, day.targetKcal).toFixed(3)}"><span class="circle">${icon(all ? 'check' : 'bowl')}</span></span>`
    + `<span class="body"><p class="name">營養</p><p class="meta" id="nut-home-sum" aria-label="今天已記 ${num(day.kcal)} / ${num(day.targetKcal)} kcal，${day.count}/${day.meals.length} 餐">${num(day.kcal)} / ${num(day.targetKcal)} kcal · ${day.count}/${day.meals.length} 餐</p></span>`
    + `<span class="chev">${icon('chevron', { size: 18 })}</span></button>`;
}

function adviceText(tr, W) {
  const ch = tr.change === null ? '' : `7 天平均比上週 ${signed(tr.change)} kg`;
  if (tr.advice === 'hold') return { tag: '不動', tone: 'ok', text: `${ch}，在範圍內。照目前的量吃就好。` };
  if (tr.advice === 'watch') return { tag: '不動', tone: 'watch', text: `${ch}，低於 +${W.holdMinKg} kg。先不動，再觀察 1 週。` };
  if (tr.advice === 'up') return { tag: `每天 +${tr.stepKcal} kcal`, tone: 'up', text: `${ch}，連續 ${W.lowWeeksNeeded} 週低於 +${W.holdMinKg} kg。建議每天加 ${tr.stepKcal} kcal（碳水約 +${tr.stepCarbG} g）。` };
  if (tr.advice === 'down') return { tag: `每天 −${tr.stepKcal} kcal`, tone: 'down', text: `${ch}，高於 +${W.holdMaxKg} kg。建議每天減 ${tr.stepKcal} kcal。` };
  return { tag: '再記幾天', tone: 'wait', text: tr.daysNeeded > 0 ? `再記幾天就能看每週變化（滿 ${W.minSpanDays} 天後開始，還有 ${tr.daysNeeded} 天）。` : '最近兩週的紀錄還不夠，再記幾天就能看每週變化。' };
}

/* 熱量環：今天實際攝取（打勾的建議餐＋實際紀錄）／每日目標 */
function kcalRing(day) {
  const R = 46, C = 2 * Math.PI * R, p = ratio(day.kcal, day.targetKcal);
  const left = day.left.kcal;
  return `<div class="nut-ring" role="img" aria-label="今天已記 ${num(day.kcal)} kcal（估算），目標 ${num(day.targetKcal)} kcal，${left > 0 ? `還差 ${num(left)} kcal` : '已達標'}">
    <svg viewBox="0 0 112 112" aria-hidden="true"><circle class="track" cx="56" cy="56" r="${R}"/><circle class="bar" cx="56" cy="56" r="${R}" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${(C * (1 - p)).toFixed(2)}"/></svg>
    <div class="center"><span id="nut-sum" class="num"><b>${num(day.kcal)}</b> <small>/ ${num(day.targetKcal)} kcal</small></span><span class="left" id="nut-left-kcal">${left > 0 ? `還差 ${num(left)}` : '已達標'}</span></div></div>`;
}

/* 三大營養素：比例條與百分比是目標的熱量比例（蛋白質、碳水 4 kcal/g，脂肪 9 kcal/g）。
   今天有記東西（打勾或實際紀錄）時，克數顯示「實際 / 目標 g」，並顯示蛋白質還差幾 g；什麼都沒記時只顯示目標（與改版前相同）。 */
function macroSplit(t, day, C) {
  const any = day.count > 0 || day.extras.length > 0;
  const parts = [
    { key: 'protein', name: '蛋白質', g: t.proteinG, got: day.macros.proteinG, kcal: t.proteinG * 4 },
    { key: 'fat', name: '脂肪', g: t.fatG, got: day.macros.fatG, kcal: t.fatG * 9 },
    { key: 'carb', name: '碳水', g: t.carbG, got: day.macros.carbG, kcal: t.carbG * 4 }
  ];
  const sum = parts.reduce((s, x) => s + x.kcal, 0) || 1;
  const bar = parts.map((x) => `<i class="${x.key}" style="flex:${x.kcal}"></i>`).join('');
  const legend = parts.map((x) => `<li data-macro="${x.key}"><span class="dot ${x.key}"></span><span class="k">${x.name}</span><b class="num">${any ? `${num(x.got)}<small> / ${num(x.g)} g</small>` : `${num(x.g)} g`}</b><span class="pct num">${Math.round((x.kcal / sum) * 100)}%</span></li>`).join('');
  const planTicked = day.meals.some((m) => m.done && m.entries.length === 0);
  const notes = !any ? '' : `<p class="nut-left" id="nut-left">${day.left.kcal > 0 ? `還差 ${num(day.left.kcal)} kcal` : '熱量已達標'} · ${day.left.proteinG > 0 ? `蛋白質還差 ${num(day.left.proteinG)} g` : '蛋白質已達標'}</p>`
    + (day.macrosPartial && C.macrosPartial ? `<p class="small nut-note" id="nut-macros-partial">${esc(C.macrosPartial)}</p>` : '')
    + (planTicked && C.planMacros ? `<p class="small nut-note" id="nut-plan-macros">${esc(C.planMacros)}</p>` : '');
  return `<div class="nut-split" aria-hidden="true">${bar}</div><ul class="nut-macros" id="nut-macros" aria-label="${any ? '三大營養素：今天估算攝取／每日目標' : '每日三大營養素目標'}">${legend}</ul>${notes}`;
}

/* 實際紀錄一列：名稱、估算標記（拍照來的）、kcal、移除鈕 */
function entryRow(e) {
  return `<li class="entry" data-entry="${esc(e.id)}"><span class="n">${esc(e.name)}</span>${e.source === 'photo' ? '<span class="tag nutri">估算</span>' : ''}<span class="num">${num(e.kcal)} kcal</span><button type="button" class="entry-x" data-remove-entry="${esc(e.id)}" aria-label="移除 ${esc(e.name)}">${icon('close', { size: 18 })}</button></li>`;
}
/* 一餐：左邊打勾鈕（.meal，行為照舊）＋右邊「記實際吃的」鈕；有實際紀錄時列在下面，打勾鈕變成已記狀態。 */
function mealRow(m) {
  const has = m.entries.length > 0;
  const kcal = has ? m.kcalActual : m.kcal;
  const meta = has ? `已記 ${m.entries.length} 筆，用實際紀錄計算` : m.example;
  return `<div class="meal-row${has ? ' has-entries' : ''}"><div class="meal-line">
    <button type="button" class="meal${m.done ? ' done' : ''}${has ? ' logged' : ''}" data-meal="${esc(m.id)}" aria-pressed="${m.done}"${has ? ' aria-disabled="true"' : ''}><span class="circle">${icon('check', { size: 18 })}</span><span class="body"><p class="name"><span class="t">${esc(m.label)}</span> <span class="num">${num(kcal)} kcal</span></p><p class="meta">${esc(meta)}</p></span></button>
    <button type="button" class="meal-log" data-log="${esc(m.id)}" aria-label="記實際吃的：${esc(m.label)}" title="記實際吃的">${icon('camera', { size: 20 })}</button></div>
    ${has ? `<ul class="entries" data-entries="${esc(m.id)}" aria-label="${esc(m.label)}的實際紀錄">${m.entries.map(entryRow).join('')}</ul>` : ''}</div>`;
}

/* 最近 28 天的體重趨勢線（原生 SVG）。紀錄少於 2 筆時不畫。 */
function weightSpark(weights, date) {
  const pts = weights
    .filter((w) => w && typeof w.date === 'string' && Number.isFinite(Number(w.kg)))
    .map((w) => ({ d: dayDiff(w.date, date), kg: Number(w.kg) }))
    .filter((w) => w.d <= 0 && w.d > -TREND_DAYS)
    .sort((a, b) => a.d - b.d);
  if (pts.length < 2) return '';
  const W = 320, H = 72, PX = 6, PY = 10;
  const first = pts[0].d, days = 1 - first;
  const lo = Math.min(...pts.map((p) => p.kg)), hi = Math.max(...pts.map((p) => p.kg));
  const span = hi - lo || 1;
  const x = (d) => PX + ((d - first) / (days - 1 || 1)) * (W - PX * 2);
  const y = (kg) => (hi === lo ? H / 2 : PY + (1 - (kg - lo) / span) * (H - PY * 2));
  const line = pts.map((p) => `${x(p.d).toFixed(1)},${y(p.kg).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  const area = `${x(pts[0].d).toFixed(1)},${H} ${line} ${x(last.d).toFixed(1)},${H}`;
  return `<div class="nut-trend"><div class="nut-trend-head"><span>最近 ${days} 天</span><span class="num">最低 ${kg1(lo)} · 最高 ${kg1(hi)} kg</span></div>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="最近 ${days} 天體重 ${pts.length} 筆，最低 ${kg1(lo)} kg，最高 ${kg1(hi)} kg">
      <polygon class="area" points="${area}"/><polyline class="line" points="${line}"/><circle class="last" cx="${x(last.d).toFixed(1)}" cy="${y(last.kg).toFixed(1)}" r="4"/></svg></div>`;
}

export function renderNutrition() {
  const cfg = nutritionData();
  $('nutrition-back-ic').innerHTML = icon('back');
  $('nutrition-back').onclick = () => goTo('s-home');
  if (!cfg || !cfg.target) { $('nutrition-body').innerHTML = ''; return; }
  const date = today();
  const data = parseNutrition(v4().nutrition);
  const day = mealDay(data, date, cfg);
  const tr = weightTrend(data.weights, date, cfg);
  const W = cfg.weight, C = cfg.copy;
  const adv = adviceText(tr, W);

  const summary = `<section class="card nut-summary" aria-label="每日目標">
    <div class="card-head"><h3 class="card-title">每日目標</h3><span class="tag">估算</span></div>
    <div class="nut-top">${kcalRing(day)}<div class="nut-goal"><p class="small">一天要吃到</p><p class="nut-kcal num" id="nut-target">${num(cfg.target.kcal)}<small> kcal</small></p></div></div>
    ${macroSplit(cfg.target, day, C)}</section>`;

  const meals = `<section class="card" aria-label="今天的 5 餐"><div class="card-head"><h3 class="card-title">今天的 ${day.meals.length} 餐</h3><span class="tag nutri" id="nut-count">${day.count}/${day.meals.length}</span></div>
    <div class="meals">${day.meals.map(mealRow).join('')}</div>
    ${day.extras.length ? `<div class="nut-extras"><p class="nut-sub">其他 <span class="num">${num(day.extras.reduce((a, e) => a + e.kcal, 0))} kcal</span></p><ul class="entries" id="nut-extras" aria-label="其他的實際紀錄">${day.extras.map(entryRow).join('')}</ul></div>` : ''}
    <button type="button" class="btn btn-secondary nut-add" id="nut-add-extra">${icon('plus', { size: 18 })}加一筆其他</button>
    <p class="small nut-hint">照建議吃了：點左邊圓圈打勾，再點一次取消。吃的不一樣：點右邊相機，拍照估算或手動輸入。每天 ${String(rules().day.boundaryHour).padStart(2, '0')}:00 重新開始。</p>
    <p class="nut-tip"><span class="ic-wrap">${icon('spark', { size: 16 })}</span><span>${esc(C.tip)}</span></p></section>`;

  const weight = `<section class="card" aria-label="體重"><div class="card-head"><h3 class="card-title">早上體重</h3><span class="tag advice ${adv.tone}" id="nut-advice-tag">${esc(adv.tag)}</span></div>
    <form id="nut-weight-form" class="nut-weight" novalidate><div class="field"><label for="nut-weight">今天早上</label><div class="kg-input"><input type="number" id="nut-weight" inputmode="decimal" step="0.1" min="${W.minKg}" max="${W.maxKg}" autocomplete="off" placeholder="例：80.5" value="${tr.today === null ? '' : kg1(tr.today)}"><span class="suffix">kg</span></div></div><button type="submit" class="btn" id="nut-weight-save">記錄</button></form>
    <p class="small nut-msg" id="nut-weight-msg" role="status"></p>
    ${weightSpark(data.weights, date)}
    <div class="nut-stats"><div><span class="small">7 天平均</span><b class="num" id="nut-avg">${tr.avg7 === null ? '—' : `${kg1(tr.avg7)} kg`}</b></div><div class="${adv.tone}"><span class="small">每週變化</span><b class="num" id="nut-change">${tr.change === null ? '—' : `${signed(tr.change)} kg`}</b></div></div>
    <p class="nut-advice ${adv.tone}" id="nut-advice">${esc(adv.text)}</p>
    <details class="nut-rules"><summary>每週怎麼調整<span class="chev">${icon('chevron', { size: 16 })}</span></summary><p class="small">${esc(C.weighIn)}${esc(C.pace)}</p><p class="small">${esc(C.rule)}</p></details></section>`;

  $('nutrition-body').innerHTML = summary + meals + weight + `<p class="version" id="nut-disclaimer">${esc(C.disclaimer)}</p>`;
  const body = $('nutrition-body');
  const stale = () => today() !== date;
  body.querySelectorAll('[data-meal]').forEach((b) => { b.onclick = async () => { if (stale()) { renderNutrition(); return; } if (b.getAttribute('aria-disabled') === 'true') return; toggleMeal(v4(), date, b.dataset.meal); await commit(); renderNutrition(); }; });
  body.querySelectorAll('[data-log]').forEach((b) => { b.onclick = () => { if (stale()) { renderNutrition(); return; } openEntrySheet(b.dataset.log); }; });
  $('nut-add-extra').onclick = () => { if (stale()) { renderNutrition(); return; } openEntrySheet(null); };
  body.querySelectorAll('[data-remove-entry]').forEach((b) => { b.onclick = async () => {
    if (stale()) { renderNutrition(); return; }
    const host = b.closest('[data-entries]');
    const back = host ? `[data-log="${host.dataset.entries}"]` : '#nut-add-extra';
    if (removeEntry(v4(), date, b.dataset.removeEntry)) await commit();
    renderNutrition();
    const el = $('nutrition-body').querySelector(back);
    if (el) el.focus();
  }; });
  $('nut-weight-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const raw = $('nut-weight').value.trim();
    const kg = Math.round(Number(raw) * 10) / 10;
    if (raw === '' || !Number.isFinite(kg) || kg < W.minKg || kg > W.maxKg) { $('nut-weight-msg').textContent = `請輸入 ${W.minKg}–${W.maxKg} 之間的數字。`; return; }
    setWeight(v4(), { date: today(), kg, now: now() });
    await commit();
    renderNutrition();
    $('nut-weight-msg').textContent = `已記錄 ${kg1(kg)} kg。`;
  };
}

/* ---------- 「記實際吃的」面板（沿用 #sheet；slotId 是餐 id，null＝其他） ---------- */
const clip = (t, max) => [...String(t ?? '').trim()].slice(0, max).join('').trim();
let closeOpenSheet = null;

function openEntrySheet(slotId) {
  const cfg = nutritionData();
  const C = cfg.copy || {}, P = cfg.photo || {}, L = ENTRY_LIMITS;
  const meal = (cfg.meals || []).find((m) => m.id === slotId) || null;
  const slot = meal ? meal.id : null;
  const portions = Array.isArray(P.portions) ? P.portions.filter((p) => p && typeof p.id === 'string') : [];
  const hasPhoto = typeof P.endpoint === 'string' && P.endpoint !== '';
  const backSel = slot ? `[data-log="${slot}"]` : '#nut-add-extra';
  if (closeOpenSheet) closeOpenSheet(false);

  let mode = hasPhoto ? 'photo' : 'manual';
  let est = null, scaled = null, busy = false, seq = 0, ctrl = null, closed = false;
  let portion = (portions.find((p) => p.factor === 1) || portions[0] || { id: '' }).id;

  const sh = $('sheet');
  const macroField = (id, label, [min, max]) => `<div class="field"><label for="${id}">${label}（g）</label><input type="number" id="${id}" inputmode="numeric" min="${min}" max="${max}" step="1" autocomplete="off" placeholder="選填"></div>`;
  sh.innerHTML = `<div class="panel nut-sheet" id="nut-sheet" role="dialog" aria-modal="true" aria-labelledby="nut-sheet-t" tabindex="-1"><div class="grab"></div>
    <div class="nut-sheet-head"><h3 class="card-title" id="nut-sheet-t">${meal ? `記實際吃的 · ${esc(meal.label)}` : '加一筆其他'}</h3><button type="button" class="icon-btn flat" id="nut-sheet-close" aria-label="關閉">${icon('close', { size: 20 })}</button></div>
    ${hasPhoto ? `<div class="nut-modes" role="group" aria-label="記錄方式"><button type="button" id="nut-mode-photo" data-mode="photo">${icon('camera', { size: 18 })}拍照估算</button><button type="button" id="nut-mode-manual" data-mode="manual">手動輸入</button></div>
    <div id="nut-photo-pane"><div class="field"><label for="nut-photo-note">補充一句（選填，拍照前先填）</label><input type="text" id="nut-photo-note" maxlength="80" autocomplete="off" placeholder="例：大碗、去皮"></div>
      <button type="button" class="btn nut-photo-btn" id="nut-photo-btn">${icon('camera', { size: 20 })}<span id="nut-photo-btn-t">拍照</span></button>
      <input type="file" id="nut-photo-input" accept="image/*" tabindex="-1" aria-label="餐點照片" hidden>
      <p class="small nut-privacy" id="nut-photo-privacy">${esc(C.photoPrivacy || '')}</p></div>` : ''}
    <p class="nut-sheet-msg" id="nut-sheet-msg" role="status"></p>
    <div id="nut-est" class="nut-est" tabindex="-1" hidden></div>
    <form id="nut-entry-form" class="nut-entry-form" novalidate hidden>
      <div class="field"><label for="nut-entry-name">名稱</label><input type="text" id="nut-entry-name" maxlength="${L.nameMax}" autocomplete="off" placeholder="例：雞腿便當"></div>
      <div class="field"><label for="nut-entry-kcal" id="nut-entry-kcal-l">熱量（kcal）</label><input type="number" id="nut-entry-kcal" inputmode="numeric" min="${L.kcal[0]}" max="${L.kcal[1]}" step="1" autocomplete="off" placeholder="例：650"></div>
      <div class="nut-macro-fields" id="nut-entry-macros">${macroField('nut-entry-protein', '蛋白質', L.proteinG)}${macroField('nut-entry-fat', '脂肪', L.fatG)}${macroField('nut-entry-carb', '碳水', L.carbG)}</div>
      <p class="small nut-msg" id="nut-entry-msg" role="status"></p>
      <button type="submit" class="btn btn-primary" id="nut-entry-save">儲存</button>
    </form></div>`;
  sh.hidden = false;
  const panel = $('nut-sheet');

  const setMsg = (text, tone = '') => { const el = $('nut-sheet-msg'); el.textContent = text || ''; el.className = `nut-sheet-msg${tone ? ` ${tone}` : ''}`; };
  const paintEst = (refill) => {
    const box = $('nut-est');
    if (!est) { box.hidden = true; box.innerHTML = ''; scaled = null; return; }
    const factor = (portions.find((p) => p.id === portion) || {}).factor;
    scaled = scaleEstimate(est, factor);
    box.innerHTML = `<div class="card-head"><h4 class="nut-est-t">照片估算結果</h4><span class="tag nutri">估算</span></div>
      <ul class="est-items" id="nut-est-items">${scaled.items.slice(0, 12).map((it) => `<li><span class="n">${esc(clip(it.name, L.nameMax) || '品項')}</span><span class="num g">${num(it.grams)} g</span><span class="num k">${num(it.kcal)} kcal</span></li>`).join('')}</ul>
      <p class="est-total" id="nut-est-total"><b class="num">估算合計 ${num(scaled.kcal)} kcal</b><span class="num">蛋白質 ${num(scaled.proteinG)} g · 脂肪 ${num(scaled.fatG)} g · 碳水 ${num(scaled.carbG)} g</span></p>
      ${portions.length ? `<div class="portions" role="group" aria-label="實際份量">${portions.map((p) => `<button type="button" data-portion="${esc(p.id)}" aria-pressed="${p.id === portion}">${esc(p.label)}</button>`).join('')}</div>` : ''}
      <p class="small nut-accuracy" id="nut-est-accuracy">${esc(C.photoAccuracy || '')}</p>`;
    box.hidden = false;
    box.querySelectorAll('[data-portion]').forEach((b) => { b.onclick = () => { portion = b.dataset.portion; paintEst(false); const again = box.querySelector(`[data-portion="${portion}"]`); if (again) again.focus(); }; });
    if (refill) $('nut-entry-name').value = clip(scaled.items.slice(0, 2).map((it) => clip(it.name, L.nameMax)).filter(Boolean).join('、'), L.nameMax);
    $('nut-entry-kcal').value = scaled.kcal > 0 ? String(scaled.kcal) : '';
  };
  const paint = () => {
    const photo = mode === 'photo';
    panel.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    if (hasPhoto) {
      $('nut-photo-pane').hidden = !photo;
      $('nut-photo-btn').disabled = busy;
      $('nut-photo-btn').classList.toggle('again', !!est);
      $('nut-photo-btn-t').textContent = busy ? '估算中…' : est ? '重拍一張' : '拍照';
      $('nut-photo-note').disabled = busy;
    }
    panel.setAttribute('aria-busy', String(busy));
    $('nut-est').hidden = !(photo && est);
    $('nut-entry-form').hidden = photo && !est;
    $('nut-entry-macros').hidden = photo;
    $('nut-entry-kcal-l').textContent = photo ? '熱量（kcal，估算，可以改）' : '熱量（kcal）';
  };
  const setMode = (next, keepMsg = false) => {
    if (mode === next && !keepMsg) return;
    mode = next;
    if (!keepMsg) setMsg('');
    $('nut-entry-msg').textContent = '';
    paint();
  };
  const close = (refocus = true) => {
    if (closed) return;
    closed = true; seq += 1;
    if (ctrl) ctrl.abort();
    ctrl = null; est = null; scaled = null;
    document.removeEventListener('keydown', onKey, true);
    sh.onclick = null;
    sh.hidden = true; sh.innerHTML = '';
    closeOpenSheet = null;
    if (refocus) { const el = $('nutrition-body').querySelector(backSel); if (el) el.focus(); }
  };
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    const list = [...panel.querySelectorAll('button,input,[tabindex="0"]')].filter((el) => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length > 0);
    if (!list.length) { e.preventDefault(); panel.focus(); return; }
    const first = list[0], last = list[list.length - 1], a = document.activeElement;
    if (!panel.contains(a)) { e.preventDefault(); first.focus(); } else if (e.shiftKey && (a === first || a === panel)) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
  }
  closeOpenSheet = close;
  document.addEventListener('keydown', onKey, true);
  sh.onclick = (e) => { if (e.target === sh) close(); };
  $('nut-sheet-close').onclick = () => close();
  panel.querySelectorAll('[data-mode]').forEach((b) => { b.onclick = () => { if (busy) return; setMode(b.dataset.mode); if (mode === 'manual') $('nut-entry-name').focus(); }; });

  if (hasPhoto) {
    const input = $('nut-photo-input');
    $('nut-photo-btn').onclick = () => { if (!busy) input.click(); };
    input.onchange = async () => {
      const file = input.files && input.files[0];
      try { input.value = ''; } catch { /* */ }
      if (!file || busy) return;
      const my = ++seq;
      ctrl = new AbortController();
      busy = true; est = null; paintEst(false);
      setMsg('估算中…', 'busy');
      $('nut-entry-msg').textContent = '';
      paint();
      let r;
      try { r = await estimateMeal(file, $('nut-photo-note').value, P, ctrl.signal); } catch { r = { ok: false, reason: 'failed' }; }
      if (closed || my !== seq) return;
      busy = false; ctrl = null;
      if (r.ok) {
        est = r.est;
        setMsg('');
        paintEst(true);
        paint();
        $('nut-est').focus(); /* 不直接跳進輸入框：手機鍵盤會蓋住估算結果 */
        return;
      }
      if (r.reason === 'aborted') { setMsg(''); paint(); return; }
      setMsg(C[r.reason] || C.failed || '', 'warn');
      setMode('manual', true);
      $('nut-entry-name').focus();
    };
  }

  $('nut-entry-form').onsubmit = async (ev) => {
    ev.preventDefault();
    if (busy) return;
    const say = (t, el) => { $('nut-entry-msg').textContent = t; if (el) el.focus(); };
    const name = clip($('nut-entry-name').value, L.nameMax);
    if (!name) { say('請填名稱。', $('nut-entry-name')); return; }
    const rawK = $('nut-entry-kcal').value.trim();
    const kcal = Math.round(Number(rawK));
    if (rawK === '' || !Number.isFinite(kcal) || kcal < L.kcal[0] || kcal > L.kcal[1]) { say(`熱量請輸入 ${num(L.kcal[0])}–${num(L.kcal[1])} 之間的數字。`, $('nut-entry-kcal')); return; }
    const photo = mode === 'photo' && !!scaled;
    const macros = { proteinG: null, fatG: null, carbG: null };
    if (photo) Object.assign(macros, { proteinG: scaled.proteinG, fatG: scaled.fatG, carbG: scaled.carbG });
    else {
      for (const [key, id, label] of [['proteinG', 'nut-entry-protein', '蛋白質'], ['fatG', 'nut-entry-fat', '脂肪'], ['carbG', 'nut-entry-carb', '碳水']]) {
        const el = $(id), raw = el.value.trim();
        if (raw === '' && !(el.validity && el.validity.badInput)) continue;
        const g = Math.round(Number(raw));
        if (raw === '' || !Number.isFinite(g) || g < L[key][0] || g > L[key][1]) { say(`${label}請輸入 ${num(L[key][0])}–${num(L[key][1])} 之間的數字，或留空。`, el); return; }
        macros[key] = g;
      }
    }
    const id = addEntry(v4(), { date: today(), slot, name, kcal, ...macros, source: photo ? 'photo' : 'manual', now: now() });
    if (id === null) {
      const list = v4().nutrition.entries[today()];
      say(Array.isArray(list) && list.length >= L.perDay ? `今天已經記了 ${L.perDay} 筆，先移除一筆再記。` : '這筆沒記到，請看一下名稱和熱量再試一次。');
      return;
    }
    close(false);
    await commit();
    renderNutrition();
    const el = $('nutrition-body').querySelector(backSel);
    if (el) el.focus();
  };

  paint();
  panel.focus();
}
