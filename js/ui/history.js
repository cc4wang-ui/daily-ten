/* Daily Ten — RECORDS 畫面：8 週熱力圖與 AFT 三項 PR。M1 自 index.html 原樣搬出。 */
import { getState } from '../state/store.js';
import { $ } from './dom.js';
import { todayStr, dateOffset } from './dates.js';
import { sessionOn } from './session.js';

export function renderHist(){
  const heat=$('hist-heat');heat.innerHTML='';
  const t=todayStr();
  for(let i=55;i>=0;i--){
    const d=dateOffset(t,-i),s=sessionOn(d);
    const el=document.createElement('i');
    if(s)el.className=s.type;
    el.title=d+(s?' '+s.type:'');
    heat.appendChild(el);
  }
  const fmtT=s=>Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
  const fill=(id,arr,f)=>{const el=$(id);
    el.innerHTML=arr.length?arr.slice(-5).reverse().map(p=>'<div class="prline"><span>'+p.date+'</span><b>'+f(p)+'</b></div>').join(''):'<p class="small">尚無紀錄 — 週日 Boss Day 見。</p>';};
  fill('pr-hrp',getState().prs.hrp,p=>p.reps+' 下');
  fill('pr-plank',getState().prs.plank,p=>fmtT(p.sec));
  fill('pr-run',getState().prs.run2mi,p=>fmtT(p.sec));
}
