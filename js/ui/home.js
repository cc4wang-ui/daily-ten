/* Daily Ten — 今日：日期、階段、連續天數、身分宣言、三環＋中央等級、「下一步」主按鈕（全畫面唯一一顆）、保底版、
   AFT 自選目標差距卡、條件卡（搬家、載入錯誤、已更新、中斷提示、強度升級）。
   遊戲層（engine）就緒時：階段、三環、下一步由 todaySummary 決定（早上＝早安打卡、之後＝今日課表、週日＝Boss Day、都完成＝完成）；
   未就緒時（規則檔讀不到）：隱藏階段與三環，下一步照 M1 的課表邏輯（今日課表／Boss Day／已完成），其他照常。
   今日與訓練分頁共用今日課表：這裡一起呼叫 renderTrain()；統計三格（累計 XP、最佳連續）也一起更新（同 M1 首頁）。
   D24：最上方的搬家卡（只在舊網址顯示）在 relocate.js，每次 renderHome 重新判斷。D27 起今日不再有備份提醒卡。
   V2a：
   - Freeze（連續天數旁）：engine 的 freeze.tokens；0 張且從沒得過時隱藏；點一下展開說明（數字來自 data/game.json）。
   - D6 降量卡：engine 的 deload.label 有值才顯示；「恢復 L{n}」（restoreLabel）→ setDeloadRestored(今天)，10 秒內可復原
     （clearDeloadRestored）。降量中今天的課表一律用 deload.planLevel（下一步、訓練分頁、實際跑的序列）；state.level 不改。
   - D19 回歸任務：returnQuest.stage 不是 none 時，#h-banner 改成回歸卡（engine 的 label），取代 V1 的「上次訓練是 N 天前」。
   - Perfect Day 慶祝、升級卡：最後交給 celebrate.js 判斷（今日在前景、沒有訓練畫面、復原 toast 收起後才出現）。 */
import { getState, saveState } from '../state/store.js';
import { $ } from './dom.js';
import { dayGap } from './dates.js';
import { DOW, estMin, minimalSeq, todayPlan } from './program.js';
import { sessionOn, levelUpEligible } from './session.js';
import { renderMoveCard } from './relocate.js';
import { goTo } from './nav.js';
import { icon } from './icons.js';
import { summary, todayKey, keyToDate, planLevel, gameRules, setDeloadRestored, clearDeloadRestored } from './game.js';
import { showToast, undoMs } from './toast.js';
import { queueCelebrations } from './celebrate.js';
import { renderRings, legendMarkup } from './rings.js';
import { renderAft } from './aft.js';
import { renderTrain, runPlan } from './trainhub.js';
import { renderKpis } from './stats.js';

const KINDS = ['checkin', 'workout', 'boss', 'done'];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const finite = (n) => Number.isFinite(n);

function renderPhase(sum) {
  const el = $('h-phase');
  const p = sum && sum.phase;
  const label = p && typeof p.label === 'string' ? p.label.trim() : '';
  if (!label) { el.hidden = true; return; }
  el.textContent = label + (finite(p.day) && p.day > 0 && !/第\s*\d+\s*天/.test(label) ? ` · 第 ${p.day} 天` : '');
  el.hidden = false;
}

function renderStreak(sum, st) {
  const days = sum && sum.streak && finite(sum.streak.days) ? sum.streak.days : st.streak.current;
  $('h-streak').textContent = days;
}

/* 「我是獨立、自律、持續成長的人。」→ 我是<b>獨立、自律、持續成長</b>的人（設定可改，其他句型照原文） */
function renderIdentity(st) {
  const text = String((st.goals && st.goals.identity) || '').trim();
  const el = $('h-identity');
  if (!text) { el.hidden = true; return; }
  const m = /^我是(.+?)的人。?$/.exec(text);
  $('h-identity-text').innerHTML = m ? `我是<b>${esc(m[1])}</b>的人` : esc(text);
  el.hidden = false;
}

function ringsData(sum) {
  const P = sum.pillars || {};
  const pill = (p) => ({ xp: p && p.xp, max: p && p.max });
  const ex = P.explore || {};
  return {
    move: pill(P.move),
    sleep: pill(P.sleep),
    explore: ex.locked === false ? { locked: false, xp: ex.xp, max: ex.max } : { locked: true, unlock: ex.unlock || null },
    level: sum.level && finite(sum.level.lv) ? { lv: sum.level.lv, xpInto: sum.level.xpInto, xpNeed: sum.level.xpNeed } : null
  };
}

function renderRingsCard(sum) {
  const card = $('h-rings');
  if (!sum || !sum.pillars) { card.hidden = true; return; }
  const d = ringsData(sum);
  card.hidden = false;
  renderRings($('h-rings-svg'), d, { visible: $('s-home').classList.contains('active') });
  const lg = $('h-legend');
  lg.innerHTML = legendMarkup(d);
  lg.querySelectorAll('[data-go]').forEach((b) => { b.onclick = () => goTo(b.dataset.go); });
}

