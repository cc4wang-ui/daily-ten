/* Daily Ten — 訓練紀錄、連續天數、Boss 輪替、升級條件。M1 自 index.html 原樣搬出。
   B1：「今天」一律是遊戲日（G 規則 1：04:00 前算前一天；js/ui/game.js 的 todayKey，遊戲層未就緒時退回日曆日）。
   加一輪記成當天的一般 type＋plus:true（不用 type 'plus'：舊版 XP 表沒有 'plus'，legacy xp 會變 NaN）。 */
import { getState, saveState } from '../state/store.js';
import { dateOffset, isoWeek } from './dates.js';
import { XP } from './content.js';
import { todayKey, keyToDate } from './game.js';
import { canonicalMovement } from '../game/training-progression.js';

/* ================= SESSION / STREAK LOGIC ================= */
export function sessionOn(date){return getState().sessions.find(x=>x.date===date);}
export async function recordSetFeedback({ id, name, target, actual, effort, pain, form, resistance }){
  if(typeof id!=='string'||!id||id.length>60||typeof name!=='string'||!name||!Number.isInteger(target)||target<1||target>999
    ||!Number.isInteger(actual)||actual<0||actual>999
    ||!['easy','okay','hard'].includes(effort)||typeof pain!=='boolean'||typeof form!=='boolean')return {ok:false,saved:false};
  const band=canonicalMovement(name)?.startsWith('彈力帶')===true;
  if(band&&resistance!==undefined&&typeof resistance!=='string')return {ok:false,saved:false};
  const label=band&&typeof resistance==='string'?resistance.trim():'';
  if([...label].length>40)return {ok:false,saved:false};
  const game=getState().game;
  if(!Array.isArray(game.trainingFeedback))game.trainingFeedback=[];
  const entry={id,date:todayKey(),name,target,actual,effort,pain,form};
  if(label)entry.resistance=label;
  const existing=game.trainingFeedback.findIndex(f=>f&&f.id===id);
  if(existing>=0)game.trainingFeedback[existing]=entry;
  else game.trainingFeedback.push(entry);
  if(game.trainingFeedback.length>2000)game.trainingFeedback.splice(0,game.trainingFeedback.length-2000);
  return {ok:true,saved:await saveState()};
}
export function recordSession(type,opts){
  const t=todayKey(),plus=!!(opts&&opts.plus);
  if(!sessionOn(t)){
    const rec={date:t,type:type,xp:XP[type]};
    if(plus)rec.plus=true;
    getState().sessions.push(rec);
    getState().xp+=XP[type];
    const last=getState().streak.lastDate;
    if(last===dateOffset(t,-1)) getState().streak.current+=1;
    else if(last!==t) getState().streak.current=1;
    getState().streak.lastDate=t;
    if(getState().streak.current>getState().streak.best)getState().streak.best=getState().streak.current;
  } else { // 同日第二次（例如保底後補完整版）：升級 type、補 XP 差額
    const s=sessionOn(t);
    if(XP[type]>s.xp){getState().xp+=XP[type]-s.xp;s.xp=XP[type];s.type=type;}
    if(plus)s.plus=true; // 同一天主課表之後再加一輪：當天升級為加一輪
  }
  saveState();
}
/* Boss rotation: ISO week % 3 → 0 HRP / 1 Plank / 2 Run */
export function bossItem(){return ['hrp','plank','run2mi'][isoWeek(keyToDate(todayKey()))%3];}
/* 只計有完成紀錄、主動回報且動作穩定的工作組。徒手上背控制沒有足夠阻力，不算負重拉力。 */
export const STRENGTH_GROUPS=['push','pull','squat','hip'];
export function movementGroup(name){
  if(typeof name!=='string'||!/第\s*\d+\s*組/.test(name))return null;
  if(/^(?:伏地挺身|派克伏地挺身|彈力帶肩上推)/.test(name))return 'push';
  if(/^彈力帶划船/.test(name))return 'pull';
  if(/^分腿蹲/.test(name))return 'squat';
  if(/^(?:臀橋|彈力帶羅馬尼亞硬舉)/.test(name))return 'hip';
  return null;
}
export function weeklyStrengthEvidence(state=getState(),asOf=todayKey()){
  const from=dateOffset(asOf,-6),sessions=new Set((state.sessions||[])
    .filter(s=>s&&s.date>=from&&s.date<=asOf&&['full','cycle'].includes(s.type)).map(s=>s.date));
  const byGroup=Object.fromEntries(STRENGTH_GROUPS.map(group=>[group,new Map()]));
  for(const f of state.game?.trainingFeedback||[]){
    const group=movementGroup(f?.name);
    if(!group||!sessions.has(f.date)||typeof f.id!=='string'||!f.id
      ||f.pain!==false||f.form!==true||f.effort==='hard'
      ||!Number.isInteger(f.target)||!Number.isInteger(f.actual)||f.actual<f.target)continue;
    if(!byGroup[group].has(f.date))byGroup[group].set(f.date,new Set());
    byGroup[group].get(f.date).add(f.id);
  }
  return Object.fromEntries(STRENGTH_GROUPS.map(group=>{
    const dates=[...byGroup[group]].filter(([,ids])=>ids.size>=2);
    return [group,{days:dates.length,sets:dates.reduce((n,[,ids])=>n+ids.size,0)}];
  }));
}
/* Level-up: recent sessions, PR and repeated verified work for every primary strength group. */
const LV_TARGET={2:{hrp:8,plank:60,run2mi:1500},3:{hrp:12,plank:90,run2mi:1320},4:{hrp:15,plank:150,run2mi:1197}};
export function levelUpEligible(){
  if(getState().level>=5)return false;
  const t=todayKey();
  const recent=dateOffset(t,-6);
  const feedback=getState().game?.trainingFeedback;
  if(Array.isArray(feedback)&&feedback.some(f=>f&&f.date>=recent&&f.date<=t
    &&(f.pain===true||f.form===false||f.actual<f.target||f.effort==='hard')))return false;
  for(let i=0;i<7;i++){ if(!sessionOn(dateOffset(t,-i)))return false; }
  const volume=weeklyStrengthEvidence(getState(),t);
  if(STRENGTH_GROUPS.some(group=>volume[group].days<2))return false;
  const tg=LV_TARGET[getState().level]; if(!tg)return false;
  const cut=dateOffset(t,-21);
  const hit=(arr,key,pass)=>arr.some(p=>p.date>=cut&&pass(p));
  return hit(getState().prs.hrp,'hrp',p=>p.reps>=tg.hrp)
      || hit(getState().prs.plank,'plank',p=>p.sec>=tg.plank)
      || hit(getState().prs.run2mi,'run',p=>p.sec<=tg.run2mi);
}
