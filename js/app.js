/* Daily Ten — 入口：載入 state、接線、首次 render、分頁切換、Service Worker 註冊。
   M1 自 index.html 原樣搬出（行為零變更）；state 一律經由 js/state/store.js。
   1b：loadState() 回 repaired／recovered 時顯示 HOME 錯誤卡；整個開機流程包在 try/catch，
   module 改成在 boot() 裡動態 import——任何一個檔案載入或執行失敗，都會落到 showFatal()，不會白屏。
   D23：自動更新的頁面端（SW 通知 → 回 ACK → 閒置才重新載入；回到前景／恢復連線時檢查新版），見下方「自動更新」。 */

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

/* ===== 自動更新（D23）：純 DOM，不依賴其他 module；不支援 SW 或 SW 被封鎖時全部安靜略過 =====
   新版 SW 啟用後會送 {type:'DT_UPDATE_READY', version}，附一個 MessagePort：
   1. 立刻從 port 回 {type:'DT_UPDATE_ACK'}（3 秒內沒回，SW 會直接重新導向，那是給舊版頁面用的）。
   2. 閒置才重新載入：沒在訓練、沒有訓練／完成／示範畫面、匯入預覽沒開、不在 Boss 成績輸入；否則每 2 秒再看一次。
   3. 重新載入前把版本名存進 sessionStorage，開機後在 HOME 提示一次（畫面在 js/ui/update.js）。
   另外：回到前景（visibilitychange → visible）與恢復連線（online）時請瀏覽器檢查新版，60 秒內最多一次——
   iPhone 從背景切回 App 不算重開，不檢查就會一直停在舊版。 */
const UPDATED_KEY='daily-ten-updated-to'; // sessionStorage：重新載入後要提示的版本名（例 daily-ten-v8）
const IDLE_POLL_MS=2000;
const UPDATE_CHECK_MS=60000;
let trainingNow=null; // boot() 載入 train.js 後換成 isTraining；載入前（或載入失敗）只看畫面
let pendingVersion=null,idleTimer=null,lastUpdateCheck=null;
function isIdle(){
  if(trainingNow&&trainingNow())return false;
  const active=id=>{const el=document.getElementById(id);return !!el&&el.classList.contains('active');};
  if(active('train')||active('done')||active('demo-modal')||active('s-boss'))return false;
  /* 匯入預覽：hidden 屬性關掉，或所在的 SETUP 不在前景（離開 SETUP 再回來時預覽本來就會被收起）都算沒開 */
  const pv=document.getElementById('imp-preview');
  return !pv||pv.hidden||pv.getClientRects().length===0;
}
function reloadWhenIdle(){
  try{if(!isIdle())return;}catch(e){return;} // 判斷不了就當作忙碌：寧可等下次開 App，也不打斷
  clearInterval(idleTimer);idleTimer=null;
  try{sessionStorage.setItem(UPDATED_KEY,pendingVersion||'');}catch(e){}
  location.reload();
}
function onSwMessage(ev){
  const d=ev&&ev.data;
  if(!d||d.type!=='DT_UPDATE_READY')return;
  try{if(ev.ports&&ev.ports[0])ev.ports[0].postMessage({type:'DT_UPDATE_ACK'});}catch(e){}
  pendingVersion=typeof d.version==='string'?d.version:'';
  if(!idleTimer)idleTimer=setInterval(reloadWhenIdle,IDLE_POLL_MS);
  reloadWhenIdle();
}
function checkForUpdate(){
  const now=Date.now();
  /* 60 秒節流；系統時間被往回調時不擋 */
  if(lastUpdateCheck!==null&&now>=lastUpdateCheck&&now-lastUpdateCheck<UPDATE_CHECK_MS)return;
  lastUpdateCheck=now;
  try{navigator.serviceWorker.getRegistration().then(r=>r&&r.update()).catch(()=>{});}catch(e){}
}
/* 上一次重新載入是自動更新造成的：取出版本名（只用一次），開機後交給 js/ui/update.js 顯示 */
let updatedTo=null;
try{updatedTo=sessionStorage.getItem(UPDATED_KEY);if(updatedTo!==null)sessionStorage.removeItem(UPDATED_KEY);}catch(e){}
/* module 頂層、任何 await 之前就接上：開機途中送來的通知也收得到 */
try{
  if('serviceWorker' in navigator){
    const swc=navigator.serviceWorker;
    swc.addEventListener('message',onSwMessage);
    if(typeof swc.startMessages==='function')swc.startMessages();
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')checkForUpdate();});
    window.addEventListener('online',checkForUpdate);
  }
}catch(e){}
/* 「已更新」提示與 SETUP 版本行：非必要畫面，另外載入，失敗也不影響 App */
let updateUi=null;
function loadUpdateUi(){
  import('./ui/update.js').then(m=>{
    updateUi=m;
    if(updatedTo!==null)m.showUpdatedNote(updatedTo);
    m.renderAppVersion();
  }).catch(e=>console.warn('更新提示載入失敗',e));
}

async function boot(){
  const [store,dom,program,demo,train,home,history,body,setup,backupUi]=await Promise.all([
    import('./state/store.js'),import('./ui/dom.js'),import('./ui/program.js'),import('./ui/demo.js'),
    import('./ui/train.js'),import('./ui/home.js'),import('./ui/history.js'),import('./ui/body.js'),
    import('./ui/setup.js'),import('./ui/backup.js')]);
  const {loadState,getState}=store, {$,showScreen}=dom, {minimalSeq,rainSeq}=program, {closeDemo}=demo,
        {startWorkout,isTraining}=train, {renderHome}=home, {renderHist}=history, {renderBody,wireBody}=body,
        {renderSetup}=setup, {showLoadError}=backupUi;
  trainingNow=isTraining;
  /* ================= WIRE ================= */
  document.querySelectorAll('#tabs button').forEach(b=>{
    b.onclick=()=>{ if(isTraining())return; showScreen(b.dataset.s);
      if(b.dataset.s==='s-hist')renderHist();
      if(b.dataset.s==='s-body')renderBody();
      if(b.dataset.s==='s-setup'){renderSetup();if(updateUi)updateUi.renderAppVersion();}
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
  loadUpdateUi();
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
