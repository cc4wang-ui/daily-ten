/* Daily Ten — DOM 小工具：$、showScreen、esc。畫面：今日 s-home、健身房 s-gym、伸展 s-stretch、探索 s-explore、進度 s-progress、設定 s-settings（從今日進入，亮「今日」）。 */
export const $ = (id) => document.getElementById(id);
export const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const TAB_OF = { 's-home': 's-home', 's-settings': 's-home', 's-gym': 's-gym', 's-stretch': 's-stretch', 's-explore': 's-explore', 's-progress': 's-progress' };
export function showScreen(id) {
  const el = $(id); if (!el) return;
  const changed = !el.classList.contains('active');
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s === el));
  const tab = TAB_OF[id] || null;
  document.querySelectorAll('#tabs button').forEach((b) => {
    const on = b.dataset.s === tab;
    b.classList.toggle('on', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  if (changed) window.scrollTo(0, 0);
}
export function activeScreen() { const s = document.querySelector('.screen.active'); return s ? s.id : null; }
