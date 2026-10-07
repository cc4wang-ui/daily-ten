/* Daily Ten — V2a Perfect Day 慶祝與升級卡（全螢幕卡 index.html #cele；設計見 docs/vnext-mockup/PerfectDay.dc.html）。
   engine 不判斷「看過沒」：這裡比較 todaySummary 與 data-guardian 的 game.seen（js/ui/game.js 轉接）。
     慶祝：  summary.perfectDay.done && summary.perfectDay.date > seen.perfectDay → 按「領取」才 markPerfectDaySeen(date)（一天最多一次）
     升級卡：summary.level.lv > seen.level → 按「繼續」才 markLevelSeen(lv)（每個新等級一次；一次跳好幾級也只出最新的一張）
     兩個都該出現時先慶祝、再升級卡。seen 還沒初始化（null）時先 ensureSeen（只改記憶體），不補播舊的。
   什麼時候出現（queueCelebrations 由 renderHome 每次呼叫）：今日在前景，而且沒有訓練（#train）、完成（#done）、
   示範（#demo-modal）、Boss 成績輸入（#s-boss）；復原 toast 顯示中（打卡、D6 恢復後 10 秒）先等它收起，不擋住復原。
   擋住的時候不記任何東西：關掉訓練／完成畫面回到今日（renderHome）就會出現。
   開著的時候條件不再成立（例如按了打卡的復原、跨過 04:00）→ 直接關掉、不記成看過。
   動態（CLAUDE.md §2.9）：卡片淡入＋微幅上移、彩帶是 DOM 小片（不用 Canvas），只動 transform／opacity，全部 ≤1.5 秒
   （--confetti-ms＋--confetti-delay）；prefers-reduced-motion 時卡片只淡入、彩帶靜止淡入。開著時 js/app.js 的 isIdle() 視為忙碌（D23）。 */
import { getState } from '../state/store.js';
import { $ } from './dom.js';
import { summary, readSeen, ensureSeen, markPerfectDaySeen, markLevelSeen } from './game.js';
import { toastVisible, onToastHidden } from './toast.js';

const PILLARS = ['move', 'sleep', 'explore'];
const RADIUS = { move: 106, sleep: 84, explore: 62 };
const PIECES = 26;

let open = null;      // 顯示中：{kind:'perfect', date} | {kind:'level', lv}
let waiting = false;  // 等復原 toast 收起

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = (n) => (Number.isFinite(n) ? Math.round(n) : 0);
const active = (id) => { const el = $(id); return !!el && el.classList.contains('active'); };

function tokenMs(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const m = /^(\d+(?:\.\d+)?)(ms|s)$/.exec(v);
    return m ? Number(m[1]) * (m[2] === 's' ? 1000 : 1) : fallback;
  } catch (e) { return fallback; }
}
function reducedMotion() {
  try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
}

/* 今日不在前景，或訓練／完成／示範／Boss 成績輸入開著 → 先不出現 */
function screenBlocked() {
  return !active('s-home') || active('train') || active('done') || active('demo-modal') || active('s-boss');
}

function dueKind(sum, seen) {
  const pd = sum.perfectDay;
  if (pd && pd.done === true && typeof pd.date === 'string' && pd.date > seen.perfectDay) return 'perfect';
  const lv = sum.level;
  if (lv && Number.isInteger(lv.lv) && lv.lv > seen.level) return 'level';
  return null;
}
function stillDue(cur, sum) {
  if (!sum) return true; // 遊戲層暫時算不出來：不動它
  if (cur.kind === 'perfect') return !!(sum.perfectDay && sum.perfectDay.done === true && sum.perfectDay.date === cur.date);
  return !!(sum.level && Number.isInteger(sum.level.lv) && sum.level.lv >= cur.lv);
}

