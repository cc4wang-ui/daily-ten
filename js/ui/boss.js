/* Daily Ten — Boss Day：十動作暖身 → HRP／Plank／2 英里測驗 → 成績輸入。M1 自 index.html 原樣搬出。
   B1：測驗計時（#train）與完成畫面保持 M1；只有成績輸入畫面（#s-boss）換亮色樣式（class 取代 inline 琥珀色）。 */
import { getState, saveState } from '../state/store.js';
import { $, showScreen } from './dom.js';
import { todayStr } from './dates.js';
import { initAudio, beep, speak } from './audio.js';
import { lockScreen, unlockScreen } from './wakelock.js';
import { fullSeq } from './program.js';
import { XP } from './content.js';
import { bossItem, recordSession } from './session.js';
import { setTrainDemo, stopDemo } from './demo.js';
import { startWorkout } from './train.js';
import { renderHome } from './home.js';

/* ================= BOSS FLOW ================= */
export function startBoss(){
  const item=bossItem();
  startWorkout(fullSeq(getState().level,'A'),'boss',()=>{ // 十動作完成 → 測驗
    if(item==='hrp')bossHRP();
    else if(item==='plank')bossPlank();
    else bossRun();
  });
}
function bossHRP(){
  // 2:00 window，App 計時，Cross 自數次數，結束後輸入
  const seq=[{name:'HRP 伏地挺身測驗',sub:'2 分鐘 · 盡可能多下 · 自己計數',mode:'time',secs:120}];
  // 40% rule 語音在 1:40 觸發
  $('train').classList.add('active');
  initAudio();lockScreen();
  speak('HRP測驗。兩分鐘，盡可能多下。預備，開始。');
  let left=120;const el=$('t-count');
  $('t-phase').textContent='BOSS · HRP';$('t-name').textContent='HRP 伏地挺身測驗';
  $('t-sub').textContent='2:00 · 自己計數';$('t-next').textContent='';$('t-bar').style.width='0%';
  setTrainDemo('HRP',null,false);
  el.textContent='2:00';
  const tm=setInterval(()=>{ left--;
    el.textContent=Math.floor(left/60)+':'+String(left%60).padStart(2,'0');
    $('t-bar').style.width=Math.round((120-left)/120*100)+'%';
    if(left===20)speak('你還有百分之六十。再兩下。');
    if(left<=5&&left>0)beep(880,.08);
    if(left<=0){clearInterval(tm);beep(440,.6);unlockScreen();
      stopDemo();$('train').classList.remove('active');bossInput('hrp');}
  },1000);
  $('t-abort').onclick=()=>{clearInterval(tm);stopDemo();unlockScreen();$('train').classList.remove('active');renderHome();};
  $('t-pause').onclick=null;
}
function bossPlank(){
  // 碼表直到撐不住按停 — 免持例外（不可避免）
  $('train').classList.add('active');initAudio();lockScreen();
  speak('Plank測驗。撐到極限，落地時按結束。預備，開始。');
  let sec=0;const el=$('t-count');
  $('t-phase').textContent='BOSS · PLANK';$('t-name').textContent='平板支撐測驗';
  $('t-sub').textContent='撐到極限 · 落地按「結束」';$('t-next').textContent='';
  setTrainDemo('平板支撐',null,false);
  el.textContent='0:00';
  const tm=setInterval(()=>{ sec++;
    el.textContent=Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0');
    if(sec===90)speak('一分半。朝兩分半訓練目標前進。');
    if(sec===150)speak('兩分半。目標達成，繼續推。');
  },1000);
  $('t-abort').textContent='結束';
  $('t-abort').onclick=()=>{clearInterval(tm);stopDemo();unlockScreen();$('train').classList.remove('active');
    $('t-abort').textContent='結束';bossInput('plank',sec);};
  $('t-pause').onclick=null;
}
function bossRun(){ bossInput('run2mi'); }
function bossInput(item,presetSec){
  showScreen('s-boss');
  const titles={hrp:'HRP 成績輸入',plank:'Plank 成績確認',run2mi:'2 英里跑 成績輸入'};
  $('b-title').textContent=titles[item];
  const c=$('b-card');
  if(item==='hrp'){
    c.innerHTML='<h3>2 分鐘內完成幾下？</h3><div class="inputrow"><input type="number" id="bi-1" min="0" max="200" inputmode="numeric"><span>下</span></div><button class="btn-main" id="bi-save">儲存 PR</button>';
    $('bi-save').onclick=()=>{const v=parseInt($('bi-1').value,10);
      if(isNaN(v)||v<0){alert('請輸入次數');return;}
      getState().prs.hrp.push({date:todayStr(),reps:v});finishBoss();};
  }else if(item==='plank'){
    c.innerHTML='<h3>本次成績</h3><p class="boss-result num">'+Math.floor(presetSec/60)+':'+String(presetSec%60).padStart(2,'0')+'</p><button class="btn-main" id="bi-save">儲存 PR</button>';
    $('bi-save').onclick=()=>{getState().prs.plank.push({date:todayStr(),sec:presetSec});finishBoss();};
  }else{
    c.innerHTML='<h3>戶外跑 2 英里（3.2 km），回來輸入時間</h3><div class="inputrow"><input type="number" id="bi-m" min="0" max="59" placeholder="分" inputmode="numeric"><span>分</span><input type="number" id="bi-s" min="0" max="59" placeholder="秒" inputmode="numeric"><span>秒</span></div><p>雨天可改跑步機或延後至下午，當日輸入即可。</p><button class="btn-main" id="bi-save">儲存 PR</button>';
    $('bi-save').onclick=()=>{const m=parseInt($('bi-m').value,10),s=parseInt($('bi-s').value,10);
      if(isNaN(m)||isNaN(s)){alert('請輸入完整時間');return;}
      getState().prs.run2mi.push({date:todayStr(),sec:m*60+s});finishBoss();};
  }
  function finishBoss(){
    recordSession('boss');
    saveState();
    $('d-identity').textContent='測驗完成。數據不說謊。';
    $('d-xp').textContent='+'+XP.boss+' XP　·　STREAK '+getState().streak.current;
    $('done').classList.add('active');
  }
}
