/* Daily Ten — 訓練中保持螢幕常亮（Wake Lock，失敗靜默）。M1 自 index.html 原樣搬出。 */
/* ================= WAKE LOCK ================= */
let wakeLock=null;
export async function lockScreen(){ try{ if('wakeLock' in navigator){wakeLock=await navigator.wakeLock.request('screen');} }catch(e){} }
export function unlockScreen(){ try{ if(wakeLock){wakeLock.release();wakeLock=null;} }catch(e){} }
