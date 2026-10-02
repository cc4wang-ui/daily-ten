/* Daily Ten — 動作示範（包裝 demos.js 的 window.DT_DEMOS）：訓練畫面示範與 SETUP 示範視窗。M1 自 index.html 原樣搬出。
   demoCtl 以 live binding 匯出，train.js 讀到的永遠是目前的控制器。 */
import { $ } from './dom.js';

/* ================= 動作示範（demos.js） =================
   訓練畫面：當前動作有示範就播，並把 reps 動作的週期對齊節拍（tempo），動畫一輪 = 一下。
   休息／預備／換組沒有對應動作時，改播「下一個」動作。 */
export const HAS_DEMO=typeof window.DT_DEMOS!=='undefined';
export let demoCtl=null;
export function stopDemo(){ if(demoCtl){demoCtl.stop();demoCtl=null;} }
export function setTrainDemo(name,period,isNext){
  stopDemo();
  const k=HAS_DEMO?DT_DEMOS.keyFor(name):null, wrap=$('t-demo-wrap');
  if(!k){wrap.style.display='none';$('t-cue').textContent='';return;}
  wrap.style.display='';wrap.classList.toggle('next',!!isNext);
  $('t-demo-tag').textContent=isNext?'NEXT':'';
  demoCtl=DT_DEMOS.mount($('t-demo'),k,{period:period});
  $('t-cue').textContent=DT_DEMOS.info(k).cue;
}
export function openDemo(k,q){
  if(!HAS_DEMO||!DT_DEMOS.info(k))return;
  const inf=DT_DEMOS.info(k);
  $('dm-name').textContent=inf.name;$('dm-cue').textContent=inf.cue;
  $('dm-yt').href='https://www.youtube.com/results?search_query='+encodeURIComponent(q||inf.name);
  if(openDemo.ctl)openDemo.ctl.stop();
  openDemo.ctl=DT_DEMOS.mount($('dm-svg'),k);
  $('demo-modal').classList.add('active');
}
export function closeDemo(){ if(openDemo.ctl){openDemo.ctl.stop();openDemo.ctl=null;} $('demo-modal').classList.remove('active'); }
