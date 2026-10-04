/* Daily Ten — 早安打卡（D17）：1 次點擊同時記錄「起床＝點擊時間」與「昨晚熄燈」（預填就寢時間 settings.bedtime，可改）。
   計分（D18 漸進）、時段、遊戲日都由 engine 決定（js/ui/game.js 轉接）；寫入由 data-guardian 的 addSleepEntry 負責（含驗證與存檔）。
   寫入後顯示計分明細與 toast「已記錄起床 06:58 · +60　復原」，10 秒內按復原 → removeSleepEntry（ui-engineer 規則 3）。
   探卡：未解鎖時虛線框＋鎖頭＋解鎖進度（規則 4，不隱藏）。
   「修改時間」只在這次打卡前有效（記憶體）；編輯列開著時 js/app.js 的 isIdle() 視為忙碌（D23）。 */
import { getState } from '../state/store.js';
import { TIME_RE } from '../state/schema.js';
import { $ } from './dom.js';
import { icon } from './icons.js';
import { summary, checkInWindow, buildCheckIn, addSleepEntry, removeSleepEntry } from './game.js';
import { showToast, undoMs } from './toast.js';
import { renderHome } from './home.js';

const pad = (n) => String(n).padStart(2, '0');
const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const finite = (n) => Number.isFinite(n);
const LINE_ICON = { wake: 'sun', lightsOut: 'moon', duration: 'clock' };
const ORDER_ICON = ['sun', 'moon', 'clock'];

let edited = null;   // 使用者改的熄燈時間 'HH:MM'；null＝用就寢時間
let writing = false; // 寫入中：擋連點
let clock = null;    // 起床按鈕上的時間每 15 秒更新（只在畫面開著、還沒打卡時）

function bedtime() {
  const v = getState().settings && getState().settings.bedtime;
  return typeof v === 'string' && TIME_RE.test(v) ? v : '23:00';
}
/* ISO（含 offset）取出當地 HH:MM；格式不符回 null */
function isoHHMM(iso) {
  const m = typeof iso === 'string' ? /T(\d{2}):(\d{2})/.exec(iso) : null;
  return m ? `${m[1]}:${m[2]}` : null;
}
function show(part) {
  $('ci-todo').hidden = part !== 'todo';
  $('ci-done').hidden = part !== 'done';
  $('ci-closed').hidden = part !== 'closed';
}
function setMsg(text) { $('ci-msg').textContent = text || ''; }

function stopClock() { if (clock) { clearInterval(clock); clock = null; } }
function startClock() {
  stopClock();
  clock = setInterval(() => {
    const scr = $('s-checkin');
    if (!scr || !scr.classList.contains('active') || $('ci-todo').hidden) { stopClock(); return; }
    $('ci-now').textContent = hhmm(new Date());
  }, 15000);
}

function renderTodo(now) {
  const bt = bedtime();
  $('ci-now').textContent = hhmm(now);
  $('ci-lights-sub').textContent = edited
    ? `同時記錄昨晚熄燈 ${edited}（你改的時間）`
    : `同時記錄昨晚熄燈 ${bt}（就寢時間）`;
  const open = !$('ci-edit-row').hidden;
  const link = $('ci-edit');
  link.hidden = open;
  link.textContent = `昨晚不是 ${bt} 熄燈？修改時間`;
  if (!open) $('ci-lights').value = edited || bt;
}

function renderScore(sleep) {
  const score = sleep && sleep.score;
  const lines = score && Array.isArray(score.lines) ? score.lines : [];
  $('ci-lines').innerHTML = lines.map((l, i) => {
    const xp = finite(l && l.xp) ? `+${Math.round(l.xp)}` : '';
    return `<li class="sc-line">${icon(LINE_ICON[l && l.key] || ORDER_ICON[i] || 'check', { size: 18 })}`
      + `<span class="sc-label">${esc((l && l.label) || '')}</span><span class="sc-val num">${esc((l && l.value) ?? '')}</span>`
      + `<span class="sc-xp num">${xp}</span></li>`;
  }).join('');
  $('ci-note').textContent = score && typeof score.note === 'string' && score.note
    ? score.note : '晚於時段不久仍有一半分數，不會歸零。';
}

