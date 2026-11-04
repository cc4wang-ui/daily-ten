/* Daily Ten — 設定：身分宣言、健身房日、聲音、今天休息（不斷連續）、資料備份（backup.js）、刪除資料、版本。 */
import { $, esc } from './dom.js';
import { icon } from './icons.js';
import { goTo } from './nav.js';
import { rules, v4, commit, now, summary } from './model.js';
import { getState, setState, saveState } from '../state/store.js';
import { defaultState } from '../state/schema.js';
import { gameDay } from '../game/core.js';
import { wireBackupCard } from './backup.js';
import { renderAppVersion } from './update.js';

const WD = ['日', '一', '二', '三', '四', '五', '六'];
let wipeArmed = null;

export function renderSettings() {
  const s = v4().settings, R = rules();
  const today = gameDay(now(), R);
  const pausedToday = (v4().pauses || []).some((p) => p.from <= today && today <= p.to);
  $('settings-back-ic').innerHTML = icon('back');
  $('settings-body').innerHTML = `
    <section class="card"><div class="card-head"><h3 class="card-title">身分宣言</h3></div><div class="field"><label for="cfg-identity">每個完成的習慣都是為這個身分投一票</label><input type="text" id="cfg-identity" maxlength="80" value="${esc(s.identity)}"></div></section>
    <section class="card"><div class="card-head"><h3 class="card-title">健身房日</h3><span class="small">目標 ${R.habits.gym.weeklyTarget} 天／週</span></div><div class="days" role="group" aria-label="健身房日">${[1, 2, 3, 4, 5, 6, 0].map((d) => `<button type="button" data-d="${d}" aria-pressed="${(s.gymDays || []).includes(d)}">${WD[d]}</button>`).join('')}</div></section>
    <section class="card"><div class="switch"><span><b>提示音</b><br><span class="small">伸展換項目、休息結束時嗶一聲</span></span><button type="button" class="btn" id="cfg-sound" aria-pressed="${s.sound !== false}">${s.sound !== false ? '開' : '關'}</button></div>
      <div class="switch" style="border-top:1px solid var(--line);margin-top:8px;padding-top:8px"><span><b>今天休息</b><br><span class="small">生病、旅行時用：不斷連續、不耗 Freeze、不計週目標</span></span><button type="button" class="btn" id="cfg-rest" aria-pressed="${pausedToday}">${pausedToday ? '休息中' : '設為休息'}</button></div></section>
    <section class="card"><div class="card-head"><h3 class="card-title">規則</h3></div><p class="small" style="margin:0">健身房完整課 +${R.habits.gym.xp.complete}、部分 +${R.habits.gym.xp.partial}；伸展 ${R.stretch.fullMinutes} 分 +${R.habits.stretch.xp.full}、${R.stretch.shortMinutes} 分 +${R.habits.stretch.xp.short}；探索 +${R.habits.explore.xp.complete}。
      同一天健身房＋伸展＝Perfect Day +${R.bonus.perfectDay}；一週健身房 ${R.perfectWeek.gym}、伸展 ${R.perfectWeek.stretch}、探索 ${R.perfectWeek.explore}＝Perfect Week +${R.bonus.perfectWeek}；每週各項達標各 +${R.bonus.weeklyGoal.gym}；PR +${R.bonus.pr}；中斷後回來 +${R.bonus.comeback}。
      等級：每級需 ${R.level.base} + ${R.level.step} ×（等級 − 1）XP。連續 ${R.streak.freeze.earnEvery} 天得 1 張 Freeze（最多 ${R.streak.freeze.max}），漏一天自動補上。漏掉的日子不扣 XP。</p></section>
    <section class="card"><div class="card-head"><h3 class="card-title" style="color:var(--danger-ink)">刪除全部資料</h3></div><p class="small">只刪這台裝置上的紀錄，無法復原。先下載備份。</p><button type="button" class="btn btn-danger" id="cfg-wipe">刪除全部資料</button><p class="small" id="cfg-wipe-msg"></p></section>`;
  $('settings-back').onclick = () => goTo('s-home');
  $('cfg-identity').onchange = async () => { const v = $('cfg-identity').value.trim(); if (v) { v4().settings.identity = v; await commit(); } };
  $('settings-body').querySelectorAll('.days button').forEach((b) => { b.onclick = async () => { const d = Number(b.dataset.d); const set = new Set(v4().settings.gymDays || []); if (set.has(d)) set.delete(d); else set.add(d); v4().settings.gymDays = [...set].sort(); await commit(); renderSettings(); }; });
  $('cfg-sound').onclick = async () => { v4().settings.sound = v4().settings.sound === false; await commit(); renderSettings(); };
  $('cfg-rest').onclick = async () => { if (pausedToday) v4().pauses = v4().pauses.filter((p) => !(p.from <= today && today <= p.to)); else v4().pauses.push({ from: today, to: today, kind: 'rest' }); await commit(); renderSettings(); };
  $('cfg-wipe').onclick = async () => {
    if (!wipeArmed) { wipeArmed = setTimeout(() => { wipeArmed = null; $('cfg-wipe').textContent = '刪除全部資料'; }, 10000); $('cfg-wipe').textContent = '再按一次，確定刪除'; $('cfg-wipe-msg').textContent = '10 秒內再按一次才會刪除。'; return; }
    clearTimeout(wipeArmed); wipeArmed = null;
    setState(defaultState(now()));
    await commit();
    $('cfg-wipe-msg').textContent = '已刪除。';
    goTo('s-home');
  };
  wireBackupCard(() => { summary(); goTo('s-home'); });
  renderAppVersion();
}
