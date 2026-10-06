/* D24 搬家卡：舊網址（GitHub Pages）提示改用新網址。
   全 App 只有這裡寫新網址；CI 的 check-repo 只允許 NEW_APP_URL 出現在這個檔案（使用者點了才導覽，不是網路請求）。
   D27（Cross 2026-10-06 放棄備份）：拿掉搬家卡的「下載備份」與新網址的「從舊網址搬資料」匯入卡；設定的資料備份卡照舊。 */
import { $ } from './dom.js';

export const NEW_APP_URL = 'https://daily-ten-app.vercel.app/';
export const LEGACY_HOSTS = ['cc4wang-ui.github.io'];

/* 畫面是 index.html 的 #mv-legacy（預設 hidden）。renderHome() 每次都呼叫 renderMoveCard() 重新判斷：
   - 舊網址（hostname 在 LEGACY_HOSTS）：搬家卡，不能關閉，其他功能照常。
     ① 打開新網址（新分頁）　② 加入主畫面、以後從新圖示打開、刪除舊圖示的說明。
   - 其他網址（新網址、localhost、127.0.0.1、Vercel 預覽網址…）：維持 hidden。
   不新增 localStorage key、不讀也不改 state。 */

const NEW_HOST = hostOf(NEW_APP_URL);

function hostOf(url) {
  try { return new URL(url).hostname; } catch (e) { return ''; }
}
function currentHost() {
  try { return location.hostname; } catch (e) { return ''; }
}

/* ---------- renderHome() 每次呼叫 ---------- */
export function renderMoveCard() {
  const card = $('mv-legacy');
  if (!card) return;
  try {
    const legacy = LEGACY_HOSTS.includes(currentHost());
    if (legacy) {
      $('mv-open').href = NEW_APP_URL;
      $('mv-open-host').textContent = NEW_HOST;
    }
    card.hidden = !legacy;
  } catch (e) {
    /* 搬家卡不是必要功能：出錯就不顯示，HOME 其他部分照常 */
    card.hidden = true;
    console.warn('搬家卡顯示失敗', e);
  }
}
