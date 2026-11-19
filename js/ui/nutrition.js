/* Daily Ten — 營養（工具卡，不是第四個習慣：不計 XP、不算連續、不進成就）。
   今日頁入口卡 nutritionCard() → 畫面 s-nutrition：熱量環＋三大營養素比例、5 餐逐餐打勾（1 次點擊，再點一次取消）、
   早上體重 1 欄、最近 28 天內的體重趨勢線（從第一筆畫到今天）、7 天平均與每週調整建議。數字全部來自 data/nutrition.json；計算在 js/game/nutrition.js。
   打勾以遊戲日（04:00 換日）為 key，換日後自然是空的，不需要另外重置。語氣中性：沒打勾就只是沒打勾。
   畫面開著跨過 04:00：體重以「點記錄當下」的遊戲日存；打勾若發現日期已換，第一次點擊只重畫成新的一天，不寫入。
   2026-11-19 外觀改版：專屬主色 --nutri；入口卡與習慣列同款（圓形圖示＋外圈進度）；圖表全部是原生 SVG／CSS，不加套件，不加動畫。 */
import { $, esc } from './dom.js';
import { icon } from './icons.js';
import { goTo } from './nav.js';
import { rules, nutritionData, v4, commit, now } from './model.js';
import { parseNutrition, toggleMeal, setWeight } from '../state/v4.js';
import { gameDay } from '../game/core.js';
import { mealDay, weightTrend } from '../game/nutrition.js';

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
    + `<span class="body"><p class="name">營養</p><p class="meta" id="nut-home-sum"><span class="nw">今天已打勾 ${num(day.kcal)} / ${num(day.targetKcal)} kcal</span><span class="nw">（${day.count}/${day.meals.length} 餐）</span></p></span>`
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

/* 熱量環：今天已打勾的 kcal／每日目標 */
function kcalRing(day) {
  const R = 46, C = 2 * Math.PI * R, p = ratio(day.kcal, day.targetKcal);
  const left = Math.max(0, day.targetKcal - day.kcal);
  return `<div class="nut-ring" role="img" aria-label="今天已打勾 ${num(day.kcal)} kcal，目標 ${num(day.targetKcal)} kcal">
    <svg viewBox="0 0 112 112" aria-hidden="true"><circle class="track" cx="56" cy="56" r="${R}"/><circle class="bar" cx="56" cy="56" r="${R}" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${(C * (1 - p)).toFixed(2)}"/></svg>
    <div class="center"><span id="nut-sum" class="num"><b>${num(day.kcal)}</b> <small>/ ${num(day.targetKcal)} kcal</small></span><span class="left">${left > 0 ? `還差 ${num(left)}` : '已達標'}</span></div></div>`;
}

/* 三大營養素：依目標克數換成熱量比例（蛋白質、碳水 4 kcal/g，脂肪 9 kcal/g）。只顯示目標，不追蹤實際吃了多少。 */
function macroSplit(t) {
  const parts = [
    { key: 'protein', name: '蛋白質', g: t.proteinG, kcal: t.proteinG * 4 },
    { key: 'fat', name: '脂肪', g: t.fatG, kcal: t.fatG * 9 },
    { key: 'carb', name: '碳水', g: t.carbG, kcal: t.carbG * 4 }
  ];
  const sum = parts.reduce((s, x) => s + x.kcal, 0) || 1;
  const bar = parts.map((x) => `<i class="${x.key}" style="flex:${x.kcal}"></i>`).join('');
  const legend = parts.map((x) => `<li><span class="dot ${x.key}"></span><span class="k">${x.name}</span><b class="num">${num(x.g)} g</b><span class="pct num">${Math.round((x.kcal / sum) * 100)}%</span></li>`).join('');
  return `<div class="nut-split" aria-hidden="true">${bar}</div><ul class="nut-macros" id="nut-macros" aria-label="每日三大營養素目標">${legend}</ul>`;
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
    ${macroSplit(cfg.target)}</section>`;

  const meals = `<section class="card" aria-label="今天的 5 餐"><div class="card-head"><h3 class="card-title">今天的 ${day.meals.length} 餐</h3><span class="tag nutri" id="nut-count">${day.count}/${day.meals.length}</span></div>
    <div class="meals">${day.meals.map((m) => `<button type="button" class="meal${m.done ? ' done' : ''}" data-meal="${esc(m.id)}" aria-pressed="${m.done}"><span class="circle">${icon('check', { size: 18 })}</span><span class="body"><p class="name"><span class="t">${esc(m.label)}</span> <span class="num">${num(m.kcal)} kcal</span></p><p class="meta">${esc(m.example)}</p></span></button>`).join('')}</div>
    <p class="small nut-hint">點一下打勾，再點一次取消。每天 ${String(rules().day.boundaryHour).padStart(2, '0')}:00 重新開始。</p>
    <p class="nut-tip"><span class="ic-wrap">${icon('spark', { size: 16 })}</span><span>${esc(C.tip)}</span></p></section>`;

  const weight = `<section class="card" aria-label="體重"><div class="card-head"><h3 class="card-title">早上體重</h3><span class="tag advice ${adv.tone}" id="nut-advice-tag">${esc(adv.tag)}</span></div>
    <form id="nut-weight-form" class="nut-weight" novalidate><div class="field"><label for="nut-weight">今天早上</label><div class="kg-input"><input type="number" id="nut-weight" inputmode="decimal" step="0.1" min="${W.minKg}" max="${W.maxKg}" autocomplete="off" placeholder="例：80.5" value="${tr.today === null ? '' : kg1(tr.today)}"><span class="suffix">kg</span></div></div><button type="submit" class="btn" id="nut-weight-save">記錄</button></form>
    <p class="small nut-msg" id="nut-weight-msg" role="status"></p>
    ${weightSpark(data.weights, date)}
    <div class="nut-stats"><div><span class="small">7 天平均</span><b class="num" id="nut-avg">${tr.avg7 === null ? '—' : `${kg1(tr.avg7)} kg`}</b></div><div class="${adv.tone}"><span class="small">每週變化</span><b class="num" id="nut-change">${tr.change === null ? '—' : `${signed(tr.change)} kg`}</b></div></div>
    <p class="nut-advice ${adv.tone}" id="nut-advice">${esc(adv.text)}</p>
    <details class="nut-rules"><summary>每週怎麼調整<span class="chev">${icon('chevron', { size: 16 })}</span></summary><p class="small">${esc(C.weighIn)}${esc(C.pace)}</p><p class="small">${esc(C.rule)}</p></details></section>`;

  $('nutrition-body').innerHTML = summary + meals + weight + `<p class="version" id="nut-disclaimer">${esc(C.disclaimer)}</p>`;
  $('nutrition-body').querySelectorAll('[data-meal]').forEach((b) => { b.onclick = async () => { if (today() !== date) { renderNutrition(); return; } toggleMeal(v4(), date, b.dataset.meal); await commit(); renderNutrition(); }; });
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
