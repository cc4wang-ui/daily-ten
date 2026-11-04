/* Daily Ten — 今日（redo-v1）。版型：主行動卡（一顆按鈕）→ 三個習慣列（左圓打勾）→ 本週三環＋XP → 週條 → 教練一句。
   全部由 model.summary() 推導，不自己算；點擊只負責切畫面或開始流程。 */
import { $, esc } from './dom.js';
import { icon } from './icons.js';
import { goTo } from './nav.js';
import { summary, rules, coachLine, now, v4 } from './model.js';
import { renderMoveCard } from './relocate.js';
import { queueCelebrations } from './celebrate.js';

const WD = ['日', '一', '二', '三', '四', '五', '六'];
const num = (n) => Number(n || 0).toLocaleString('zh-Hant-TW');

function nextAction(sum) {
  const t = sum.today, w = sum.week;
  const gymDays = v4().settings.gymDays || [];
  const dow = new Date(`${t.date}T12:00:00`).getDay();
  const gymPlanned = gymDays.includes(dow);
  if (!t.stretch.done) return { habit: 'stretch', screen: 's-stretch', title: `晨間伸展 ${rules().stretch.fullMinutes} 分鐘`, sub: '一次點擊開始，做完自動記錄', xp: rules().habits.stretch.xp.full };
  if (!t.gym.done && (gymPlanned || w.gym.count < w.gym.target)) return { habit: 'gym', screen: 's-gym', title: `健身房：${t.gym.nextLabel}`, sub: gymPlanned ? '今天是你排的健身房日' : `本週還差 ${w.gym.target - w.gym.count} 次`, xp: rules().habits.gym.xp.complete };
  if (!t.explore.done && w.explore.count < w.explore.target) return { habit: 'explore', screen: 's-explore', title: '本週的新事物', sub: '看看這週要試什麼', xp: rules().habits.explore.xp.complete };
  return null;
}

function ringsSvg(w) {
  const defs = [['gym', 60, w.gym], ['stretch', 47, w.stretch], ['explore', 34, w.explore]];
  return `<svg viewBox="0 0 136 136" aria-hidden="true">${defs.map(([k, r, v]) => {
    const c = 2 * Math.PI * r, p = Math.min(1, v.target ? v.count / v.target : 0);
    return `<circle class="track" cx="68" cy="68" r="${r}"/><circle class="bar ${k}" cx="68" cy="68" r="${r}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - p)).toFixed(1)}"/>`;
  }).join('')}</svg>`;
}

