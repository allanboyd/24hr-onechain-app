// BTW Office service worker (generated into dist/sw.js by the `pwa` plugin in vite.config.ts; do not copy by hand).
// Makes the office web app installable and quick to open. It never caches the API (/v1): the office always sees
// live numbers, and when offline the app says so instead of showing old figures (docs/23 §6).
const VERSION = '__VERSION__';
const SHELL = `btw-office-shell-${VERSION}`;
const RUNTIME = 'btw-office-runtime';
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE.map((p) => new Request(p, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('btw-office-shell-') && k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req);
    if (hit) return hit;
    throw err;
  }
}
async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type === 'basic') (await caches.open(RUNTIME)).put(req, res.clone());
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/v1/') || url.pathname === '/health') return; // live data: straight to the network
  if (url.pathname.startsWith('/app/')) return; // the phone app has its own worker and scope
  if (req.mode === 'navigate') {
    e.respondWith(networkFirst(req, SHELL).catch(() => caches.match('/').then((r) => r || caches.match('/index.html'))));
    return;
  }
  // hashed build files never change: cache first; anything else (report, images, brand files): fresh when online
  if (url.pathname.startsWith('/assets/')) { e.respondWith(cacheFirst(req)); return; }
  e.respondWith(networkFirst(req, RUNTIME));
});
