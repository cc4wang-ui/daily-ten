/* Daily Ten — 課表：劑量、各序列建構、一週排程、時長估算、今日計畫。M1 自 index.html 原樣搬出。
   V2a（D6）：今日計畫的強度＝planLevel()（降量中是降一級後的強度，否則 state.level）；plan.lv 記下算時用的強度。 */
import { getState } from '../state/store.js';
import { bossItem } from './session.js';
import { todayWeekday, planLevel } from './game.js';

/* 有彈力帶時走加載版課表；出差沒帶就關掉，自動退回徒手版 */
export function hasBand(){return getState().settings.band!==false;}
/* ================= EXERCISE DATA ================= */
/* dose(level): stretches scale +15s/+2reps per level from L2 base, capped */
function dose(lv){
  const st=n=>Math.min(n+(lv-2)*15,90);      // seconds for stretches
  const rp=n=>Math.min(n+(lv-2)*2,15);       // reps for stretches
  return {
    catcow:rp(10), nineok:st(45), squatHold:Math.min(40+(lv-2)*20,120),
    wall:rp(10), needle:Math.min(6+(lv-2),10),
    bridge:[12,15,20,20,20][lv-1], bridgeSingle:lv>=4,
    pushSets:lv>=3?3:2, pushReps:[8,10,12,15,15][lv-1], pushKnee:lv===1,
    squatSets:lv>=3?3:2, squatReps:[12,15,20,20,20][lv-1],
    calf:[15,20,25,25,25][lv-1], calfSingle:lv>=4,
    plankSec:[30,45,60,90,150][lv-1], plankSets:lv>=2?2:1
  };
}
/* 步驟建構小工具 */
const T=(n,sub,sec)=>({name:n,sub:sub,mode:'time',secs:sec});
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
    R('靠牆滑臂','Wall Slides ×'+d.wall,d.wall,4),
    T('嬰兒式側伸展','Side Child’s Pose · 左右各半',d.nineok)
  ];
  if(set==='C')return[
    R('貓牛式','Cat-Cow ×'+d.catcow,d.catcow,3),
    T('世界最強伸展 · 左','World’s Greatest Stretch L',d.nineok),
    T('世界最強伸展 · 右','World’s Greatest Stretch R',d.nineok),
    T('下犬↔上犬流動','Down Dog ↔ Up Dog Flow',d.squatHold),
    T('躺姿脊椎扭轉','Supine Twist · 左右各半',d.nineok)
  ];
  return[
    R('貓牛式','Cat-Cow ×'+d.catcow,d.catcow,3),
    T('90/90 髖旋轉 · 左','90/90 Hip Switch L',d.nineok),
    T('90/90 髖旋轉 · 右','90/90 Hip Switch R',d.nineok),
    T('深蹲蹲坐','Deep Squat Hold',d.squatHold),
    T('鴿式','Pigeon Pose · 左右各半',d.nineok)
  ];
}
/* ===== 十動作本體 = 伸展 5 槽（輪替）＋ 肌力 5 槽（固定，含 AFT 三項的兩項） ===== */
export function fullSeq(lv,mob){
  const d=dose(lv), s=mobSeq(mob||'A',lv).slice();
  s.push(R('臀橋'+(d.bridgeSingle?' · 單腳輪替':''),'Glute Bridge ×'+d.bridge,d.bridge,3));
  for(let i=1;i<=d.pushSets;i++){ s.push(R('伏地挺身 第'+i+'組'+(d.pushKnee?' · 跪姿':''),'Push-up ×'+d.pushReps,d.pushReps,3));
    if(i<d.pushSets)s.push(REST(30)); }
  for(let i=1;i<=d.squatSets;i++){ s.push(R('深蹲 第'+i+'組','Squat ×'+d.squatReps,d.squatReps,3));
    if(i<d.squatSets)s.push(REST(30)); }
  s.push(R('提踵'+(d.calfSingle?' · 單腳輪替':''),'Calf Raise ×'+d.calf,d.calf,2));
  for(let i=1;i<=d.plankSets;i++){ s.push(T('平板支撐 第'+i+'組','Plank '+d.plankSec+'s',d.plankSec));
    if(i<d.plankSets)s.push(REST(20)); }
  return s;
}
/* ===== 加強區塊（Block B）— 主課表的後半段 =====
   預設使用彈力帶；關閉時改用毛巾與徒手動作。三種區塊依星期輪替。 */
