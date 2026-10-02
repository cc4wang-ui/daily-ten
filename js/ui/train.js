/* Daily Ten — 訓練計時引擎（startWorkout）。M1 自 index.html 原樣搬出；原全域 runner 改為模組內部，對外以 isTraining() 查詢。 */
import { getState } from '../state/store.js';
import { $ } from './dom.js';
import { initAudio, beep, speak } from './audio.js';
import { lockScreen, unlockScreen } from './wakelock.js';
import { addTransitions } from './program.js';
import { XP, IDENTITY } from './content.js';
import { recordSession } from './session.js';
import { HAS_DEMO, demoCtl, stopDemo, setTrainDemo } from './demo.js';
import { renderHome } from './home.js';

/* ================= TIMER ENGINE ================= */
let runner=null;
/* 訓練進行中（startWorkout 開始到 cleanup 之間）為 true；分頁切換用它擋住 */
export function isTraining(){return !!runner;}
export function startWorkout(seq,type,after){
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
    recordSession(type);
    $('d-identity').textContent=IDENTITY[Math.floor(Math.random()*IDENTITY.length)];
    $('d-xp').textContent='+'+XP[type]+' XP　·　STREAK '+getState().streak.current;
    speak('完成。'+'目前連續'+getState().streak.current+'天。');
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
