/* Daily Ten — 慶祝：Perfect Day、升級、Perfect Week、新成就。全螢幕卡 #cele＋Canvas 彩帶（≤1.5 秒），prefers-reduced-motion 時不放彩帶。
   「看過」記在 state.v4.seen（level／perfectDay／perfectWeek／achievements），按「繼續」才記；條件不再成立就直接關。 */
import { $, esc, activeScreen } from './dom.js';
import { summary, v4, commit, achievementsData } from './model.js';
import { toastVisible, onToastHidden } from './toast.js';

let open = null;
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

export function celebrationOpen() { return !!open; }

function due() {
  const s = summary(), seen = v4().seen;
  const list = [];
  if (s.today.perfect && seen.perfectDay !== s.today.date) list.push({ kind: 'perfectDay', em: '🏆', title: 'Perfect Day', text: '健身房＋晨間伸展同一天完成，為「獨立、自律、持續成長的人」投了一票。', xp: 30, mark: () => { v4().seen.perfectDay = s.today.date; } });
  if (s.week.perfect && seen.perfectWeek !== s.week.start) list.push({ kind: 'perfectWeek', em: '🎉', title: 'Perfect Week', text: '這週健身房、伸展、探索全部達標。', xp: 200, mark: () => { v4().seen.perfectWeek = s.week.start; } });
  if (Number.isInteger(seen.level) ? s.level.lv > seen.level : s.level.lv > 1) list.push({ kind: 'level', em: '⬆️', title: `升到 Lv ${s.level.lv}`, text: `下一級還需要 ${s.level.need - s.level.into} XP。`, xp: null, mark: () => { v4().seen.level = s.level.lv; } });
  const seenA = new Set(seen.achievements || []);
  const fresh = Object.keys(s.achievements.unlocked).filter((id) => !seenA.has(id));
  if (fresh.length) {
    const names = fresh.map((id) => (achievementsData().find((a) => a.id === id) || {}).name || id);
    list.push({ kind: 'achievement', em: '🏅', title: fresh.length === 1 ? names[0] : `${fresh.length} 個新成就`, text: fresh.length === 1 ? (achievementsData().find((a) => a.id === fresh[0]) || {}).desc || '' : names.join('、'), xp: null, mark: () => { v4().seen.achievements = [...seenA, ...fresh]; } });
  }
  return list;
}

/* 第一次開啟（seen 全空）：不補播舊的，直接記成看過 */
export function ensureSeenInitialized() {
  const s = summary(), seen = v4().seen;
  if (seen.level === null) seen.level = s.level.lv;
  if (seen.perfectDay === null && s.perfectDays.length && !s.today.perfect) seen.perfectDay = s.perfectDays[s.perfectDays.length - 1];
  if (seen.perfectWeek === null && s.perfectWeeks.length && !s.week.perfect) seen.perfectWeek = s.perfectWeeks[s.perfectWeeks.length - 1];
  /* 搬舊資料進來時已解鎖的成就一次記成看過（不補播一整串） */
  if ((!seen.achievements || !seen.achievements.length) && seen.level !== null && Object.keys(s.achievements.unlocked).length && v4().gym.sessions.some((x) => x && x.legacy)) seen.achievements = Object.keys(s.achievements.unlocked);
}

export function queueCelebrations() {
  if (open) return;
  if (activeScreen() !== 's-home') return;
  if (toastVisible()) { onToastHidden(queueCelebrations); return; }
  const list = due();
  if (!list.length) return;
  show(list[0]);
}

function show(item) {
  open = item;
  const el = $('cele');
  el.innerHTML = `<div class="box" role="dialog" aria-modal="true" aria-labelledby="cele-t"><div class="em" aria-hidden="true">${item.em}</div><h2 id="cele-t">${esc(item.title)}</h2>${item.xp ? `<span class="xp num">+${item.xp} XP</span><br>` : ''}<p>${esc(item.text)}</p><button type="button" class="btn" id="cele-ok">繼續</button></div>`;
  el.hidden = false;
  $('cele-ok').onclick = async () => { item.mark(); await commit(); close(); queueCelebrations(); };
  $('cele-ok').focus();
  if (!reduced()) confetti();
}
function close() { $('cele').hidden = true; $('cele').innerHTML = ''; open = null; }

/* Canvas 彩帶：只畫 1.4 秒；小畫面也不超過 120 片 */
export function confetti(ms = 1400) {
  const c = $('confetti');
  if (!c || typeof c.getContext !== 'function') return;
  const ctx = c.getContext('2d');
  if (!ctx) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = innerWidth * dpr; c.height = innerHeight * dpr; c.hidden = false;
  ctx.scale(dpr, dpr);
  const colors = ['#F97316', '#14B8A6', '#8B5CF6', '#F59E0B', '#2563EB', '#FFFFFF'];
  const P = Array.from({ length: 120 }, () => ({ x: Math.random() * innerWidth, y: -20 - Math.random() * innerHeight * .4, vx: (Math.random() - .5) * 2.2, vy: 2.5 + Math.random() * 3.5, s: 5 + Math.random() * 6, r: Math.random() * Math.PI, vr: (Math.random() - .5) * .3, col: colors[(Math.random() * colors.length) | 0] }));
  const t0 = performance.now();
  function frame(t) {
    const k = (t - t0) / ms;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.globalAlpha = k > .75 ? Math.max(0, 1 - (k - .75) / .25) : 1;
    for (const p of P) { p.x += p.vx; p.y += p.vy; p.r += p.vr; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.col; ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * .6); ctx.restore(); }
    if (k < 1) requestAnimationFrame(frame); else { ctx.clearRect(0, 0, innerWidth, innerHeight); c.hidden = true; }
  }
  requestAnimationFrame(frame);
}
