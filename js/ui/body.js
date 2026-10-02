/* Daily Ten — BODY 畫面：身體指標輸入、趨勢判讀、營養目標、圍度與肌力檢測。M1 自 index.html 原樣搬出。 */
import { getState, saveState } from '../state/store.js';
import { $ } from './dom.js';
import { todayStr, dateOffset } from './dates.js';

/* ================= BODY METRICS ================= */
function logMetric(key,val){
  const t=todayStr(),arr=getState().body[key],i=arr.findIndex(x=>x.date===t);
  if(i>=0)arr[i].v=val; else arr.push({date:t,v:val});
  arr.sort((a,b)=>a.date<b.date?-1:1);
}
function latest(key){const a=getState().body[key];return a.length?a[a.length-1].v:null;}
function windowAvg(key,from,to){
  const v=getState().body[key].filter(x=>x.date>=from&&x.date<=to).map(x=>x.v);
  return v.length?v.reduce((a,b)=>a+b,0)/v.length:null;
}
/* 7 日均 + 週變化率 + 腰圍方向 → 一句判讀 */
function trend(){
  const t=todayStr();
  const count=(key,from,to)=>getState().body[key].filter(x=>x.date>=from&&x.date<=to).length;
  const cur=windowAvg('weight',dateOffset(t,-6),t),
        prev=windowAvg('weight',dateOffset(t,-13),dateOffset(t,-7));
  const waistNow=windowAvg('waist',dateOffset(t,-6),t),
        waistPrev=windowAvg('waist',dateOffset(t,-20),dateOffset(t,-7));
  const rhrBase=windowAvg('rhr',dateOffset(t,-27),dateOffset(t,-4)),
        rhrNow=windowAvg('rhr',dateOffset(t,-2),t);
  const o={cur:cur,prev:prev,waist:waistNow,rhr:rhrNow,
    pct:(cur&&prev&&count('weight',dateOffset(t,-6),t)>=7
      &&count('weight',dateOffset(t,-13),dateOffset(t,-7))>=7)?(cur-prev)/prev*100:null,
    waistUp:(waistNow&&waistPrev)?waistNow-waistPrev>0.3:false,
    overreached:(rhrBase&&rhrNow&&count('rhr',dateOffset(t,-2),t)>=3
      &&count('rhr',dateOffset(t,-27),dateOffset(t,-4))>=7)?rhrNow>=rhrBase+5:false};
  if(o.overreached){o.cls='bad';o.msg='近 3 天靜息心率均值高於基線 5 bpm 以上 — 恢復不足。今天改跑保底版或恢復日，先補睡。';return o;}
  if(o.pct===null){o.cls='idle';o.msg='還需要更多資料 — 連續記錄 14 天才能算出週變化率。';return o;}
  if(o.pct>=0.5&&o.waistUp){o.cls='bad';o.msg='體重週增 '+o.pct.toFixed(2)+'%，腰圍同步變粗 — 增太快了。每日熱量 −150 kcal。';}
  else if(o.pct>=0.15&&!o.waistUp){o.cls='good';o.msg='體重週增 '+o.pct.toFixed(2)+'%，腰圍持平 — 精瘦增肌中，維持現在的吃法。';}
  else if(Math.abs(o.pct)<0.15){o.cls='warn';o.msg='體重 7 日均幾乎沒動（'+o.pct.toFixed(2)+'%）。若已連續 3 週如此，每日 +150 kcal。';}
  else {o.cls='warn';o.msg='體重週減 '+Math.abs(o.pct).toFixed(2)+'% — 熱量不足以增肌。先把吃的補回來。';}
  return o;
}
/* 巨量營養素以 g/kg 表示 —— 比猜 TDEE 誠實，數字也直接可用 */
function macros(){
  const w=latest('weight'); if(!w)return null;
  const r=(a,b,d)=>(d?a.toFixed(d):Math.round(a))+'–'+(d?b.toFixed(d):Math.round(b));
  return {w:w,kcal:r(w*33+250,w*37+250),protein:r(w*1.6,w*2.2),carb:r(w*3,w*5),
    fat:r(w*0.8,w*1.0),perMeal:r(w*0.3,w*0.4),water:Math.round(w*35),
    gain:r(w*0.0025,w*0.005,2)};
}
export function renderBody(){
  const fmtT=s=>Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
  const tr=trend(),v=$('bd-verdict');
  v.className='verdict '+(tr?tr.cls:'idle');
  v.textContent=tr?tr.msg:'還需要更多資料 — 連續記錄 14 天才能算出週變化率。';
  const tile=(lab,val,unit,cls)=>'<div class="tile'+(cls?' '+cls:'')+'"><em>'+lab+'</em><b>'
    +(val===null||val===undefined?'—':val)+(unit?'<span>'+unit+'</span>':'')+'</b></div>';
  $('bd-tiles').innerHTML=
    tile('體重 7 日均',tr&&tr.cur?tr.cur.toFixed(1):null,'kg')
   +tile('週變化',tr&&tr.pct!==null?(tr.pct>0?'+':'')+tr.pct.toFixed(2):null,'%',
      tr&&tr.pct!==null?(tr.pct>=0.15?'up':(tr.pct<=-0.15?'down':'flat')):'')
   +tile('腰圍',latest('waist'),'cm',tr&&tr.waistUp?'down':'')
   +tile('靜息心率',latest('rhr'),'bpm',tr&&tr.overreached?'down':'');
  const m=macros(),mb=$('bd-macros');
  if(!m){mb.innerHTML='<p>先輸入一次體重，才能算出你的營養目標。</p>';$('bd-macro-note').textContent='';}
  else{
    mb.innerHTML=[
      ['每日熱量（起點估算）',m.kcal+' kcal'],
      ['蛋白質 1.6–2.2 g/kg',m.protein+' g'],
      ['碳水 3–5 g/kg',m.carb+' g'],
      ['脂肪 0.8–1.0 g/kg',m.fat+' g'],
      ['每餐蛋白 × 4 餐',m.perMeal+' g'],
      ['飲水',m.water+' ml'],
      ['目標增重速率',m.gain+' kg／週'],
      ['肌酸（單水）','3–5 g／天'],
      ['睡眠','7–9 小時']
    ].map(x=>'<div class="macro"><span>'+x[0]+'</span><b>'+x[1]+'</b></div>').join('');
    $('bd-macro-note').textContent='熱量是以 '+m.w.toFixed(1)
      +' kg 推估的起點，真正的校準來自上面的 7 日均趨勢：吃兩週、看體重怎麼走、再調 150 kcal。'
      +'蛋白質才是硬底線，其餘可彈性。有慢性病或正在用藥，先問醫師。';
  }
  const girth=(lab,key,unit)=>{const a=getState().body[key];if(!a.length)return '';
    const last=a[a.length-1],first=a.length>1?a[0]:null;
    return '<div class="prline"><span>'+lab+'</span><b>'+last.v+unit
      +(first?'　('+(last.v-first.v>=0?'+':'')+(last.v-first.v).toFixed(1)+')':'')+'</b></div>';};
  $('bd-girth').innerHTML=girth('上臂','arm','cm')+girth('肩圍','shoulder','cm')+girth('大腿','thigh','cm')
    ||'<p class="small">尚無圍度紀錄。</p>';
  const pr=(lab,key,f)=>{const a=getState().prs[key];if(!a.length)return '';
    const l=a[a.length-1];return '<div class="prline"><span>'+lab+' · '+l.date+'</span><b>'+f(l.v)+'</b></div>';};
  $('bd-strength').innerHTML=pr('伏地挺身','pushup',x=>x+' 下')+pr('派克伏地挺身','pike',x=>x+' 下')
    +pr('側平板','sideplank',x=>fmtT(x))||'<p class="small">尚無檢測紀錄。</p>';
  ['weight','waist','rhr','sleep','arm','shoulder','thigh'].forEach(k=>{
    const el=$('bd-'+k); if(el&&!el.value){const v=latest(k); if(v!==null)el.placeholder=String(v);} });
}
export function wireBody(){
  const num=id=>{const raw=$(id).value.trim();if(!raw)return null;
    const n=parseFloat(raw);return isNaN(n)||n<=0?NaN:n;};
  const commit=(pairs,msg,clear)=>{
    let wrote=0,bad=false;
    pairs.forEach(p=>{const n=num(p[1]);
      if(n===null)return; if(isNaN(n)){bad=true;return;}
      logMetric(p[0],n);wrote++;});
    if(bad){$('bd-msg').textContent='輸入的數字無效 — 請填正數。';return;}
    if(!wrote){$('bd-msg').textContent='沒有填任何欄位。';return;}
    saveState();clear.forEach(id=>{$(id).value='';});
    $('bd-msg').textContent=msg+'（'+wrote+' 項）';renderBody();
  };
  $('bd-save').onclick=()=>commit(
    [['weight','bd-weight'],['waist','bd-waist'],['rhr','bd-rhr'],['sleep','bd-sleep']],
    '已記錄今日',['bd-weight','bd-waist','bd-rhr','bd-sleep']);
  $('bd-save2').onclick=()=>commit(
    [['arm','bd-arm'],['shoulder','bd-shoulder'],['thigh','bd-thigh']],
    '已記錄圍度',['bd-arm','bd-shoulder','bd-thigh']);
  $('bd-save3').onclick=()=>{
    let wrote=0,bad=false;
    [['pushup','bd-pushup'],['pike','bd-pike'],['sideplank','bd-sideplank']].forEach(p=>{
      const n=num(p[1]); if(n===null)return; if(isNaN(n)){bad=true;return;}
      getState().prs[p[0]].push({date:todayStr(),v:n});wrote++;});
    if(bad){$('bd-msg').textContent='輸入的數字無效 — 請填正數。';return;}
    if(!wrote){$('bd-msg').textContent='沒有填任何欄位。';return;}
    saveState();['bd-pushup','bd-pike','bd-sideplank'].forEach(id=>{$(id).value='';});
    $('bd-msg').textContent='已記錄檢測（'+wrote+' 項）';renderBody();
  };
}
