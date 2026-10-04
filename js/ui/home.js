/* Daily Ten — 今日：日期、階段、連續天數、身分宣言、三環＋中央等級、「下一步」主按鈕（全畫面唯一一顆）、保底版、
   AFT 自選目標差距卡、條件卡（搬家／匯入、載入錯誤、已更新、中斷提示、強度升級、備份提醒）。
   遊戲層（engine）就緒時：階段、三環、下一步由 todaySummary 決定（早上＝早安打卡、之後＝今日課表、週日＝Boss Day、都完成＝完成）；
   未就緒時（規則檔讀不到）：隱藏階段與三環，下一步照 M1 的課表邏輯（今日課表／Boss Day／已完成），其他照常。
   今日與訓練分頁共用今日課表：這裡一起呼叫 renderTrain()；統計三格（累計 XP、最佳連續）也一起更新（同 M1 首頁）。
   D24：最上方的搬家引導卡（舊網址搬家、新網址匯入）在 relocate.js，每次 renderHome 重新判斷。 */
import { getState, saveState } from '../state/store.js';
import { $ } from './dom.js';
import { todayStr, dayGap } from './dates.js';
import { DOW, estMin, minimalSeq, todayPlan } from './program.js';
import { sessionOn, levelUpEligible } from './session.js';
import { renderBackupReminder } from './backup.js';
import { renderMoveCard } from './relocate.js';
import { goTo } from './nav.js';
import { icon } from './icons.js';
import { summary } from './game.js';
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
  const lv = getState().level;
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

/* 中斷提示：只陳述事實＋給保底版，不扣分、不羞辱（原則 8）。D19 回歸任務在之後的版本 */
function renderBanner(st, t, doneToday) {
  const b = $('h-banner');
  b.className = 'banner';
  b.textContent = '';
  const last = st.streak.lastDate;
  if (!last || doneToday) return;
  const gap = dayGap(last, t);
  const m = estMin(minimalSeq(st.level));
  let text = '';
  if (gap === 2) text = `上次訓練是前天。今天做保底版也算數，約 ${m} 分鐘。`;
  else if (gap > 2) text = `上次訓練是 ${gap} 天前。從保底版重新開始就好，約 ${m} 分鐘。`;
  if (!text) return;
  b.innerHTML = `${icon('info', { size: 18 })}<span>${text}</span>`;
  b.className = 'banner info';
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
  const st=getState(),t=todayStr(),plan=todayPlan(),d=new Date();
  $('h-date').textContent='週'+DOW[d.getDay()]+' '+(d.getMonth()+1)+'/'+d.getDate();
  const sum=summary(d);
  const doneToday=!!sessionOn(t);
  renderPhase(sum);
  renderStreak(sum,st);
  renderIdentity(st);
  renderRingsCard(sum);
  renderNext(sum,plan,doneToday);
  $('h-minimal').innerHTML='只有 '+estMin(minimalSeq(st.level))+' 分鐘？<u>做保底版</u>';
  renderBanner(st,t,doneToday);
  renderLevelUp();
  renderAft();
  renderBackupReminder();
  renderMoveCard();
  renderTrain();
  renderKpis();
}
