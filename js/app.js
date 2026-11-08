/* Daily Ten — 入口（redo-v1）：載入 state → 建 state.v4 → 讀規則檔 → 接線 → 首次 render → 註冊 Service Worker。
   開機流程包在 try/catch：任何檔案載入失敗落到 showFatal()，不白屏，原始資料可下載。
   D23 自動更新：SW 通知 → 回 ACK → 閒置（沒有訓練／伸展／面板／慶祝／復原 toast／輸入中）才重新載入；回到前景與恢復連線時檢查新版。 */

/* ===== 啟動失敗保護：純 DOM，不依賴其他 module ===== */
const RAW_KEY = 'daily-ten-state';
function rawFallback() {
  try {
    const raw = localStorage.getItem(RAW_KEY);
    if (raw === null) return { ok: false, message: '找不到原始資料' };
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    const filename = `daily-ten-raw-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.txt`;
    const url = URL.createObjectURL(new Blob([raw], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a'); a.href = url; a.download = filename; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return { ok: true, filename };
  } catch (e) { return { ok: false, message: '原始資料下載失敗，請再試一次' }; }
}
function showFatal(err) {
  try { console.error('Daily Ten 啟動失敗', err); } catch (e) { /* */ }
  try {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === 's-home'));
    ['session', 'guide', 'sheet', 'cele', 'rest'].forEach((id) => { const el = document.getElementById(id); if (el) el.hidden = true; });
    if (document.getElementById('boot-error')) return;
    const card = document.createElement('div');
    card.id = 'boot-error'; card.className = 'banner danger'; card.setAttribute('role', 'alert');
    const msg = document.createElement('div'); msg.textContent = 'App 啟動時發生問題。資料仍在這台裝置上，請先下載保存。';
    const btn = document.createElement('button'); btn.id = 'boot-error-download'; btn.className = 'btn btn-sm'; btn.textContent = '下載原始資料';
    const note = document.createElement('div'); note.className = 'small';
    btn.onclick = async () => { let r; try { const m = await import('./state/backup.js'); r = m.downloadRawBackup(RAW_KEY); } catch (e) { r = rawFallback(); } note.textContent = r.ok ? `已下載 ${r.filename}` : r.message; };
    card.append(msg, btn, note);
    const host = document.getElementById('s-home') || document.body;
    host.insertBefore(card, host.firstChild);
  } catch (e) { /* 靜態 markup 仍可見 */ }
}

/* ===== 自動更新（D23） ===== */
const UPDATED_KEY = 'daily-ten-updated-to';
const IDLE_POLL_MS = 2000, UPDATE_CHECK_MS = 60000;
let busyNow = () => false;
let pendingVersion = null, idleTimer = null, lastUpdateCheck = null;
const NON_TEXT_INPUT = /^(checkbox|radio|file|hidden|button|submit|reset|image|range|color)$/i;
const isTextField = (el) => !!el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !NON_TEXT_INPUT.test(el.type)));
function typing() {
  const a = document.activeElement;
  if (isTextField(a) && a.getClientRects().length > 0) return true;
  const scr = document.querySelector('.screen.active');
  if (!scr) return false;
  for (const el of scr.querySelectorAll('input,textarea')) {
    if (!isTextField(el) || el.getClientRects().length === 0) continue;
    if (el.value.trim() !== '' && el.id === 'exp-area') return true;
    if (el.validity && el.validity.badInput) return true;
  }
  return false;
}
const shown = (id) => { const el = document.getElementById(id); return !!el && !el.hidden; };
function isIdle() {
  try { if (busyNow()) return false; } catch (e) { return false; }
  if (shown('session') || shown('guide') || shown('sheet') || shown('cele') || shown('toast') || shown('imp-preview')) return false;
  return !typing();
}
function reloadWhenIdle() {
  try { if (!isIdle()) return; } catch (e) { return; }
  clearInterval(idleTimer); idleTimer = null;
  try { sessionStorage.setItem(UPDATED_KEY, pendingVersion || ''); } catch (e) { /* */ }
  location.reload();
}
function onSwMessage(ev) {
  const d = ev && ev.data;
  if (!d || d.type !== 'DT_UPDATE_READY') return;
  try { if (ev.ports && ev.ports[0]) ev.ports[0].postMessage({ type: 'DT_UPDATE_ACK' }); } catch (e) { /* */ }
  pendingVersion = typeof d.version === 'string' ? d.version : '';
  if (!idleTimer) idleTimer = setInterval(reloadWhenIdle, IDLE_POLL_MS);
  reloadWhenIdle();
}
function checkForUpdate() {
  const t = Date.now();
  if (lastUpdateCheck !== null && t >= lastUpdateCheck && t - lastUpdateCheck < UPDATE_CHECK_MS) return;
  lastUpdateCheck = t;
  try { navigator.serviceWorker.getRegistration().then((r) => r && r.update()).catch(() => {}); } catch (e) { /* */ }
}
let updatedTo = null;
try { updatedTo = sessionStorage.getItem(UPDATED_KEY); if (updatedTo !== null) sessionStorage.removeItem(UPDATED_KEY); } catch (e) { /* */ }
try {
  if ('serviceWorker' in navigator) {
    const swc = navigator.serviceWorker;
    swc.addEventListener('message', onSwMessage);
    if (typeof swc.startMessages === 'function') swc.startMessages();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkForUpdate(); });
    window.addEventListener('online', checkForUpdate);
  }
} catch (e) { /* */ }

