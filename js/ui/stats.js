/* Daily Ten — 統計分頁：上方三格（累計 XP、最佳連續、訓練天數）＋「訓練紀錄」（history.js）／「身體指標」（body.js）兩段。
   三格的數字跟著 renderHome() 一起更新（同 M1 首頁的 XP／BEST），隱藏中也不會是舊值。 */
import { getState } from '../state/store.js';
import { $ } from './dom.js';
import { renderHist } from './history.js';
import { renderBody } from './body.js';

export function renderKpis() {
  const st = getState();
  $('h-xp').textContent = st.xp;
  $('h-best').textContent = st.streak.best;
  $('st-count').textContent = Array.isArray(st.sessions) ? st.sessions.length : 0;
}

export function renderStats() {
  renderKpis();
  renderHist();
  renderBody();
}
