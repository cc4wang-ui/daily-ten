/* Daily Ten — 動作示範動畫
   自製線條人偶，不依賴外部影片：離線可用、無授權問題、可跟著 App 的節拍（tempo）同步。
   座標系：x 向右、y 向上、地面 y=0；角度 0°=向右、90°=向上。
   每個動作 = 基礎姿勢 b ＋ 關鍵影格 k（覆寫欄位）＋ 時間軸 tl。
   關鍵影格可用 an（把某關節釘在指定位置）與 ik（把手腕／腳踝放到指定點，自動解手肘／膝蓋）。
   預處理時每個影格都轉成「髖座標＋角度＋IK 目標」的純數字，動畫只做線性插值。 */
(function(root){
'use strict';
const L={T:34,NK:4,HR:6.5,UA:17,FA:16,TH:22,SH:21,FT:7};
const GY=122, VW=200, VH=130;             /* svg 視窗；地面在 svg y=122 */
const rad=d=>d*Math.PI/180;
const dir=(a,l)=>[l*Math.cos(rad(a)),l*Math.sin(rad(a))];
const add=(p,v)=>[p[0]+v[0],p[1]+v[1]];
const BASE={t:90,c:0,w:0,wh:0,
  u1:-90,f1:-90,u2:-90,f2:-90,h1:-90,s1:-90,h2:-90,s2:-90,
  m1:1,n1:1,m2:1,n2:1,q1:1,r1:1,q2:1,r2:1,ftl:1,hx:100,hy:46};
const LIMB={w1:['s1','e1',L.UA,L.FA,'m1','n1','u1','f1'],w2:['s2','e2',L.UA,L.FA,'m2','n2','u2','f2'],
            a1:['p1','k1',L.TH,L.SH,'q1','r1','h1','s1'],a2:['p2','k2',L.TH,L.SH,'q2','r2','h2','s2']};
const deg=v=>Math.atan2(v[1],v[0])*180/Math.PI;

/* 2 段 IK：root→mid→end，b=+1/-1 決定關節彎向哪一側 */
function ik2(R,X,l1,l2,b){
  const dx=X[0]-R[0],dy=X[1]-R[1];
  let d=Math.hypot(dx,dy);
  d=Math.max(Math.abs(l1-l2)+.01,Math.min(l1+l2-.01,d));
  const base=deg([dx,dy]);
  const c=Math.max(-1,Math.min(1,(l1*l1+d*d-l2*l2)/(2*l1*d)));
  const a1=base+b*Math.acos(c)*180/Math.PI;
  const mid=add(R,dir(a1,l1));
  const a2=deg([X[0]-mid[0],X[1]-mid[1]]);
  return [a1,a2];
}
function foot(P,i){return P['ft'+i]!=null?P['ft'+i]:P['s'+i]+60;}
/* 解一個姿勢 → 各關節世界座標 */
function solve(P){
  /* 先以髖在原點算一次，依 an（釘住的關節）或 hx/hy 決定髖的世界座標 */
  const J0=solveFK(P,[0,0]);
  const H=P.an?[P.an[1]-J0[P.an[0]][0],P.an[2]-J0[P.an[0]][1]]:[P.hx,P.hy];
  const J=solveFK(P,H);
  /* IK：解出角度寫回 P（之後插值只看角度）；釘住的關節不可是被 IK 的肢段 */
  if(P.ik){
    for(const key in P.ik){
      const tg=P.ik[key],lb=LIMB[key],ref=typeof tg[0]==='string';
      const X=ref?add(J[tg[0]],[tg[1],tg[2]]):[tg[0],tg[1]];
      const r=ik2(J[lb[0]],X,lb[2]*P[lb[4]],lb[3]*P[lb[5]],(ref?tg[3]:tg[2])||1);
      P[lb[6]]=r[0];P[lb[7]]=r[1];
    }
    return solveFK(P,H);
  }
  return J;
}
/* 已知髖位置與全部角度，純 FK */
function solveFK(P,H){
  const J={h:H};
  J.n=add(H,dir(P.t,L.T));
  J.hd=add(J.n,dir(P.hd!=null?P.hd:P.t,L.NK+L.HR));
  J.s1=add(J.n,dir(P.t+90,P.w)); J.s2=add(J.n,dir(P.t-90,P.w));
  J.p1=add(H,dir(P.t+90,P.wh)); J.p2=add(H,dir(P.t-90,P.wh));
  for(const i of [1,2]){
    J['e'+i]=add(J['s'+i],dir(P['u'+i],L.UA*P['m'+i]));
    J['w'+i]=add(J['e'+i],dir(P['f'+i],L.FA*P['n'+i]));
    J['k'+i]=add(J['p'+i],dir(P['h'+i],L.TH*P['q'+i]));
    J['a'+i]=add(J['k'+i],dir(P['s'+i],L.SH*P['r'+i]));
    J['t'+i]=add(J['a'+i],dir(foot(P,i),L.FT*P.ftl));
  }
  return J;
}
/* 影格 → 純數字（髖位置 hx/hy ＋ 已解的角度＋足部角度） */
function bake(b,k){
  const P=Object.assign({},BASE,b,k);
  if(b.ik||k.ik)P.ik=Object.assign({},b.ik||{},k.ik||{});
  const J0=solve(P);
  const out={};
  for(const key in BASE)out[key]=P[key];
  out.hd=P.hd!=null?P.hd:P.t;
  out.ft1=foot(P,1);out.ft2=foot(P,2);
  out.hx=J0.h[0];out.hy=J0.h[1];
  return out;
}
const NUM=Object.keys(BASE).concat(['hd','ft1','ft2']);
function lerpPose(a,b,x){const o={};for(const k of NUM)o[k]=a[k]+(b[k]-a[k])*x;return o;}
const ease=x=>.5-.5*Math.cos(Math.PI*x);

/* ================= 動作庫 =================
   b 基礎、k 影格、tl [[從,到,權重]]、p 自訂週期（秒）、v 視角 side/front/top、props 道具 */
const STAND={t:90,an:['a1',100,3.5]};
const FRONT={t:90,w:8,wh:5,h1:-94,s1:-92,h2:-86,s2:-88,ft1:-150,ft2:-30,ftl:.6,u1:-98,f1:-96,u2:-82,f2:-84,an:['a1',95,3]};
const QUAD={t:19,h1:-90,s1:180,h2:-90,s2:180,ft1:180,ft2:180,an:['k1',78,1],ik:{w1:[103,0,-1],w2:[103,0,-1]}};
const PRONE_TOP={t:0,w:8,wh:5,h1:180,s1:180,h2:180,s2:180,ft1:180,ft2:180,ftl:.6,hx:72,hy:60};
const PING=[[0,1,.45],[1,1,.1],[1,0,.45]];
const HOLD=[[0,1,.5],[1,0,.5]];
const D={};
function def(key,name,cue,o){D[key]=Object.assign({key:key,name:name,cue:cue,v:'side',tl:null,props:{}},o);}

/* ---- 伸展 ---- */
def('catcow','貓牛式','吸氣塌腰抬頭，吐氣拱背收下巴；手在肩下、膝在髖下。',
  {b:QUAD,k:[{c:-6,hd:55,t:21},{c:8,hd:-60,t:17}]});
def('needle','穿針式','撐地手不動，另一手從身體下方穿過、肩膀貼地，再向上打開胸口。',
  {b:Object.assign({},QUAD,{ik:{w1:[110,0,1]}}),k:[{u2:95,f2:95,hd:60},{u2:-60,f2:-100,hd:0,t:14},{u2:-120,f2:-178,hd:-40,t:8,c:3}],
   tl:[[0,1,.3],[1,2,.2],[2,2,.1],[2,1,.2],[1,0,.2]],p:5});
def('wallslide','靠牆滑臂','背、後腦、手肘與手背貼牆，沿牆上滑到仍能貼牆的高度，再滑下。',
  {v:'front',b:FRONT,k:[{u1:180,f1:95,u2:0,f2:85},{u1:120,f1:100,u2:60,f2:80}]});
def('childside','嬰兒式側伸展','臀坐回腳跟、雙手向前走，再移向一側，感受側腰與背闊拉長。',
  {b:{an:['h',60,15],h1:-42,s1:180,h2:-42,s2:180,ft1:180,ft2:180,t:-4,hd:-30,c:4,ik:{w1:[124,1,1],w2:[124,1,1]}},
   k:[{},{t:-10,c:6}],tl:HOLD,p:5});
def('wgs','世界最強伸展','弓步，同側手撐地、手肘往足弓下沉，再轉胸讓手指向天花板。',
  {b:{an:['h',80,24],h1:-5,s1:-90,h2:-150,s2:-162,ft2:-110,t:22,ik:{w1:[106,0,1]}},
   k:[{u2:-85,f2:-95,hd:0},{u2:88,f2:88,hd:70,t:30}],p:5});
def('dogflow','下犬↔上犬流動','下犬推地把髖往後上；上犬胸口向前穿過雙手，肩膀遠離耳朵。',
  {b:{an:['a1',58,3],ik:{w1:[122,0,1],w2:[122,0,1]}},
   k:[{h1:-120,s1:-120,h2:-120,s2:-120,t:-38,hd:-60},{h1:-175,s1:-175,h2:-175,s2:-175,t:48,hd:70,ft1:185,ft2:185}],p:6});
def('twist','躺姿脊椎扭轉','仰躺、雙臂打開，雙膝一起倒向一側，肩膀盡量貼地；時間過半換邊。',
  {v:'top',b:{t:0,w:8,wh:5,hx:78,hy:62,u1:95,f1:95,u2:-95,f2:-95,hd:0,ftl:.6},
   k:[{h1:145,s1:210,h2:150,s2:212},{h1:215,s1:150,h2:210,s2:148}],
   tl:[[0,0,.35],[0,1,.15],[1,1,.35],[1,0,.15]],p:8});
def('hip9090','90/90 髖旋轉','坐姿，前後腿都約 90°，軀幹直立，雙膝同時抬起倒向另一側。',
  {v:'front',b:{t:90,w:8,wh:5,an:['h',100,6],u1:-120,f1:-100,u2:-60,f2:-80,ftl:.5},
   k:[{h1:180,s1:-90,r1:.25,q1:1,h2:190,q2:.4,s2:180,r2:1,ft1:-90,ft2:180},
      {h1:-10,q1:.4,s1:0,r1:1,h2:0,q2:1,s2:-90,r2:.25,ft1:0,ft2:-90}],
   tl:[[0,0,.2],[0,1,.3],[1,1,.2],[1,0,.3]],p:4});
def('deepsquat','深蹲蹲坐','腳跟踩地、膝蓋向外推，手肘撐開膝蓋，挺胸停住。',
  {b:{an:['a1',98,3.5],h1:12,s1:-112,h2:12,s2:-112,u1:-35,f1:65,u2:-35,f2:65},
   k:[{t:64,hd:80},{t:70,hd:85}],tl:HOLD,p:4});
def('pigeon','鴿式','前腿屈膝橫放、後腿向後伸直，髖擺正，慢慢向前折。',
  {b:{an:['h',95,10],h1:-20,q1:.6,s1:-90,r1:.25,h2:-176,s2:-178,ft2:180,u1:-85,f1:-80,u2:-85,f2:-80},
   k:[{t:82},{t:55,hd:40}],tl:HOLD,p:6});

/* ---- 十動作肌力 ---- */
const BRIDGE={t:0,an:['n',132,5],hd:180+0,u1:180,f1:180,u2:180,f2:180,ik:{a1:[64,3.5,-1],a2:[64,3.5,-1]},ft1:-10,ft2:-10};
def('bridge','臀橋','腳跟推地、夾臀把髖推高到肩—髖—膝一直線，不拱腰。',
  {b:BRIDGE,k:[{hd:0},{t:-30,hd:0}]});
def('sbridge','單腳臀橋','單腳踩地推髖，另一腿伸直與大腿同高，骨盆不歪斜；時間過半換腳。',
  {b:Object.assign({},BRIDGE,{ik:{a1:[64,3.5,-1]}}),k:[{hd:0,h2:170,s2:165},{t:-30,hd:0,h2:150,s2:150}]});
const PUSH_TOP={an:['a1',36,5],t:23,h1:-157,s1:-157,h2:-157,s2:-157,ik:{w1:[103,0,-1],w2:[103,0,-1]}};
def('pushup','伏地挺身','身體一直線，手肘約 45° 下放到胸口接近地面，再推到手臂打直。',
  {b:PUSH_TOP,k:[{},{t:6,h1:-174,s1:-174,h2:-174,s2:-174}]});
def('kneepush','跪姿伏地挺身','膝蓋著地，膝到頭一直線，手肘約 45° 下放再推起。',
  {b:{an:['k1',68,1],t:36,h1:-144,h2:-144,s1:150,s2:150,ft1:180,ft2:180,ik:{w1:[106,0,-1],w2:[106,0,-1]}},
   k:[{},{t:12,h1:-168,h2:-168,s1:170,s2:170}]});
def('hrp','HRP 手放開伏地挺身','胸口貼地、雙手離地向兩側伸開一下，再撐起到手臂打直；全程身體一直線。',
  {b:PUSH_TOP,k:[{},{t:3,h1:-177,s1:-177,h2:-177,s2:-177},
                 {t:3,h1:-177,s1:-177,h2:-177,s2:-177,ik:{w1:['s1',-6,6,-1],w2:['s2',-6,6,-1]},m1:.5,n1:.5,m2:.5,n2:.5}],
   tl:[[0,1,.35],[1,2,.12],[2,1,.12],[1,0,.35],[0,0,.06]]});
def('squat','深蹲','腳跟踩地，髖往後坐到大腿約平行，膝蓋順著腳尖方向，再站起。',
  {b:STAND,k:[{u1:-80,f1:-80,u2:-80,f2:-80},{t:58,h1:-8,s1:-112,h2:-8,s2:-112,u1:5,f1:5,u2:5,f2:5}]});
def('squatjump','深蹲跳','蹲下蓄力，全身伸展跳起，前腳掌輕落地回到蹲姿。',
  {b:STAND,k:[{t:58,h1:-8,s1:-112,h2:-8,s2:-112,u1:-150,f1:-150,u2:-150,f2:-150},
              {u1:80,f1:85,u2:80,f2:85},
              {an:['a1',100,20],ft1:-80,ft2:-80,u1:80,f1:85,u2:80,f2:85}],
   tl:[[0,1,.3],[1,2,.15],[2,1,.15],[1,0,.25],[0,0,.15]]});
def('calf','提踵','腳尖推地升到最高、停一下，再慢慢放下。',
  {b:STAND,k:[{},{an:['a1',100,12],ft1:-65,ft2:-65}]});
def('scalf','單腳提踵','單腳站、手扶牆保持平衡，腳跟升到最高再慢放；時間過半換腳。',
  {props:{wall:132},b:Object.assign({},STAND,{h2:-110,s2:-165,ik:{w1:[131,70,1]}}),k:[{},{an:['a1',100,10],ft1:-70}]});
def('plank','平板支撐','前臂撐地、手肘在肩下，夾臀收腹，頭到腳跟一直線；落地就停錶。',
  {b:{an:['e1',136,1.5],t:13,h1:-169,s1:-169,h2:-169,s2:-169,u1:-90,f1:0,u2:-90,f2:0,ft1:-95,ft2:-95},
   k:[{},{t:12}],tl:HOLD,p:4});

/* ---- 肩推鏈 ---- */
const PR=Object.assign({},PRONE_TOP);
def('yraise','俯臥 Y 舉','俯臥，拇指朝天把手臂舉離地成 Y 字，停一下慢放（俯視圖）。',
  {v:'top',b:PR,k:[{u1:22,f1:22,u2:-22,f2:-22,m1:.9,n1:.9,m2:.9,n2:.9},{u1:32,f1:32,u2:-32,f2:-32}]});
def('traise','俯臥 T 舉','俯臥，手臂向兩側打開成 T 字舉離地，夾肩胛（俯視圖）。',
  {v:'top',b:PR,k:[{u1:100,f1:100,u2:-100,f2:-100,m1:.9,n1:.9,m2:.9,n2:.9},{u1:90,f1:90,u2:-90,f2:-90}]});
def('wraise','俯臥 W 舉','俯臥，手肘彎曲往腰側收成 W 字，夾緊肩胛（俯視圖）。',
  {v:'top',b:PR,k:[{u1:115,f1:40,u2:-115,f2:-40},{u1:135,f1:60,u2:-135,f2:-60}]});
def('snowangel','反向雪天使','俯臥、手臂微離地，從大腿旁畫大弧到頭頂再回來（俯視圖）。',
  {v:'top',b:PR,k:[{u1:168,f1:172,u2:-168,f2:-172},{u1:28,f1:22,u2:-28,f2:-22}],p:4});
def('pike','派克伏地挺身','髖抬高成倒 V，頭往雙手前方的地面下放，再推回。',
  {b:{an:['a1',55,3.5],ik:{w1:[128,0,1],w2:[128,0,1]}},
   k:[{h1:-120,s1:-120,h2:-120,s2:-120,t:-35,hd:-60},{h1:-128,s1:-128,h2:-128,s2:-128,t:-52,hd:-70}]});
def('epike','腳抬高派克伏地挺身','腳放在沙發或椅上，髖在肩正上方，頭朝雙手前方下放再推起。',
  {props:{box:[26,0,30,34]},b:{an:['t1',50,34],ft1:-60,ft2:-60,ik:{w1:[112,0,1],w2:[112,0,1]}},
   k:[{h1:-150,s1:-150,h2:-150,s2:-150,t:-72,hd:-80},{h1:-160,s1:-160,h2:-160,s2:-160,t:-82,hd:-85}]});
const HAND={an:['n',112,33],t:-90,h1:88,s1:88,h2:88,s2:88,ft1:60,ft2:60,hd:-90,ik:{w1:[112,0,-1],w2:[112,0,-1]}};
def('hspu','靠牆倒立肩推','雙手推地、腳靠牆，頭往雙手之間下放到輕觸地，再推起。',
  {props:{wall:124},b:HAND,k:[{},{an:['n',112,15]}]});
def('hshold','靠牆倒立撐','雙手推地、肩膀頂向耳朵，身體收緊成一直線，腳輕靠牆。',
  {props:{wall:124},b:HAND,k:[{},{an:['n',112,32]}],tl:HOLD,p:4});
def('shouldertap','平板肩點','高平板、雙腳稍開，一手輕點對側肩膀，髖不左右晃。',
  {b:PUSH_TOP,k:[{},{ik:{w1:['n',-3,-2,-1]}}],tl:[[0,1,.3],[1,1,.15],[1,0,.3],[0,0,.25]]});
def('bearhold','熊爬定位','四足跪姿，膝蓋離地約一個拳頭，背保持平。',
  {b:{an:['t1',62,0],t:18,h1:-80,s1:-160,h2:-80,s2:-160,ft1:-60,ft2:-60,ik:{w1:[108,0,1],w2:[108,0,1]}},
   k:[{},{t:19}],tl:HOLD,p:3});
def('planche','假直立伏地挺身','伏地挺身姿勢，肩膀前傾超過手掌，手指朝外或朝後，再下放推起。',
  {b:Object.assign({},PUSH_TOP,{an:['a1',42,5],ik:{w1:[96,0,-1],w2:[96,0,-1]}}),k:[{},{t:6,h1:-174,s1:-174,h2:-174,s2:-174}]});
def('bandohp','彈力帶肩上推','雙腳踩住彈力帶，從肩上推到頭頂打直，核心收緊不後仰。',
  {props:{band:[['t1','w1']]},b:STAND,k:[{u1:-110,f1:85,u2:-110,f2:85},{u1:92,f1:90,u2:92,f2:90}]});
def('bandlat','彈力帶側平舉','踩住帶子，手肘微彎把手舉到肩高，停一下慢放。',
  {v:'front',props:{band:[['a1','w1'],['a2','w2']]},b:FRONT,k:[{},{u1:-185,f1:-188,u2:5,f2:8}]});
def('tricep','彈力帶三頭下壓','帶子固定在高處，上臂貼身不動，只用前臂下壓到打直。',
  {props:{band:[[[130,112],'w1']]},b:Object.assign({},STAND,{t:86,u1:-95,u2:-95}),k:[{f1:10,f2:10},{f1:-88,f2:-88}]});

/* ---- 下肢後鏈 ---- */
def('splitsquat','分腿蹲','前後腳站開，後膝垂直往地面下降，前膝對準腳尖，再推起。',
  {b:{t:88,u1:-110,f1:-60,u2:-110,f2:-60,ft2:-60,ik:{a1:[122,3.5,1],a2:[66,7,-1]}},
   k:[{an:['h',94,40]},{an:['h',92,22]}]});
def('bandrdl','彈力帶羅馬尼亞硬舉','踩住帶子，膝微彎、背打直，髖往後推到腿後拉緊，再站起。',
  {props:{band:[['t1','w1']]},b:STAND,k:[{},{t:18,h1:-78,s1:-96,h2:-78,s2:-96}]});
def('wallsit','靠牆深蹲靜態','背貼牆，大腿與地面平行、膝蓋約 90°，撐住。',
  {props:{wall:72},b:{an:['a1',98,3.5],h1:0,s1:-90,h2:0,s2:-90,u1:-60,f1:-10,u2:-60,f2:-10},k:[{t:90},{t:91}],tl:HOLD,p:4});
def('nordic','跪姿離心腿後彎舉','跪姿、腳踝固定，膝到頭一直線，約 5 秒慢慢前倒，用手接住再推回。',
  {props:{box:[36,0,12,8]},b:{an:['k1',70,1],s1:180,s2:180,ft1:180,ft2:180},
   k:[{t:90,h1:-90,h2:-90,u1:-80,f1:-80,u2:-80,f2:-80},{t:22,h1:-158,h2:-158,u1:-60,f1:-80,u2:-60,f2:-80}],
   tl:[[0,1,.72],[1,0,.23],[0,0,.05]]});
def('deadbug','死蟲式','仰躺、下背貼地，對側手腳慢慢伸遠再收回，左右輪替。',
  {b:{t:0,an:['h',82,5],hd:0,u1:90,f1:90,u2:90,f2:90,h1:90,s1:180,h2:90,s2:180,ft1:90,ft2:90},
   k:[{},{u1:170,f1:175,h2:178,s2:180,ft2:95},{u2:170,f2:175,h1:178,s1:180,ft1:95}],
   tl:[[0,1,.25],[1,0,.25],[0,2,.25],[2,0,.25]],p:6});

/* ---- 拉系列 ---- */
def('bandrow','彈力帶划船','坐姿、帶子繞腳底，把手肘往後拉、夾緊肩胛，再慢放。',
  {props:{band:[['t1','w1']]},b:{an:['h',60,8],t:88,h1:-4,s1:-4,h2:-4,s2:-4,ft1:80,ft2:80},
   k:[{u1:-12,f1:-12,u2:-12,f2:-12},{u1:-150,f1:-10,u2:-150,f2:-10}]});
def('bandpd','彈力帶直臂下拉','帶子固定在高處，手肘打直，從前上方下壓到大腿旁。',
  {props:{band:[[[150,108],'w1']]},b:Object.assign({},STAND,{t:80}),k:[{u1:40,f1:40,u2:40,f2:40},{u1:-85,f1:-85,u2:-85,f2:-85}]});
def('facepull','彈力帶面拉','帶子固定在頭高，拉向額頭、手肘高於手腕，外旋到底。',
  {props:{band:[[[156,82],'w1']]},b:STAND,k:[{u1:8,f1:8,u2:8,f2:8},{u1:178,f1:55,u2:178,f2:55}]});
def('pullapart','彈力帶開肩','手臂打直在肩高，把帶子往兩側拉開到胸前成 T 字。',
  {v:'front',props:{band:[['w1','w2']]},b:FRONT,
   k:[{u1:180,f1:180,u2:0,f2:0,m1:.3,n1:.3,m2:.3,n2:.3},{u1:180,f1:180,u2:0,f2:0}]});
def('extrot','彈力帶肩外旋','手肘貼身彎 90°，前臂向外轉開，上臂不離開身體。',
  {v:'front',props:{band:[['w1',[160,50]]]},b:FRONT,k:[{u1:-92,f1:0,n1:.25},{u1:-92,f1:180,n1:1}]});
def('curl','彈力帶二頭彎舉','踩住帶子，上臂貼身，只彎手肘把手捲到肩前，再慢放。',
  {props:{band:[['t1','w1']]},b:STAND,k:[{u1:-92,f1:-80,u2:-92,f2:-80},{u1:-92,f1:95,u2:-92,f2:95}]});
def('sideplank','側平板','手肘在肩下，髖抬起讓身體一直線，不下沉。',
  {v:'front',b:{an:['e1',128,1.5],t:13,u1:-90,f1:0,n1:.35,u2:95,f2:95,h1:-167,s1:-167,h2:-167,s2:-167,ft1:-120,ft2:-120},
   k:[{},{t:14}],tl:HOLD,p:4});
def('towelrow','毛巾划船（門把）','門確實關緊，毛巾繞門把、身體後傾打直，把胸口拉向門把。',
  {props:{wall:152,band:[['w1',[151,52]]]},b:{an:['a1',120,3.5],ik:{w1:[149,52,1],w2:[149,52,1]}},
   k:[{t:112,h1:-68,s1:-68,h2:-68,s2:-68},{t:100,h1:-80,s1:-80,h2:-80,s2:-80}]});
def('smrow','超人式划船','俯臥、胸口微離地，手臂從前伸拉回到肋骨旁、夾肩胛。',
  {b:{an:['h',78,4],t:12,h1:177,s1:177,h2:177,s2:177,ft1:180,ft2:180,hd:15},
   k:[{u1:15,f1:15,u2:15,f2:15},{u1:190,f1:0,u2:190,f2:0}]});
def('smhold','超人式停留','俯臥，手臂與腿同時離地，頸部保持中立，停住。',
  {b:{an:['h',78,4],t:14,h1:172,s1:172,h2:172,s2:172,ft1:175,ft2:175,u1:18,f1:18,u2:18,f2:18,hd:16},
   k:[{},{t:16,h1:170,s1:170,h2:170,s2:170}],tl:HOLD,p:4});
def('towelpd','毛巾直臂下拉','雙手拉緊毛巾高舉，雙手向外拉開，手肘往下帶到肩膀高度。',
  {v:'front',props:{band:[['w1','w2']]},b:FRONT,k:[{u1:112,f1:100,u2:68,f2:80},{u1:205,f1:95,u2:-25,f2:85}]});
def('revplank','反向平板','坐姿手在身後，推地把髖抬到肩到腳跟一直線。',
  {b:{an:['a1',140,3.5],t:157,hd:140,h1:-23,s1:-23,h2:-23,s2:-23,ft1:60,ft2:60,ik:{w1:[70,0,1],w2:[70,0,1]}},
   k:[{},{t:156}],tl:HOLD,p:4});

/* ---- 有氧 ---- */
def('burpee','波比跳','蹲下手撐地、跳成平板，跳回蹲姿，再向上跳起。',
  {b:{},k:[
    Object.assign({},STAND),
    {an:['a1',80,3.5],t:30,h1:20,s1:-120,h2:20,s2:-120,ik:{w1:[110,0,-1],w2:[110,0,-1]}},
    Object.assign({},PUSH_TOP,{an:['a1',46,5],ik:{w1:[113,0,-1],w2:[113,0,-1]}}),
    Object.assign({},STAND,{an:['a1',100,18],ft1:-80,ft2:-80,u1:85,f1:90,u2:85,f2:90})],
   tl:[[0,1,.2],[1,2,.15],[2,1,.15],[1,0,.15],[0,3,.12],[3,0,.13],[0,0,.1]],p:4});
def('jack','開合跳','雙手過頭同時雙腳跳開，再回到併腳。',
  {v:'front',b:FRONT,k:[{},{an:['a1',86,6],h1:-110,s1:-112,h2:-70,s2:-68,u1:-210,f1:-240,u2:30,f2:60}],p:1.2});

/* 課表步驟名稱 → 動作（順序重要：較具體的放前面） */
const MAP=[[/貓牛/,'catcow'],[/穿針/,'needle'],[/靠牆滑臂/,'wallslide'],[/嬰兒式/,'childside'],[/世界最強/,'wgs'],
  [/下犬|上犬/,'dogflow'],[/脊椎扭轉/,'twist'],[/90\/90/,'hip9090'],[/深蹲蹲坐/,'deepsquat'],[/鴿式/,'pigeon'],
  [/單腳臀橋|臀橋.*單腳/,'sbridge'],[/臀橋/,'bridge'],[/HRP/,'hrp'],[/假直立/,'planche'],[/腳抬高派克/,'epike'],
  [/派克/,'pike'],[/倒立肩推/,'hspu'],[/倒立撐/,'hshold'],[/伏地挺身.*跪姿/,'kneepush'],[/伏地挺身/,'pushup'],
  [/靠牆深蹲/,'wallsit'],[/深蹲跳/,'squatjump'],[/深蹲/,'squat'],[/單腳提踵|提踵.*單腳/,'scalf'],[/提踵/,'calf'],
  [/平板肩點/,'shouldertap'],[/側平板/,'sideplank'],[/反向平板/,'revplank'],[/平板/,'plank'],
  [/Y 舉/,'yraise'],[/T 舉/,'traise'],[/W 舉/,'wraise'],[/雪天使/,'snowangel'],[/肩上推/,'bandohp'],[/側平舉/,'bandlat'],
  [/三頭/,'tricep'],[/熊爬/,'bearhold'],[/分腿蹲/,'splitsquat'],[/羅馬尼亞硬舉/,'bandrdl'],[/腿後彎舉/,'nordic'],
  [/死蟲/,'deadbug'],[/毛巾划船/,'towelrow'],[/超人式划船/,'smrow'],[/超人式停留/,'smhold'],[/毛巾直臂下拉/,'towelpd'],
  [/彈力帶划船/,'bandrow'],[/直臂下拉/,'bandpd'],[/面拉/,'facepull'],[/開肩/,'pullapart'],[/肩外旋/,'extrot'],
  [/二頭/,'curl'],[/波比/,'burpee'],[/開合跳/,'jack']];
function keyFor(name){ if(!name)return null; for(const m of MAP)if(m[0].test(name))return m[1]; return null; }

/* 預處理 */
const BAKED={};
function baked(key){
  if(BAKED[key])return BAKED[key];
  const d=D[key]; if(!d)return null;
  const frames=d.k.map(k=>bake(d.b,k));
  const tl=d.tl||(frames.length===2?PING:frames.map((_,i)=>[i,(i+1)%frames.length,1]));
  const tot=tl.reduce((a,x)=>a+x[2],0);
  const B={d:d,frames:frames,tl:tl.map(x=>[x[0],x[1],x[2]/tot])};
  B.vb=fit(B);
  return BAKED[key]=B;
}
/* 依整段動作的外框自動縮放，讓趴、躺姿勢不會縮成一條線 */
function fit(B){
  let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;
  const see=p=>{x0=Math.min(x0,p[0]);x1=Math.max(x1,p[0]);y0=Math.min(y0,p[1]);y1=Math.max(y1,p[1]);};
  for(let i=0;i<32;i++){const P=poseAt(B,i/32),J=solveFK(P,[P.hx,P.hy]);
    for(const k in J)see(J[k]); see([J.hd[0],J.hd[1]+L.HR]); see([J.hd[0]-L.HR,J.hd[1]]); see([J.hd[0]+L.HR,J.hd[1]]);}
  const pr=B.d.props||{};
  if(pr.box){see([pr.box[0],0]);see([pr.box[0]+pr.box[2],pr.box[1]+pr.box[3]]);}
  if(pr.wall!=null)see([pr.wall,0]);
  (pr.band||[]).forEach(b=>b.forEach(e=>{if(typeof e!=='string')see(e);}));
  const top=B.d.v==='top';
  if(!top)y0=Math.min(y0,0);
  const pad=10;
  let w=Math.max(x1-x0+2*pad,(y1-y0+2*pad)*VW/VH,96), h=w*VH/VW;
  const cx=(x0+x1)/2;
  const bottom=top?GY-((y0+y1)/2-h/2):GY+6;   /* 有地面時地面固定在下緣附近 */
  return [cx-w/2,bottom-h,w,h];
}
function poseAt(B,phase){
  let x=((phase%1)+1)%1;
  for(const seg of B.tl){
    if(x<=seg[2]||seg===B.tl[B.tl.length-1]){
      const f=seg[2]?Math.min(1,x/seg[2]):1;
      return lerpPose(B.frames[seg[0]],B.frames[seg[1]],ease(f));
    }
    x-=seg[2];
  }
}
function jointsAt(key,phase){const B=baked(key);if(!B)return null;const P=poseAt(B,phase);return solveFK(P,[P.hx,P.hy]);}

/* ================= SVG 繪製 ================= */
const NS='http://www.w3.org/2000/svg';
const sx=p=>p[0].toFixed(1), sy=p=>(GY-p[1]).toFixed(1);
const pt=p=>sx(p)+','+sy(p);
function el(tag,attrs,parent){const e=document.createElementNS(NS,tag);for(const k in attrs)e.setAttribute(k,attrs[k]);if(parent)parent.appendChild(e);return e;}
function build(svg,d,vb){
  svg.setAttribute('viewBox',vb.map(v=>v.toFixed(1)).join(' '));
  svg.innerHTML='';
  const g={};
  if(d.v!=='top')el('line',{x1:-300,y1:GY+.8,x2:500,y2:GY+.8,class:'dm-ground'},svg);
  const P=d.props||{};
  if(P.wall!=null)el('line',{x1:P.wall,y1:GY,x2:P.wall,y2:-200,class:'dm-prop'},svg);
  if(P.box)el('rect',{x:P.box[0],y:GY-P.box[1]-P.box[3],width:P.box[2],height:P.box[3],rx:2,class:'dm-prop'},svg);
  g.bands=(P.band||[]).map(()=>el('line',{class:'dm-band'},svg));
  const far=el('g',{class:'dm-fig',opacity:d.v==='side'?.42:.9},svg);
  g.a2=el('polyline',{},far);g.l2=el('polyline',{},far);
  const near=el('g',{class:'dm-fig'},svg);
  g.l1=el('polyline',{},near);g.torso=el('path',{},near);g.head=el('circle',{r:L.HR,class:'dm-head'},near);
  g.a1=el('polyline',{},near);
  return g;
}
function draw(g,d,J,P){
  g.a1.setAttribute('points',[J.s1,J.e1,J.w1].map(pt).join(' '));
  g.a2.setAttribute('points',[J.s2,J.e2,J.w2].map(pt).join(' '));
  g.l1.setAttribute('points',[J.p1,J.k1,J.a1,J.t1].map(pt).join(' '));
  g.l2.setAttribute('points',[J.p2,J.k2,J.a2,J.t2].map(pt).join(' '));
  const mid=[(J.h[0]+J.n[0])/2,(J.h[1]+J.n[1])/2],cc=add(mid,dir(P.t+90,P.c*2));
  g.torso.setAttribute('d','M'+pt(J.h)+' Q'+pt(cc)+' '+pt(J.n));
  g.head.setAttribute('cx',sx(J.hd));g.head.setAttribute('cy',sy(J.hd));
  (d.props.band||[]).forEach((b,i)=>{
    const p=b.map(e=>typeof e==='string'?J[e]:e);
    g.bands[i].setAttribute('x1',sx(p[0]));g.bands[i].setAttribute('y1',sy(p[0]));
    g.bands[i].setAttribute('x2',sx(p[1]));g.bands[i].setAttribute('y2',sy(p[1]));
  });
}
/* 單一 rAF 迴圈驅動所有可見的示範 */
const live=new Set();let raf=0;
function loop(now){
  raf=0;
  for(const c of live){
    if(!c.paused)c.phase+=(now-(c.last||now))/1000/c.period;
    c.last=now;
    const P=poseAt(c.B,c.phase);
    draw(c.g,c.B.d,solveFK(P,[P.hx,P.hy]),P);
  }
  if(live.size)raf=requestAnimationFrame(loop);
}
/* mount(svg, key, {period}) → 控制器；key 無對應時回傳 null */
function mount(svg,key,opt){
  const B=baked(key); if(!B||!svg)return null;
  const c={B:B,g:build(svg,B.d,B.vb),phase:0,period:(opt&&opt.period)||B.d.p||3,paused:false,last:0};
  const P=poseAt(B,0);draw(c.g,B.d,solveFK(P,[P.hx,P.hy]),P);
  c.setPaused=v=>{c.paused=!!v;};
  c.stop=()=>{live.delete(c);};
  live.add(c); if(!raf&&typeof requestAnimationFrame!=='undefined')raf=requestAnimationFrame(loop);
  return c;
}
function info(key){const d=D[key];return d?{key:key,name:d.name,cue:d.cue,view:d.v}:null;}
function still(svg,key,phase){const B=baked(key);if(!B)return;const g=build(svg,B.d,B.vb);const P=poseAt(B,phase);draw(g,B.d,solveFK(P,[P.hx,P.hy]),P);}
root.DT_DEMOS={keyFor:keyFor,mount:mount,still:still,info:info,keys:()=>Object.keys(D),jointsAt:jointsAt,defaultPeriod:k=>D[k]&&(D[k].p||3)};
})(typeof window!=='undefined'?window:globalThis);