function renderExplore(sum) {
  const ex = sum && sum.pillars && sum.pillars.explore;
  const box = $('ci-explore');
  if (ex && ex.locked === false) {
    box.innerHTML = `<p class="ci-soon">${icon('info', { size: 18 })}<span>探索打卡下一版開放。</span></p>`;
    return;
  }
  const u = (ex && ex.unlock) || {};
  const need = finite(u.need) && u.need > 0 ? Math.round(u.need) : null;
  const have = finite(u.have) ? Math.max(0, Math.round(u.have)) : 0;
  const reached = need !== null && have >= need;
  const title = typeof u.label === 'string' && u.label.trim() ? u.label.trim()
    : need !== null ? `起床達標 ${need} 天後解鎖` : '先把睡眠顧好，之後解鎖';
  const sub = reached ? '條件達成，探索下一版開放' : need !== null ? `${Math.min(have, need)} / ${need} 天 · 先把睡眠顧好` : '';
  const ratio = need ? Math.min(1, have / need) : 0;
  box.innerHTML = `<div class="lockbox"><span class="lock-ic">${icon('lock', { size: 22 })}</span><div class="lock-body">`
    + `<b>${esc(title)}</b>`
    + (need !== null ? `<div class="bar sleep" role="progressbar" aria-label="探索解鎖進度" aria-valuemin="0" aria-valuemax="${need}" aria-valuenow="${Math.min(have, need)}"><i style="width:${(ratio * 100).toFixed(1)}%"></i></div>` : '')
    + (sub ? `<span class="small">${esc(sub)}</span>` : '') + '</div></div>';
}

export function renderCheckIn() {
  const now = new Date();
  const sum = summary(now);
  const sleep = sum && sum.pillars && sum.pillars.sleep;
  $('ci-xp').textContent = sleep && finite(sleep.xp) ? Math.round(sleep.xp) : 0;
  $('ci-max').textContent = sleep && finite(sleep.max) ? Math.round(sleep.max) : 60;
  if (sleep && sleep.checkedIn) {
    show('done');
    renderScore(sleep);
    stopClock();
  } else {
    const win = checkInWindow(now);
    if (win.open) {
      show('todo');
      renderTodo(now);
      startClock();
    } else {
      show('closed');
      $('ci-closed-text').textContent = win.reason || '早安打卡只在早上開放，明天起床後再打卡就好。';
      stopClock();
    }
  }
  renderExplore(sum);
}

async function undo(date) {
  const r = await removeSleepEntry(date);
  renderCheckIn();
  renderHome();
  showToast(r.ok ? '已復原' : '復原失敗，請再試一次');
}

async function checkIn() {
  if (writing) return;
  writing = true;
  setMsg('');
  try {
    const now = new Date();
    if (!checkInWindow(now).open) { renderCheckIn(); return; } // 停在畫面上跨過了打卡時段
    const built = buildCheckIn(now, edited ? { lightsOut: edited } : {});
    if (!built || !built.entry) { setMsg('目前無法記錄，請稍後再試。'); return; }
    const r = await addSleepEntry(built.entry);
    if (!r.ok) { renderCheckIn(); setMsg(r.message || '今天已經打過卡了。'); return; }
    const total = built.score && finite(built.score.total) ? Math.round(built.score.total) : null;
    const date = built.entry.date;
    edited = null;
    $('ci-edit-row').hidden = true;
    renderCheckIn();
    renderHome();
    showToast(`已記錄起床 ${isoHHMM(built.entry.wake) || hhmm(now)}${total !== null ? ` · +${total}` : ''}`,
      { action: { label: '復原', run: () => undo(date) }, ms: undoMs() });
  } finally {
    writing = false;
  }
}

function openEditor() {
  $('ci-edit-row').hidden = false;
  $('ci-lights').value = edited || bedtime();
  renderTodo(new Date());
}
function resetEditor() {
  edited = null;
  $('ci-edit-row').hidden = true;
  renderTodo(new Date());
}
function onLightsInput() {
  const v = $('ci-lights').value;
  if (!TIME_RE.test(v)) return; // 打到一半：先不改
  edited = v === bedtime() ? null : v;
  renderTodo(new Date());
}

export function wireCheckIn() {
  $('ci-wake').onclick = checkIn;
  $('ci-edit').onclick = openEditor;
  $('ci-edit-reset').onclick = resetEditor;
  $('ci-lights').onchange = onLightsInput;
  $('ci-lights').oninput = onLightsInput;
}
