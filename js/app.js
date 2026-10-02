/* Daily Ten — 入口：載入 state、接線、首次 render、分頁切換、Service Worker 註冊。
   M1 自 index.html 原樣搬出（行為零變更）；state 一律經由 js/state/store.js。
   1b：loadState() 回 repaired／recovered 時顯示 HOME 錯誤卡；整個開機流程包在 try/catch，
   module 改成在 boot() 裡動態 import——任何一個檔案載入或執行失敗，都會落到 showFatal()，不會白屏。 */

/* ===== 啟動失敗保護：純 DOM，不依賴任何其他 module ===== */
const RAW_KEY='daily-ten-state'; // 與 store.js 的 STORAGE_KEY 相同；store 載入失敗時也要能下載
const FATAL_TEXT='App 啟動時發生問題。資料仍在這台裝置上，請先下載保存。';
function rawFallback(){
  /* backup.js 也載不到時：直接把主 key 的原始字串存成檔案 */
  try{
    const raw=localStorage.getItem(RAW_KEY);
    if(raw===null)return {ok:false,message:'找不到原始資料'};
    const d=new Date(),p=n=>String(n).padStart(2,'0');
    const filename='daily-ten-raw-'+d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'.txt';
    const url=URL.createObjectURL(new Blob([raw],{type:'text/plain;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download=filename;a.style.display='none';
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
    return {ok:true,filename};
  }catch(e){return {ok:false,message:'原始資料下載失敗，請再試一次'};}
}
async function downloadRaw(){
  let mod=null;
  try{mod=await import('./state/backup.js');}catch(e){return rawFallback();}
  return mod.downloadRawBackup(RAW_KEY);
}
function showFatal(err){
  try{console.error('Daily Ten 啟動失敗',err);}catch(e){}
  try{
    document.querySelectorAll('.screen').forEach(s=>s.classList.toggle('active',s.id==='s-home'));
    document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('on',b.dataset.s==='s-home'));
    ['train','done','demo-modal'].forEach(id=>{const el=document.getElementById(id);if(el)el.classList.remove('active');});
    if(document.getElementById('boot-error'))return;
    const card=document.createElement('div');
    card.id='boot-error';card.className='banner danger';card.setAttribute('role','alert');card.style.margin='20px 18px 0';
    const msg=document.createElement('div');msg.textContent=FATAL_TEXT;
    const btn=document.createElement('button');btn.id='boot-error-download';btn.className='btn-sub';btn.textContent='下載原始資料';
    const note=document.createElement('div');note.className='small';
    btn.onclick=async()=>{const r=await downloadRaw();note.textContent=r.ok?'已下載 '+r.filename:r.message;};
    card.append(msg,btn,note);
    const host=document.getElementById('app')||document.body;
    host.insertBefore(card,host.firstChild);
  }catch(e){/* 連錯誤卡都畫不出來：HOME 的靜態 markup 仍然可見 */}
}

async function boot(){
  const [store,dom,program,demo,train,home,history,body,setup,backupUi]=await Promise.all([
    import('./state/store.js'),import('./ui/dom.js'),import('./ui/program.js'),import('./ui/demo.js'),
    import('./ui/train.js'),import('./ui/home.js'),import('./ui/history.js'),import('./ui/body.js'),
    import('./ui/setup.js'),import('./ui/backup.js')]);
  const {loadState,getState}=store, {$,showScreen}=dom, {minimalSeq,rainSeq}=program, {closeDemo}=demo,
        {startWorkout,isTraining}=train, {renderHome}=home, {renderHist}=history, {renderBody,wireBody}=body,
        {renderSetup}=setup, {showLoadError}=backupUi;
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
  const loaded=await loadState();
  wireBody();
  renderHome();renderSetup();renderBody();
  if(loaded&&(loaded.status==='repaired'||loaded.status==='recovered'))showLoadError(loaded.error);
}
boot().catch(showFatal);

/* ===== PWA: 註冊 Service Worker（離線可用）===== */
if('serviceWorker' in navigator){
  const register=()=>{
    navigator.serviceWorker.register('./sw.js').catch(e=>console.warn('SW 註冊失敗',e));
  };
  /* module 可能在 load 事件之後才執行完：已 complete 就直接註冊 */
  if(document.readyState==='complete')register();
  else window.addEventListener('load',register);
}
