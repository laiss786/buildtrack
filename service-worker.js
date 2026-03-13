// service-worker.js — BuildTrack PWA v3
// v3: JS files are never cached (always fresh) to prevent stale auth/data bugs

const CACHE_NAME = 'buildtrack-v3';

// Only cache truly static assets (CSS, fonts, HTML shells)
// JS files are intentionally excluded — they must always be fresh
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/login.html',
  '/register.html',
  '/dashboard.html',
  '/css/style.css',
  '/css/dashboard.css',
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap',
];

// ── Install ────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(
        STATIC_ASSETS.map(url =>
          cache.add(url).catch(() => console.warn('[SW] Failed to cache:', url))
        )
      )
    )
  );
  self.skipWaiting();
});

// ── Activate: delete ALL old caches ───────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch strategy ─────────────────────────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // 1. Always network for Firebase
  if (
    url.hostname.includes('firebase') ||
    url.hostname.includes('firestore') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('gstatic') ||
    url.hostname.includes('firebaseapp') ||
    url.hostname.includes('firebasestorage')
  ) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 2. Always network for JS files — never serve stale JS
  if (url.pathname.endsWith('.js')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // 3. Cache-first for everything else (CSS, HTML, images)
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok && event.request.method === 'GET') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        if (event.request.destination === 'document') {
          return caches.match('/login.html');
        }
      });
    })
  );
});

// ── Push Notifications ─────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  const data = event.data.json();
  self.registration.showNotification(data.title || 'BuildTrack', {
    body: data.body || '',
    icon: '/icons/maskable_icon_x192.png',
    badge: '/icons/maskable_icon_x72.png',
  });
});
