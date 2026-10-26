/* Daily Ten — 訓練計時引擎（startWorkout）。M1 自 index.html 原樣搬出；原全域 runner 改為模組內部，對外以 isTraining() 查詢。
   B1：畫面與計時不變；完成畫面的 XP 改顯示新尺度（記錄前後 summary.xp.total 的增加量，不會是負數；遊戲層未就緒時照 M1 的 XP 表），
   「STREAK N」改「連續 N 天」。opts.plus：加一輪（記成當天 type＋plus:true）。
   V2a：增加量本來就含 Perfect Day＋30 與回歸加成 ×1.5（engine 的總 XP 含 bonus）；這次記錄讓它們出現時，
   #d-xp 下面多一行 #d-bonus（「含 Perfect Day +30 XP」「含回歸加成 ×1.5 +25 XP」），#d-xp 的文字與版面不變。 */
import { getState } from '../state/store.js';
import { $ } from './dom.js';
import { initAudio, beep, speak } from './audio.js';
import { lockScreen, unlockScreen } from './wakelock.js';
import { addTransitions } from './program.js';
import { XP, IDENTITY } from './content.js';
import { recordSession, recordSetFeedback } from './session.js';
import { summary, todayKey } from './game.js';
import { latestResistance } from '../game/training-progression.js';
import { demoCtl, stopDemo, setTrainDemo, openDemo, closeDemo } from './demo.js';
import { getApprovedExerciseMedia, getExerciseStoryboard, getStoryboardLabel } from './exercise-media.js';
import { renderHome } from './home.js';

/* ================= TIMER ENGINE ================= */
let runner=null;
let externalTraining=false;
const CHECKPOINT_KEY='daily-ten-active-workout';
const CHECKPOINT_MAX_AGE=24*60*60*1000;
const isMovement=st=>st.prep===undefined&&st.name!=='換組'&&st.name.indexOf('休息')<0;
const hasSideSwitch=st=>st.sideSwitch===true&&st.mode==='time'
  &&Number.isInteger(st.secs)&&st.secs>=2&&st.secs<=120;
