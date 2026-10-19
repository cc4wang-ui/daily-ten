/* Daily Ten — 課表：劑量、各序列建構、一週排程、時長估算、今日計畫。M1 自 index.html 原樣搬出。
   V2a（D6）：今日計畫的強度＝planLevel()（降量中是降一級後的強度，否則 state.level）；plan.lv 記下算時用的強度。 */
import { getState } from '../state/store.js';
import { bossItem } from './session.js';
import { todayWeekday, todayKey, planLevel, gameRules, summary } from './game.js';
import { canonicalMovement, latestResistance, progressionFor } from '../game/training-progression.js';

/* 有彈力帶時走加載版課表；出差沒帶就關掉，自動退回徒手版 */
export function hasBand(){return getState().settings.band!==false;}
/* ================= EXERCISE DATA ================= */
/* 活動度維持短段落；力量進階以受控次數為主，不靠拉長靜態停留。 */
function dose(lv){
  const st=n=>Math.min(Math.max(20,n+(lv-2)*5),35);
  const rp=n=>Math.min(n+(lv-2)*2,15);       // reps for stretches
  return {
    catcow:rp(10), nineok:st(30), squatHold:Math.min(20+(lv-1)*3,30),
    wall:rp(10), needle:Math.max(5,Math.min(6+(lv-2),10)),
    bridge:[12,15,20,20,20][lv-1], bridgeSingle:lv>=4,
    pushReps:[8,10,12,15,15][lv-1], pushKnee:lv===1,
    squatReps:[12,15,20,20,20][lv-1],
    calf:[15,20,25,25,25][lv-1], calfSingle:lv>=4,
    /* 不在每日課表反覆做到 Boss Day 的極限時數。 */
    plankSec:[20,30,45,60,75][lv-1], plankSets:lv>=4?2:1
  };
}
/* 步驟建構小工具 */
const T=(n,sub,sec)=>({name:n,sub:sub,mode:'time',secs:sec});
const B=(n,sub,sec)=>({...T(n,sub,sec),sideSwitch:true});
const R=(n,sub,reps,tempo)=>({name:n,sub:sub,mode:'reps',reps:reps,tempo:tempo||3});
const REST=sec=>T('組間休息','Rest',sec);
/* ===== 伸展輪替 =====
   前五個槽位固定，內容依星期輪替 —— 使用者不做選擇，只是每天不一樣。
   A 髖與後鏈 ／ B 胸肩與上背 ／ C 全身流動 */
const MOB_SETS={A:'髖與後鏈',B:'胸肩與上背',C:'全身流動'};
function mobSeq(set,lv){
  const d=dose(lv);
  if(set==='B')return[
    R('貓牛式','Cat-Cow ×'+d.catcow,d.catcow,3),
    R('穿針式 · 左','Thread the Needle L ×'+d.needle,d.needle,4),
    R('穿針式 · 右','Thread the Needle R ×'+d.needle,d.needle,4),
    R('俯臥半程雪天使','Prone Floor Angel ×'+d.wall+' · 手臂離地',d.wall,4),
    B('嬰兒式側伸展','Side Child’s Pose · 左右各半',d.nineok)
  ];
  if(set==='C')return[
    R('貓牛式','Cat-Cow ×'+d.catcow,d.catcow,3),
    T('世界最強伸展 · 左','World’s Greatest Stretch L',d.nineok),
    T('世界最強伸展 · 右','World’s Greatest Stretch R',d.nineok),
    T('下犬↔上犬流動','Down Dog ↔ Up Dog Flow',d.squatHold),
    B('躺姿脊椎扭轉','Supine Twist · 左右各半',d.nineok)
  ];
  return[
    R('貓牛式','Cat-Cow ×'+d.catcow,d.catcow,3),
    T('90/90 髖旋轉 · 左','90/90 Hip Switch L',d.nineok),
    T('90/90 髖旋轉 · 右','90/90 Hip Switch R',d.nineok),
    T('深蹲蹲坐','Deep Squat Hold',d.squatHold),
    B('鴿式','Pigeon Pose · 左右各半',d.nineok)
  ];
}
/* ===== Boss Day 十動作暖身：5 個活動度＋5 個低量啟動，不在測驗前堆疲勞 ===== */
export function fullSeq(lv,mob){
  const d=dose(lv), s=mobSeq(mob||'A',lv).slice();
  const bridge=Math.min(d.bridge,10), push=Math.min(d.pushReps,8), squat=Math.min(d.squatReps,10), calf=Math.min(d.calf,12);
  s.push(R('臀橋','Glute Bridge ×'+bridge,bridge,3));
  s.push(R('伏地挺身'+(d.pushKnee?' · 跪姿':''),'Push-up ×'+push,push,3));
  s.push(R('深蹲','Squat ×'+squat,squat,3));
  s.push(R('提踵','Calf Raise ×'+calf,calf,2));
  s.push(T('平板支撐','Plank 20s',20));
  return s;
}
/* ===== 加強區塊（Block B）— 主課表的後半段 =====
   預設使用彈力帶；關閉時改用不需固定點的徒手動作。三種區塊依星期輪替。 */
