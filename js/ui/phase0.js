/* Daily Ten — Phase 0 今日面板（js/ui/home.js 呼叫 renderPhase0Panel(rerender)）
   注意：本面板不改 engine 的 XP／等級／Perfect Day。健身房完整課同時寫一筆既有 session（type full，
   engine 計 Movement 50、同一天多筆取最高＝每天最多 1 個 Movement 額度）；最小課寫 type minimal（30）；
   散步、伸展、探索嘗試、暫停只寫 state.phase0，不寫 session、不進 XP。
   疼痛：當天該動作停用並記入 phase0.pain（進步暫停標示），不算完成訓練；教練簽核仍是外部未完成項。 */
import { getState, saveState } from '../state/store.js';
import { $ } from './dom.js';
import { todayKey } from './game.js';
import { recordSession } from './session.js';
import { showToast } from './toast.js';
import { parsePhase0, nextGym, weekGymCount, phase0Day, shuffleExplore, buildExport, EXPLORE_TASKS, PHASE0_BOUNDARY } from '../game/phase0.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const ensure = (st) => { if (!st.phase0 || typeof st.phase0 !== 'object' || Array.isArray(st.phase0)) st.phase0 = {}; return st.phase0; };
const save = () => { try { saveState(); } catch (e) { /* 儲存失敗時畫面仍顯示當次操作 */ } };
const download = (name, text, type) => {
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch (e) { showToast('下載失敗，請再試一次'); }
};
const nowHM = () => { const d = new Date(); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

export function renderPhase0Panel(rerender) {
  const host = $('p0');
  if (!host) return;
  const st = getState();
  if (!st) { host.hidden = true; return; }
  host.hidden = false;
  const today = todayKey();
  const parsed = parsePhase0(st);
  const gym = nextGym(parsed, today);
  const day = phase0Day(parsed, today, !!(st.sessions || []).some((s) => s && s.date === today));
  const weekCount = weekGymCount(parsed, today);
  const task = EXPLORE_TASKS[parsed.exploreCurrent] || EXPLORE_TASKS[0];
  const pausedToday = day.paused;
  const held = new Set(day.painExercises);
  const cele = (text) => { const el = $('p0-cele'); if (el) { el.textContent = text; el.classList.remove('p0-pop'); void el.offsetWidth; el.classList.add('p0-pop'); el.hidden = false; } showToast(text); };
  const setLog = (mode) => {
    const p = ensure(st);
    const list = Array.isArray(p.gymLog) ? p.gymLog : (p.gymLog = []);
    const i = list.findIndex((e) => e && e.date === today);
    if (i >= 0) list[i] = { date: today, mode }; else list.push({ date: today, mode });
    save(); if (typeof rerender === 'function') rerender();
  };
  host.innerHTML = `
    <h2>Phase 0 · 今日新面板</h2>
    <p class="small">健身房日由你自己選，不再固定星期；漏掉或改居家，順序都保留、不補雙倍。</p>
    <div class="p0-cele" id="p0-cele" hidden></div>
    <h3>健身房 · 下一課：${esc(gym.label)}</h3>
    <p class="small">本週健身房 ${weekCount}/4 · 順序 ${esc(gym.label)}（已完成 ${gym.count} 次完整健身房課）${pausedToday ? ' · 今天已暫停' : ''}</p>
    <ul class="p0-list">${gym.template.map((e) => `<li class="${held.has(e.name) ? 'p0-held' : ''}">${esc(e.name)} · ${esc(String(e.sets))} 組 · ${esc(e.rep)} 下 ${held.has(e.name) ? '（疼痛，今日停用、進步暫停）' : ''} <button type="button" class="btn-sub p0-pain" data-ex="${esc(e.name)}" ${held.has(e.name) ? 'disabled' : ''}>疼痛，停這個動作</button></li>`).join('')}</ul>
    <p class="small">模板以 reel 為準：上肢 7 動作各 2 組、下肢 6 動作各 2–3 組，不發明 A/B 差異；次數沿用充實建議（複合 6–10、孤立 10–15），正式出貨前仍須教練簽核。</p>
    <div class="p0-row">
      <button type="button" class="btn-main" id="p0-gym">完成健身房課</button>
      <button type="button" class="btn-sub" id="p0-home">改做居家（不推進順序）</button>
      <button type="button" class="btn-sub" id="p0-min">最小課（熱身＋主動作）</button>
      <button type="button" class="btn-sub" id="p0-walk">散步（只計活動日）</button>
    </div>
    <p class="small" id="p0-daynote">今日：${day.logMode ? `已記 ${day.logMode}` : '尚未記錄'} · Movement 額度：${day.movementCredit ? '已有（今天最多 1 個）' : '尚未取得'} · 散步不計 Movement、不計 Perfect Day；最小課計 Movement、計活動日，但不計完整健身房課。</p>
    <h3>晨間伸展</h3>
    <p class="small">每天 15 分鐘；時間不夠用 5 分鐘短版也算完成。伸展是獨立每日例行，不計健身房達標率 x/4，也不單獨當成完整 Move。</p>
    <div class="p0-row">
      <button type="button" class="btn-sub" id="p0-stretch-full">15 分鐘伸展完成</button>
      <button type="button" class="btn-sub" id="p0-stretch-short">5 分鐘短版完成</button>
    </div>
    <p class="small">今日伸展：${day.stretch === 'full' ? '15 分鐘已完成' : day.stretch === 'short' ? '5 分鐘短版已完成' : '尚未完成'}</p>
    <h3>暫停（主動宣告，優先於 Freeze）</h3>
    <p class="small">暫停日不耗 Freeze、不計連續、不計 Perfect Day、不計 28 天分母；Freeze 只補非暫停的意外缺席日。</p>
    <div class="p0-row">
      <button type="button" class="btn-sub" data-pause="Rest">今天暫停：Rest</button>
      <button type="button" class="btn-sub" data-pause="Sick">今天暫停：Sick</button>
      <button type="button" class="btn-sub" data-pause="Travel">今天暫停：Travel</button>
      <button type="button" class="btn-sub" id="p0-unpause">取消今天暫停</button>
    </div>
    <p class="small">今天狀態：${pausedToday ? '已暫停' : '未暫停'}</p>
    <h3>提醒（1 個，App 內提醒，未完成才提醒）</h3>
    <p class="small">PWA 無法保證系統推播，本提醒為開啟 App 時的站內提醒；時間到且今日未完成才顯示。</p>
    <div class="p0-row">
      <label class="field"><span>提醒時間</span><input type="time" id="p0-rem-time" value="${parsed.reminder ? esc(parsed.reminder.time) : '08:00'}"></label>
      <label class="toggle"><span>開啟提醒</span><input type="checkbox" role="switch" id="p0-rem-on" ${parsed.reminder && parsed.reminder.enabled ? 'checked' : ''}></label>
      <button type="button" class="btn-sub" id="p0-rem-save">儲存提醒</button>
    </div>
    <p class="small">${parsed.reminder && parsed.reminder.enabled ? `提醒時間 ${esc(parsed.reminder.time)}，現在 ${nowHM()}，今日未完成時會提醒。` : '提醒未開啟。'}</p>
    <h3>探索洗牌機</h3>
    <p class="small">${esc(PHASE0_BOUNDARY)}</p>
    <div class="p0-task">
      <b id="p0-task-title">${esc(task.title)}</b>
      <p class="small">${esc(task.category)} · ${esc(task.place)} · ${esc(task.time)} · ${esc(task.cost)}</p>
      <p>完成標準：${esc(task.finish)}</p>
    </div>
    <div class="p0-row">
      <button type="button" class="btn-main" id="p0-shuffle">Shuffle 一下</button>
      <button type="button" class="btn-sub" id="p0-explore-done">完成這次探索嘗試</button>
    </div>
    <p class="small">已記錄的探索嘗試：${parsed.exploreTries.length} 次（本階段不改 XP／Perfect Day／連續）。</p>
    <h3>資料</h3>
    <div class="p0-row">
      <button type="button" class="btn-sub" id="p0-exp-csv">匯出 CSV</button>
      <button type="button" class="btn-sub" id="p0-exp-json">匯出 JSON</button>
      <button type="button" class="btn-sub" id="p0-wipe">刪除 Phase 0 資料</button>
    </div>
    <p class="small">刪除只清 state.phase0（健身房 log、暫停、伸展、探索嘗試、疼痛、提醒），不動既有 sessions、睡眠、PR；完整資料管理仍在設定頁。</p>`;
  host.querySelectorAll('.p0-pain').forEach((b) => { b.onclick = () => { const p = ensure(st); const list = Array.isArray(p.pain) ? p.pain : (p.pain = []); if (!list.some((x) => x && x.date === today && x.exercise === b.dataset.ex)) list.push({ date: today, exercise: b.dataset.ex }); save(); cele(`收到！${b.dataset.ex} 今天停用、進步暫停，好好照顧自己。`); if (typeof rerender === 'function') rerender(); }; });
  $('p0-gym').onclick = () => { if (pausedToday) { showToast('今天已暫停，先取消暫停再記錄健身房課。'); return; } setLog('gym'); recordSession('full'); cele('太棒了！健身房課完成，順序推進一課！'); };
  $('p0-home').onclick = () => { setLog('home'); cele('改做居家已記錄，健身房順序保留，不補雙倍。'); };
  $('p0-min').onclick = () => { if (pausedToday) { showToast('今天已暫停，先取消暫停再記錄。'); return; } setLog('minimum'); recordSession('minimal'); cele('最小課也算數！熱身＋主動作，穩穩前進！'); };
  $('p0-walk').onclick = () => { setLog('walk'); cele('散步完成，活動日＋1，不計 Movement，輕鬆也算出席。'); };
  $('p0-stretch-full').onclick = () => { const p = ensure(st); p.stretch = { ...(p.stretch || {}), [today]: 'full' }; save(); cele('晨間伸展 15 分鐘完成，身體醒過來了！'); if (typeof rerender === 'function') rerender(); };
  $('p0-stretch-short').onclick = () => { const p = ensure(st); p.stretch = { ...(p.stretch || {}), [today]: 'short' }; save(); cele('5 分鐘短版伸展也算完成，短短的也很好！'); if (typeof rerender === 'function') rerender(); };
  host.querySelectorAll('[data-pause]').forEach((b) => { b.onclick = () => { const p = ensure(st); const list = Array.isArray(p.pauses) ? p.pauses : (p.pauses = []); if (!list.some((x) => x && x.from === today && x.to === today)) list.push({ from: today, to: today, kind: b.dataset.pause }); save(); if (typeof rerender === 'function') rerender(); }; });
  $('p0-unpause').onclick = () => { const p = ensure(st); if (Array.isArray(p.pauses)) p.pauses = p.pauses.filter((x) => !(x && x.from === today && x.to === today)); save(); if (typeof rerender === 'function') rerender(); };
  $('p0-rem-save').onclick = () => { const t = $('p0-rem-time').value; if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) { showToast('提醒時間格式應為 HH:MM'); return; } const p = ensure(st); p.reminder = { time: t, enabled: $('p0-rem-on').checked }; save(); showToast('提醒已儲存'); if (typeof rerender === 'function') rerender(); };
  $('p0-shuffle').onclick = () => {
    const titleEl = $('p0-task-title');
    let ticks = 0;
    const timer = setInterval(() => {
      titleEl.textContent = EXPLORE_TASKS[Math.floor(Math.random() * EXPLORE_TASKS.length)].title;
      if (++ticks >= 8) { clearInterval(timer); const p = ensure(st); const next = shuffleExplore(parsed.exploreCurrent); p.exploreCurrent = next; save(); if (typeof rerender === 'function') rerender(); }
    }, 60);
  };
  $('p0-explore-done').onclick = () => { const p = ensure(st); const list = Array.isArray(p.exploreTries) ? p.exploreTries : (p.exploreTries = []); list.push({ date: today, taskId: task.id }); save(); cele(`探索嘗試已記錄：${task.title}，不改 XP，純粹試試看！`); if (typeof rerender === 'function') rerender(); };
  $('p0-exp-csv').onclick = () => { download('daily-ten-phase0.csv', buildExport(st, parsePhase0(st)).csv, 'text/csv'); };
  $('p0-exp-json').onclick = () => { download('daily-ten-phase0.json', JSON.stringify(buildExport(st, parsePhase0(st)).json, null, 2), 'application/json'); };
  $('p0-wipe').onclick = () => { if (typeof window !== 'undefined' && window.confirm && !window.confirm('確定刪除 Phase 0 資料嗎？既有 sessions、睡眠、PR 不受影響。')) return; delete st.phase0; save(); if (typeof rerender === 'function') rerender(); };
};
