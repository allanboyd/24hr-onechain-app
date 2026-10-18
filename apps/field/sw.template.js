// BTW Team service worker (generated into dist/sw.js by the `pwa` plugin in vite.config.ts — do not copy by hand).
// App shell: index.html + entry JS/CSS + icons precached at install; other same-origin assets (lazy chunks,
// images) cached on first use. API calls (/v1/…): network first, last good GET answer when offline.
const VERSION = '__VERSION__';
const SHELL = `btw-shell-${VERSION}`;
const RUNTIME = 'btw-runtime';
const API = 'btw-api';
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE.map((p) => new Request(p, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('btw-shell-') && k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok && req.method === 'GET') cache.put(req, res.clone());
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
  if (req.method !== 'GET') return; // writes go straight to the network (the app keeps its own offline outbox)
  const url = new URL(req.url);
  if (url.pathname.includes('/v1/')) { e.respondWith(networkFirst(req, API)); return; }
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // The app is one page: fresh index.html when online, the cached shell when not.
    e.respondWith(networkFirst(req, SHELL).catch(() => caches.match(new URL('./', self.registration.scope).href).then((r) => r || caches.match('index.html'))));
    return;
  }
  if (url.href.startsWith(self.registration.scope)) e.respondWith(cacheFirst(req));
});
