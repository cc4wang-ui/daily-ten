/* Daily Ten — 入口：載入 state、接線、首次 render、分頁切換、Service Worker 註冊。
   M1 自 index.html 原樣搬出（行為零變更）；state 一律經由 js/state/store.js。 */
import { loadState, getState } from './state/store.js';
import { $, showScreen } from './ui/dom.js';
import { minimalSeq, rainSeq } from './ui/program.js';
import { closeDemo } from './ui/demo.js';
import { startWorkout, isTraining } from './ui/train.js';
import { renderHome } from './ui/home.js';
import { renderHist } from './ui/history.js';
import { renderBody, wireBody } from './ui/body.js';
import { renderSetup } from './ui/setup.js';

/* ================= WIRE ================= */
document.querySelectorAll('#tabs button').forEach(b=>{
  b.onclick=()=>{ if(isTraining())return; showScreen(b.dataset.s);
    if(b.dataset.s==='s-hist')renderHist();
    if(b.dataset.s==='s-body')renderBody();
    if(b.dataset.s==='s-setup')renderSetup();
    if(b.dataset.s==='s-home')renderHome(); };
});
$('h-minimal').onclick=()=>startWorkout(minimalSeq(getState().level),'minimal');
$('h-rain').onclick=()=>startWorkout(rainSeq(),'rain');
$('d-ok').onclick=()=>{$('done').classList.remove('active');renderHome();showScreen('s-home');};
$('dm-close').onclick=closeDemo;
$('demo-modal').onclick=e=>{if(e.target===$('demo-modal'))closeDemo();};
/* ================= INIT ================= */
(async function(){
  await loadState();
  wireBody();
  renderHome();renderSetup();renderBody();
})();
/* ===== PWA: 註冊 Service Worker（離線可用）===== */
if('serviceWorker' in navigator){
  const register=()=>{
    navigator.serviceWorker.register('./sw.js').catch(e=>console.warn('SW 註冊失敗',e));
  };
  /* module 可能在 load 事件之後才執行完：已 complete 就直接註冊 */
  if(document.readyState==='complete')register();
  else window.addEventListener('load',register);
}