function clearCheckpoint(){try{localStorage.removeItem(CHECKPOINT_KEY);}catch(e){}}
function readCheckpoint(){
  try{
    const c=JSON.parse(localStorage.getItem(CHECKPOINT_KEY)||'null');
    if(c&&c.v===1&&Array.isArray(c.seq)&&c.seq.length>0&&c.seq.length<500
      &&c.seq.every(st=>st&&typeof st.name==='string'&&st.name.length<200
        &&(st.mode==='time'?Number.isInteger(st.secs)&&st.secs>0&&st.secs<3600
          :st.mode==='reps'&&Number.isInteger(st.reps)&&st.reps>0&&st.reps<1000
            &&Number.isFinite(st.tempo)&&st.tempo>0&&st.tempo<120)
        &&(st.sideSwitch===undefined||typeof st.sideSwitch==='boolean'
          &&st.mode==='time'&&st.secs>=2&&st.secs<=120))
      &&Number.isInteger(c.idx)&&c.idx>=0&&c.idx<c.seq.length
      &&typeof c.type==='string'&&Number.isFinite(c.savedAt)
      &&Date.now()-c.savedAt<CHECKPOINT_MAX_AGE&&Date.now()-c.savedAt>-60000)return c;
  }catch(e){}
  clearCheckpoint();
  return null;
}
/* 重載後停在原本的動作與計數，等待使用者主動按「繼續」。 */
export async function resumeWorkout(){
  const c=readCheckpoint();
  if(!c)return false;
  const after=c.type==='boss'?()=>import('./boss.js').then(m=>m.continueBossWarmup(c.bossItem)):undefined;
  startWorkout(c.seq,c.type,after,{plus:c.plus,bossItem:c.bossItem,restore:c});
  return true;
}
/* 訓練進行中（startWorkout 開始到 cleanup 之間）為 true；分頁切換用它擋住 */
export function isTraining(){return !!runner||externalTraining;}
/* Boss 測驗在暖身後使用自己的碼表，仍須封鎖分頁跳轉。 */
export function setExternalTraining(active){externalTraining=!!active;}
/* 完成畫面的連續天數：遊戲層的連續天數（與今日 chip 相同），未就緒時用舊欄位 */
export function streakDays(){
  const s=summary();
  return s&&s.streak&&Number.isFinite(s.streak.days)?s.streak.days:getState().streak.current;
}
/* 這次記錄新出現的額外 XP（Perfect Day、回歸加成）→ 完成畫面的一行說明；沒有就空字串 */
function bonusNote(before,after){
  if(!before||!after)return '';
  const parts=[];
  const pa=after.perfectDay,pb=before.perfectDay;
  if(pa&&pa.done===true&&!(pb&&pb.done===true)&&Number.isFinite(pa.xp)&&pa.xp>0)parts.push(`Perfect Day +${pa.xp} XP`);
  const qa=after.returnQuest,qb=before.returnQuest;
  const boost=(qa&&Number.isFinite(qa.boostXp)?qa.boostXp:0)-(qb&&Number.isFinite(qb.boostXp)?qb.boostXp:0);
  if(qa&&qa.stage==='boost'&&boost>0)parts.push(`回歸加成 ×${qa.multiplier} +${boost} XP`);
  return parts.length?'含 '+parts.join('、'):'';
}
let lastBonus='';
/* 記錄並回傳這次增加的 XP（新尺度）；遊戲層未就緒時回 M1 XP 表的值 */
export function recordAndGain(type,opts){
  const before=summary();
  recordSession(type,opts);
  const after=summary();
  const tb=before&&before.xp&&Number.isFinite(before.xp.total)?before.xp.total:null;
  const ta=after&&after.xp&&Number.isFinite(after.xp.total)?after.xp.total:null;
  lastBonus=bonusNote(before,after);
  return tb!==null&&ta!==null?Math.max(0,ta-tb):XP[type];
}
/* 完成畫面 #d-bonus：上一次 recordAndGain 的額外 XP 說明（沒有就隱藏） */
export function showBonusNote(){
  const el=$('d-bonus');
  if(!el)return;
  el.textContent=lastBonus;
  el.hidden=!lastBonus;
}
export function startWorkout(seq,type,after,opts){
  const restore=opts&&opts.restore;
  const runId=restore&&typeof restore.runId==='string'&&/^[a-z0-9-]{1,40}$/.test(restore.runId)
    ?restore.runId:`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;
  seq=restore?seq:addTransitions(seq);
  if(!restore)clearCheckpoint();
  initAudio(); lockScreen();
  $('train').classList.add('active');
  $('train').classList.remove('feedback-open');
  $('t-feedback').hidden=true;
  let idx=restore?restore.idx-1:-1,paused=!!restore,timer=null,advanceTimer=null,
      pendingAdvance=false,skippedAction=!!(restore&&restore.skippedAction),left=null,done=null;
  $('t-pause').textContent=paused?'繼續':'暫停';
  $('t-pause').hidden=false;
  $('t-skip').hidden=false;
  $('t-checkpoint').classList.toggle('paused',paused);
  const total=seq.length;
  function fmt(n){return n>=60?Math.floor(n/60)+':'+String(n%60).padStart(2,'0'):String(n);}
  function showSide(st){
    if(!hasSideSwitch(st))return;
    const side=left>Math.floor(st.secs/2)?'第一側':'第二側';
    $('t-sub').textContent=(st.sub?st.sub+' · ':'')+side;
  }
  function persist(){
    if(idx<0||idx>=total)return;
    const c={v:1,savedAt:Date.now(),runId,seq,idx,type,plus:!!(opts&&opts.plus),
      bossItem:opts&&opts.bossItem,paused,skippedAction,pendingAdvance,left,done};
    try{localStorage.setItem(CHECKPOINT_KEY,JSON.stringify(c));}catch(e){}
  }
  function nextStep(){
    if(advanceTimer){clearTimeout(advanceTimer);advanceTimer=null;}
    pendingAdvance=false;
    idx++;
    if(idx>=total){finish();return;}
    const st=seq[idx];
    const prior=restore&&idx===restore.idx?restore:null;
    $('t-phase').textContent=(idx+1)+' / '+total;
    $('t-bar').style.width=Math.round(idx/total*100)+'%';
    $('t-name').textContent=st.name;
    $('t-sub').textContent=st.sub||'';
    const isRest=st.name.indexOf('休息')>=0;
    const isPrep=st.name==='預備'||st.name==='換組'||st.prep!==undefined;
    $('t-feedback-open').hidden=st.mode!=='reps'||isPrep||isRest;
    $('t-feedback').hidden=true;
    $('train').classList.remove('feedback-open');
    $('t-checkpoint').textContent=(prior?'已恢復 · ':'')+(isRest?'檢查點 · 組間休息':isPrep?'檢查點 · 準備下一步':'檢查點 · 進行動作');
    $('t-more-rest').hidden=!isRest;
    $('t-more-rest').onclick=isRest?()=>{
      left=Math.min(st.secs+300,left+20);
      $('t-count').textContent=fmt(left);
      persist();
    }:null;
    const set=st.name.match(/第\s*(\d+)\s*組/);
    $('t-set').textContent=set?'第 '+set[1]+' 組':'';
    $('t-set').hidden=!set;
    const immediate=seq[idx+1],nextMovement=seq.slice(idx+1).find(isMovement);
    const gap=immediate&&!isMovement(immediate)?immediate:null;
    if(nextMovement){
      $('t-next').textContent='下一個：'+nextMovement.name
        +(gap?'（先'+gap.name+(gap.mode==='time'?' '+gap.secs+' 秒':'')+'）':'');
    }else if(gap){
      $('t-next').textContent='最後一個動作 · 接著'+gap.name
        +(gap.mode==='time'?' '+gap.secs+' 秒':'')+'，然後完成';
    }else{
      $('t-next').textContent=isMovement(st)?'最後一個動作 · 完成後結束':'接下來：完成訓練';
    }
    const demoName=isRest||isPrep?(st.prep!==undefined?st.prep:(nextMovement?nextMovement.name:'')):st.name;
    const demoCue=isRest||isPrep?(nextMovement?nextMovement.sub:''):st.sub;
    const demoKey=setTrainDemo(demoName,st.mode==='reps'&&demoName===st.name?st.tempo:null,demoName!==st.name);
    const approvedMedia=!!getApprovedExerciseMedia(demoName);
    const storyboard=getExerciseStoryboard(demoName);
    $('t-show-demo').hidden=!demoName;
    $('t-show-demo').textContent=storyboard?`查看 ${getStoryboardLabel(storyboard)}動作影格 · 計時會暫停`:'查看動作說明 · 計時會暫停';
    $('t-demo-safety').hidden=true;
    $('t-no-demo').hidden=approvedMedia||isRest;
    $('t-no-demo').textContent=storyboard
      ? `有 ${getStoryboardLabel(storyboard)} AI 動作影格試作；目前仍沒有完整真人影片。`
      : isPrep
      ? '下一個動作尚無完整示範；如果不熟悉，請先查看說明，開始後可略過該動作。'
      : '目前沒有此動作的完整示範；如果不熟悉，請略過這一步。';
    $('t-show-demo').onclick=demoName?()=>{
      setPaused(true);
      const canSkipCurrent=!isRest&&!isPrep&&!approvedMedia;
      openDemo(demoKey||demoName,demoName,()=>{ $('t-pause').focus(); },demoName,demoCue,
        canSkipCurrent?()=>$('t-skip').click():null);
    }:null;
    if(st.prep!==undefined)speak('準備，'+st.prep);
    else speak(isRest?st.name:(st.name+(st.mode==='reps'?'，'+st.reps+'下':'，'+st.secs+'秒')));
    if(st.mode==='time'){
      left=prior&&Number.isInteger(prior.left)?Math.max(0,Math.min(st.secs+(isRest?300:0),prior.left)):st.secs;
      done=null;$('t-count').textContent=fmt(left);showSide(st);
      beep(660,.12);
      timer=setInterval(()=>{ if(paused)return;
        const before=left;
        left--; $('t-count').textContent=fmt(left);persist();
        if(hasSideSwitch(st)&&before>Math.floor(st.secs/2)&&left<=Math.floor(st.secs/2)){
          showSide(st);speak('換另一側');
        }
        if(left<=5&&left>0)beep(880,.08);
        if(left<=0){clearInterval(timer);beep(440,.5);queueNextStep();}
      },1000);
    }else{ // reps with tempo
      done=prior&&Number.isInteger(prior.done)?Math.max(0,Math.min(st.reps,prior.done)):0;
      left=null;$('t-count').textContent=done+'/'+st.reps;
      beep(660,.12);
      timer=setInterval(()=>{ if(paused)return;
        done++; $('t-count').textContent=done+'/'+st.reps; beep(760,.07);persist();
        if(done>=st.reps){clearInterval(timer);beep(440,.5);queueNextStep();}
      },st.tempo*1000);
    }
    if(prior&&(prior.pendingAdvance||(st.mode==='time'?left<=0:done>=st.reps))){
      clearInterval(timer);timer=null;pendingAdvance=true;
    }
    persist();
  }
  function queueNextStep(){
    // A completed interval has no unlisted 600 ms gap: estSec() covers the
    // displayed work, rest and preparation time exactly.
    pendingAdvance=true;persist();
    advanceTimer=setTimeout(()=>{advanceTimer=null;if(!paused)nextStep();},0);
  }
  function setPaused(value){
    paused=value;
    $('t-pause').textContent=paused?'繼續':'暫停';
    $('t-checkpoint').classList.toggle('paused',paused);
    persist();
    if(demoCtl)demoCtl.setPaused(paused);
    if(!paused){
      if(pendingAdvance){nextStep();return;}
      speak('繼續');
    }
  }
  const pauseWhenHidden=()=>{if(document.visibilityState==='hidden')setPaused(true);};
  const pauseOnPageHide=()=>setPaused(true);
  document.addEventListener('visibilitychange',pauseWhenHidden);
  window.addEventListener('pagehide',pauseOnPageHide);
  function finish(){
    cleanup();
    if(skippedAction){
      $('d-identity').textContent='這次略過了動作';
      $('d-xp').textContent='未記為完成';
      $('d-bonus').hidden=true;
      $('d-ok').textContent='返回今日';
      $('done').classList.add('active');
      return;
    }
    $('d-ok').textContent='回報完成';
    if(after){after();return;}
    const gain=recordAndGain(type,{plus:!!(opts&&opts.plus)});
    const days=streakDays();
    $('d-identity').textContent=IDENTITY[Math.floor(Math.random()*IDENTITY.length)];
    $('d-xp').textContent='+'+gain+' XP　·　連續 '+days+' 天';
    showBonusNote();
    speak('完成。'+'目前連續'+days+'天。');
    $('done').classList.add('active');
  }
  function cleanup(){
    document.removeEventListener('visibilitychange',pauseWhenHidden);
    window.removeEventListener('pagehide',pauseOnPageHide);
    if(timer)clearInterval(timer);
    if(advanceTimer)clearTimeout(advanceTimer);
    closeDemo();
    stopDemo();
    try{speechSynthesis.cancel();}catch(e){}
    unlockScreen();
    $('train').classList.remove('active');
    $('train').classList.remove('feedback-open');
    $('t-feedback').hidden=true;
    runner=null;
    clearCheckpoint();
  }
  $('t-pause').onclick=()=>setPaused(!paused);
  $('t-feedback-open').onclick=()=>{
    const st=seq[idx];
    if(!st||st.mode!=='reps')return;
    setPaused(true);
    const existing=getState().game?.trainingFeedback?.find(f=>f?.id===`${runId}-${idx}`
      &&f.name===st.name&&f.target===st.reps&&f.date===todayKey());
    $('t-actual').value=String(existing?.actual??done??0);
    $('t-effort').value=existing?.effort??'okay';
    $('t-form').value=existing?.form===false?'no':'yes';
    $('t-pain').value=existing?.pain===true?'yes':'no';
    const resistance=latestResistance({state:getState(),asOf:todayKey(),name:st.name,includeToday:true});
    $('t-resistance-fields').hidden=resistance===null;
    $('t-resistance').value=resistance===null?'':existing
      ? (typeof existing.resistance==='string'?existing.resistance:'') : resistance;
    $('t-feedback-error').hidden=true;
    $('t-feedback').hidden=false;
    $('train').classList.add('feedback-open');
    $('t-actual').focus();
  };
  $('t-feedback-cancel').onclick=()=>{
    $('t-feedback').hidden=true;
    $('train').classList.remove('feedback-open');
    $('t-feedback-open').focus();
  };
  $('t-feedback').onsubmit=async(event)=>{
    event.preventDefault();
    const st=seq[idx],actual=Number($('t-actual').value);
    if(!st||st.mode!=='reps')return;
    const band=latestResistance({state:getState(),asOf:todayKey(),name:st.name,includeToday:true})!==null;
    const resistance=band?$('t-resistance').value.trim():'';
    if([...resistance].length>40){
      $('t-feedback-error').textContent='阻力標記請縮短至 40 字以內。';
      $('t-feedback-error').hidden=false;
      $('t-resistance').focus();
      return;
    }
    const submit=$('t-feedback').querySelector('[type=submit]');
    submit.disabled=true;
    let result;
    try{result=await recordSetFeedback({id:`${runId}-${idx}`,name:st.name,target:st.reps,actual,
      effort:$('t-effort').value,pain:$('t-pain').value==='yes',form:$('t-form').value==='yes',
      ...(resistance?{resistance}:{})});}
    catch(e){result={ok:false,saved:false};}
    submit.disabled=false;
    if(!result.ok){
      $('t-feedback-error').textContent='回報內容無效，請檢查實際次數。';
      $('t-feedback-error').hidden=false;
      return;
    }
    if($('t-pain').value==='yes'||$('t-form').value==='no'){
      cleanup();
      const reason=$('t-pain').value==='yes'?'已因疼痛停止訓練':'已因姿勢不穩停止訓練';
      $('d-identity').textContent=result.saved?reason:`${reason} · 回報未儲存`;
      $('d-xp').textContent='未記為完成';
      $('d-bonus').hidden=true;
      $('d-ok').textContent='返回今日';
      $('done').classList.add('active');
      return;
    }
    if(!result.saved){
      $('t-feedback-error').textContent='儲存失敗，回報暫存在此頁；請確認儲存空間後重試。';
      $('t-feedback-error').hidden=false;
      return;
    }
    if(timer){clearInterval(timer);timer=null;}
    if(advanceTimer){clearTimeout(advanceTimer);advanceTimer=null;}
    paused=false;
    $('t-pause').textContent='暫停';
    $('t-checkpoint').classList.remove('paused');
    nextStep();
  };
  $('t-skip').onclick=()=>{
    const st=seq[idx];
    if(st&&st.name.indexOf('休息')<0&&st.name!=='預備'&&st.name!=='換組'&&st.prep===undefined)skippedAction=true;
    if(timer)clearInterval(timer);
    if(advanceTimer){clearTimeout(advanceTimer);advanceTimer=null;}
    if(paused){paused=false;$('t-pause').textContent='暫停';$('t-checkpoint').classList.remove('paused');}
    nextStep();
  };
  $('t-abort').onclick=()=>{cleanup();renderHome();};
  runner={cleanup};
  nextStep();
}