export const BLOCKS={shoulder:'推與肩',lower:'下肢與髖伸',pull:'拉與上背',lowerPull:'下肢＋拉力補強'};
export function blockLabel(kind){
  if(!hasBand()&&kind==='pull')return '上背控制（拉力有限）';
  if(!hasBand()&&kind==='lowerPull')return '下肢＋上背控制（拉力有限）';
  return BLOCKS[kind];
}
/* 推日：兩組水平推、兩組垂直推，加少量肩胛控制；不在疲勞後加高難度收尾。 */
function shoulderSeq(lv){
  const d=dose(lv), pike=[0,4,6,8,10,10][lv], s=[];
  for(let i=1;i<=2;i++){
    s.push(R('伏地挺身 第'+i+'組'+(d.pushKnee?' · 跪姿':''),'Push-up ×'+d.pushReps,d.pushReps,3));
    s.push(REST(60));
  }
  if(hasBand()){
    const ohp=[0,8,10,10,12,12][lv];
    for(let i=1;i<=2;i++){
      s.push(R('彈力帶肩上推 第'+i+'組','Band Overhead Press ×'+ohp+' · 雙腳踩穩帶子、先用輕阻力',ohp,3));
      s.push(REST(60));
    }
    s.push(R('彈力帶側平舉','Band Lateral Raise ×12 · 輕阻力、舉到肩高',12,3));
  }else{
    for(let i=1;i<=2;i++){
      s.push(R('派克伏地挺身 第'+i+'組','Pike Push-up ×'+pike+' · 自選可控制的活動範圍',pike,4));
      s.push(REST(60));
    }
  }
  s.push(R('俯臥 Y 舉','Prone Y Raise ×10 · 小幅度、拇指朝天',10,3));
  s.push(R('俯臥 T 舉','Prone T Raise ×10 · 小幅度',10,3));
  return s;
}
/* 下肢日：膝主導與髖主導各有工作組，移除疲勞後的自動跳躍。 */
function lowerSeq(lv){
  const sp=[0,6,8,10,12,12][lv], bridge=[0,10,12,12,15,15][lv], s=[];
  for(let i=1;i<=2;i++){
    s.push(R('分腿蹲 第'+i+'組 · 左','Split Squat L ×'+sp,sp,3));
    s.push(R('分腿蹲 第'+i+'組 · 右','Split Squat R ×'+sp,sp,3));
    s.push(REST(60));
  }
  for(let i=1;i<=2;i++){
    s.push(R('臀橋 第'+i+'組','Glute Bridge ×'+bridge+' · 頂點停 1 秒',bridge,3));
    s.push(REST(45));
  }
  if(hasBand()){
    for(let i=1;i<=2;i++){
      s.push(R('彈力帶羅馬尼亞硬舉 第'+i+'組','Band RDL ×'+bridge+' · 雙腳踩穩、從髖部折疊',bridge,3));
      s.push(REST(60));
    }
  }
  s.push(R('控制深蹲','Controlled Squat ×10 · 3 秒蹲下、1 秒站起',10,4));
  s.push(REST(40));
  s.push(R('單腳提踵 · 左','Single-Leg Calf Raise L ×15',15,2));
  s.push(R('單腳提踵 · 右','Single-Leg Calf Raise R ×15',15,2));
  s.push(T('死蟲式','Dead Bug 30s · 緩慢交替',30));
  return s;
}
/* 拉：有彈力帶可做水平拉；沒有固定點時無法提供等效垂直拉。 */
function pullSeq(lv){
  if(!hasBand())return pullSeqBodyweight(lv);
  const rows=[0,8,10,12,12,15][lv], sets=lv<=2?2:3, s=[];
  for(let i=1;i<=sets;i++){
    s.push(R('彈力帶划船 第'+i+'組','Band Row ×'+rows+' · 帶子繞腳底、確認踩穩、輕阻力開始',rows,3));
    s.push(REST(60));
  }
  for(let i=1;i<=2;i++){
    s.push(R('彈力帶開肩 第'+i+'組','Band Pull-apart ×12 · 輕阻力、小幅度',12,3));
    s.push(REST(45));
  }
  s.push(R('彈力帶肩外旋 · 左','Band External Rotation L ×10 · 輕阻力',10,3));
  s.push(R('彈力帶肩外旋 · 右','Band External Rotation R ×10 · 輕阻力',10,3));
  s.push(T('側平板 · 左','Side Plank L 20s',20));
  s.push(T('側平板 · 右','Side Plank R 20s',20));
  return s;
}
/* 無帶版是低阻力的上背控制，不能視為等效的拉力肌力訓練。 */
function pullSeqBodyweight(lv){
  const rows=[0,8,10,12,12,15][lv], s=[];
  const sets=2;
  for(let i=1;i<=sets;i++){
    s.push(R('超人式划船 第'+i+'組','Superman Row ×'+rows+' · 徒手上背控制，不能取代負重拉力',rows,3));
    s.push(REST(60));
  }
  s.push(R('俯臥 T 舉 · 慢速','Prone T Raise ×10 · 小幅度控制',10,4));
  s.push(REST(40));
  for(let i=1;i<=2;i++){
    s.push(R('毛巾直臂下拉 第'+i+'組','Towel Pull-down ×10 · 雙手互相對抗，不固定在物體上',10,4));
    s.push(REST(45));
  }
  s.push(T('側平板 · 左','Side Plank L 20s',20));
  s.push(T('側平板 · 右','Side Plank R 20s',20));
  return s;
}
/* 週五用短版下肢＋拉力補強，避免把兩堂完整課表硬接在一起。 */
function lowerPullSeq(lv){
  const sp=[0,6,8,10,10,12][lv], rows=[0,8,10,12,12,15][lv], s=[];
  for(let i=1;i<=2;i++){
    s.push(R('分腿蹲 第'+i+'組 · 左','Split Squat L ×'+sp,sp,3));
    s.push(R('分腿蹲 第'+i+'組 · 右','Split Squat R ×'+sp,sp,3));
    s.push(REST(45));
  }
  for(let i=1;i<=2;i++){
    s.push(R('臀橋 第'+i+'組','Glute Bridge ×12 · 頂點停 1 秒',12,3));
    s.push(REST(40));
  }
  for(let i=1;i<=2;i++){
    s.push(hasBand()
      ? R('彈力帶划船 第'+i+'組','Band Row ×'+rows+' · 帶子繞腳底、確認踩穩',rows,3)
      : R('超人式划船 第'+i+'組','Superman Row ×'+rows+' · 低阻力上背控制，不能取代負重拉力',rows,3));
    s.push(REST(60));
  }
  return s;
}
function baseBlockSeq(kind,lv){
  if(kind==='shoulder')return shoulderSeq(lv);
  if(kind==='lower')return lowerSeq(lv);
  if(kind==='pull')return pullSeq(lv);
  if(kind==='lowerPull')return lowerPullSeq(lv);
  return [];
}
/* Only numbered strength worksets adapt. The generated sequence is a snapshot:
   the runner and checkpoint keep these reps even if feedback changes later. */
