/* Daily Ten — 進度：KPI 磚、12 週熱力圖（三習慣）、健身房每週長條、PR、成就。全部純 SVG／DOM，不引入圖表庫。 */
import { $, esc } from './dom.js';
import { icon } from './icons.js';
import { summary, rules, achievementsData } from './model.js';
import { weekDays, weekStartOf } from '../game/core.js';
import { dayNumber, dayNumberToStr } from '../state/time.js';

const num = (n) => Number(n || 0).toLocaleString('zh-Hant-TW');

export function renderProgress() {
  const sum = summary(), R = rules();
  const tiles = `<div class="tiles">
    <div class="tile"><p class="k">總 XP · Lv ${sum.level.lv}</p><p class="v num">${num(sum.xp.total)}</p></div>
    <div class="tile"><p class="k">連續天數 · 最長 ${sum.streak.best}</p><p class="v num">${sum.streak.current}<small> 天</small></p></div>
    <div class="tile gym"><p class="k">健身房</p><p class="v num">${sum.counts.gym}<small> 次 · ${num(sum.counts.volume)} kg</small></p></div>
    <div class="tile stretch"><p class="k">伸展</p><p class="v num">${sum.counts.stretch}<small> 天</small></p></div>
    <div class="tile explore"><p class="k">探索</p><p class="v num">${sum.counts.explore}<small> 件 · ${sum.counts.categories} 類</small></p></div>
    <div class="tile"><p class="k">Perfect Day · Week</p><p class="v num">${sum.perfectDays.length}<small> · ${sum.perfectWeeks.length}</small></p></div>
  </div>`;

  /* 熱力圖：12 週 × 7 天；深淺＝當天完成的習慣數 */
  const weeks = num(R.heatmapWeeks) ? R.heatmapWeeks : 12;
  const ws = weekStartOf(sum.today.date, R);
  const todayN = dayNumber(sum.today.date);
  const dayMap = new Map();
  for (const w of sum.weeks) for (const [d, v] of Object.entries(w.days)) dayMap.set(d, v);
  const cols = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = dayNumberToStr(dayNumber(ws) - i * 7);
    cols.push(`<div class="col">${weekDays(start).map((d) => { const v = dayMap.get(d); const n = v ? (v.gym ? 1 : 0) + (v.stretch ? 1 : 0) + (v.explore ? 1 : 0) : 0; const fut = dayNumber(d) > todayN; return `<i class="c${n ? ` l${Math.min(4, n + (n >= 2 ? 1 : 0))}` : ''}${fut ? ' future' : ''}" title="${d}"></i>`; }).join('')}</div>`);
  }
  const heat = `<section class="card"><div class="card-head"><h3 class="card-title">近 ${weeks} 週</h3><span class="small">越深＝那天完成越多</span></div><div class="heat">${cols.join('')}</div></section>`;

  /* 健身房每週長條（8 週） */
  const bars = [];
  for (let i = 7; i >= 0; i--) {
    const start = dayNumberToStr(dayNumber(ws) - i * 7);
    const w = sum.weeks.find((x) => x.start === start);
    const c = w ? w.gym : 0, tgt = R.habits.gym.weeklyTarget;
    bars.push(`<div class="b"><i class="${c >= tgt ? 'hit' : ''}" style="height:${Math.max(6, Math.round((Math.min(c, tgt + 1) / (tgt + 1)) * 60))}px"></i><span class="num">${c}</span><span class="wk">${start.slice(5).replace('-', '/')}</span></div>`);
  }
  const gymBars = `<section class="card"><div class="card-head"><h3 class="card-title">健身房 每週次數</h3><span class="small">目標 ${R.habits.gym.weeklyTarget}／週</span></div><div class="bars">${bars.join('')}</div></section>`;

  const prs = sum.prs.length ? `<section class="card"><div class="card-head"><h3 class="card-title">PR</h3><span class="small">估計 1RM 創新高</span></div><div class="list">${sum.prs.slice(0, 10).map((p) => `<div class="row"><div class="body"><p class="t">${esc(p.name)}</p><p class="s">${esc(p.date)}</p></div><div class="r num" style="color:var(--gym-ink)">${p.weight} kg × ${p.reps}</div></div>`).join('')}</div></section>` : '';
  const bests = Object.entries(sum.bests);
  const bestCard = bests.length ? `<section class="card"><div class="card-head"><h3 class="card-title">每個動作的最佳</h3></div><div class="list">${bests.map(([id, b]) => `<div class="row"><div class="body"><p class="t">${esc(b.name || id)}</p><p class="s">${esc(b.date)}</p></div><div class="r num">${b.weight} kg × ${b.reps}</div></div>`).join('')}</div></section>` : '';

  const A = achievementsData(), U = sum.achievements.unlocked, L = Object.fromEntries(sum.achievements.locked.map((x) => [x.id, x]));
  const badges = `<div class="card-head" style="margin-top:20px"><h3 class="card-title">成就 ${Object.keys(U).length}/${A.length}</h3></div><div class="badges">${A.map((a) => { const u = U[a.id]; const l = L[a.id]; return `<div class="badge${u ? '' : ' locked'}" title="${esc(a.desc)}"><div class="em">${icon(u ? 'trophy' : 'lock', { size: 20 })}</div><p class="n">${esc(a.name)}</p><p class="d">${u ? esc(u) : esc(a.desc)}</p>${!u && l && a.n > 1 ? `<div class="p"><i style="--p:${(l.progress / l.n).toFixed(2)}"></i></div>` : ''}</div>`; }).join('')}</div>`;

  $('progress-body').innerHTML = tiles + heat + gymBars + prs + bestCard + badges;
}
