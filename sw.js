/* Daily Ten — Service Worker (cache-first, offline-capable)
   改版時把 CACHE 版本號 +1；新增檔案要加進 ASSETS（CI 的 check-repo 會檢查）。舊 cache 會在 activate 時自動清掉。
   自動更新（D23）：新版啟用後通知每個開著的頁面。新版頁面回覆 DT_UPDATE_ACK，等閒置（不在訓練中）時自己重新載入；
   舊版頁面不認得通知，3 秒後由這裡直接重新導向同一網址，讓舊程式也能換成新版（瀏覽器不支援時就等下次開啟）。 */
'use strict';
const CACHE = 'daily-ten-v11';
const ACK_TIMEOUT_MS = 3000;
const ASSETS = [
  './',
  './index.html',
  './css/tokens.css',
  './css/app.css',
  './js/app.js',
  './js/ui/aft.js',
  './js/ui/audio.js',
  './js/ui/backup.js',
  './js/ui/body.js',
  './js/ui/boss.js',
  './js/ui/celebrate.js',
  './js/ui/checkin.js',
  './js/ui/content.js',
  './js/ui/dates.js',
  './js/ui/demo.js',
  './js/ui/dom.js',
  './js/ui/game.js',
  './js/ui/history.js',
  './js/ui/home.js',
  './js/ui/icons.js',
  './js/ui/nav.js',
  './js/ui/relocate.js',
  './js/ui/program.js',
  './js/ui/rings.js',
  './js/ui/session.js',
  './js/ui/setup.js',
  './js/ui/stats.js',
  './js/ui/toast.js',
  './js/ui/train.js',
  './js/ui/trainhub.js',
  './js/ui/update.js',
  './js/ui/wakelock.js',
  './js/state/store.js',
  './js/state/schema.js',
  './js/state/migrate.js',
  './js/state/backup.js',
  './js/state/habits.js',
  './js/state/game.js',
  './js/state/time.js',
  './js/game/rules.js',
  './js/game/day.js',
  './js/game/engine.js',
  './js/game/timeline.js',
  './js/habits/move.js',
  './js/habits/sleep.js',
  './js/habits/deload.js',
  './data/game.json',
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

/* 通知一個頁面「新版已就緒」：新版頁面回 ACK 自己處理；舊版頁面沒回應就直接重新導向 */
function announce(client) {
  return new Promise((resolve) => {
    let acked = false;
    try {
      const ch = new MessageChannel();
      ch.port1.onmessage = (ev) => {
        if (ev.data && ev.data.type === 'DT_UPDATE_ACK') { acked = true; resolve(); }
      };
      client.postMessage({ type: 'DT_UPDATE_READY', version: CACHE }, [ch.port2]);
    } catch (err) { /* 不支援 MessageChannel：當作舊版頁面處理 */ }
    setTimeout(() => {
      if (acked) return;
      // 不 await：導覽請求要等 activate 結束才會送出，等待會互相卡住
      try { if (typeof client.navigate === 'function') client.navigate(client.url).catch(() => {}); } catch (err) {}
      resolve();
    }, ACK_TIMEOUT_MS);
  });
}

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    const old = keys.filter((k) => k.startsWith('daily-ten-v') && k !== CACHE);
    await Promise.all(old.map((k) => caches.delete(k)));
    await self.clients.claim();
    if (!old.length) return; // 第一次安裝：頁面本來就是最新版，不用重新載入
    const clients = await self.clients.matchAll({ type: 'window' });
    await Promise.all(clients.map(announce));
  })());
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