export function blockSeq(kind,lv){
  const seq=baseBlockSeq(kind,lv),state=getState(),rules=gameRules();
  const deload=summary()?.deload?.active===true;
  const holdReason=deload?'deload':lv!==state.level?'level':!rules?.trainingProgression?'invalid':null;
  const sets=new Map();
  for(const step of seq){
    const movement=canonicalMovement(step.name);
    if(movement)sets.set(movement,(sets.get(movement)||0)+1);
  }
  const asOf=todayKey();
  return seq.map(step=>{
    const movement=canonicalMovement(step.name);
    if(!movement||step.mode!=='reps')return step;
    const decision=holdReason
      ? {reps:step.reps,baseReps:step.reps,delta:0,reason:holdReason,evidenceDays:[]}
      : progressionFor({state,asOf,name:step.name,baseReps:step.reps,requiredSets:sets.get(movement),rules});
    if(!decision)return step;
    if(holdReason){
      const resistance=latestResistance({state,asOf,name:step.name,historyDays:rules?.trainingProgression?.historyDays});
      if(resistance!==null)decision.resistance=resistance;
    }
    return {...step,reps:decision.reps,sub:step.sub.replace(/×\d+/,`×${decision.reps}`),
      prescription:{movement,...decision}};
  });
}
export function blockTargets(kind,lv){
  const targets=new Map();
  for(const step of blockSeq(kind,lv)){
    const target=step.prescription;
    if(target&&!targets.has(target.movement))targets.set(target.movement,target);
  }
  return [...targets.values()];
}
/* 週三是加練日，維持當天的拉／上背主題。 */
function cycleExtra(lv){
  const rows=[0,8,10,10,12,12][lv];
  if(hasBand())return [R('彈力帶划船 加練','Band Row ×'+rows+' · 帶子繞腳底、確認踩穩、輕阻力開始',rows,3),
    REST(60),R('彈力帶開肩 加練','Band Pull-apart ×10 · 輕阻力、小幅度',10,3)];
  return [R('超人式划船 加練','Superman Row ×'+rows+' · 低阻力上背控制，不能取代負重拉力',rows,3),REST(60),
          R('反向雪天使 加練','Reverse Snow Angel ×10 · 小幅度控制',10,3)];
}
/* 恢復日：三組伸展全部走一遍，不做肌力；不再額外乘時長。 */
export function restSeq(lv){
  return ['A','B','C'].reduce((acc,set,i)=>
    acc.concat(i?[T('換組','Recovery · 下一組伸展',15)]:[],mobSeq(set,lv)),[]);
}
export function minimalSeq(lv){
  const d=dose(lv);
  return [
    R('貓牛式','Cat-Cow ×'+d.catcow,d.catcow,3),
    T('90/90 髖旋轉 · 左','30s',30),
    T('90/90 髖旋轉 · 右','30s',30),
    T('平板支撐','Plank',Math.min(d.plankSec,45))
  ];
}
export function rainSeq(){
  const s=[]; // 低衝擊 5 輪；加上 10 秒預備後約 10 分鐘。
  for(let i=1;i<=5;i++){
    s.push(T('原地快走 R'+i,'地面乾燥防滑、留出空間；不舒服就降速',40));
    s.push(T('休息','原地輕鬆走、放慢呼吸',20));
    s.push(T('側步開合 R'+i,'左右跨步，不跳躍；不確定就原地走',40));
    s.push(T('休息','原地輕鬆走、放慢呼吸',20));
  }
  return s;
}
export function addTransitions(seq){
  const out=[{name:'預備',sub:'手機放地上 · 就位',mode:'time',secs:10,prep:seq[0]?seq[0].name:''}];
  let previousGear='徒手';
  for(let i=0;i<seq.length;i++){
    const st=seq[i],isRest=st.name.indexOf('休息')>=0||st.name==='換組';
    const prevIsGap=out.length&&(out[out.length-1].name.indexOf('休息')>=0
      ||out[out.length-1].name==='換組'||out[out.length-1].prep!==undefined);
    const gear=st.name.indexOf('彈力帶')>=0?'彈力帶':'徒手';
    if(!isRest&&i>0&&gear!==previousGear){
      out.push({name:'換器材',sub:gear==='彈力帶'?'拿好彈力帶、確認踩穩':'放下彈力帶、回到墊上',mode:'time',secs:15,prep:st.name});
    }else if(!isRest&&!prevIsGap&&i>0){
      out.push({name:'準備',sub:st.name,mode:'time',secs:8,prep:st.name});
    }
    out.push(st);
    if(!isRest)previousGear=gear;
  }
  return out;
}
export const DOW=['日','一','二','三','四','五','六'];
/* 一週排程：伸展組與加強區塊都由星期決定，使用者不做選擇。
   0=日 … 6=六 */