/* ---------- 內容 ---------- */
/* 身分宣言「我是獨立、自律、持續成長的人。」→「獨立、自律、持續成長」；其他句型去掉句尾標點照用 */
function identityCore() {
  const g = getState() && getState().goals;
  const text = String((g && g.identity) || '').trim();
  if (!text) return '';
  const m = /^我是(.+?)的人。?$/.exec(text);
  return m ? m[1] : text.replace(/[。．.！!]+$/, '');
}
function voteLine(kind) {
  const core = identityCore();
  if (kind === 'perfect') return core ? `又為「${core}」投了一票。` : '又為自己投了一票。';
  return core ? `每一次出席都算數，繼續為「${core}」投票。` : '每一次出席都算數，繼續加油。';
}

/* 已解鎖的支柱畫滿環、未解鎖畫虛線環（不隱藏），中間打勾 */
function perfectArt(pd) {
  const need = Array.isArray(pd.need) && pd.need.length ? pd.need : ['move', 'sleep'];
  let svg = '';
  for (const k of PILLARS) {
    const r = RADIUS[k];
    svg += need.includes(k)
      ? `<circle class="arc ${k}" cx="120" cy="120" r="${r}" fill="none" stroke-width="18"/>`
      : `<circle class="ring-lock" cx="120" cy="120" r="${r}" fill="none" stroke-width="3" stroke-dasharray="6 7"/>`;
  }
  svg += '<path class="cele-check" d="M98 122l15 15 30-32" fill="none" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>';
  return `<svg class="cele-svg" viewBox="0 0 240 240" focusable="false">${svg}</svg>`;
}
/* 升級：三支柱色各一段的環（任何支柱都讓等級成長），中間 Lv N */
function levelArt(lv) {
  const r = 100;
  const len = 2 * Math.PI * r;
  const seg = len / 3 - 14;
  let svg = '';
  PILLARS.forEach((k, i) => {
    svg += `<circle class="arc ${k}" cx="120" cy="120" r="${r}" fill="none" stroke-width="18" stroke-linecap="round"`
      + ` stroke-dasharray="${seg.toFixed(2)} ${len.toFixed(2)}" transform="rotate(${-86 + i * 120} 120 120)"/>`;
  });
  return `<svg class="cele-svg" viewBox="0 0 240 240" focusable="false">${svg}</svg>`
    + `<span class="cele-lv num"><small>Lv</small>${num(lv.lv)}</span>`;
}
const statsMarkup = (list) => list.map(([v, label]) =>
  `<div class="cele-stat"><b class="num">${esc(v)}</b><span>${esc(label)}</span></div>`).join('');

/* ---------- 彩帶：DOM 小片，transform／opacity；減少動態時靜止淡入 ---------- */
function confetti(host) {
  host.textContent = '';
  const still = reducedMotion();
  const dur = tokenMs('--confetti-ms', 1150);
  const spread = tokenMs('--confetti-delay', 300);
  let seed = 20261006;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const frag = document.createDocumentFragment();
  for (let i = 0; i < PIECES; i++) {
    const el = document.createElement('i');
    el.className = `cf ${PILLARS[i % 3]}${still ? ' still' : ''}`;
    el.style.left = `${(3 + rnd() * 92).toFixed(1)}%`;
    if (still) {
      el.style.top = `${(4 + rnd() * 22).toFixed(1)}%`;
      el.style.transform = `rotate(${Math.round(rnd() * 140 - 70)}deg)`;
    } else {
      el.style.setProperty('--dx', `${Math.round(rnd() * 90 - 45)}px`);
      el.style.setProperty('--dy', `${Math.round(40 + rnd() * 55)}vh`);
      el.style.setProperty('--r0', `${Math.round(rnd() * 120 - 60)}deg`);
      el.style.setProperty('--r1', `${Math.round(rnd() * 360 + 180)}deg`);
      el.style.animationDelay = `${Math.round(rnd() * spread)}ms`;
      el.style.animationDuration = `${Math.round(dur * (0.75 + rnd() * 0.25))}ms`;
    }
    frag.appendChild(el);
  }
  host.appendChild(frag);
}