export const BLOCKS={shoulder:'肩推鏈',lower:'下肢後鏈',pull:'拉系列與上背'};
/* 肩：後三角＋肩胛先做（多數人的弱點在後側），再進垂直推的漸進階梯 */
function shoulderSeq(lv){
  const pike=[0,6,8,10,12,15][lv], hold=[0,15,20,30,40,45][lv],
        /* 有彈力帶時肩上推已補了推的量，派克降到 2 組；動作越難每組負荷越高，組數也往下調 */
        sets=hasBand()?2:(lv<=3?3:2),
        name=lv<=2?'派克伏地挺身':(lv<=4?'腳抬高派克伏地挺身':'靠牆倒立肩推'),
        en=lv<=2?'Pike Push-up':(lv<=4?'Elevated Pike Push-up · 腳踩牆或沙發':'Wall Handstand Push-up'),
        s=[];
  s.push(R('俯臥 Y 舉','Prone Y Raise ×12 · 拇指朝天',12,3));
  s.push(R('俯臥 T 舉','Prone T Raise ×12',12,3));
  s.push(R('俯臥 W 舉','Prone W Raise ×12 · 夾緊肩胛',12,3));
  s.push(REST(30));
  for(let i=1;i<=sets;i++){ s.push(R(name+' 第'+i+'組',en+' ×'+pike,pike,4)); s.push(REST(40)); }
  if(hasBand()){
    /* 徒手練不到的兩塊：加載的垂直推、以及被孤立的中三角 */
    const ohp=[0,12,15,15,15,15][lv];
    s.push(R('彈力帶肩上推','Band Overhead Press ×'+ohp+' · 踩住帶子',ohp,3));
    s.push(REST(35));
    /* L4 起主課表本身已經很重，配件動作讓位給時間預算 */
    if(lv<=3){ s.push(R('彈力帶側平舉','Band Lateral Raise ×15 · 舉到肩高',15,3)); s.push(REST(25)); }
  }
  s.push(T('靠牆倒立撐','Wall Handstand Hold '+hold+'s · 面牆',hold));
  s.push(REST(30));
  s.push(R('反向雪天使','Reverse Snow Angel ×15 · 俯臥',15,2));
  if(hasBand()&&lv<=3)s.push(R('彈力帶三頭下壓','Band Triceps Extension ×15',15,3));
  s.push(R('平板肩點','Plank Shoulder Tap ×20',20,2));
  if(lv===3)s.push(T('熊爬定位','Bear Crawl Hold 30s',30));
  if(lv>=4)s.push(R('假直立伏地挺身','Pseudo Planche Push-up ×'+Math.max(5,pike-4)+' · 身體前傾',Math.max(5,pike-4),4));
  return s;
}
/* 下肢：單邊化是徒手唯一有效的漸進超負荷路徑 */
function lowerSeq(lv){
  const sp=[0,8,10,12,15,15][lv], wall=[0,30,40,50,60,75][lv],
        nord=Math.min(4+lv,10), s=[];
  const sets=lv<=3?2:2;
  for(let i=1;i<=sets;i++){
    s.push(R('分腿蹲 第'+i+'組 · 左','Split Squat L ×'+sp,sp,3));
    s.push(R('分腿蹲 第'+i+'組 · 右','Split Squat R ×'+sp,sp,3));
    s.push(REST(40));
  }
  s.push(R('單腳臀橋 · 左','Single-Leg Glute Bridge L ×'+sp,sp,3));
  s.push(R('單腳臀橋 · 右','Single-Leg Glute Bridge R ×'+sp,sp,3));
  s.push(REST(30));
  if(hasBand()){
    /* 徒手最難加載的後鏈 —— 髖鉸鏈有了阻力才練得到 */
    s.push(R('彈力帶羅馬尼亞硬舉','Band RDL ×15 · 髖鉸鏈、背打直',15,3));
    s.push(REST(35));
  }
  s.push(T('靠牆深蹲靜態','Wall Sit '+wall+'s',wall));
  s.push(R('跪姿離心腿後彎舉','Kneeling Eccentric Hamstring ×'+nord+' · 5 秒下放',nord,5));
  s.push(REST(20));
  s.push(R('單腳提踵 · 左','Single-Leg Calf Raise L ×15',15,2));
  s.push(R('單腳提踵 · 右','Single-Leg Calf Raise R ×15',15,2));
  if(lv>=3)s.push(R('深蹲跳','Squat Jump ×10 · 輕落地',10,2));
  s.push(T('死蟲式','Dead Bug 40s',40));
  return s;
}
/* 拉：有彈力帶就是真正的水平＋垂直拉；沒帶則退回俯臥等長版 */
function pullSeq(lv){
  if(!hasBand())return pullSeqBodyweight(lv);
  const rows=[0,12,15,15,15,15][lv], sets=lv<=2?2:(lv<=3?3:2), s=[];
  for(let i=1;i<=sets;i++){
    s.push(R('彈力帶划船 第'+i+'組','Band Row ×'+rows+' · 帶子繞腳底或門縫、夾緊肩胛',rows,3));
    s.push(REST(40));
  }
  s.push(R('彈力帶直臂下拉','Band Lat Pulldown ×'+rows+' · 高處固定、手肘打直下壓',rows,3));
  s.push(REST(30));
  s.push(R('彈力帶面拉','Band Face Pull ×15 · 拉到額頭高度、外旋到底',15,3));
  s.push(R('彈力帶開肩','Band Pull-apart ×20 · 手肘打直',20,2));
  s.push(REST(25));
  s.push(R('彈力帶肩外旋 · 左','Band External Rotation L ×15',15,3));
  s.push(R('彈力帶肩外旋 · 右','Band External Rotation R ×15',15,3));
  s.push(REST(25));
  s.push(R('彈力帶二頭彎舉','Band Biceps Curl ×'+rows,rows,3));
  s.push(REST(20));
  s.push(T('側平板 · 左','Side Plank L 30s',30));
  s.push(T('側平板 · 右','Side Plank R 30s',30));
  return s;
}
/* 出差／沒帶彈力帶的替代版 —— 強度上限較低，但比不做好 */
function pullSeqBodyweight(lv){
  const rows=[0,10,12,15,15,15][lv], sup=[0,20,25,30,40,45][lv], s=[];
  const sets=lv<=3?3:2;
  for(let i=1;i<=sets;i++){
    s.push(R('毛巾划船 第'+i+'組','Towel Row ×'+rows+' · 毛巾繞門把、身體後傾',rows,3));
    s.push(REST(40));
  }
  s.push(R('俯臥 T 舉 · 慢速','Prone T Raise ×15 · 頂點停 3 秒',15,4));
  s.push(R('超人式划船','Superman Row ×15',15,3));
  s.push(REST(20));
  s.push(T('超人式停留','Superman Hold '+sup+'s',sup));
  s.push(R('毛巾直臂下拉','Towel Pull-down ×12 · 雙手互相對抗',12,4));
  s.push(REST(20));
  s.push(T('反向平板','Reverse Plank '+sup+'s',sup));
  s.push(T('側平板 · 左','Side Plank L 30s',30));
  s.push(T('側平板 · 右','Side Plank R 30s',30));
  return s;
}
export function blockSeq(kind,lv){
  if(kind==='shoulder')return shoulderSeq(lv);
  if(kind==='lower')return lowerSeq(lv);
  if(kind==='pull')return pullSeq(lv);
  return [];
}
/* 週三是一週唯一的加練日。加的量跟著當天的區塊走 ——
   有彈力帶時週三是拉日，就加拉；否則補推的量。不要在拉日堆推。 */
