/* Daily Ten — SETUP 畫面：示範／影片清單、設定開關、匯出／匯入、一週節奏。M1 自 index.html 原樣搬出。 */
import { getState, setState, saveState, migrateState } from '../state/store.js';
import { $ } from './dom.js';
import { VIDEOS } from './content.js';
import { HAS_DEMO, openDemo } from './demo.js';
import { hasBand, BLOCKS, DOW, WEEK, estMin, fullSeq, restSeq, planSeq } from './program.js';
import { renderHome } from './home.js';
import { renderHist } from './history.js';
import { renderBody } from './body.js';

export function renderSetup(){
  $('vids').innerHTML=VIDEOS.map((v,i)=>{
    if(!v[1])return '<div class="eyebrow" style="padding:12px 0 4px">'+v[0]+'</div>';
    const k=HAS_DEMO?DT_DEMOS.keyFor(v[0]):null;
    return '<div class="vidline"><span>'+v[0]+'</span><span>'
      +(k?'<button data-demo="'+k+'" data-i="'+i+'">示範</button>':'')
      +'<a href="https://www.youtube.com/results?search_query='+encodeURIComponent(v[1])
      +'" target="_blank" rel="noopener" style="margin-left:10px">真人 ↗</a></span></div>';
  }).join('');
  $('vids').querySelectorAll('button[data-demo]').forEach(b=>{
    b.onclick=()=>openDemo(b.dataset.demo,VIDEOS[+b.dataset.i][1]);});
  const lv=getState().level,today=new Date().getDay();
  $('week-tbl').innerHTML=WEEK.map((p,i)=>{
    const name=p.type==='boss'?'Boss Day · 十動作＋測驗'
      :p.type==='rest'?'恢復日 · 三組伸展全走'
      :'十動作＋'+BLOCKS[p.block]+(p.type==='cycle'?'＋加練':'');
    const min=p.type==='boss'?estMin(fullSeq(lv,p.mob))
      :p.type==='rest'?estMin(restSeq(lv)):estMin(planSeq(p,lv));
    return '<div class="prline"'+(i===today?' style="background:rgba(232,163,61,.08)"':'')+'>'
      +'<span>'+DOW[i]+'　'+name+'　<span style="color:var(--ink-dim)">'+p.mob+'</span></span>'
      +'<b>'+min+' min'+(p.type==='boss'?' 暖身＋測驗另計':'')+'</b></div>';
  }).join('');
  $('cfg-voice').checked=getState().settings.voice;
  $('cfg-beep').checked=getState().settings.beep;
  $('cfg-band').checked=hasBand();
  $('cfg-voice').onchange=e=>{getState().settings.voice=e.target.checked;saveState();};
  $('cfg-beep').onchange=e=>{getState().settings.beep=e.target.checked;saveState();};
  /* 器材變了，課表內容與時長都要跟著重算 */
  $('cfg-band').onchange=e=>{getState().settings.band=e.target.checked;saveState();renderSetup();renderHome();};
  $('exp-btn').onclick=()=>{$('exp-area').value=JSON.stringify(getState());$('io-msg').textContent='已匯出 — 全選複製保存。';};
  $('imp-btn').onclick=()=>{
    try{const s=JSON.parse($('exp-area').value);
      if(!s.version||!s.streak)throw new Error('格式不符');
      const next=migrateState(s);if(!next)throw new Error('格式不符');
      setState(next);saveState();renderHome();renderHist();renderSetup();renderBody();
      $('io-msg').textContent='匯入成功。';}
    catch(e){$('io-msg').textContent='匯入失敗：'+e.message;}
  };
}