/* 完成狀態：已解鎖的支柱都做了才說「都完成了」；早安打卡沒打（時段已過）或沒有遊戲層時只說課表完成，不誇大 */
function doneTitle(sum) {
  const sleep = sum && sum.pillars && sum.pillars.sleep;
  return sleep && sleep.checkedIn ? '今天都完成了' : '今日課表完成了';
}

/* 「下一步」：遊戲層決定種類（kind），文案與時間由畫面依今日課表算；週日的課表一律是 Boss Day */
function renderNext(sum, plan, doneToday) {
  const lv = Number.isInteger(plan.lv) ? plan.lv : getState().level; // 今天的強度（D6 降量中降一級）
  let kind = sum && sum.nextAction && KINDS.includes(sum.nextAction.kind) ? sum.nextAction.kind : null;
  if (!kind) kind = doneToday ? 'done' : 'workout';
  if (kind === 'workout' || kind === 'boss') kind = plan.type === 'boss' ? 'boss' : 'workout';
  const cfg = {
    checkin: { ic: 'sun', tone: 'sleep', title: '早安打卡', meta: '1 次點擊', run: () => goTo('s-checkin') },
    workout: { ic: 'play', tone: 'move', title: plan.type === 'rest' ? '開始恢復序列' : '開始今日課表', meta: `強度 L${lv} · ${plan.min} 分`, run: () => runPlan(plan) },
    boss: { ic: 'trophy', tone: 'move', title: '開始 Boss Day', meta: `暖身 ${plan.min} 分＋測驗`, run: () => runPlan(plan) },
    done: { ic: 'check', tone: 'done', title: doneTitle(sum), meta: '再練一次', run: () => runPlan(plan) }
  }[kind];
  const btn = $('h-start');
  btn.dataset.kind = kind;
  btn.innerHTML = `<span class="nx-ic tone-${cfg.tone}" aria-hidden="true">${icon(cfg.ic, { size: 18 })}</span>`
    + `<span class="nx-text"><span class="nx-eyebrow">下一步</span><span class="nx-title">${cfg.title}</span></span>`
    + `<span class="nx-meta num">${cfg.meta}</span>`;
  btn.onclick = cfg.run;
}

/* 「×1.5」這類倍數加粗（文字照 engine 的 label） */
const boldMult = (text) => esc(text).replace(/×\d+(?:\.\d+)?/g, (m) => `<b>${m}</b>`);

/* D19 回歸任務（engine 的 returnQuest）：中斷中＝回歸任務、拿到徽章＝加成說明、加成日＝今天 XP ×1.5。
   只講接下來能拿到什麼，不提中斷幾天（原則 8）。stage none 或沒有遊戲層時回 false，改走 V1 的中斷提示 */
function renderQuest(sum) {
  const q = sum && sum.returnQuest;
  if (!q || !['return', 'badge', 'boost'].includes(q.stage) || typeof q.label !== 'string' || !q.label.trim()) return false;
  const b = $('h-banner');
  b.innerHTML = `<span class="q-ic" aria-hidden="true">${icon(q.stage === 'return' ? 'badge' : 'spark', { size: 18 })}</span>`
    + `<span class="q-text">${boldMult(q.label.trim())}</span>`;
  b.className = `banner quest${q.stage === 'boost' ? ' boost' : ''}`;
  b.dataset.stage = q.stage;
  return true;
}

/* 中斷提示：只陳述事實＋給保底版，不扣分、不羞辱（原則 8）。D19 回歸任務進行中時改顯示回歸卡（renderQuest） */
function renderBanner(st, t, doneToday, sum, lv) {
  const b = $('h-banner');
  b.className = 'banner';
  b.textContent = '';
  delete b.dataset.stage;
  if (renderQuest(sum)) return;
  const last = st.streak.lastDate;
  if (!last || doneToday) return;
  const gap = dayGap(last, t);
  const m = estMin(minimalSeq(lv));
  let text = '';
  if (gap === 2) text = `上次訓練是前天。今天做保底版也算數，約 ${m} 分鐘。`;
  else if (gap > 2) text = `上次訓練是 ${gap} 天前。從保底版重新開始就好，約 ${m} 分鐘。`;
  if (!text) return;
  b.innerHTML = `${icon('info', { size: 18 })}<span>${text}</span>`;
  b.className = 'banner info';
}

