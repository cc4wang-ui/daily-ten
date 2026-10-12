/* Daily Ten — 訓練分頁：今日課表卡（開始）、其他選項（加一輪、保底版、雨天替代）、週日 Boss Day、一週節奏、動作庫。
   課表規則全部沿用 program.js／session.js（B1 不改劑量與排程）；本檔只管畫面與接線。
   今日與訓練分頁共用「今日課表」狀態：renderHome() 會一起呼叫 renderTrain()，隱藏中的分頁也不會顯示舊的時間或完成狀態。
   動作庫清單是靜態的（VIDEOS＋demos.js），開機畫一次（renderVideos）。
   V2a（D6）：今天的課表、加一輪、保底版、一週節奏的今天那一列都用 planLevel（降量中降一級）；右上「強度」維持 state.level，
   降量中課表卡的說明前面加「今天先改成 L{n}」。按今日的「恢復」後 renderHome 會一起重畫這裡。 */
import { getState } from '../state/store.js';
import { $ } from './dom.js';
import { VIDEOS } from './content.js';
import { HAS_DEMO, openDemo } from './demo.js';
import { getApprovedExerciseMedia } from './exercise-media.js';
import { hasBand, blockLabel, DOW, WEEK, estMin, fullSeq, restSeq, planSeq, blockSeq, minimalSeq, todayPlan } from './program.js';
import { sessionOn, bossItem } from './session.js';
import { startWorkout } from './train.js';
import { startBoss } from './boss.js';
import { icon } from './icons.js';
import { todayKey, todayWeekday, summary, planLevel } from './game.js';

const BOSS_ITEM = { hrp: 'HRP 伏地挺身 2 分鐘', plank: 'Plank 極限', run2mi: '2 英里跑' };

/* 開始今日課表（今日「下一步」與訓練分頁共用）：週日 Boss Day 走暖身＋測驗；強度＝畫面上顯示的 plan.lv */
export function runPlan(plan = todayPlan()) {
  const lv = Number.isInteger(plan.lv) ? plan.lv : planLevel();
  if (plan.type === 'boss') startBoss(lv);
  else startWorkout(planSeq(plan, lv), plan.type);
}

export function planTitle(plan) {
  if (plan.type === 'boss') return 'Boss Day · 十動作暖身＋測驗';
  if (plan.type === 'rest') return '恢復日 · 三組伸展全走';
  return `活動度＋${blockLabel(plan.block)}${plan.type === 'cycle' ? '＋加練' : ''}`;
}

function opt(ic, title, meta, note) {
  return `<span class="opt-ic" aria-hidden="true">${icon(ic, { size: 20 })}</span>`
    + `<span class="opt-text"><span class="opt-title">${title}</span><span class="opt-note">${note}</span></span>`
    + `<span class="opt-meta num">${meta}</span>${icon('chevron', { size: 18, cls: 'opt-go' })}`;
}

function renderWeek(lv, today, todayLv = lv) {
  $('week-tbl').innerHTML = WEEK.map((p, i) => {
    const plv = i === today ? todayLv : lv;
    const name = p.type === 'boss' ? 'Boss Day · 十動作＋測驗'
      : p.type === 'rest' ? '恢復日 · 三組伸展全走'
        : `活動度＋${blockLabel(p.block)}${p.type === 'cycle' ? '＋加練' : ''}`;
    const min = p.type === 'boss' ? estMin(fullSeq(plv, p.mob))
      : p.type === 'rest' ? estMin(restSeq(plv)) : estMin(planSeq(p, plv));
    return `<div class="prline wk-row${i === today ? ' today' : ''}"${i === today ? ' aria-current="date"' : ''}>`
      + `<span class="wk-dow">${DOW[i]}</span><span class="wk-name">${name}<small>伸展組 ${p.mob}</small></span>`
      + `<b class="wk-min num">${min} 分${p.type === 'boss' ? '＋測驗' : ''}</b></div>`;
  }).join('');
}

