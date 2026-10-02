/* Daily Ten — Service Worker (cache-first, offline-capable)
   改版時把 CACHE 版本號 +1；新增檔案要加進 ASSETS（CI 的 check-repo 會檢查）。舊 cache 會在 activate 時自動清掉。 */
'use strict';
const CACHE = 'daily-ten-v6';
const ASSETS = [
  './',
  './index.html',
  './css/tokens.css',
  './css/app.css',
  './js/app.js',
  './js/ui/audio.js',
  './js/ui/backup.js',
  './js/ui/body.js',
  './js/ui/boss.js',
  './js/ui/content.js',
  './js/ui/dates.js',
  './js/ui/demo.js',
  './js/ui/dom.js',
  './js/ui/history.js',
  './js/ui/home.js',
  './js/ui/program.js',
  './js/ui/session.js',
  './js/ui/setup.js',
  './js/ui/train.js',
  './js/ui/wakelock.js',
  './js/state/store.js',
  './js/state/schema.js',
  './js/state/migrate.js',
  './js/state/backup.js',
  './js/state/time.js',
  './demos.js',
  './mockup.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (e) => {
  // cache:'reload' 繞過瀏覽器 HTTP 快取，避免新版 index.html 配到舊版 module（拆成多檔後版本必須一致）
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('daily-ten-v') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((res) => {
          // 順手把新抓到的同源資源存起來，之後也能離線
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => {
          // 離線且沒 cache：導覽請求一律回 index.html（SPA fallback）
          if (req.mode === 'navigate') return caches.match('./index.html');
        });
    })
  );
});
