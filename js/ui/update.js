/* Daily Ten — 自動更新（D23）的畫面：HOME「已更新到最新版（vN）」提示一次、SETUP 最下方「App 版本 vN」。
   與 Service Worker 的協定（回 ACK、閒置才重新載入）在 js/app.js；這裡只管顯示，拿不到資料就不顯示、不丟錯。
   提示浮在 HOME 最上方（不推動版面、不擋點擊），約 4 秒後消失。動態只動 opacity，時間取自 tokens.css 的 --fade-ms；
   prefers-reduced-motion: reduce、或訓練畫面已蓋上來時，直接出現／消失。 */
import { $ } from './dom.js';

const NOTE_MS = 4000; // 提示停留時間（從出現起算）
const CACHE_RE = /^daily-ten-v(\d+)$/;

/* 'daily-ten-v8' → 'v8'；格式不符回空字串 */
export function versionLabel(name) {
  const m = CACHE_RE.exec(String(name || ''));
  return m ? `v${m[1]}` : '';
}

function fadeMs() {
  try {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return 0;
    const v = getComputedStyle(document.documentElement).getPropertyValue('--fade-ms').trim();
    const m = /^(\d+(?:\.\d+)?)(ms|s)$/.exec(v);
    return m ? Number(m[1]) * (m[2] === 's' ? 1000 : 1) : 0;
  } catch (e) { return 0; }
}
/* 元素真的看得到（HOME 在前景）、而且沒有被訓練畫面蓋住才播淡入淡出 */
function canFade(el) {
  const train = $('train');
  return el.getClientRects().length > 0 && !(train && train.classList.contains('active'));
}
/* 只動 opacity；不需要或不支援時回 null（呼叫端直接切換） */
function fade(el, from, to, keepEnd) {
  const ms = fadeMs();
  if (!ms || typeof el.animate !== 'function' || !canFade(el)) return Promise.resolve(null);
  const a = el.animate([{ opacity: from }, { opacity: to }], { duration: ms, easing: 'ease-out', fill: keepEnd ? 'forwards' : 'none' });
  return a.finished.then(() => a, () => a);
}
/* 頁面在背景時（例如在背景自動重新載入）先不顯示，等使用者切回來才開始計時 */
function whenVisible(fn) {
  if (document.visibilityState !== 'hidden') { fn(); return; }
  const on = () => {
    if (document.visibilityState === 'hidden') return;
    document.removeEventListener('visibilitychange', on);
    fn();
  };
  document.addEventListener('visibilitychange', on);
}

let noteTimer = null;
export function showUpdatedNote(version) {
  const el = $('upd-note');
  if (!el) return;
  const label = versionLabel(version);
  whenVisible(() => {
    el.textContent = label ? `已更新到最新版（${label}）` : '已更新到最新版';
    el.className = 'banner ok';
    fade(el, 0, 1, false);
    clearTimeout(noteTimer);
    noteTimer = setTimeout(async () => {
      const a = await fade(el, 1, 0, true);
      el.className = 'banner';
      el.textContent = '';
      if (a) a.cancel();
    }, NOTE_MS);
  });
}

/* SETUP 最下方的版本行：Cache Storage 裡 daily-ten-v* 的最大 N；拿不到（不支援、SW 被封鎖、還沒快取）就隱藏 */
export async function renderAppVersion() {
  const el = $('app-version');
  if (!el) return;
  let n = 0;
  try {
    for (const k of await caches.keys()) {
      const m = CACHE_RE.exec(k);
      if (m) n = Math.max(n, Number(m[1]));
    }
  } catch (e) { n = 0; }
  el.textContent = n ? `App 版本 v${n}` : '';
  el.hidden = !n;
}
