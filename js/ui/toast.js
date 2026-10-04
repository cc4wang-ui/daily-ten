/* Daily Ten — 底部 toast：打卡後「已記錄…　復原」，10 秒內可復原（ui-engineer 規則 3）。
   畫面是 index.html 的 #toast（浮在分頁列上方、訓練畫面之下）。同時只有一則：新的會取代舊的。
   顯示中 js/app.js 的 isIdle() 視為忙碌，自動更新（D23）不會在可復原期間重新載入。
   期限與動效時間取自 tokens.css（--undo-ms、--undone-ms）；出現時只動 transform／opacity，減少動態改淡入（app.css）。 */
import { $ } from './dom.js';
import { icon } from './icons.js';

let timer = null;

function tokenMs(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const m = /^(\d+(?:\.\d+)?)(ms|s)$/.exec(v);
    return m ? Number(m[1]) * (m[2] === 's' ? 1000 : 1) : fallback;
  } catch (e) { return fallback; }
}
export const undoMs = () => tokenMs('--undo-ms', 10000);
export const noticeMs = () => tokenMs('--undone-ms', 2500);

export function hideToast() {
  clearTimeout(timer);
  timer = null;
  const el = $('toast');
  if (!el) return;
  el.hidden = true;
  el.classList.remove('in');
  const btn = $('toast-action');
  if (btn) btn.onclick = null;
}

/* text：一行訊息；action：{label, run}（例如 復原）；ms：多久後自動收起 */
export function showToast(text, { action = null, ms = noticeMs() } = {}) {
  const el = $('toast');
  if (!el) return;
  clearTimeout(timer);
  $('toast-text').textContent = text;
  const btn = $('toast-action');
  if (action && typeof action.run === 'function') {
    btn.innerHTML = `${icon('undo', { size: 16 })}<span>${action.label}</span>`;
    btn.hidden = false;
    btn.onclick = () => { hideToast(); action.run(); };
  } else {
    btn.hidden = true;
    btn.onclick = null;
  }
  el.classList.remove('in');
  el.hidden = false;
  void el.offsetWidth; // 重新播放出現動畫
  el.classList.add('in');
  timer = setTimeout(hideToast, ms);
}

export function toastVisible() {
  const el = $('toast');
  return !!el && !el.hidden;
}