/* sum：renderHome 傳入的今日摘要（省略時現算；null＝遊戲層未就緒） */
export function renderTrain(sum) {
  const s = sum === undefined ? summary() : sum;
  const lv = getState().level, plv = planLevel(s), plan = todayPlan(plv), wd = todayWeekday();
  const done = !!sessionOn(todayKey());
  $('h-level').textContent = 'L' + lv;
  $('tr-day').textContent = `週${DOW[wd]} · 今日課表${done ? ' · 已完成' : ''}`;
  $('tr-plan-title').textContent = planTitle(plan);
  $('h-mission').textContent = plan.mission;
  $('tr-plan-meta').textContent = (plv !== lv ? `今天先改成 L${plv} · ` : '')
    + (plan.type === 'boss' ? `暖身約 ${plan.min} 分＋測驗另計` : `約 ${plan.min} 分`)
    + ` · ${hasBand() ? '瑜珈墊、彈力帶（不用門錨或牆）' : '瑜珈墊（上背低阻力，不能取代負重拉力）'}`;
  const start = $('tr-start');
  start.textContent = done ? '再練一次今日課表'
    : plan.type === 'boss' ? '開始 Boss Day' : plan.type === 'rest' ? '開始恢復序列' : '開始今日課表';
  start.onclick = () => runPlan(plan);
  start.dataset.level = String(plv);
  /* 上限選項：時間夠的日子多跑一輪加強區塊。保底版是下限，這是上限，中間是預設。 */
  const plus = $('h-plus');
  if (plan.block) {
    const seq = planSeq(plan, plv).concat(blockSeq(plan.block, plv));
    plus.hidden = false;
    plus.innerHTML = opt('plus', `加一輪 ${blockLabel(plan.block)}`, `${estMin(seq)} 分鐘`, '時間夠的日子，多跑一輪加強區塊');
    /* 加一輪：記成當天的一般 type（週三 cycle、其他 full）＋plus:true */
    plus.onclick = () => startWorkout(seq, plan.type === 'cycle' ? 'cycle' : 'full', undefined, { plus: true });
  } else plus.hidden = true;
  $('tr-minimal').innerHTML = opt('stopwatch', '保底版', `約 ${estMin(minimalSeq(plv))} 分鐘`, '最少做這個，今天就算數');
  $('h-rain').innerHTML = opt('rain', '雨天／出差替代', '約 10 分鐘', '低衝擊原地快走＋側步；先確認地面乾燥防滑');
  $('tr-boss-item').textContent = BOSS_ITEM[bossItem()];
  renderWeek(lv, wd, plv);
}

/* 動作庫：「說明」開本機影片狀態；「真人」是 YouTube 搜尋連結（只是 href，點了才連網） */
export function renderVideos() {
  $('vids').innerHTML = VIDEOS.map((v, i) => {
    if (!v[1]) return `<h3 class="vid-group">${v[0].replace(/^—\s*|\s*—$/g, '')}</h3>`;
    return `<div class="vidline"><span class="vid-name">${v[0]}</span><span class="vid-acts">`
      + `<button type="button" class="vid-btn" data-i="${i}" aria-label="${v[0]} 動作說明">說明</button>`
      + `<a class="vid-link" href="https://www.youtube.com/results?search_query=${encodeURIComponent(v[1])}" target="_blank" rel="noopener"`
      + ` aria-label="${v[0]} 真人影片（YouTube，需連網）">真人${icon('external', { size: 14 })}</a></span></div>`;
  }).join('');
  $('vids').querySelectorAll('button[data-i]').forEach((b) => {
    b.onclick = () => {
      const v=VIDEOS[+b.dataset.i], k=(HAS_DEMO?DT_DEMOS.keyFor(v[0]):null)
        || (getApprovedExerciseMedia(v[0])?v[0]:null);
      openDemo(k||v[0],v[1],null,v[0]);
    };
  });
}
