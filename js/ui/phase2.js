/* Daily Ten — Phase 2 進度儀表板（只在統計的 Progress 分段 #p2 渲染，首頁不新增進度）
   注意：
     - 本面板不改 engine 的 XP／等級／Perfect Day，不寫 session；匯入只寫 phase1.gymSets 與
       phase1.prs（mode gym），再記一筆 phase2.imports 供去重稽核，匯入本身不計 XP。
     - 首頁仍只顯示健身房達標率 x/4 與本週 Perfect Day X/5 兩條進度（見 js/ui/home.js），
       本面板的數字絕不寫回首頁；首頁文案不含設定頁關鍵字。
     - 儀表板數字由 js/game/phase2.js 的 dashboardMetrics 推導；滾動 30 天只是滾動觀察，
       不是已驗證的回訪率結論；砍功能門檻僅註明，不刪除任何功能。
     - 匯入流程分兩步：先「解析預覽」（只算、不寫入），錯誤與重複組數先說清楚，
       使用者按「確認匯入」才寫入；同一檔案重匯一次時新增組數為 0（去重，見 mergeImportedSets）。 */
import { getState, saveState } from '../state/store.js';
import { $ } from './dom.js';
import { todayKey } from './game.js';
import { showToast } from './toast.js';
import { parsePhase1, combinedPrList, prsByMode } from '../game/phase1.js';
import {
  parsePhase2, makeImportRecord, parseImportCsv, mergeImportedSets, applyImportPrs,
  dashboardMetrics, PHASE2_BOUNDARY, CUT_THRESHOLD_TEXT,
} from '../game/phase2.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ensure = (st, key) => { if (!st[key] || typeof st[key] !== 'object' || Array.isArray(st[key])) st[key] = {}; return st[key]; };
const save = () => { try { saveState(); } catch (e) { /* 儲存失敗時畫面仍顯示當次操作 */ } };

/* 跨重畫保留的狀態（只在記憶體，不進 state）：待確認的解析結果與上次匯入結果訊息。 */
let pending = null; // {parsed, merge, pr}
let lastResult = '';

function weekRows(weekly, fmt) {
  return weekly.map((w) => `<div class="p2-week"><span>${esc(w.label)}</span><b class="num">${esc(fmt(w))}</b></div>`).join('');
}

