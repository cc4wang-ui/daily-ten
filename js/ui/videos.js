/* Daily Ten — 示範 Short 的顯示：縮圖＋外部連結（新分頁開 YouTube；iOS 會跳 YouTube App）。
   不內嵌 iframe（離線與排版都不穩）；沒網路時縮圖載不到就顯示色塊，文字口令仍在。
   data/videos.json 由研究節點產生：每筆 {id, youtubeId, title, views}。 */
import { esc } from './dom.js';
import { icon } from './icons.js';

export const SHORTS_BASE = 'https://www.youtube.com/shorts/';
export const THUMB_BASE = 'https://i.ytimg.com/vi/';

export function videoFor(videos, id) {
  const it = (videos && Array.isArray(videos.items) ? videos.items : []).find((v) => v.id === id);
  return it && typeof it.youtubeId === 'string' && it.youtubeId ? it : null;
}
export function fmtViews(n) {
  if (!Number.isFinite(n)) return '';
  if (n >= 1e8) return `${(n / 1e8).toFixed(1)} 億`;
  if (n >= 1e4) return `${Math.round(n / 1e4)} 萬`;
  return String(n);
}
export function thumbHtml(video, { cls = 'thumb', label = '看示範' } = {}) {
  if (!video) return `<span class="${cls}" aria-hidden="true"></span>`;
  return `<a class="${cls}" href="${SHORTS_BASE}${esc(video.youtubeId)}" target="_blank" rel="noopener" aria-label="${esc(label)}：${esc(video.title || '')}"><img src="${THUMB_BASE}${esc(video.youtubeId)}/hqdefault.jpg" alt="" loading="lazy"><span class="play">${icon('play')}</span></a>`;
}
export function linkHtml(video, label = '看示範 Short') {
  if (!video) return '';
  return `<a class="video-link" href="${SHORTS_BASE}${esc(video.youtubeId)}" target="_blank" rel="noopener">${icon('play', { size: 16 })}${esc(label)}${Number.isFinite(video.views) ? ` <span class="muted">· ${esc(fmtViews(video.views))} 次觀看</span>` : ''}</a>`;
}
