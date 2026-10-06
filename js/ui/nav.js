/* Daily Ten — 導覽：goTo(id) 同步切畫面並重畫該畫面（不 await、不動態 import）。
   各畫面的 render 由 js/app.js 開機時用 onScreen() 登記；本檔只依賴 dom.js，避免循環 import。
   訓練進行中（守門函式回 true）一律不切畫面，回 false。 */
import { showScreen } from './dom.js';

const renders = new Map();
let busy = () => false;

export function setNavGuard(fn) { busy = typeof fn === 'function' ? fn : () => false; }
export function onScreen(id, render) { renders.set(id, render); }

export function goTo(id) {
  try { if (busy()) return false; } catch (e) { return false; }
  showScreen(id);
  const render = renders.get(id);
  if (render) render();
  return true;
}
