/* Daily Ten — 內嵌 SVG 圖示（24×24、線條、currentColor）。純字串，不連網、不引入圖示庫。圖示一律 aria-hidden。 */
const P = {
  flame: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-1-5 1-8.5z"/>',
  gear: '<path d="M10.14 5.05L10.5 2.52h3l.36 2.53 1.74.71 2.04-1.53 2.13 2.13-1.53 2.04.71 1.74 2.53.36v3l-2.53.36-.71 1.74 1.53 2.04-2.13 2.13-2.04-1.53-1.74.71-.36 2.53h-3l-.36-2.53-1.74-.71-2.04 1.53-2.13-2.13 1.53-2.04-.71-1.74-2.53-.36v-3l2.53-.36.71-1.74-1.53-2.04 2.13-2.13 2.04 1.53z"/><circle cx="12" cy="12" r="3"/>',
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  gym: '<path d="M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12"/><rect x="4" y="7" width="3" height="10" rx="1"/><rect x="17" y="7" width="3" height="10" rx="1"/>',
  stretch: '<circle cx="12" cy="4.5" r="2"/><path d="M12 7v6l-4 7M12 13l4 7M12 9l5-3M12 9L7 6"/>',
  explore: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  progress: '<path d="M4 19h16M7 16V9M12 16V5M17 16v-6"/>',
  play: '<path d="M8 5.5v13l10-6.5z" fill="currentColor" stroke="none"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  undo: '<path d="M9 7L4 12l5 5M4 12h11a5 5 0 0 1 0 10h-2"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  back: '<path d="M15 6l-6 6 6 6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  external: '<path d="M7 17L17 7M9 7h8v8"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4.5a3 3 0 0 0 3.5 4M16 6h3.5a3 3 0 0 1-3.5 4M12 13v4M8 20h8"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  snow: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/>',
  shuffle: '<path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  skip: '<path d="M5 5l9 7-9 7zM19 5v14"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  spark: '<path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>'
};
export function icon(name, { size = 24, cls = '' } = {}) {
  const d = P[name] || '';
  return `<svg class="ic${cls ? ' ' + cls : ''}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}</svg>`;
}