/* ---------- 開／關 ---------- */
function show(kind, sum) {
  const el = $('cele');
  if (!el) return;
  const pd = sum.perfectDay || {};
  const lv = sum.level || {};
  const streak = sum.streak && Number.isFinite(sum.streak.days) ? sum.streak.days : 0;
  const xp = sum.xp || {};
  open = kind === 'perfect' ? { kind, date: pd.date } : { kind, lv: lv.lv };
  el.dataset.kind = kind;
  if (kind === 'perfect') {
    $('cele-art').innerHTML = perfectArt(pd);
    $('cele-eyebrow').textContent = '已解鎖的支柱全完成';
    $('cele-title').textContent = typeof pd.title === 'string' && pd.title ? pd.title : 'Perfect Day';
    $('cele-xp').textContent = `+${num(pd.xp || pd.reward)} XP`;
    $('cele-xp').hidden = false;
    $('cele-stats').innerHTML = statsMarkup([[streak, '連續天數'], [num(pd.weekCount), '本週 Perfect'], [num(xp.today), '今日 XP']]);
    $('cele-ok').textContent = '領取';
  } else {
    $('cele-art').innerHTML = levelArt(lv);
    $('cele-eyebrow').textContent = '等級提升';
    $('cele-title').textContent = `升到 ${typeof lv.label === 'string' && lv.label ? lv.label : `Lv ${num(lv.lv)}`}`;
    $('cele-xp').textContent = '';
    $('cele-xp').hidden = true;
    $('cele-stats').innerHTML = statsMarkup([[num(xp.total), '累計 XP'], [streak, '連續天數'],
      [Math.max(0, num(lv.xpNeed) - num(lv.xpInto)), '下一級還差 XP']]);
    $('cele-ok').textContent = '繼續';
  }
  $('cele-vote').textContent = voteLine(kind);
  $('cele-ok').onclick = close;
  el.hidden = false;
  el.classList.remove('in');
  void el.offsetWidth; // 重新播放出現動畫（升級卡緊接在慶祝之後）
  el.classList.add('in');
  confetti($('cele-confetti'));
  try { $('cele-ok').focus({ preventScroll: true }); } catch (e) { /* 舊瀏覽器 */ }
}

function hideOverlay() {
  open = null;
  const el = $('cele');
  if (!el) return;
  el.hidden = true;
  el.classList.remove('in');
  delete el.dataset.kind;
  const c = $('cele-confetti');
  if (c) c.textContent = '';
}

/* 「領取」／「繼續」：記成看過（data-guardian 寫入並存檔），再看下一張（慶祝之後的升級卡） */
function close() {
  const cur = open;
  hideOverlay();
  if (!cur) return;
  const r = cur.kind === 'perfect' ? markPerfectDaySeen(cur.date) : markLevelSeen(cur.lv);
  if (!r || r.ok !== true) console.warn('看過的紀錄沒有寫入', r);
  queueCelebrations(summary());
}

export function celebrationOpen() { return !!open; }

export function queueCelebrations(sum) {
  try {
    if (open) {
      if (!stillDue(open, sum)) hideOverlay(); // 例如按了打卡的復原：關掉，不記成看過
      return;
    }
    if (!sum) return;
    let seen = readSeen();
    if (!seen) return;
    if (seen.level === null || seen.perfectDay === null) {
      ensureSeen(sum);
      seen = readSeen();
      if (!seen || seen.level === null || seen.perfectDay === null) return;
    }
    const kind = dueKind(sum, seen);
    if (!kind || screenBlocked()) return;
    if (toastVisible()) { // 復原時段內不蓋住 toast：收起後再看一次
      if (!waiting) {
        waiting = true;
        onToastHidden(() => { waiting = false; queueCelebrations(summary()); });
      }
      return;
    }
    show(kind, sum);
  } catch (e) {
    console.warn('慶祝畫面失敗', e);
  }
}
