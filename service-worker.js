// service-worker.js — BuildTrack PWA v4
// v4: Offline-first for app shell. JS always fresh. IndexedDB sync via offline-sync.js.

const CACHE_NAME = "buildtrack-v4";

const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/login.html",
  "/register.html",
  "/dashboard.html",
  "/css/style.css",
  "/css/dashboard.css",
  "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap",
];

// ── Install ───────────────────────────────────────────────────
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled(
        STATIC_ASSETS.map(url =>
          cache.add(url).catch(() => console.warn("[SW] Failed to cache:", url))
        )
      )
    )
  );
  self.skipWaiting();
});

// ── Activate: purge old caches ────────────────────────────────
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch strategy ────────────────────────────────────────────
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  // 1. Always network-only for Firebase / Google APIs
  if (
    url.hostname.includes("firebase") ||
    url.hostname.includes("firestore") ||
    url.hostname.includes("googleapis") ||
    url.hostname.includes("gstatic") ||
    url.hostname.includes("firebaseapp") ||
    url.hostname.includes("firebasestorage") ||
    url.hostname.includes("anthropic")  // AI API — never cache
  ) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // Return a helpful offline JSON response for API calls
        if (event.request.headers.get("content-type")?.includes("application/json")) {
          return new Response(
            JSON.stringify({ error: "offline", message: "You are offline. Data will sync when connected." }),
            { status: 503, headers: { "Content-Type": "application/json" } }
          );
        }
      })
    );
    return;
  }

  // 2. JS files — network first, fallback to cache (never serve very stale)
  if (url.pathname.endsWith(".js")) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          // Update cache with fresh copy
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 3. HTML pages — network first (so updates propagate), cache fallback
  if (event.request.destination === "document") {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(event.request) || caches.match("/login.html"))
    );
    return;
  }

  // 4. Everything else (CSS, images, fonts) — cache first, network fallback
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        if (res.ok && event.request.method === "GET") {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return res;
      }).catch(() => {
        if (event.request.destination === "document") {
          return caches.match("/login.html");
        }
      });
    })
  );
});

// ── Background Sync (for browsers that support it) ───────────
self.addEventListener("sync", event => {
  if (event.tag === "buildtrack-sync") {
    // Signal all clients to attempt sync
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(client =>
          client.postMessage({ type: "BACKGROUND_SYNC_TRIGGERED" })
        );
      })
    );
  }
});

// ── Push Notifications ────────────────────────────────────────
self.addEventListener("push", event => {
  if (!event.data) return;
  const data = event.data.json();
  self.registration.showNotification(data.title || "BuildTrack", {
    body:  data.body || "",
    icon:  "/icons/maskable_icon_x192.png",
    badge: "/icons/maskable_icon_x72.png",
  });
});
