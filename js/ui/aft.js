/* Daily Ten — AFT 自選目標差距卡（今日）與統計的門檻線文字。
   原則 4：17–21 歲標準只稱「自選目標」，不宣稱正式 AFT 通過。
   遊戲層就緒時一律用 engine 的 aftGaps(state, rules)：歷來最佳、門檻與文案都在 data/game.json（aft、copy.aft）。
   規則檔讀不到時才用下面的 M1 對照表（同一組數字：15 下、1:30、19:57），算法與 engine 相同（歷來最佳）。 */
import { getState } from '../state/store.js';
import { $ } from './dom.js';
import { icon } from './icons.js';
import { gameRules, aftGaps } from './game.js';

const M1 = Object.freeze({
  title: 'AFT 自選目標差距',
  subtitle: '17–21 歲 60 分門檻 · 自選目標，不是正式 AFT 測驗',
  items: [
    { key: 'hrp', name: 'HRP 伏地挺身', field: 'reps', unit: 'reps', better: 'higher', target: 15 },
    { key: 'plank', name: 'Plank', field: 'sec', unit: 'sec', better: 'higher', target: 90 },
    { key: 'run2mi', name: '2 英里跑', field: 'sec', unit: 'sec', better: 'lower', target: 1197 }
  ]
});

const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
const fmtValue = (it, v) => (it.unit === 'sec' ? mmss(v) : `${v} 下`);

/* 門檻（統計的門檻線用）：data/game.json 的 aft.items（以 key 對應 prs）；沒有規則時用 M1 表 */
export function aftTargets() {
  const r = gameRules();
  const items = r && r.aft && Array.isArray(r.aft.items) ? r.aft.items : null;
  return items && items.length ? items : M1.items;
}
/* 統計 PR 卡的門檻線（例：自選目標 ≥ 15 下） */
export function passText(it) { return `自選目標 ${it.better === 'lower' ? '≤' : '≥'} ${fmtValue(it, it.target)}`; }

/* 沒有遊戲層時：和 engine.aftGaps 同樣的形狀與算法（歷來最佳） */
function fallbackGaps(prs) {
  const items = M1.items.map((it) => {
    let best = null;
    for (const p of Array.isArray(prs[it.key]) ? prs[it.key] : []) {
      const v = p && p[it.field];
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || (it.better === 'lower' && v === 0)) continue;
      if (best === null || (it.better === 'lower' ? v < best : v > best)) best = v;
    }
    const gap = best === null ? null : Math.max(0, Math.round(it.better === 'lower' ? best - it.target : it.target - best));
    const gapText = best === null ? '尚無紀錄' : gap === 0 ? '已達自選目標'
      : it.unit === 'reps' ? `差 ${gap} 下` : gap < 60 ? `差 ${gap} 秒` : `差 ${mmss(gap)}`;
    return { key: it.key, name: it.name, unit: it.unit, target: it.target, best, gap, met: gap === 0,
      bestText: best === null ? '—' : fmtValue(it, Math.round(best)), targetText: fmtValue(it, it.target), gapText, better: it.better };
  });
  return { title: M1.title, subtitle: M1.subtitle, items };
}

function row(it, better) {
  const has = it.best !== null && it.best !== undefined;
  const ratio = !has ? 0 : it.met ? 1
    : better === 'lower' ? Math.min(1, it.target / Math.max(it.best, 1)) : Math.min(1, it.best / it.target);
  const status = !has ? `<span class="aft-gap none">${it.gapText}</span>`
    : it.met ? `<span class="aft-gap ok">${icon('check', { size: 14 })}${it.gapText}</span>`
      : `<span class="aft-gap">${it.gapText}</span>`;
  return `<div class="aft-row"><div class="aft-top"><span class="aft-name">${it.name}</span>`
    + `<span class="aft-val"><b class="num">${it.bestText}</b> / ${it.targetText}</span></div>`
    + `<div class="bar move" aria-hidden="true"><i style="width:${(ratio * 100).toFixed(1)}%"></i></div>${status}</div>`;
}

export function renderAft() {
  const host = $('h-aft-rows');
  if (!host) return;
  const g = aftGaps() || fallbackGaps(getState().prs || {});
  const betterOf = Object.fromEntries(aftTargets().map((t) => [t.key, t.better]));
  $('h-aft-title').textContent = g.title;
  $('h-aft-note').textContent = g.subtitle;
  host.innerHTML = g.items.map((it) => row(it, it.better || betterOf[it.key])).join('');
}
