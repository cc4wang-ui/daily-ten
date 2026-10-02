/* Daily Ten — HOME 畫面：今日計畫、連續天數、Never Miss Twice 提示、升級按鈕、備份提醒卡。M1 自 index.html 原樣搬出。 */
import { getState, saveState } from '../state/store.js';
import { $ } from './dom.js';
import { todayStr, dayGap } from './dates.js';
import { BLOCKS, DOW, estMin, minimalSeq, todayPlan, planSeq, blockSeq } from './program.js';
import { sessionOn, levelUpEligible } from './session.js';
import { startWorkout } from './train.js';
import { startBoss } from './boss.js';
import { renderBackupReminder } from './backup.js';

export function renderHome(){
  const t=todayStr(),plan=todayPlan();
  const d=new Date();
  $('h-date').textContent=(d.getMonth()+1)+'月'+d.getDate()+'日 · 週'+DOW[d.getDay()];
  $('h-minimal').textContent='保底版 · 約 '+estMin(minimalSeq(getState().level))+' 分鐘';
  $('h-streak').textContent=getState().streak.current;
  $('h-level').textContent='L'+getState().level;
  $('h-xp').textContent=getState().xp;
  $('h-best').textContent=getState().streak.best;
  $('h-mission').textContent=plan.mission;
  const doneToday=!!sessionOn(t);
  $('h-start').textContent=doneToday?'✓ 今日已完成 — 再跑一次也行':plan.label;
  $('h-start').onclick=()=>{
    if(plan.type==='boss')startBoss();
    else startWorkout(planSeq(plan,getState().level),plan.type);
  };
  /* 上限選項：時間夠的日子多跑一輪加強區塊。保底版是下限，這是上限，中間是預設。 */
  const plus=$('h-plus');
  if(plan.block){
    const seq=planSeq(plan,getState().level).concat(blockSeq(plan.block,getState().level));
    plus.style.display='block';
    plus.textContent='加一輪 '+BLOCKS[plan.block]+' · '+estMin(seq)+' 分鐘';
    plus.onclick=()=>startWorkout(seq,plan.type==='cycle'?'cycle':'full');
  }else plus.style.display='none';
  // Never Miss Twice
  const b=$('h-banner');b.className='banner';b.textContent='';
  const last=getState().streak.lastDate;
  if(last&&!doneToday){
    const gap=dayGap(last,t);
    if(gap===2){b.className='banner warn';b.textContent='⚠ 昨天斷了。今天是關鍵日 — Never Miss Twice。最少按下保底版。';}
    else if(gap>2){b.className='banner danger';b.textContent='✕ 已中斷 '+(gap-1)+' 天。現在按保底版，約 '+estMin(minimalSeq(getState().level))+' 分鐘重新開始。你是每天訓練的人。';}
  }
  const lu=$('h-levelup');
  if(levelUpEligible()){lu.style.display='block';
    lu.onclick=()=>{getState().level=Math.min(5,getState().level+1);saveState();renderHome();
      alert('升級至 L'+getState().level+'。劑量已自動調整。');};}
  else lu.style.display='none';
  renderBackupReminder();
}
