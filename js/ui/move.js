/* D24 搬家引導：舊網址（GitHub Pages）提示搬家；新網址第一次開啟時引導匯入備份。
   全 App 只有這裡寫新網址；CI 的 check-repo 只允許 NEW_APP_URL 出現在這個檔案（使用者點了才導覽，不是網路請求）。 */
import { getState } from '../state/store.js';
import { $ } from './dom.js';
import { runBackup, renderBackupReminder, renderBackupStatus } from './backup.js';

export const NEW_APP_URL = 'https://daily-ten.vercel.app/';
export const LEGACY_HOSTS = ['cc4wang-ui.github.io'];

/* 畫面是 index.html 的 #mv-legacy、#mv-import（預設 hidden）。renderHome() 每次都呼叫 renderMoveCard() 重新判斷：
   - 舊網址（hostname 在 LEGACY_HOSTS）：搬家卡，不能關閉，其他功能照常。
     ① 下載備份（同 HOME 提醒卡，走 runBackup）：成功顯示檔名、取消不顯示、失敗顯示訊息　② 打開新網址（新分頁）　③ 加入主畫面與匯入的說明。
     這裡沒有任何紀錄時（hasNoRecords，例如用 Safari 打開、紀錄其實在主畫面的舊圖示裡）多一行提醒，避免下載到空的備份。
   - 新網址（hostname = NEW_APP_URL 的 hostname）且 isFreshState：「從舊網址搬資料」卡。
     「選擇備份檔」在同一個點擊手勢內切到 SETUP、捲到資料備份卡、打開既有的 #imp-file，之後是既有的驗證 → 差異預覽 → 兩次確認。
     匯入成功（備份檔一定有 meta.lastBackupAt）或有第一筆訓練後，資料不再是全新的，卡片自然消失。
   - 其他網址（localhost、127.0.0.1、Vercel 預覽網址…）：兩張卡都維持 hidden，畫面與先前完全相同。
   不新增 localStorage key、不改 state 結構；判斷只讀 getState()。 */

const NEW_HOST = hostOf(NEW_APP_URL);
let savedFile = null; // 這次開 App 在搬家卡下載成功的檔名（只在記憶體；切分頁回來仍顯示）

function hostOf(url) {
  try { return new URL(url).hostname; } catch (e) { return ''; }
}
function currentHost() {
  try { return location.hostname; } catch (e) { return ''; }
}

/* ---------- 全新的資料 ----------
   依 js/state/schema.js 的欄位：
   hasNoRecords(state)：下面全部成立——
     sessions（訓練紀錄）沒有任何一筆；xp 與 game.xp 的 move／sleep／explore／total 都是 0；
     streak 的 current、best 都是 0；prs 六項、body 七項都沒有紀錄；habits 底下的打卡紀錄（sleep.log、explore.log）都是空的。
   isFreshState(state)：hasNoRecords，而且 meta.lastBackupAt 為空（null、空字串或沒有）。
   等級、設定、身分宣言、階段、預設探索項目（DJ）不算紀錄：全新安裝就有。不是物件（讀不懂）→ 兩者都回 false，不顯示提示。 */
const hasItems = (a) => Array.isArray(a) && a.length > 0;
const anyList = (o) => !!o && typeof o === 'object' && Object.values(o).some(hasItems);
const positive = (n) => typeof n === 'number' && n > 0;
const objOf = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

export function hasNoRecords(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return false;
  if (hasItems(state.sessions) || anyList(state.prs) || anyList(state.body)) return false;
  if (positive(state.xp)) return false;
  const streak = objOf(state.streak);
  if (positive(streak.current) || positive(streak.best)) return false;
  const gameXp = objOf(objOf(state.game).xp);
  if (Object.values(gameXp).some(positive)) return false;
  return !Object.values(objOf(state.habits)).some((h) => hasItems(objOf(h).log));
}

export function isFreshState(state) {
  return hasNoRecords(state) && !objOf(state.meta).lastBackupAt;
}

/* iPhone 主畫面開的（navigator.standalone）或已安裝的 PWA（display-mode: standalone） */
function isStandalone() {
  try {
    if (navigator.standalone === true) return true;
    return typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches;
  } catch (e) { return false; }
}

/* ---------- 舊網址：搬家卡 ---------- */
function showBackupResult(text, kind) {
  const msg = $('mv-backup-msg');
  msg.textContent = text;
  msg.className = kind ? `small mv-msg mv-${kind}` : 'small mv-msg';
}
function showSaved() {
  if (savedFile) showBackupResult(`已存好：${savedFile}`, 'ok');
  else showBackupResult('', '');
}

function renderLegacy() {
  $('mv-legacy-empty').hidden = !hasNoRecords(getState());
  const open = $('mv-open');
  open.href = NEW_APP_URL;
  $('mv-open-host').textContent = NEW_HOST;
  showSaved();
  const btn = $('mv-backup');
  btn.onclick = async () => {
    const r = await runBackup(btn);
    if (r.ok) {
      savedFile = r.filename;
      showSaved();
      renderBackupReminder(); // 剛備份過：HOME 的 7 天提醒卡跟著收起
      renderBackupStatus(); // SETUP 的「上次備份」同步
    } else if (r.reason === 'cancelled') {
      showSaved(); // 取消不顯示訊息（之前存好的檔名照常顯示）
    } else {
      showBackupResult(r.message, 'err');
    }
  };
}

/* ---------- 新網址：從舊網址搬資料 ---------- */
/* 資料備份卡的頂端對齊 SETUP 標題的位置：安全區（#app 的 padding-top）＋畫面上方留白（.screen 的 padding-top）。直接跳過去，不捲動動畫 */
function scrollToBackupCard() {
  const btn = $('bk-download');
  const card = btn && btn.closest('.card');
  if (!card) return;
  const padTop = (id) => parseFloat(getComputedStyle($(id)).paddingTop) || 0;
  const y = card.getBoundingClientRect().top + window.scrollY - padTop('app') - padTop('s-setup');
  window.scrollTo(0, Math.max(0, y));
}

/* 全部同步完成、不能有 await：iOS 只在使用者手勢的同一個流程裡允許程式打開檔案選擇。
   切分頁用分頁列的 SETUP 按鈕（與使用者自己點相同：重畫 SETUP、收起舊的匯入預覽、接上 #imp-file 的處理）。 */
function chooseBackupFile() {
  const tab = document.querySelector('#tabs button[data-s="s-setup"]');
  if (tab) tab.click();
  const setup = $('s-setup');
  if (!setup || !setup.classList.contains('active')) return; // 沒切過去（例如訓練中）就不打開
  scrollToBackupCard();
  $('imp-file').click();
}

function renderImport() {
  $('mv-import-hint').hidden = isStandalone();
  $('mv-import-btn').onclick = chooseBackupFile;
}

/* ---------- renderHome() 每次呼叫 ---------- */
export function renderMoveCard() {
  const legacyCard = $('mv-legacy');
  const importCard = $('mv-import');
  if (!legacyCard || !importCard) return;
  try {
    const host = currentHost();
    const legacy = LEGACY_HOSTS.includes(host);
    const fresh = !legacy && !!NEW_HOST && host === NEW_HOST && isFreshState(getState());
    if (legacy) renderLegacy();
    if (fresh) renderImport();
    legacyCard.hidden = !legacy;
    importCard.hidden = !fresh;
  } catch (e) {
    /* 搬家引導不是必要功能：出錯就兩張都不顯示，HOME 其他部分照常 */
    legacyCard.hidden = true;
    importCard.hidden = true;
    console.warn('搬家引導顯示失敗', e);
  }
}