export function renderHome() {
  const sum = summary();
  const d = now();
  const h = d.getHours();
  $('h-greet').textContent = h < 5 ? '深夜' : h < 11 ? '早安' : h < 18 ? '午安' : '晚安';
  $('h-date').textContent = `${d.getMonth() + 1} 月 ${d.getDate()} 日 週${WD[d.getDay()]}`;
  $('h-streak').textContent = String(sum.streak.current);
  $('h-streak-ic').innerHTML = icon('flame', { size: 18 });
  $('h-settings-ic').innerHTML = icon('gear', { size: 22 });
  $('h-streak-btn').title = sum.streak.tokens ? `Freeze ${sum.streak.tokens} 張：漏一天自動補上` : '連續有活動的天數';
  renderMoveCard();

  const t = sum.today, w = sum.week, R = rules();
  const next = nextAction(sum);
  const hero = next
    ? `<section class="hero ${next.habit}" aria-labelledby="hero-t"><p class="label">下一步</p><h2 id="hero-t">${esc(next.title)}</h2><p class="label" style="margin-bottom:12px">${esc(next.sub)} · <span class="xp-pill">+${next.xp} XP</span></p><button type="button" class="btn" id="hero-go" data-s="${next.screen}">${icon('play', { size: 20 })}開始</button></section>`
    : `<section class="hero done" aria-labelledby="hero-t"><p class="label">今天</p><h2 id="hero-t">${t.perfect ? 'Perfect Day，今天都完成了。' : '今天的任務都完成了。'}</h2><p class="label"><span class="xp-pill">今日 +${t.xp} XP</span></p></section>`;

  const gymSub = t.gym.done ? `${t.gym.session.label} · ${num(t.gym.session.volume)} kg` : t.gym.partial ? `${t.gym.session.label} 做了一部分` : `下一次：${t.gym.nextLabel} · 本週 ${w.gym.count}/${w.gym.target}`;
  const stSub = t.stretch.done ? (t.stretch.variant === 'full' ? `${R.stretch.fullMinutes} 分鐘完成 · 本週 ${w.stretch.count}/${w.stretch.target}` : `${R.stretch.shortMinutes} 分鐘短版完成 · 本週 ${w.stretch.count}/${w.stretch.target}`) : `${R.stretch.fullMinutes} 分（短版 ${R.stretch.shortMinutes} 分）· 本週 ${w.stretch.count}/${w.stretch.target}`;
  const cur = v4().explore.current;
  const exSub = t.explore.done ? '這週的新事物完成了' : w.explore.count >= w.explore.target ? '本週已達標，多試一件也可以' : cur ? '本週任務已抽好，去看看' : '抽一件這週要試的新事物';
  const row = (k, name, sub, done, xp) => `<button type="button" class="habit ${k}${done ? ' done' : ''}" data-s="s-${k}"><span class="circle">${icon(done ? 'check' : k)}</span><span class="body"><p class="name">${esc(name)}</p><p class="meta">${esc(sub)}</p></span><span class="right">${done ? '完成' : ''}<span class="xp">${done ? `+${xp} XP` : `+${xp} XP`}</span></span><span class="chev">${icon('chevron', { size: 18 })}</span></button>`;
  const habits = `<div class="habits">
    ${row('stretch', '晨間伸展', stSub, t.stretch.done, t.stretch.done ? (t.stretch.variant === 'full' ? R.habits.stretch.xp.full : R.habits.stretch.xp.short) : R.habits.stretch.xp.full)}
    ${row('gym', '健身房', gymSub, t.gym.done, t.gym.done ? R.habits.gym.xp.complete : R.habits.gym.xp.complete)}
    ${row('explore', '探索', exSub, t.explore.done || w.explore.count >= w.explore.target, R.habits.explore.xp.complete)}
  </div>`;

  const lv = sum.level;
  const ringsCard = `<section class="card" aria-label="本週進度"><div class="card-head"><h3 class="card-title">本週</h3><span class="tag xp">Lv ${lv.lv} · ${num(sum.xp.total)} XP</span></div>
    <div class="rings-card"><div class="rings">${ringsSvg(w)}<div class="center"><span class="lv-label">LEVEL</span><span class="lv num">${lv.lv}</span></div></div>
    <div class="legend">
      <div class="row"><span class="name"><i class="dot" style="background:var(--gym)"></i>健身房</span><span class="val num">${w.gym.count}<small>/${w.gym.target}</small></span></div>
      <div class="row"><span class="name"><i class="dot" style="background:var(--stretch)"></i>伸展</span><span class="val num">${w.stretch.count}<small>/${w.stretch.target}</small></span></div>
      <div class="row"><span class="name"><i class="dot" style="background:var(--explore)"></i>探索</span><span class="val num">${w.explore.count}<small>/${w.explore.target}</small></span></div>
    </div></div>
    <div class="xp-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${lv.need}" aria-valuenow="${lv.into}" aria-label="下一級進度"><i style="--p:${(lv.into / lv.need).toFixed(3)}"></i></div>
    <div class="xp-line"><span>下一級 Lv ${lv.lv + 1}</span><span class="num">${num(lv.into)} / ${num(lv.need)} XP</span></div>
  </section>`;

  const gymDays = v4().settings.gymDays || [];
  const week = `<section class="card" aria-label="本週每日"><div class="week">${w.days.map((x) => {
    const dow = new Date(`${x.date}T12:00:00`).getDay();
    return `<div class="day${x.today ? ' today' : ''}${x.future ? ' future' : ''}${gymDays.includes(dow) ? ' plan' : ''}"><span class="lbl">${WD[dow]}</span><span class="cell${x.frozen ? ' frozen' : ''}" title="${x.date}">${x.frozen ? icon('snow', { size: 14 }) : `<i class="${x.stretch ? 'stretch' : ''}"></i><i class="${x.gym ? 'gym' : ''}"></i><i class="${x.explore ? 'explore' : ''}"></i>`}</span></div>`;
  }).join('')}</div><p class="small" style="margin:10px 0 0">橘字＝你排的健身房日。${sum.streak.tokens ? `Freeze ${sum.streak.tokens} 張，漏一天會自動補上。` : '連續 7 天可得 1 張 Freeze。'}</p></section>`;

  const coach = `<p class="small" style="text-align:center;margin:4px 8px 0">${esc(coachLine())}</p><p class="small" style="text-align:center;margin:4px 8px 0;color:var(--ink-2);font-weight:600">${esc(v4().settings.identity)}</p>`;

  $('home-body').innerHTML = hero + habits + ringsCard + week + coach;
  $('home-body').querySelectorAll('[data-s]').forEach((b) => { b.onclick = () => goTo(b.dataset.s); });
  /* 主行動卡的「開始」直接進流程：伸展開引導、健身房開課；探索只切畫面 */
  if ($('hero-go') && next) $('hero-go').onclick = () => { goTo(next.screen); const btn = next.habit === 'stretch' ? $('st-start-full') : next.habit === 'gym' ? ($('gym-start') || $('gym-resume')) : null; if (btn) btn.click(); };
  queueCelebrations();
}