/* ---------- V2a：Freeze ---------- */
let freezeOpen = false; // 說明展開中（重畫時保留）
function freezeExplain(fz) {
  const R = gameRules();
  const every = R && R.freeze && Number.isInteger(R.freeze.earnEvery) ? R.freeze.earnEvery : null;
  const max = Number.isInteger(fz.max) ? fz.max : (R && R.freeze ? R.freeze.max : null);
  const how = every && max ? `連續實際有做每滿 ${every} 天得 1 張，最多 ${max} 張。` : '';
  return [typeof fz.note === 'string' && fz.note ? `${fz.note}。` : '',
    `${fz.label}：漏掉一天會自動用掉 1 張，連續天數不會中斷。`, how].join('');
}
function renderFreeze(sum) {
  const btn = $('h-freeze');
  const note = $('h-freeze-note');
  const fz = sum && sum.freeze;
  const tokens = fz && Number.isInteger(fz.tokens) ? fz.tokens : 0;
  const earned = fz && Number.isInteger(fz.earnedTotal) ? fz.earnedTotal : 0;
  if (!fz || (tokens <= 0 && earned <= 0) || typeof fz.label !== 'string') {
    btn.hidden = true; note.hidden = true; freezeOpen = false; btn.onclick = null;
    return;
  }
  $('h-freeze-n').textContent = tokens;
  btn.setAttribute('aria-label', fz.label + (typeof fz.note === 'string' && fz.note ? `，${fz.note}` : ''));
  btn.setAttribute('aria-expanded', String(freezeOpen));
  btn.classList.toggle('used', Array.isArray(fz.recent) && fz.recent.length > 0);
  btn.hidden = false;
  note.textContent = freezeExplain(fz);
  note.hidden = !freezeOpen;
  btn.onclick = () => { freezeOpen = !freezeOpen; renderFreeze(summary()); };
}

/* ---------- V2a：D6 降量卡 ---------- */
/* engine 的一句話「昨晚睡 5 小時 24 分，今天先改成 L1，輕一點也算數。」→ 粗體第一段＋第二行其餘（mockup 的兩行） */
function splitLabel(text) {
  const i = text.indexOf('，');
  return i > 0 && i < text.length - 1 ? [text.slice(0, i), text.slice(i + 1)] : [text, ''];
}
function renderDeload(sum) {
  const card = $('h-deload');
  const d = sum && sum.deload;
  const label = d && typeof d.label === 'string' ? d.label.trim() : '';
  if (!label) { card.hidden = true; delete card.dataset.state; return; }
  const [title, sub] = splitLabel(label);
  $('h-deload-title').textContent = title;
  $('h-deload-sub').textContent = sub;
  $('h-deload-sub').hidden = !sub;
  const btn = $('h-deload-restore');
  const canRestore = d.active === true && typeof d.restoreLabel === 'string' && d.restoreLabel.trim() !== '';
  card.dataset.state = canRestore ? 'active' : 'restored';
  btn.hidden = !canRestore;
  btn.textContent = canRestore ? d.restoreLabel.trim() : '';
  btn.onclick = canRestore ? () => restore(sum.date, d.fromLevel) : null;
  card.hidden = false;
}
/* 恢復原本強度（只對今天有效）：寫入 → 重畫（下一步、訓練分頁立刻換回）→ 10 秒內可復原 */
function restore(date, from) {
  const r = setDeloadRestored(date);
  if (!r || r.ok !== true) { showToast((r && r.message) || '目前無法恢復，請再試一次'); return; }
  renderHome();
  showToast(`已恢復 L${from}`, { action: { label: '復原', run: () => undoRestore(date) }, ms: undoMs() });
}
function undoRestore(date) {
  const r = clearDeloadRestored(date);
  renderHome();
  showToast(r && r.ok === true ? '已復原' : ((r && r.message) || '復原失敗，請再試一次'));
}

function renderLevelUp() {
  const lu = $('h-levelup');
  if (!levelUpEligible()) { lu.hidden = true; lu.onclick = null; return; }
  const lv = getState().level;
  lu.innerHTML = `${icon('up', { size: 18 })}<span>強度升級條件達成 — 點此升到 L${lv + 1}</span>`;
  lu.hidden = false;
  lu.onclick = () => {
    getState().level = Math.min(5, getState().level + 1); saveState(); renderHome();
    alert('升級至 L' + getState().level + '。劑量已自動調整。');
  };
}

export function renderHome(){
  const st=getState(),now=new Date(),t=todayKey(now),day=keyToDate(t);
  /* 日期標題用遊戲日（04:00 前仍是前一天），和下一步、課表、三環同一天 */
  $('h-date').textContent='週'+DOW[day.getDay()]+' '+(day.getMonth()+1)+'/'+day.getDate();
  const sum=summary(now);
  const lv=planLevel(sum),plan=todayPlan(lv); // V2a：D6 降量中是降一級後的強度
  const doneToday=!!sessionOn(t);
  renderPhase(sum);
  renderStreak(sum,st);
  renderFreeze(sum);
  renderIdentity(st);
  renderRingsCard(sum);
  renderDeload(sum);
  renderNext(sum,plan,doneToday);
  $('h-minimal').innerHTML='只有 '+estMin(minimalSeq(lv))+' 分鐘？<u>做保底版</u>';
  renderBanner(st,t,doneToday,sum,lv);
  renderLevelUp();
  renderAft();
  renderMoveCard();
  renderTrain(sum);
  renderKpis(sum);
  queueCelebrations(sum);
}
