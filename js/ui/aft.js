/* Daily Ten — AFT 自選目標差距卡（今日）與統計的門檻線文字。
   原則 4：17–21 歲標準只稱「自選目標」，不宣稱正式 AFT 通過。差距以「最近一次」Boss Day 成績計算。
   門檻屬目標數值（原則 10 應放 data/*.json）：有 rules.aft（data/game.json）就用；
   還沒有時沿用 M1 畫面上既有的同一組數字（RECORDS 門檻線：15 下、1:30、19:57），不是新增的規則。 */
import { getState } from '../state/store.js';
import { $ } from './dom.js';
import { icon } from './icons.js';
import { gameRules } from './game.js';

const M1_TARGETS = Object.freeze({
  note: '17–21 歲 60 分門檻',
  items: [
    { id: 'hrp', name: 'HRP 伏地挺身', pr: 'hrp', field: 'reps', target: 15, better: 'higher', unit: 'reps' },
    { id: 'plank', name: 'Plank', pr: 'plank', field: 'sec', target: 90, better: 'higher', unit: 'sec' },
    { id: 'run2mi', name: '2 英里跑', pr: 'run2mi', field: 'sec', target: 1197, better: 'lower', unit: 'sec' }
  ]
});

const validItem = (x) => x && typeof x.name === 'string' && typeof x.pr === 'string' && typeof x.field === 'string'
  && Number.isFinite(x.target) && x.target > 0 && (x.better === 'higher' || x.better === 'lower');

export function aftTargets() {
  const r = gameRules();
  const a = r && r.aft;
  if (a && Array.isArray(a.items) && a.items.length && a.items.every(validItem)) {
    return { note: typeof a.note === 'string' ? a.note : M1_TARGETS.note, items: a.items };
  }
  return M1_TARGETS;
}

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
export function fmtValue(item, v) { return item.unit === 'sec' ? mmss(v) : `${v} 下`; }
function fmtGap(item, d) {
  if (item.unit === 'sec') return d < 60 ? `${Math.round(d)} 秒` : mmss(d);
  return `${d} 下`;
}
/* 統計 PR 卡的門檻線（例：自選目標 ≥ 15 下） */
export function passText(item) { return `自選目標 ${item.better === 'lower' ? '≤' : '≥'} ${fmtValue(item, item.target)}`; }

/* 最近一次的成績（日期最大；同日取最後一筆） */
function latest(list, field) {
  let best = null;
  for (const p of Array.isArray(list) ? list : []) {
    if (!p || !Number.isFinite(p[field]) || typeof p.date !== 'string') continue;
    if (!best || p.date >= best.date) best = p;
  }
  return best ? best[field] : null;
}

function row(item, v) {
  const has = v !== null;
  const ratio = !has ? 0 : item.better === 'lower' ? Math.min(1, item.target / Math.max(v, 1)) : Math.min(1, v / item.target);
  const gap = !has ? 0 : item.better === 'lower' ? v - item.target : item.target - v;
  const status = !has ? '<span class="aft-gap none">還沒有紀錄 · 週日 Boss Day 測一次</span>'
    : gap > 0 ? `<span class="aft-gap">差 ${fmtGap(item, gap)}</span>`
      : `<span class="aft-gap ok">${icon('check', { size: 14 })}已達自選目標</span>`;
  return `<div class="aft-row"><div class="aft-top"><span class="aft-name">${item.name}</span>`
    + `<span class="aft-val"><b class="num">${has ? fmtValue(item, v) : '—'}</b> / ${fmtValue(item, item.target)}</span></div>`
    + `<div class="bar move" aria-hidden="true"><i style="width:${(ratio * 100).toFixed(1)}%"></i></div>${status}</div>`;
}

export function renderAft() {
  const host = $('h-aft-rows');
  if (!host) return;
  const t = aftTargets();
  const prs = getState().prs || {};
  $('h-aft-note').textContent = t.note;
  host.innerHTML = t.items.map((it) => row(it, latest(prs[it.pr], it.field))).join('');
}