export const WEEK=[
  {type:'boss', mob:'A', block:null},
  {type:'full', mob:'A', block:'shoulder'},
  {type:'full', mob:'B', block:'lower'},
  {type:'cycle',mob:'C', block:'pull'},
  {type:'full', mob:'B', block:'shoulder'},
  {type:'full', mob:'A', block:'lowerPull'},
  {type:'rest', mob:'C', block:null}
];
/* 時長一律由序列算出，不手寫 —— 劑量隨等級長大，標籤才不會說謊 */
export function estSec(seq){
  return addTransitions(seq).reduce((a,x)=>a+(x.mode==='time'?x.secs:x.reps*x.tempo),0);
}
export function estMin(seq){return Math.round(estSec(seq)/60);}
/* 今日計畫：星期取遊戲日（04:00 前仍是前一天的課表）；lv＝今天的強度（預設 planLevel()：D6 降量中降一級） */
export function todayPlan(lv=planLevel()){
  const p=WEEK[todayWeekday()], plan=Object.assign({},p);
  plan.lv=lv;
  if(p.type==='boss'){
    plan.min=estMin(fullSeq(lv,p.mob)); // 僅暖身；測驗長度依項目而異，跑步另計
    plan.label='BOSS DAY · 十動作暖身（約 '+plan.min+' min）＋測驗另計';
    plan.mission='今日測驗：'+({hrp:'HRP 伏地挺身 2 分鐘',plank:'Plank 極限',run2mi:'2 英里跑'})[bossItem()]
      +'。先完成十動作暖身，測驗自動接續。';
  }else if(p.type==='rest'){
    plan.min=estMin(restSeq(lv));
    plan.label='恢復序列 · '+plan.min+' 分鐘全身流動';
    plan.mission='休息日：三組伸展全部走一遍，不做肌力。白天散步 20–30 分鐘，晚上熱水澡、7 小時睡眠 — 明天 Boss Day 滿血。';
  }else{
    plan.min=estMin(planSeq(plan,lv));
    plan.label='開始 · 活動度＋'+blockLabel(p.block)+'（'+plan.min+' min）';
    plan.mission='伸展組 '+p.mob+'：'+MOB_SETS[p.mob]+'　·　加強區塊：'+blockLabel(p.block)
      +(p.type==='cycle'?'（本週唯一加練日）':'')+'。肌力組保留約 2 下餘力；彈力帶依此選阻力。按下開始後手機放地上，聽指令即可。';
    if(!hasBand()&&(p.block==='pull'||p.block==='lowerPull'))plan.mission+=' 徒手上背動作阻力有限，不能等同負重拉力訓練。';
  }
  return plan;
}
/* 今天要跑的完整序列 */
export function planSeq(plan,lv){
  if(plan.type==='rest')return restSeq(lv);
  if(plan.type==='boss')return fullSeq(lv,plan.mob);
  const s=mobSeq(plan.mob,lv).slice();
  if(plan.block)s.push.apply(s,blockSeq(plan.block,lv));
  if(plan.type==='cycle')s.push.apply(s,cycleExtra(lv));
  return s;
}
