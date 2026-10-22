/* Daily Ten — 動作說明：舊 key 只保留文字提示與查表；完整教學只接受本機審核影片。 */
import { $ } from './dom.js';
import { getApprovedExerciseMedia, mountExerciseVideo } from './exercise-media.js';

/* ================= 動作說明 =================
   舊線條動畫不再在訓練畫面或求助視窗呈現為示範。
   只有核准的本機完整影片可進求助播放器；沒有影片時顯示明確缺片狀態。 */
export const HAS_DEMO=typeof window.DT_DEMOS!=='undefined';
export let demoCtl=null;
let demoCloseAction=null;
let mediaCtl=null;
export function stopDemo(){ if(demoCtl){demoCtl.stop();demoCtl=null;} }
export function setTrainDemo(name,period,isNext){
  stopDemo();
  const k=HAS_DEMO?DT_DEMOS.keyFor(name):null, media=getApprovedExerciseMedia(name), wrap=$('t-demo-wrap');
  if(!k){wrap.style.display='none';$('t-cue').textContent='';return media?name:null;}
  wrap.style.display='none';
  $('t-cue').textContent=DT_DEMOS.info(k).cue;
  return k;
}
export function openDemo(k,q,onClose,exactName,fallbackCue,onSkip){
  const inf=HAS_DEMO?DT_DEMOS.info(k):null;
  const movementName=exactName||(onClose?q:(inf?inf.name:k));
  $('dm-name').textContent=k==='towelpd'&&inf?inf.name:movementName;$('dm-cue').textContent=inf?inf.cue:(fallbackCue||'');
  const link=$('dm-yt');
  link.href='https://www.youtube.com/results?search_query='+encodeURIComponent(q||movementName);
  link.style.display=onClose?'none':'block';
  $('dm-training-note').hidden=!onClose;
  $('dm-close').textContent=onClose?'返回訓練':'關閉';
  demoCloseAction=onClose||null;
  if(openDemo.ctl){openDemo.ctl.stop();openDemo.ctl=null;}
  if(mediaCtl)mediaCtl.stop();
  $('dm-svg').hidden=true;
  mediaCtl=mountExerciseVideo($('dm-video'),movementName);
  $('dm-safety').textContent=mediaCtl.available
    ? '請對照影片與動作文字；若有疼痛或不確定姿勢，先停下來。'
    : mediaCtl.storyboard
      ? '這是 AI 生成的連續影格試作，尚未有此動作的真人影片。請自行判斷動作是否清楚；不熟悉可略過。'
    : '目前沒有經審核的完整動作影片。文字與線條動畫不能代替動作教學；若不熟悉，請略過這一步。';
  const skip=$('dm-skip');
  skip.hidden=mediaCtl.available||typeof onSkip!=='function';
  skip.onclick=skip.hidden?null:()=>{closeDemo();onSkip();};
  $('demo-modal').classList.add('active');
}
export function closeDemo(){
  if(mediaCtl){mediaCtl.stop();mediaCtl=null;}
  if(openDemo.ctl){openDemo.ctl.stop();openDemo.ctl=null;}
  $('demo-modal').classList.remove('active');
  $('dm-skip').onclick=null;
  $('dm-skip').hidden=true;
  const onClose=demoCloseAction; demoCloseAction=null;
  if(onClose)onClose();
}
