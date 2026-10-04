/* Daily Ten — 訓練計時引擎（startWorkout）。M1 自 index.html 原樣搬出；原全域 runner 改為模組內部，對外以 isTraining() 查詢。
   B1：畫面與計時不變；完成畫面的 XP 改顯示新尺度（記錄前後 summary.xp.total 的增加量，不會是負數；遊戲層未就緒時照 M1 的 XP 表），
   「STREAK N」改「連續 N 天」。opts.plus：加一輪（記成當天 type＋plus:true）。 */
import { getState } from '../state/store.js';
import { $ } from './dom.js';
import { initAudio, beep, speak } from './audio.js';
import { lockScreen, unlockScreen } from './wakelock.js';
import { addTransitions } from './program.js';
import { XP, IDENTITY } from './content.js';
import { recordSession } from './session.js';
import { totalXp, summary } from './game.js';
import { HAS_DEMO, demoCtl, stopDemo, setTrainDemo } from './demo.js';
import { renderHome } from './home.js';

/* ================= TIMER ENGINE ================= */
let runner=null;
/* 訓練進行中（startWorkout 開始到 cleanup 之間）為 true；分頁切換用它擋住 */
export function isTraining(){return !!runner;}
/* 完成畫面的連續天數：遊戲層的連續天數（與今日 chip 相同），未就緒時用舊欄位 */
export function streakDays(){
  const s=summary();
  return s&&s.streak&&Number.isFinite(s.streak.days)?s.streak.days:getState().streak.current;
}
/* 記錄並回傳這次增加的 XP（新尺度）；遊戲層未就緒時回 M1 XP 表的值 */
export function recordAndGain(type,opts){
  const before=totalXp();
  recordSession(type,opts);
  const after=totalXp();
  return before!==null&&after!==null?Math.max(0,after-before):XP[type];
}
export function startWorkout(seq,type,after,opts){
  seq=addTransitions(seq);
  initAudio(); lockScreen();
  $('train').classList.add('active');
  let idx=-1,paused=false,timer=null;
  const total=seq.length;
  function fmt(n){return n>=60?Math.floor(n/60)+':'+String(n%60).padStart(2,'0'):String(n);}
  function nextStep(){
    idx++;
    if(idx>=total){finish();return;}
    const st=seq[idx];
    $('t-phase').textContent=(idx+1)+' / '+total;
    $('t-bar').style.width=Math.round(idx/total*100)+'%';
    $('t-name').textContent=st.name;
    $('t-sub').textContent=st.sub||'';
    $('t-next').textContent=idx+1<total?('下一個：'+seq[idx+1].name):'最後一個動作';
    if(HAS_DEMO&&DT_DEMOS.keyFor(st.name))setTrainDemo(st.name,st.mode==='reps'?st.tempo:null,false);
    else setTrainDemo(st.prep!==undefined?st.prep:(seq[idx+1]?seq[idx+1].name:''),null,true);
    const isRest=st.name.indexOf('休息')>=0;
    if(st.prep!==undefined)speak('準備，'+st.prep);
    else speak(isRest?st.name:(st.name+(st.mode==='reps'?'，'+st.reps+'下':'，'+st.secs+'秒')));
    if(st.mode==='time'){
      let left=st.secs; $('t-count').textContent=fmt(left);
      beep(660,.12);
      timer=setInterval(()=>{ if(paused)return;
        left--; $('t-count').textContent=fmt(left);
        if(left<=5&&left>0)beep(880,.08);
        if(left<=0){clearInterval(timer);beep(440,.5);setTimeout(nextStep,600);}
      },1000);
    }else{ // reps with tempo
      let done=0; $('t-count').textContent=done+'/'+st.reps;
      beep(660,.12);
      timer=setInterval(()=>{ if(paused)return;
        done++; $('t-count').textContent=done+'/'+st.reps; beep(760,.07);
        if(done>=st.reps){clearInterval(timer);beep(440,.5);setTimeout(nextStep,600);}
      },st.tempo*1000);
    }
  }
  function finish(){
    cleanup();
    if(after){after();return;}
    const gain=recordAndGain(type,{plus:!!(opts&&opts.plus)});
    const days=streakDays();
    $('d-identity').textContent=IDENTITY[Math.floor(Math.random()*IDENTITY.length)];
    $('d-xp').textContent='+'+gain+' XP　·　連續 '+days+' 天';
    speak('完成。'+'目前連續'+days+'天。');
    $('done').classList.add('active');
  }
  function cleanup(){
    if(timer)clearInterval(timer);
    stopDemo();
    try{speechSynthesis.cancel();}catch(e){}
    unlockScreen();
    $('train').classList.remove('active');
    runner=null;
  }
  $('t-pause').onclick=()=>{paused=!paused;$('t-pause').textContent=paused?'繼續':'暫停';
    if(demoCtl)demoCtl.setPaused(paused);
    if(!paused)speak('繼續');};
  $('t-abort').onclick=()=>{cleanup();renderHome();};
  runner={cleanup};
  nextStep();
}
