/* Daily Ten — 設定（今日右上齒輪）：語音／提示音／彈力帶開關、就寢／起床時間、資料備份（下載、匯出、匯入）。
   B1：動作庫、一週節奏、彈力帶說明搬到訓練分頁（trainhub.js）；匯入走 backup.js 的「驗證 → 差異預覽 → 二次確認」。
   就寢／起床時間寫既有的 settings.bedtime／settings.wakeTime（'HH:MM'，schema 的 TIME_RE），早安打卡預填就寢時間。 */
import { getState, saveState } from '../state/store.js';
import { TIME_RE } from '../state/schema.js';
import { $ } from './dom.js';
import { hasBand } from './program.js';
import { renderHome } from './home.js';
import { renderStats } from './stats.js';
import { wireBackupCard } from './backup.js';
import { ensurePhaseStarted } from './game.js';

const DEFAULT_TIME = { bedtime: '23:00', wakeTime: '07:00' };
const timeOf = (key) => {
  const v = getState().settings[key];
  return typeof v === 'string' && TIME_RE.test(v) ? v : DEFAULT_TIME[key];
};
const minOf = (key, fallback) => {
  const v = getState().settings[key];
  return Number.isInteger(v) && v >= 0 ? v : fallback;
};

function renderSleepNote() {
  $('cfg-sleep-note').textContent = `就寢 ${timeOf('bedtime')}、起床 ${timeOf('wakeTime')}，前後 ${minOf('windowMin', 30)} 分鐘內算在時段內；`
    + `睡前 ${minOf('phoneDownMin', 30)} 分鐘放下手機（提示，不計分）。早安打卡會預填這個就寢時間。建議就寢＝起床前 8 小時。`
    + '睡眠建議是一般性參考，不是醫療建議。';
}

/* 時間欄位：改完（change）才存；空白或格式不對一律不寫入，欄位改回上一個有效值（離開欄位時再檢查一次） */
function wireTime(id, key) {
  const input = $(id);
  if (document.activeElement !== input) input.value = timeOf(key);
  const revert = () => {
    input.value = timeOf(key);
    $('cfg-sleep-msg').textContent = '時間格式不對，沒有變更。';
  };
  input.onblur = () => { if (!TIME_RE.test(input.value)) revert(); };
  input.onchange = () => {
    const v = input.value;
    if (!TIME_RE.test(v)) { revert(); return; }
    if (v === getState().settings[key]) return;
    getState().settings[key] = v;
    saveState();
    $('cfg-sleep-msg').textContent = '已儲存。';
    renderSleepNote();
    renderHome();
  };
}

export function renderSetup(){
  $('cfg-voice').checked=getState().settings.voice;
  $('cfg-beep').checked=getState().settings.beep;
  $('cfg-band').checked=hasBand();
  $('cfg-voice').onchange=e=>{getState().settings.voice=e.target.checked;saveState();};
  $('cfg-beep').onchange=e=>{getState().settings.beep=e.target.checked;saveState();};
  /* 器材變了，課表內容與時間都要跟著重算（今日與訓練分頁） */
  $('cfg-band').onchange=e=>{getState().settings.band=e.target.checked;saveState();renderSetup();renderHome();};
  wireTime('cfg-bedtime','bedtime');
  wireTime('cfg-waketime','wakeTime');
  $('cfg-sleep-msg').textContent='';
  renderSleepNote();
  $('exp-btn').onclick=()=>{$('exp-area').value=JSON.stringify(getState());$('io-msg').textContent='已匯出 — 全選複製保存。';};
  /* 下載備份、選檔／貼上匯入（驗證 → 差異預覽 → 二次確認）；匯入成功後補階段起點（舊備份沒有 phase.startedAt），
     再重繪今日（含訓練分頁）、統計、設定 */
  wireBackupCard(()=>{ensurePhaseStarted(new Date());renderHome();renderStats();renderSetup();});
}
