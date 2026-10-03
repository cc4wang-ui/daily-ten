/* D24 搬家引導：舊網址（GitHub Pages）提示搬家；新網址第一次開啟時引導匯入備份。
   全 App 只有這裡寫新網址；CI 的 check-repo 只允許 NEW_APP_URL 出現在這個檔案（使用者點了才導覽，不是網路請求）。 */
export const NEW_APP_URL = 'https://daily-ten.vercel.app/';
export const LEGACY_HOSTS = ['cc4wang-ui.github.io'];

export function renderMoveCard() {}
