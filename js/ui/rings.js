/* Daily Ten — 今日三環（原生 SVG，不用圖表庫）。只負責畫，不讀 state、不算規則。
   輸入（畫面層的形狀，由 home.js 從 engine 的 todaySummary 轉來）：
     { move:{xp,max}, sleep:{xp,max},
       explore:{locked:true, unlock:{have,need}} | {locked:false, xp, max},
       level:{lv, xpInto, xpNeed} | null }
   外圈動、中圈眠、內圈探；未解鎖的支柱畫虛線環＋鎖頭（不隱藏），解鎖進度寫在圖例。
   動態（CLAUDE.md §2.9 優先於 §7 的「環形填充」）：弧長直接畫好，只用 rotate＋opacity 從起點掃入（600ms）；
   prefers-reduced-motion 改淡入；訓練畫面蓋上來時暫停（app.css）。
   只有「數值和上次看到的不同」才掃入：畫的時候今日不在前景（例如在早安打卡畫面寫入後重畫）就先不記，
   回到今日時才播，使用者看得到環長出來。 */
import { icon } from './icons.js';

const C = 120;            // 圓心（viewBox 240×240）
const SW = 17;            // 環寬
const RADIUS = { move: 106, sleep: 84, explore: 62 };
const NAME = { move: '動', sleep: '眠', explore: '探' };
const SUB = { move: '訓練', sleep: '睡眠', explore: '探索' };

const seen = {}; // 上次在前景畫的比例（支柱 → 0..1；未解鎖記 'locked'）

const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clamp01 = (n) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
const num = (n) => (Number.isFinite(n) ? Math.round(n) : 0);
export const fracOf = (p) => (p && p.max > 0 ? clamp01(p.xp / p.max) : 0);

function arc(key, frac, sweep) {
  const r = RADIUS[key];
  const len = 2 * Math.PI * r;
  let out = `<circle class="ring-track ${key}" cx="${C}" cy="${C}" r="${r}" fill="none" stroke-width="${SW}"/>`;
  if (frac > 0) {
    out += `<g class="ring-arc${sweep ? ' sweep' : ''}" style="--sweep:${(-360 * frac).toFixed(1)}deg">`
      + `<circle class="arc ${key}" cx="${C}" cy="${C}" r="${r}" fill="none" stroke-width="${SW}" stroke-linecap="round"`
      + ` stroke-dasharray="${(len * frac).toFixed(2)} ${len.toFixed(2)}" transform="rotate(-90 ${C} ${C})"/></g>`;
  }
  return out;
}

function lockedRing(key) {
  const r = RADIUS[key];
  return `<circle class="ring-lock" cx="${C}" cy="${C}" r="${r}" fill="none" stroke-width="2" stroke-dasharray="5 6"/>`
    + `<g class="lock-badge" transform="translate(${C} ${C - r})"><circle r="12"/>`
    + `<g transform="translate(-7.2 -7.2) scale(.6)"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></g></g>`;
}

/* 給 aria-label 的一句話：數值一定用文字表達，不單靠顏色 */
export function ringsLabel(d) {
  const part = (key) => {
    const p = d[key];
    if (key === 'explore' && (!p || p.locked)) {
      const u = (p && p.unlock) || {};
      return Number.isFinite(u.need) ? `探 未解鎖，進度 ${num(u.have)} / ${num(u.need)}` : '探 未解鎖';
    }
    return `${NAME[key]} ${num(p && p.xp)} / ${num(p && p.max)} XP`;
  };
  const lv = d.level && Number.isFinite(d.level.lv)
    ? `；等級 Lv ${num(d.level.lv)}，本級 ${num(d.level.xpInto)} / ${num(d.level.xpNeed)} XP` : '';
  return `今日進度：${part('move')}、${part('sleep')}、${part('explore')}${lv}`;
}

/* host 內畫 SVG＋中央等級。visible：今日是否在前景（決定要不要掃入、要不要記成「看過」） */
export function renderRings(host, d, { visible = true } = {}) {
  let svg = '';
  for (const key of ['move', 'sleep', 'explore']) {
    const p = d[key];
    if (key === 'explore' && (!p || p.locked)) {
      svg += lockedRing(key);
      if (visible) seen[key] = 'locked';
      continue;
    }
    const f = fracOf(p);
    const sweep = visible && seen[key] !== f && f > 0;
    if (visible) seen[key] = f;
    svg += arc(key, f, sweep);
  }
  const lv = d.level && Number.isFinite(d.level.lv) ? d.level : null;
  host.setAttribute('aria-label', ringsLabel(d));
  host.innerHTML = `<svg class="rings-svg" viewBox="0 0 240 240" aria-hidden="true" focusable="false">${svg}</svg>`
    + (lv ? `<div class="rings-center" aria-hidden="true"><span class="lv num"><small>Lv</small>${num(lv.lv)}</span>`
      + `<span class="lv-xp num">${num(lv.xpInto)} / ${num(lv.xpNeed)} XP</span></div>` : '');
}

/* 圖例：三顆按鈕（動 → 訓練分頁；眠、探 → 早安打卡），≥44px */
export function legendMarkup(d) {
  const item = (key, go, valueHtml) => `<button type="button" class="lg-item" data-go="${go}">`
    + `<span class="dot ${key}" aria-hidden="true"></span><span class="lg-text">`
    + `<span class="lg-name ${key}">${NAME[key]} <span>${SUB[key]}</span></span>${valueHtml}</span></button>`;
  const val = (p) => `<span class="lg-val num">${num(p && p.xp)}<small> / ${num(p && p.max)}</small></span>`;
  const ex = d.explore;
  let exVal;
  if (!ex || ex.locked) {
    const u = (ex && ex.unlock) || {};
    const prog = Number.isFinite(u.need) ? ` ${num(u.have)}/${num(u.need)}` : '';
    /* engine 的短文案（解鎖 7/10、條件達成後「下一版開放」）優先 */
    const short = typeof u.short === 'string' && u.short.trim() ? esc(u.short.trim()) : `解鎖${prog}`;
    exVal = `<span class="lg-lock">${icon('lock', { size: 13 })}${short}</span>`;
  } else exVal = val(ex);
  return item('move', 's-train', val(d.move)) + item('sleep', 's-checkin', val(d.sleep)) + item('explore', 's-checkin', exVal);
}
