const CACHE_NAME = 'siroi-pwa-v1';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/images/flower_logo.png',
  '/images/flower_bottom_left.png',
  '/images/flower_bottom_right.png',
  '/images/flower_top_right.png',
  '/images/siroi-bg.jpg',
];

// 1. Install: Precache core shell assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// 2. Activate: Clean up older cache stores
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

// 3. Fetch: Offline-first caching strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET requests
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Exclude external API requests (Supabase, SSE streams, ML server)
  if (
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/sync') ||
    url.pathname.startsWith('/api/ml') ||
    url.pathname.includes('supabase.co')
  ) {
    return;
  }

  // A. Navigation requests (HTML pages / routes like /caregiver, /elderly/home)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        const cachedIndex = await cache.match('/index.html');
        return cachedIndex || (await cache.match('/'));
      })
    );
    return;
  }

  // B. Static assets (JS, CSS, images, fonts)
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch fresh copy in the background (Stale-While-Revalidate)
        fetch(request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(request, networkResponse);
              });
            }
          })
          .catch(() => {
            // Offline - ignore background refresh failure
          });
        return cachedResponse;
      }

      // Not in cache yet, fetch from network and cache
      return fetch(request)
        .then((networkResponse) => {
          if (
            !networkResponse ||
            networkResponse.status !== 200 ||
            networkResponse.type !== 'basic'
          ) {
            return networkResponse;
          }

          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });

          return networkResponse;
        })
        .catch(() => {
          // If image fails offline, could return fallback placeholder if needed
          return new Response('Offline asset unavailable', { status: 503 });
        });
    })
  );
});
