/* Daily Ten — 統計分頁：上方三格（累計 XP、最佳連續、訓練天數）＋「訓練紀錄」（history.js）／「身體指標」（body.js）兩段。
   三格的數字跟著 renderHome() 一起更新（同 M1 首頁的 XP／BEST），隱藏中也不會是舊值。
   B1：累計 XP＝engine 的 summary.xp.total、最佳連續＝summary.streak.best（全 App 只有新尺度一種 XP）；
   遊戲層未就緒時退回舊欄位 xp／streak.best。 */
import { getState } from '../state/store.js';
import { $ } from './dom.js';
import { summary } from './game.js';
import { renderHist } from './history.js';
import { renderBody } from './body.js';

export function renderKpis(sum = summary()) {
  const st = getState();
  const xp = sum && sum.xp && Number.isFinite(sum.xp.total) ? sum.xp.total : st.xp;
  const best = sum && sum.streak && Number.isFinite(sum.streak.best) ? sum.streak.best : st.streak.best;
  $('h-xp').textContent = xp;
  $('h-best').textContent = best;
  $('st-count').textContent = Array.isArray(st.sessions) ? st.sessions.length : 0;
}

export function renderStats() {
  renderKpis();
  renderHist();
  renderBody();
}
