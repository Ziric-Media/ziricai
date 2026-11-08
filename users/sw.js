/**
 * Sarah App PWA — precache shell; API always network.
 * Never cache /api/* or authenticated responses.
 */
const STATIC_CACHE = 'sarah-app-static-v19';

/** Shell only — large / lazy scripts are cached on first use via fetch handler. */
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/offline.html',
  '/css/design-system.css',
  '/css/icons.css',
  '/css/app.css',
  '/js/boot-inline.js',
  '/js/site-config.js',
  '/js/ziricai-config.js',
  '/js/icons.js',
  '/js/app.js',
  '/js/live-bridge.mjs',
  '/assets/favicon.png',
  '/assets/icon-192.png',
  '/assets/icon-512.png',
  '/assets/icon-maskable-512.png',
  '/assets/apple-touch-icon.png',
  '/assets/sarah-avatar.svg',
];

async function precacheResilient(cache, urls) {
  await Promise.all(
    urls.map(async (url) => {
      try {
        await cache.add(url);
      } catch (err) {
        console.warn('[Sarah SW] precache skipped', url, err);
      }
    })
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => precacheResilient(cache, PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith('sarah-app-static-') && k !== STATIC_CACHE).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

function sameOrigin(url) {
  return url.origin === self.location.origin;
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (!sameOrigin(url)) return;
  if (url.pathname.startsWith('/api/')) return;
  if (event.request.method !== 'GET') return;
  if (event.request.headers.get('Authorization')) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match('/offline.html').then((r) => r || caches.match('/index.html'))
      )
    );
    return;
  }

  const isStatic =
    url.pathname.startsWith('/css/') ||
    url.pathname.startsWith('/js/') ||
    url.pathname.startsWith('/assets/') ||
    event.request.destination === 'style' ||
    event.request.destination === 'script' ||
    event.request.destination === 'image' ||
    event.request.destination === 'font' ||
    event.request.destination === 'manifest';

  if (!isStatic) return;

  event.respondWith(
    caches.open(STATIC_CACHE).then(async (cache) => {
      const cached = await cache.match(event.request, { ignoreSearch: true });
      if (cached) return cached;
      try {
        const res = await fetch(event.request);
        if (res.ok) cache.put(event.request, res.clone());
        return res;
      } catch {
        return cached || new Response('', { status: 504, statusText: 'Offline' });
      }
    })
  );
});