/* ===== 開機 ===== */
async function boot() {
  const [store, dom, nav, model, icons, home, gym, stretch, explore, progress, settings, backupUi, celebrate, update] = await Promise.all([
    import('./state/store.js'), import('./ui/dom.js'), import('./ui/nav.js'), import('./ui/model.js'), import('./ui/icons.js'),
    import('./ui/home.js'), import('./ui/gym.js'), import('./ui/stretch.js'), import('./ui/explore.js'), import('./ui/progress.js'),
    import('./ui/settings.js'), import('./ui/backup.js'), import('./ui/celebrate.js'), import('./ui/update.js')]);
  const { goTo, onScreen, setNavGuard } = nav;
  busyNow = () => gym.sessionOpen() || stretch.guideOpen() || celebrate.celebrationOpen();
  setNavGuard(() => false);
  onScreen('s-home', home.renderHome);
  onScreen('s-gym', gym.renderGym);
  onScreen('s-stretch', stretch.renderStretch);
  onScreen('s-explore', explore.renderExplore);
  onScreen('s-progress', progress.renderProgress);
  onScreen('s-settings', settings.renderSettings);
  document.querySelectorAll('#tabs button').forEach((b) => { b.querySelector('.ic').innerHTML = icons.icon(b.querySelector('.ic').dataset.ic); b.onclick = () => goTo(b.dataset.s); });
  dom.$('h-settings').onclick = () => goTo('s-settings');
  /* 時鐘注入（測試用）：window.__dtNow = () => Date */
  if (typeof window.__dtNow === 'function') model.setClock(window.__dtNow);

  const loaded = await store.loadState();
  const st = store.getState();
  const { created } = (await import('./state/v4.js')).ensureV4(st);
  await model.loadData();
  model.refresh();
  if (created) await store.saveState();
  celebrate.ensureSeenInitialized();
  home.renderHome();
  if (loaded && (loaded.status === 'repaired' || loaded.status === 'recovered')) backupUi.showLoadError(loaded.error);
  if (st.v4 && st.v4.gym && st.v4.gym.draft) goTo('s-gym');
  document.documentElement.dataset.ready = '1';
  if (updatedTo !== null) update.showUpdatedNote(updatedTo);
}
boot().catch(showFatal);

/* ===== PWA：註冊 Service Worker（離線可用） ===== */
if ('serviceWorker' in navigator) {
  const register = () => { navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('SW 註冊失敗', e)); };
  if (document.readyState === 'complete') register(); else window.addEventListener('load', register);
}
