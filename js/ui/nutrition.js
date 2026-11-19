/* Daily Ten — 營養（工具卡，不是第四個習慣：不計 XP、不算連續、不進成就）。
   今日頁入口卡 nutritionCard() → 畫面 s-nutrition：每日目標、5 餐逐餐打勾（1 次點擊，再點一次取消）、已打勾 kcal 合計、
   早上體重 1 欄、7 天平均與每週調整建議。數字全部來自 data/nutrition.json；計算在 js/game/nutrition.js。
   打勾以遊戲日（04:00 換日）為 key，換日後自然是空的，不需要另外重置。語氣中性：沒打勾就只是沒打勾。 */
import { $, esc } from './dom.js';
import { icon } from './icons.js';
import { goTo } from './nav.js';
import { rules, nutritionData, v4, commit, now } from './model.js';
import { parseNutrition, toggleMeal, setWeight } from '../state/v4.js';
import { gameDay } from '../game/core.js';
import { mealDay, weightTrend } from '../game/nutrition.js';

const num = (n) => Number(n || 0).toLocaleString('en-US');
const kg1 = (n) => Number(n).toFixed(1);
const signed = (n) => `${n < 0 ? '−' : '+'}${Math.abs(n).toFixed(2)}`;
const today = () => gameDay(now(), rules());
const macros = (t) => `蛋白質 ${num(t.proteinG)} g · 脂肪 ${num(t.fatG)} g · 碳水 ${num(t.carbG)} g`;

/* 今日頁的入口卡（home.js 會幫 [data-s] 接上 goTo） */
export function nutritionCard() {
  const cfg = nutritionData();
  if (!cfg || !cfg.target) return '';
  const day = mealDay(parseNutrition(v4().nutrition), today(), cfg);
  return `<button type="button" class="tool" id="nut-open" data-s="s-nutrition"><span class="body"><p class="name">營養 · 每天 ${num(cfg.target.kcal)} kcal</p><p class="meta">${macros(cfg.target)}</p><p class="meta" id="nut-home-sum">今天已打勾 ${num(day.kcal)} / ${num(day.targetKcal)} kcal（${day.count}/${day.meals.length} 餐）</p></span><span class="chev">${icon('chevron', { size: 18 })}</span></button>`;
}

function adviceText(tr, W) {
  const ch = tr.change === null ? '' : `7 天平均比上週 ${signed(tr.change)} kg`;
  if (tr.advice === 'hold') return { tag: '不動', text: `${ch}，在範圍內。照目前的量吃就好。` };
  if (tr.advice === 'watch') return { tag: '不動', text: `${ch}，低於 +${W.holdMinKg} kg。先不動，再觀察 1 週。` };
  if (tr.advice === 'up') return { tag: `每天 +${tr.stepKcal} kcal`, text: `${ch}，連續 ${W.lowWeeksNeeded} 週低於 +${W.holdMinKg} kg。建議每天加 ${tr.stepKcal} kcal（碳水約 +${tr.stepCarbG} g）。` };
  if (tr.advice === 'down') return { tag: `每天 −${tr.stepKcal} kcal`, text: `${ch}，高於 +${W.holdMaxKg} kg。建議每天減 ${tr.stepKcal} kcal。` };
  return { tag: '再記幾天', text: tr.daysNeeded > 0 ? `再記幾天就能看每週變化（滿 ${W.minSpanDays} 天後開始，還有 ${tr.daysNeeded} 天）。` : '最近兩週的紀錄還不夠，再記幾天就能看每週變化。' };
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

  const target = `<section class="card" aria-label="每日目標"><div class="card-head"><h3 class="card-title">每日目標</h3><span class="tag">估算</span></div>
    <p class="nut-kcal num" id="nut-target">${num(cfg.target.kcal)}<small> kcal</small></p><p class="small" id="nut-macros" style="margin:0">${macros(cfg.target)}</p></section>`;

  const meals = `<section class="card" aria-label="今天的 5 餐"><div class="card-head"><h3 class="card-title">今天的 ${day.meals.length} 餐</h3><span class="tag" id="nut-count">${day.count}/${day.meals.length}</span></div>
    <div class="meals">${day.meals.map((m) => `<button type="button" class="meal${m.done ? ' done' : ''}" data-meal="${esc(m.id)}" aria-pressed="${m.done}"><span class="circle">${m.done ? icon('check', { size: 20 }) : ''}</span><span class="body"><p class="name">${esc(m.label)} <span class="num">${num(m.kcal)} kcal</span></p><p class="meta">${esc(m.example)}</p></span></button>`).join('')}</div>
    <div class="xp-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${day.targetKcal}" aria-valuenow="${day.kcal}" aria-label="已打勾的熱量"><i style="--p:${(day.targetKcal ? Math.min(1, day.kcal / day.targetKcal) : 0).toFixed(3)}"></i></div>
    <div class="xp-line"><span>已打勾</span><span class="num" id="nut-sum">${num(day.kcal)} / ${num(day.targetKcal)} kcal</span></div>
    <p class="small" style="margin:10px 0 0">點一下打勾，再點一次取消。每天 ${String(rules().day.boundaryHour).padStart(2, '0')}:00 重新開始。${esc(C.tip)}</p></section>`;

  const weight = `<section class="card" aria-label="體重"><div class="card-head"><h3 class="card-title">早上體重</h3><span class="tag" id="nut-advice-tag">${esc(adv.tag)}</span></div>
    <form id="nut-weight-form" class="nut-weight" novalidate><div class="field"><label for="nut-weight">今天早上（kg）</label><input type="number" id="nut-weight" inputmode="decimal" step="0.1" min="${W.minKg}" max="${W.maxKg}" autocomplete="off" value="${tr.today === null ? '' : kg1(tr.today)}"></div><button type="submit" class="btn" id="nut-weight-save">記錄</button></form>
    <p class="small" id="nut-weight-msg" role="status" style="margin:0 0 10px"></p>
    <div class="nut-stats"><div><span class="small">7 天平均</span><b class="num" id="nut-avg">${tr.avg7 === null ? '—' : `${kg1(tr.avg7)} kg`}</b></div><div><span class="small">每週變化</span><b class="num" id="nut-change">${tr.change === null ? '—' : `${signed(tr.change)} kg`}</b></div></div>
    <p id="nut-advice" style="margin:12px 0 0">${esc(adv.text)}</p>
    <p class="small" style="margin:10px 0 0">${esc(C.weighIn)}${esc(C.pace)}</p>
    <p class="small" style="margin:6px 0 0">${esc(C.rule)}</p></section>`;

  $('nutrition-body').innerHTML = target + meals + weight + `<p class="version" id="nut-disclaimer">${esc(C.disclaimer)}</p>`;
  $('nutrition-body').querySelectorAll('[data-meal]').forEach((b) => { b.onclick = async () => { toggleMeal(v4(), date, b.dataset.meal); await commit(); renderNutrition(); }; });
  $('nut-weight-form').onsubmit = async (ev) => {
    ev.preventDefault();
    const raw = $('nut-weight').value.trim();
    const kg = Math.round(Number(raw) * 10) / 10;
    if (raw === '' || !Number.isFinite(kg) || kg < W.minKg || kg > W.maxKg) { $('nut-weight-msg').textContent = `請輸入 ${W.minKg}–${W.maxKg} 之間的數字。`; return; }
    setWeight(v4(), { date, kg, now: now() });
    await commit();
    renderNutrition();
    $('nut-weight-msg').textContent = `已記錄 ${kg1(kg)} kg。`;
  };
}
