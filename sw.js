/* Daily Ten — Service Worker (cache-first, offline-capable)
   改版時只需把 CACHE 版本號 +1，舊 cache 會在 activate 時自動清掉。 */
'use strict';
const CACHE = 'daily-ten-v3';
const ASSETS = [
  './',
  './index.html',
  './mockup.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
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
