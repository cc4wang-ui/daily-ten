/* Daily Ten — state store（M1 介面契約）
   Orchestrator 種子：以下為 v2 行為，自 index.html 原樣搬出。擁有者：data-guardian（升級為 v3，API 不變）。
   對外 API（ui-engineer 依賴，名稱與回傳形狀不可改）：
     STORAGE_KEY        localStorage key（不變：'daily-ten-state'）
     loadState()        → Promise<{status:'fresh'|'ok'|'migrated'|'repaired'|'recovered', error:null|{code,message,backupKey}}>
     getState()         → 目前的 state 物件。每次用到都重新呼叫，不要快取參照（匯入會換成新物件）
     setState(next)     → 換掉記憶體中的 state
     saveState()        → Promise<boolean>：寫入 window.storage（若有）與 localStorage
     migrateState(raw)  → 遷移後的 state，失敗回 null（不丟例外） */
export const STORAGE_KEY = 'daily-ten-state';
const PR_KEYS = ['hrp', 'plank', 'run2mi', 'pushup', 'pike', 'sideplank'];
const BODY_KEYS = ['weight', 'waist', 'arm', 'shoulder', 'thigh', 'rhr', 'sleep'];
const DEFAULT_STATE = {version:2,level:2,xp:0,
  streak:{current:0,best:0,lastDate:null},
  sessions:[],
  prs:{hrp:[],plank:[],run2mi:[],pushup:[],pike:[],sideplank:[]},
  body:{weight:[],waist:[],arm:[],shoulder:[],thigh:[],rhr:[],sleep:[]},
  profile:{heightCm:null,age:null},
  settings:{voice:true,beep:true,band:true}};
let state = null;
/* v1 → v2：補上 body / profile 與新增的 PR 桶，舊資料完整保留 */
function migrate(s){
  if(!s||typeof s!=='object')return null;
  s.version=s.version||1;
  s.prs=s.prs||{}; PR_KEYS.forEach(k=>{ if(!Array.isArray(s.prs[k]))s.prs[k]=[]; });
  s.body=s.body||{}; BODY_KEYS.forEach(k=>{ if(!Array.isArray(s.body[k]))s.body[k]=[]; });
  s.profile=s.profile||{}; if(!('heightCm' in s.profile))s.profile.heightCm=null;
  if(!('age' in s.profile))s.profile.age=null;
  s.settings=s.settings||{voice:true,beep:true};
  if(!('band' in s.settings))s.settings.band=true;
  s.version=2;
  return s;
}
export function migrateState(raw){ try{ return migrate(raw); }catch(e){ return null; } }
export async function loadState(){
  try{ if(window.storage){ const r=await window.storage.get(STORAGE_KEY); if(r&&r.value){state=migrate(JSON.parse(r.value));if(state)return {status:'ok',error:null};} } }catch(e){}
  try{ const s=localStorage.getItem(STORAGE_KEY); if(s){state=migrate(JSON.parse(s));if(state)return {status:'ok',error:null};} }catch(e){}
  state=JSON.parse(JSON.stringify(DEFAULT_STATE));
  return {status:'fresh',error:null};
}
export function getState(){ return state; }
export function setState(next){ state=next; }
export async function saveState(){
  const s=JSON.stringify(state);
  let ok=false;
  try{ if(window.storage){ await window.storage.set(STORAGE_KEY,s); ok=true; } }catch(e){}
  try{ localStorage.setItem(STORAGE_KEY,s); ok=true; }catch(e){}
  if(!ok) console.error('儲存失敗：資料僅存在記憶體中');
  return ok;
}
