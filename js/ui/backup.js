/* Daily Ten — 資料保護 UI（M1）：載入錯誤卡、SETUP 備份狀態與下載、
   匯入流程（選檔或貼上 → 驗證 → 差異預覽 → 二次確認 → 覆蓋）。
   D27（Cross 2026-10-06 放棄備份）：拿掉 HOME 的 7 天備份提醒卡；SETUP 資料備份卡與載入錯誤卡照舊。
   資料邏輯全部在 js/state/backup.js（data-guardian）；這裡只管畫面與接線，不直接碰 localStorage。 */
import { getState } from '../state/store.js';
import { downloadBackup, downloadRawBackup, parseImport, applyImport, localDateStr } from '../state/backup.js';
import { $ } from './dom.js';

const ARM_MS = 10000; // 第一次按「確認匯入」後，10 秒內再按才真的覆蓋
const GUARD_MS = 1000; // 進入待確認後 1 秒內的點擊一律忽略：雙擊或連續兩次 tap 不會直接覆蓋
const CONFIRM_TEXT = '確認匯入（覆蓋目前資料）';
const ARMED_TEXT = '再按一次，確認覆蓋';

const pad = (n) => String(n).padStart(2, '0');
function lastBackupTime(state) {
  const v = state && state.meta ? state.meta.lastBackupAt : null;
  const t = typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? t : null;
}
function stampText(t) {
  const d = new Date(t);
  return `${localDateStr(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function textEl(tag, text) {
  const el = document.createElement(tag);
  el.textContent = text;
  return el;
}
/* 下載期間停用按鈕，避免連點叫出兩次分享面板；成功時 backup.js 已寫入 meta.lastBackupAt */
async function runBackup(btn) {
  btn.disabled = true;
  try { return await downloadBackup(); } finally { btn.disabled = false; }
}

/* ---------- 載入錯誤卡（HOME 最上方；「知道了」只在這次啟動隱藏） ---------- */
export function showLoadError(error) {
  if (!error) return;
  $('err-text').textContent = error.message || '';
  $('err-note').textContent = '';
  const dl = $('err-download');
  dl.hidden = !error.backupKey;
  dl.onclick = () => {
    const r = downloadRawBackup(error.backupKey);
    $('err-note').textContent = r.ok ? `已下載 ${r.filename}` : r.message;
  };
  $('err-dismiss').onclick = () => { $('err-card').className = 'banner'; };
  $('err-card').className = 'banner danger';
}

/* ---------- SETUP 資料備份卡 ---------- */
export function renderBackupStatus() {
  const t = lastBackupTime(getState());
  $('bk-status').textContent = t === null ? '尚未下載過備份' : `上次備份：${stampText(t)}`;
}

let pending = null; // parseImport 通過、等待確認的資料
let armTimer = null;
let armedAt = 0; // 進入待確認的時間（performance.now，與計時器同一個時鐘）

function disarm() {
  if (armTimer) { clearTimeout(armTimer); armTimer = null; }
  $('imp-confirm').textContent = CONFIRM_TEXT;
}
function resetImport() {
  pending = null;
  disarm();
  $('imp-preview').hidden = true;
  const err = $('imp-error');
  err.className = 'banner';
  err.textContent = '';
}
function previewRow(label, current, incoming, row) {
  const el = document.createElement('div');
  el.className = 'prline';
  const cell = row ? 'b' : 'span';
  if (row) { el.dataset.key = row.key; el.dataset.changed = String(!!row.changed); }
  el.append(textEl('span', label), textEl(cell, current), textEl(cell, incoming));
  return el;
}
/* 選檔與貼上共用：壞檔只顯示錯誤，目前的 state 與 localStorage 都不動 */
function previewImport(text) {
  resetImport();
  $('io-msg').textContent = '';
  const r = parseImport(text);
  if (!r.ok) {
    const err = $('imp-error');
    err.append(textEl('div', '無法匯入，目前的資料沒有任何變更：'), ...r.errors.map((e) => textEl('div', `・${e.message}`)));
    err.className = 'banner danger';
    return;
  }
  pending = r.incoming;
  const rows = $('imp-rows');
  rows.textContent = '';
  rows.append(previewRow('項目', '目前', '匯入後', null), ...r.summary.rows.map((x) => previewRow(x.label, x.current, x.incoming, x)));
  const warn = $('imp-warnings');
  warn.textContent = '';
  warn.append(...r.summary.warnings.map((w) => textEl('div', `⚠ ${w}`)));
  warn.className = r.summary.warnings.length ? 'banner warn' : 'banner';
  $('imp-preview').hidden = false;
}
function readFile(file) {
  if (typeof file.text === 'function') return file.text().catch(() => null);
  return new Promise((done) => {
    const fr = new FileReader();
    fr.onload = () => done(String(fr.result));
    fr.onerror = () => done(null);
    fr.readAsText(file);
  });
}

/* renderSetup 每次呼叫：重畫備份狀態、收起匯入預覽（避免拿舊的比較結果覆蓋）、接上按鈕。
   onImported：匯入成功後重繪四個分頁（同原本匯入後的 renderHome／Hist／Setup／Body） */
export function wireBackupCard(onImported) {
  renderBackupStatus();
  resetImport();
  $('bk-download').onclick = async () => {
    const r = await runBackup($('bk-download'));
    if (r.ok) renderBackupStatus();
    else if (r.reason !== 'cancelled') $('bk-status').textContent = r.message;
  };
  $('imp-btn').onclick = () => previewImport($('exp-area').value);
  $('imp-file-btn').onclick = () => $('imp-file').click();
  $('imp-file').onchange = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const text = await readFile(file);
    e.target.value = ''; // 同一個檔案可以再選一次
    previewImport(text);
  };
  $('imp-cancel').onclick = () => {
    resetImport();
    $('io-msg').textContent = '已取消匯入，資料沒有變更。';
  };
  $('imp-confirm').onclick = async () => {
    if (!pending) return;
    if (!armTimer) {
      $('imp-confirm').textContent = ARMED_TEXT;
      armedAt = performance.now();
      armTimer = setTimeout(disarm, ARM_MS);
      return;
    }
    if (performance.now() - armedAt < GUARD_MS) return; // 太快：視為連點，不套用、也不改外觀
    const incoming = pending;
    resetImport();
    if (await applyImport(incoming)) {
      $('exp-area').value = '';
      $('imp-file').value = '';
      onImported();
      $('io-msg').textContent = '匯入成功。';
    } else {
      $('io-msg').textContent = '匯入失敗：無法寫入資料，目前的資料沒有任何變更。';
    }
  };
}
