/* Boss timers and unsaved results use a separate, short-lived checkpoint.
   Only active seconds are counted; reload and backgrounding always pause. */
import { getState, saveState } from '../state/store.js';
import { $, showScreen } from './dom.js';
import { todayKey, planLevel } from './game.js';
import { initAudio, beep, speak } from './audio.js';
import { lockScreen, unlockScreen } from './wakelock.js';
import { fullSeq } from './program.js';
import { bossItem } from './session.js';
import { setTrainDemo, stopDemo, openDemo, closeDemo } from './demo.js';
import { getExerciseStoryboard, getStoryboardLabel } from './exercise-media.js';
import { startWorkout, setExternalTraining, recordAndGain, streakDays, showBonusNote } from './train.js';
import { renderHome } from './home.js';

const CHECKPOINT_KEY='daily-ten-active-boss';
const MAX_AGE=24*60*60*1000, MAX_PLANK=3600;
let active=null,cleanup=()=>{};
const integer=(n,max)=>Number.isInteger(n)&&n>=0&&n<=max;
const valueField=item=>item==='hrp'?'reps':'sec';
const validDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)
  &&Number.isFinite(Date.parse(value+'T00:00:00Z'))&&new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value;
function clearCheckpoint(){try{localStorage.removeItem(CHECKPOINT_KEY);}catch{}}
function persist(c){
  if(active!==c)return;
  if(Date.now()-c.createdAt>=MAX_AGE){clearCheckpoint();return;}
  c.savedAt=Date.now();
  try{localStorage.setItem(CHECKPOINT_KEY,JSON.stringify(c));}catch{}
}
function readCheckpoint(){
  try{
    const raw=localStorage.getItem(CHECKPOINT_KEY);
    if(!raw)return null;
    if(raw.length>2000)throw new Error('oversized');
    const c=JSON.parse(raw),age=Date.now()-c.savedAt;
    if(c.v!==1||typeof c.id!=='string'||!/^[a-z0-9-]{1,40}$/.test(c.id)
      ||!validDate(c.date)||!['hrp','plank','run2mi'].includes(c.item)||!['timer','input'].includes(c.stage)
      ||typeof c.interrupted!=='boolean'||!Number.isFinite(c.savedAt)||age< -60000||age>=MAX_AGE
      ||!Number.isFinite(c.createdAt)||c.createdAt>c.savedAt||Date.now()-c.createdAt>=MAX_AGE
      ||!integer(c.seconds,c.item==='hrp'?120:c.item==='plank'?MAX_PLANK:0)
      ||(c.stage==='timer'&&(c.item==='run2mi'||(c.item==='hrp'&&c.seconds===0)))
      ||!c.inputs||typeof c.inputs!=='object'
      ||!['reps','m','s'].every(k=>typeof c.inputs[k]==='string'&&/^[0-9eE.+-]{0,12}$/.test(c.inputs[k])))throw new Error('invalid');
    if(c.commit&&!(c.stage==='input'&&typeof c.commit.date==='string'
      &&validDate(c.commit.date)&&c.commit.date===c.date&&integer(c.commit.index,100000)
      &&integer(c.commit.value,c.item==='hrp'?200:c.item==='plank'?MAX_PLANK:3599)))throw new Error('commit');
    return {v:1,id:c.id,interrupted:c.interrupted,date:c.date,item:c.item,stage:c.stage,seconds:c.seconds,savedAt:c.savedAt,createdAt:c.createdAt,
      inputs:{reps:c.inputs.reps,m:c.inputs.m,s:c.inputs.s},...(c.commit?{commit:c.commit}:{})};
  }catch{clearCheckpoint();return null;}
}
function newCheckpoint(item){
  return {v:1,id:`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`,
    interrupted:false,date:todayKey(),item,stage:item==='run2mi'?'input':'timer',seconds:item==='hrp'?120:0,
    inputs:{reps:'',m:'',s:''},savedAt:Date.now(),createdAt:Date.now()};
}
function alreadyRecorded(c){
  const pr=c.commit&&getState().prs[c.item][c.commit.index];
  return !!pr&&pr.date===c.commit.date&&pr[valueField(c.item)]===c.commit.value;
}
export function resumeBoss(){
  const c=readCheckpoint();
  if(!c)return false;
  // The main state was saved before the draft could be removed. Never award twice.
  if(alreadyRecorded(c)){clearCheckpoint();return false;}
  cleanup();active=c;
  if(c.stage==='timer')bossTimer(c,true);else bossInput(c,true);
  return true;
}
export function startBoss(lv=planLevel()){
  cleanup();active=null;clearCheckpoint();setExternalTraining(false);
  const item=bossItem();
  startWorkout(fullSeq(lv,'A'),'boss',()=>continueBossWarmup(item),{bossItem:item});
}
export function continueBossWarmup(item){
  if(!['hrp','plank','run2mi'].includes(item))return;
  cleanup();clearCheckpoint();active=newCheckpoint(item);persist(active);
  if(active.stage==='timer')bossTimer(active);else bossInput(active);
}
function bossTimer(c,restored=false){
  const hrp=c.item==='hrp';
  let paused=restored||document.visibilityState==='hidden',timer=null,closed=false;
  $('train').classList.add('active');setExternalTraining(true);
  $('train').classList.remove('feedback-open');$('t-feedback').hidden=true;
  initAudio();
  for(const id of ['t-skip','t-show-demo','t-more-rest']){$(id).onclick=null;$(id).hidden=true;}
  $('t-pause').hidden=false;$('t-demo-safety').hidden=false;$('t-no-demo').hidden=true;
  $('t-phase').textContent=hrp?'BOSS · HRP':'BOSS · PLANK';
  $('t-name').textContent=hrp?'HRP 伏地挺身測驗':'平板支撐測驗';
  $('t-sub').textContent=hrp?'2:00 · 自己計數；姿勢失控就停止':'姿勢維持不住就按「結束」';
  $('t-next').textContent='';$('t-abort').textContent='結束';
  const demoName=hrp?'HRP 伏地挺身測驗':'平板支撐測驗';
  const demoKey=setTrainDemo(demoName,null,false);
  const draw=()=>{
    $('t-count').textContent=Math.floor(c.seconds/60)+':'+String(c.seconds%60).padStart(2,'0');
    $('t-bar').style.width=hrp?Math.round((120-c.seconds)/120*100)+'%':'0%';
    $('t-pause').textContent=paused?'繼續':'暫停';
    $('t-checkpoint').classList.toggle('paused',paused);
    $('t-checkpoint').textContent=paused?(restored?'已恢復 · 測驗已暫停':'中斷 · 測驗已暫停'):'檢查點 · 測驗計時';
  };
  const stopTimer=()=>{if(timer!==null){clearInterval(timer);timer=null;}};
  const toInput=()=>{cleanup();c.stage='input';persist(c);bossInput(c);};
  const setPaused=value=>{
    if(closed)return;
    paused=value;if(paused)c.interrupted=true;stopTimer();
    if(paused){unlockScreen();try{speechSynthesis.cancel();}catch{}}
    else{
      restored=false;lockScreen();
      timer=setInterval(()=>{
        if(closed||paused)return;
        if(document.visibilityState==='hidden'){setPaused(true);return;}
        c.seconds=hrp?c.seconds-1:Math.min(MAX_PLANK,c.seconds+1);draw();
        if((hrp&&c.seconds>0)||(!hrp&&c.seconds<MAX_PLANK))persist(c);
        if(hrp&&c.seconds===20)speak('還有二十秒；姿勢維持不住就停止。');
        if(hrp&&c.seconds<=5&&c.seconds>0)beep(880,.08);
        if(!hrp&&c.seconds===90)speak('一分半。只在姿勢能維持時繼續。');
        if(!hrp&&c.seconds===150)speak('兩分半。姿勢維持不住就結束。');
        if(hrp&&c.seconds===0){beep(440,.6);toInput();}
        else if(!hrp&&c.seconds>=MAX_PLANK)toInput();
      },1000);
    }
    draw();persist(c);
  };
  const hidden=()=>{if(document.visibilityState==='hidden')setPaused(true);};
  const pagehide=()=>setPaused(true);
  document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',pagehide);
  cleanup=()=>{
    closed=true;stopTimer();
    document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',pagehide);
    $('t-pause').onclick=$('t-abort').onclick=$('t-show-demo').onclick=null;
    $('t-show-demo').hidden=true;
    closeDemo();stopDemo();unlockScreen();setExternalTraining(false);$('train').classList.remove('active');
    try{speechSynthesis.cancel();}catch{}
  };
  $('t-show-demo').hidden=false;
  const storyboard=getExerciseStoryboard(demoName);
  $('t-show-demo').textContent=storyboard?`查看 ${getStoryboardLabel(storyboard)}動作影格 · 計時會暫停`:'查看動作說明 · 計時會暫停';
  $('t-show-demo').onclick=()=>{
    if(closed)return;
    setPaused(true);
    // Help returns to this paused checkpoint; only the resume button restarts it.
    openDemo(demoKey,demoName,()=>{},demoName);
  };
  $('t-pause').onclick=()=>setPaused(!paused);
  $('t-abort').onclick=()=>{
    if(hrp){cleanup();active=null;clearCheckpoint();renderHome();}
    else toInput();
  };
  setPaused(paused);
  if(!paused)speak(hrp?'HRP測驗。兩分鐘，自行計數；姿勢維持不住就停止。預備，開始。':'Plank測驗。只維持能控制的姿勢；姿勢維持不住就按結束。預備，開始。');
}
function bossInput(c,restored=false){
  showScreen('s-boss');setExternalTraining(true);
  const item=c.item,titles={hrp:'HRP 成績輸入',plank:'Plank 成績確認',run2mi:'2 英里跑 成績輸入'};
  $('b-title').textContent=titles[item];
  const card=$('b-card');
  if(item==='hrp')card.innerHTML='<h3>2 分鐘內完成幾下？</h3><div class="inputrow"><input type="number" id="bi-1" min="0" max="200" inputmode="numeric"><span>下</span></div>';
  else if(item==='plank')card.innerHTML='<h3>本次成績</h3><p class="boss-result num">'+Math.floor(c.seconds/60)+':'+String(c.seconds%60).padStart(2,'0')+'</p>';
  else card.innerHTML='<h3>戶外跑 2 英里（3.2 km），回來輸入時間</h3><div class="inputrow"><input type="number" id="bi-m" min="0" max="59" placeholder="分" inputmode="numeric"><span>分</span><input type="number" id="bi-s" min="0" max="59" placeholder="秒" inputmode="numeric"><span>秒</span></div><p>雨天可改跑步機或延後至下午，當日輸入即可。</p>';
  const runGuide=item==='run2mi'?document.createElement('button'):null;
  if(runGuide){
    runGuide.id='bi-show-demo';runGuide.type='button';runGuide.className='btn-sub';
    runGuide.textContent='查看跑姿影格 · 保留已填時間';
    card.append(runGuide);
  }
  const date=document.createElement('p');date.id='bi-date';date.textContent='測驗日期：'+c.date;
  const interruption=document.createElement('p');interruption.id='bi-interrupted';
  interruption.textContent='本次測驗曾中斷，顯示的是分段計時；確認後再儲存自記成績。';
  interruption.hidden=!c.interrupted||item==='run2mi';
  const saveDay=document.createElement('p');saveDay.id='bi-save-day';
  saveDay.textContent='訓練紀錄與 XP 計入儲存當日，PR 保留上述測驗日期。';
  const updateSaveDay=()=>{saveDay.hidden=c.date===todayKey();};
  updateSaveDay();
  const status=document.createElement('p');status.id='bi-status';status.setAttribute('role','status');
  status.textContent=restored?'已恢復 · 成績尚未儲存':'成績尚未儲存';
  const save=document.createElement('button');save.id='bi-save';save.className='btn-main';save.textContent='儲存 PR';
  const abort=document.createElement('button');abort.id='bi-abort';abort.className='btn-ghost';abort.textContent='取消測驗';
  save.type=abort.type='button';card.append(date,interruption,saveDay,status,save,abort);
  const fields=item==='hrp'?[['bi-1','reps']]:item==='run2mi'?[['bi-m','m'],['bi-s','s']]:[];
  for(const [id,key] of fields){$(id).value=c.inputs[key];$(id).disabled=!!c.commit;$(id).oninput=()=>{c.inputs[key]=$(id).value.slice(0,12);persist(c);};}
  const onHide=()=>{updateSaveDay();persist(c);};
  document.addEventListener('visibilitychange',onHide);window.addEventListener('pagehide',onHide);
  let saving=false,closed=false,gain=0;
  cleanup=()=>{
    closed=true;
    document.removeEventListener('visibilitychange',onHide);window.removeEventListener('pagehide',onHide);
    save.onclick=abort.onclick=null;for(const [id] of fields)$(id).oninput=null;
    if(runGuide){runGuide.onclick=null;runGuide.hidden=true;closeDemo();}
    setExternalTraining(false);
  };
  if(runGuide)runGuide.onclick=()=>{
    if(saving||closed)return;
    persist(c);
    openDemo(null,'2 英里跑',()=>{},'2 英里跑');
    // This page records an externally timed run; there is no App timer to pause.
    $('dm-training-note').hidden=true;
    $('dm-close').textContent='返回成績輸入';
  };
  abort.onclick=()=>{if(saving)return;cleanup();active=null;clearCheckpoint();showScreen('s-home');renderHome();};
  save.onclick=async()=>{
    if(saving||closed)return;
    updateSaveDay();
    let value=c.commit?.value;
    if(value===undefined){
      if(item==='hrp'){
        value=Number($('bi-1').value);
        if(!$('bi-1').value||!integer(value,200)){status.textContent='請輸入 0–200 的整數次數';return;}
      }else if(item==='plank')value=c.seconds;
      else{
        const m=Number($('bi-m').value),s=Number($('bi-s').value);
        if(!$('bi-m').value||!$('bi-s').value||!integer(m,59)||!integer(s,59)){status.textContent='請輸入完整時間（分、秒各 0–59）';return;}
        value=m*60+s;
      }
      for(const [id,key] of fields)c.inputs[key]=$(id).value.slice(0,12);
      c.commit={date:c.date,index:getState().prs[item].length,value};
      persist(c);
    }
    saving=true;save.disabled=abort.disabled=true;
    for(const [id] of fields)$(id).disabled=true;
    status.textContent='正在儲存成績…';
    if(!alreadyRecorded(c)){
      // A restored index can be stale or malformed. Persist the actual append
      // position before recording, so a failed save can retry idempotently.
      c.commit.index=getState().prs[item].length;persist(c);
      getState().prs[item].push({date:c.commit.date,[valueField(item)]:value});
      gain=recordAndGain('boss');
    }
    let saved=false;
    try{saved=await saveState();}catch{}
    if(closed||active!==c)return;
    saving=false;
    if(!saved){
      status.textContent='儲存失敗，成績仍待儲存。請重試。';save.textContent='重試儲存 PR';save.disabled=false;
      persist(c);return;
    }
    cleanup();active=null;clearCheckpoint();
    $('d-identity').textContent='測驗完成，成績已記錄。';
    $('d-xp').textContent='+'+gain+' XP　·　連續 '+streakDays()+' 天';
    showBonusNote();$('done').classList.add('active');
  };
  persist(c);
}
