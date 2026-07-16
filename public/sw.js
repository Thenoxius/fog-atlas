// Fog Atlas service worker — makes the "works offline" promise real.
//
// Strategy: navigations (the app shell) are network-first with a cache
// fallback, so a fresh deploy is picked up on the next online load and no
// "new version available" prompt is needed. Everything else same-origin is
// cache-first: Vite assets are content-hashed and immutable, and fonts /
// collection maps simply accumulate for offline sessions.

const CACHE = 'fog-atlas-v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith('fog-atlas-') && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          const cache = await caches.open(CACHE);
          cache.put(req, fresh.clone());
          return fresh;
        } catch {
          // Offline: any cached copy of the shell will do — the DM and
          // player windows only differ by query string.
          const cached = await caches.match(req, { ignoreSearch: true });
          return cached ?? Response.error();
        }
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res.ok) {
        const cache = await caches.open(CACHE);
        cache.put(req, res.clone());
      }
      return res;
    })()
  );
});