function cycleExtra(lv){
  const d=dose(lv);
  if(hasBand())return [R('彈力帶划船 加練','Band Row ×'+[0,12,15,15,15,15][lv],[0,12,15,15,15,15][lv],3),
    REST(30),R('彈力帶面拉 加練','Band Face Pull ×15',15,3)];
  return [R('伏地挺身 加練','Push-up ×'+d.pushReps,d.pushReps,3),REST(30),
          R('派克伏地挺身 加練','Pike Push-up ×8',8,4)];
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
  const s=[]; // 10 min: 5 rounds of (burpee 40s / rest 20s / jumping jack 40s / rest 20s)
  for(let i=1;i<=5;i++){
    s.push({name:'波比跳 R'+i,sub:'Burpees',mode:'time',secs:40});
    s.push({name:'休息',sub:'Rest',mode:'time',secs:20});
    s.push({name:'開合跳 R'+i,sub:'Jumping Jacks',mode:'time',secs:40});
    s.push({name:'休息',sub:'Rest',mode:'time',secs:20});
  }
  return s;
}
export function addTransitions(seq){
  const out=[{name:'預備',sub:'手機放地上 · 就位',mode:'time',secs:10,prep:seq[0]?seq[0].name:''}];
  for(let i=0;i<seq.length;i++){
    const st=seq[i],isRest=st.name.indexOf('休息')>=0;
    const prevIsGap=out.length&&(out[out.length-1].name.indexOf('休息')>=0||out[out.length-1].prep!==undefined);
    if(!isRest&&!prevIsGap&&i>0)out.push({name:'準備',sub:st.name,mode:'time',secs:8,prep:st.name});
    out.push(st);
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
  {type:'full', mob:'A', block:'lower'},
  {type:'rest', mob:'C', block:null}
];
/* 時長一律由序列算出，不手寫 —— 劑量隨等級長大，標籤才不會說謊 */
export function estMin(seq){
  const sec=addTransitions(seq).reduce((a,x)=>a+(x.mode==='time'?x.secs:x.reps*x.tempo)+0.6,0);
  return Math.round(sec/60);
}
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
    plan.label='開始 · 十動作＋'+BLOCKS[p.block]+'（'+plan.min+' min）';
    plan.mission='伸展組 '+p.mob+'：'+MOB_SETS[p.mob]+'　·　加強區塊：'+BLOCKS[p.block]
      +(p.type==='cycle'?'（本週唯一加練日）':'')+'。按下開始後手機放地上，聽指令即可。';
  }
  return plan;
}
/* 今天要跑的完整序列 */
export function planSeq(plan,lv){
  if(plan.type==='rest')return restSeq(lv);
  const s=fullSeq(lv,plan.mob);
  if(plan.block)s.push.apply(s,blockSeq(plan.block,lv));
  if(plan.type==='cycle')s.push.apply(s,cycleExtra(lv));
  return s;
}
