/* Daily Ten — 統計 › 訓練紀錄：8 週熱力圖與 AFT 三項 PR。M1 自 index.html 搬出；B1 換亮色、門檻線改稱「自選目標」（原則 4）。 */
import { getState } from '../state/store.js';
import { $ } from './dom.js';
import { todayStr, dateOffset } from './dates.js';
import { sessionOn } from './session.js';
import { aftTargets, passText } from './aft.js';

const TYPE_NAME = { full: '完整', cycle: '加練', boss: 'Boss Day', rest: '恢復', minimal: '保底版', rain: '雨天替代' };

export function renderHist(){
  const heat=$('hist-heat');heat.innerHTML='';
  const t=todayStr();
  let days=0;
  for(let i=55;i>=0;i--){
    const d=dateOffset(t,-i),s=sessionOn(d);
    const el=document.createElement('i');
    if(s){el.className=s.type;days++;}
    el.title=d+(s?' '+(TYPE_NAME[s.type]||s.type):'');
    heat.appendChild(el);
  }
  heat.setAttribute('aria-label','過去 8 週有 '+days+' 天訓練');
  const fmtT=s=>Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
  const fill=(id,arr,f)=>{const el=$(id);
    el.innerHTML=arr.length?arr.slice(-5).reverse().map(p=>'<div class="prline"><span>'+p.date+'</span><b class="num">'+f(p)+'</b></div>').join(''):'<p class="small">尚無紀錄 — 週日 Boss Day 見。</p>';};
  fill('pr-hrp',getState().prs.hrp,p=>p.reps+' 下');
  fill('pr-plank',getState().prs.plank,p=>fmtT(p.sec));
  fill('pr-run',getState().prs.run2mi,p=>fmtT(p.sec));
  /* 門檻線與今日 AFT 卡同一組數字 */
  const pass={hrp:'pass-hrp',plank:'pass-plank',run2mi:'pass-run'};
  for(const it of aftTargets().items){const el=pass[it.pr]&&$(pass[it.pr]);if(el)el.textContent=passText(it);}
}