export function renderPhase2Panel() {
  const host = $('p2');
  if (!host) return;
  const st = getState();
  if (!st) { host.hidden = true; return; }
  host.hidden = false;
  const resultBanner = lastResult; // 上次匯入結果只顯示一次，之後重畫不再殘留
  lastResult = '';
  const today = todayKey();
  const m = dashboardMetrics(st, today);
  const p2 = parsePhase2(st);
  const p1 = parsePhase1(st);
  const gymPrs = prsByMode(combinedPrList(st, p1), 'gym').slice(-5).reverse();
  const hist = p2.imports.slice(-5).reverse().map((im) => `<div class="prline"><span>${esc(im.format === 'hevy' ? 'Hevy' : 'Strong')}${im.firstDate ? ` ${esc(im.firstDate)}${im.lastDate && im.lastDate !== im.firstDate ? `～${esc(im.lastDate)}` : ''}` : ''}</span><b class="num">新增 ${im.addedSets} 組／重複 ${im.duplicateSets} 組</b></div>`).join('');

  host.innerHTML = `
    <h2>Phase 2 · 進度儀表板</h2>
    <p class="small">${esc(PHASE2_BOUNDARY)}</p>
    ${resultBanner ? `<div class="banner ok" role="status">${esc(resultBanner)}</div>` : ''}
    <h3>28 天活動率</h3>
    <p class="small">區間 ${esc(m.from28)}～${esc(m.to28)}（28 個日曆天；暫停日不偷偷扣掉分母，另列 ${m.activity.pausedDays} 天暫停日供對照）。</p>
    <div class="p2-track" role="progressbar" aria-label="28 天活動率" aria-valuemin="0" aria-valuemax="28" aria-valuenow="${m.activity.activeDays}"><i class="p2-fill" style="width:${(m.activity.rate * 100).toFixed(1)}%"></i></div>
    <p><b class="num">${m.activity.activeDays}/28 天（${m.activity.ratePct}%）</b>有活動</p>
    <h3>量趨勢（健身房與居家分開看）</h3>
    <p><b class="num">${m.gymVolume.totalKg} kg</b> · 健身房量（28 天，重量×次數加總；${m.gymVolume.days} 天有健身房紀錄）</p>
    ${weekRows(m.gymVolume.weekly, (w) => `${w.kg} kg`)}
    <p><b class="num">${m.homeVolume.totalReps} 下</b> · 居家量（28 天，實際次數加總；${m.homeVolume.reports} 筆回報）</p>
    ${weekRows(m.homeVolume.weekly, (w) => `${w.reps} 下`)}
    <p class="small">居家量以次數計，不換算成 kg，絕不與健身房量合併成一個數字；彈力帶阻力標記本來就不能換算公斤。</p>
    <h3>睡眠趨勢</h3>
    ${m.sleep.avgHours === null
      ? '<p class="small">28 天內尚無睡眠紀錄（身體指標的睡眠或早安打卡的熄燈／起床），先記錄幾天再看趨勢。</p>'
      : `<p><b class="num">平均 ${m.sleep.avgHours} 小時</b> · ${m.sleep.points} 天有紀錄${m.sleep.latest ? ` · 最近 ${esc(m.sleep.latest.date)}：${m.sleep.latest.hours} 小時` : ''}</p>${weekRows(m.sleep.weekly, (w) => (w.avgHours === null ? '尚無紀錄' : `${w.avgHours} 小時`))}`}
    <h3>滾動 30 天回訪率（觀察用）</h3>
    <div class="p2-track" role="progressbar" aria-label="滾動 30 天回訪率" aria-valuemin="0" aria-valuemax="30" aria-valuenow="${m.retention30.activeDays}"><i class="p2-fill" style="width:${(m.retention30.rate * 100).toFixed(1)}%"></i></div>
    <p><b class="num">${m.retention30.activeDays}/30 天（${m.retention30.ratePct}%）</b></p>
    <p class="small">${esc(m.retention30.note)}</p>
    <p class="small">${esc(CUT_THRESHOLD_TEXT)}</p>
    <h3>Strong／Hevy CSV 匯入</h3>
    <p class="small">匯入只寫健身房組數與 PR（mode gym），餵給 Phase 1 的預填記錄與 PR 清單；HRP 與 push-up max 仍分開存，不受影響。匯入不計 XP、不改既有 session 的計分。同一檔案重匯一次不會重複：已存在的組數會跳過並明說。</p>
    <div class="p2-row">
      <label class="field"><span>選擇 CSV 檔案</span><input type="file" id="p2-csv-file" accept=".csv,text/csv"></label>
    </div>
    <div class="p2-row">
      <label class="field"><span>Strong 重量單位（Strong 檔未標單位時用）</span><select id="p2-strong-unit" aria-label="Strong 重量單位"><option value="kg">kg</option><option value="lb">lb</option></select></label>
    </div>
    <div class="p2-row">
      <label class="p2-textlabel" for="p2-csv-text">或貼上 CSV 內容</label>
      <textarea id="p2-csv-text" placeholder="貼上 Strong 或 Hevy 匯出的 CSV（標題列須包含動作、重量、次數、日期）"></textarea>
    </div>
    <div class="p2-row"><button type="button" class="btn-sub" id="p2-parse">解析預覽（先看結果，不寫入）</button></div>
    <div id="p2-preview" role="status"></div>
    <div class="p2-row"><button type="button" class="btn-main" id="p2-confirm" disabled>確認匯入</button></div>
    <div id="p2-error" role="alert"></div>
    <h3>最近匯入紀錄</h3>
    ${hist || '<p class="small">尚無匯入紀錄。</p>'}
    <h3>健身房 PR（匯入也會出現在這裡，PR 非 XP）</h3>
    ${gymPrs.length ? gymPrs.map((pr) => `<div class="prline"><span>${esc(pr.date)}</span> ${esc(pr.exercise)} <b class="num">${esc(String(pr.value))} kg</b></div>`).join('') : '<p class="small">尚無健身房 PR。</p>'}`;

  const previewEl = $('p2-preview');
  const errorEl = $('p2-error');
  const confirmBtn = $('p2-confirm');
  const showPreview = () => {
    if (!pending) { confirmBtn.disabled = true; return; }
    const { parsed, merge, pr } = pending;
    const errLines = parsed.errors.map((e) => `<li>第 ${e.row} 列：${esc(e.message)}</li>`).join('');
    previewEl.innerHTML = `
      <p><b>${parsed.format === 'hevy' ? 'Hevy' : 'Strong'} 格式</b> · ${parsed.entries.length} 個動作日、${parsed.validSets} 組可匯入；其中 ${merge.duplicateSets} 組已存在將跳過、${merge.addedSets} 組為新增${pr.newPrs.length ? `；新 PR ${pr.newPrs.length} 筆` : ''}${pr.baselines.length ? `；首次基準 ${pr.baselines.length} 筆（不算新 PR）` : ''}。</p>
      <p class="small">跳過統計：空列 ${parsed.skipped.empty}、熱身組 ${parsed.skipped.warmup}、非肌力列 ${parsed.skipped.nonStrength}（皆已計數，不是靜默丟失）。</p>
      ${errLines ? `<p class="small">以下 ${parsed.errors.length} 列有問題，不會匯入：</p><ul class="p2-errlist">${errLines}</ul>` : '<p class="small">沒有格式錯誤的列。</p>'}`;
    confirmBtn.disabled = merge.addedSets <= 0 && pr.newPrs.length <= 0 && pr.baselines.length <= 0;
    if (confirmBtn.disabled) {
      previewEl.innerHTML += '<p class="small">沒有新增組數或 PR 變化可匯入（可能已匯入過同一檔案）：確認按鈕已停用，不會重複寫入。</p>';
    }
  };
  const runParse = () => {
    const text = $('p2-csv-text') ? $('p2-csv-text').value : '';
    const unit = $('p2-strong-unit') ? $('p2-strong-unit').value : 'kg';
    errorEl.innerHTML = '';
    pending = null;
    if (!text.trim()) {
      errorEl.innerHTML = '<div class="banner danger">請先選擇 CSV 檔案或貼上 CSV 內容。</div>';
      showPreview();
      return;
    }
    const parsed = parseImportCsv(text, { strongUnit: unit });
    if (!parsed.ok) {
      const errLines = parsed.errors.map((e) => `<li>${e.row ? `第 ${e.row} 列：` : ''}${esc(e.message)}</li>`).join('');
      errorEl.innerHTML = `<div class="banner danger"><p>無法匯入，目前的資料沒有任何變更：</p><ul class="p2-errlist">${errLines}</ul></div>`;
      showPreview();
      return;
    }
    const cur = parsePhase1(getState());
    const merge = mergeImportedSets(cur.gymSets, parsed.entries);
    const pr = applyImportPrs(cur.prs, parsed.entries);
    pending = { parsed, merge, pr };
    showPreview();
  };

  $('p2-parse').onclick = runParse;
  const fileInput = $('p2-csv-file');
  if (fileInput) {
    fileInput.addEventListener('change', () => {
      const f = fileInput.files && fileInput.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        const ta = $('p2-csv-text');
        if (ta) ta.value = typeof reader.result === 'string' ? reader.result : '';
        runParse();
      };
      reader.onerror = () => { errorEl.innerHTML = '<div class="banner danger">讀取檔案失敗，請再選一次檔案。</div>'; };
      reader.readAsText(f);
    });
  }
  confirmBtn.onclick = () => {
    if (!pending) return;
    const { parsed, merge, pr } = pending;
    const st2 = getState();
    const p1w = ensure(st2, 'phase1');
    p1w.gymSets = merge.gymSets;
    p1w.prs = pr.prs;
    const p2w = ensure(st2, 'phase2');
    const rec = makeImportRecord(parsed.format, merge, parsed.entries);
    p2w.imports = [...(Array.isArray(p2w.imports) ? p2w.imports : []), rec];
    save();
    lastResult = `已匯入 ${parsed.format === 'hevy' ? 'Hevy' : 'Strong'} CSV：新增 ${merge.addedSets} 組、跳過重複 ${merge.duplicateSets} 組${pr.newPrs.length ? `、新 PR ${pr.newPrs.length} 筆` : ''}${pr.baselines.length ? `、首次基準 ${pr.baselines.length} 筆` : ''}；匯入不計 XP。`;
    pending = null;
    showToast(lastResult);
    renderPhase2Panel();
  };
}
