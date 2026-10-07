/* Daily Ten — 內嵌 SVG 圖示（24×24、線條、currentColor）。純字串，不連網、不引入圖示庫。
   圖示一律 aria-hidden：意思由旁邊的文字或按鈕的 aria-label 表達（ui-engineer 規則 7）。 */
const P = {
  flame: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5 1-8.5z"/>',
  gear: '<path d="M10.14 5.05L10.5 2.52h3l.36 2.53 1.74.71 2.04-1.53 2.13 2.13-1.53 2.04.71 1.74 2.53.36v3l-2.53.36-.71 1.74 1.53 2.04-2.13 2.13-2.04-1.53-1.74.71-.36 2.53h-3l-.36-2.53-1.74-.71-2.04 1.53-2.13-2.13 1.53-2.04-.71-1.74-2.53-.36v-3l2.53-.36.71-1.74-1.53-2.04 2.13-2.13 2.04 1.53z"/><circle cx="12" cy="12" r="3"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  play: '<path d="M8 5.5v13l10-6.5z" fill="currentColor"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  undo: '<path d="M9 7L4 12l5 5M4 12h11a5 5 0 0 1 0 10h-2"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4.5a3 3 0 0 0 3.5 4M16 6h3.5a3 3 0 0 1-3.5 4M12 13v4M8 20h8"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  stopwatch: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M10 2.5h4"/>',
  rain: '<path d="M7 15a4 4 0 0 1-.6-7.95A5.5 5.5 0 0 1 17 8a3.5 3.5 0 0 1 .5 7z"/><path d="M9 18l-1 2.5M13 18l-1 2.5M17 18l-1 2.5"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  back: '<path d="M15 6l-6 6 6 6"/>',
  external: '<path d="M7 17L17 7M9 7h8v8"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M5 20h14"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  snow: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/>',
  badge: '<circle cx="12" cy="9" r="6"/><path d="M8.5 13.9L7 22l5-3 5 3-1.5-8.1"/>',
  spark: '<path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z"/>'
};

/* icon('sun', {size:18, cls:'x'}) → '<svg …>'；名稱不存在時回空的 svg（不丟錯） */
export function icon(name, { size = 20, cls = '' } = {}) {
  return `<svg class="ic${cls ? ` ${cls}` : ''}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor"`
    + ` stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${P[name] || ''}</svg>`;
}
