// Poker Tracker service worker — install-time only.
//
// What it does TODAY:
//   * Registers + activates so Add-to-Home-Screen flows treat the app as
//     a real PWA on iOS / Android.
//   * Pre-caches the offline shell (`/offline`) so a flaky game-night
//     connection doesn't dump you onto Chrome's dino page.
//   * Caches the manifest + favicon — tiny, but lets first-paint after
//     install survive a brief outage.
//
// What it does NOT do yet:
//   * Cache all routes (Next.js dynamic routes + RSC payloads are tricky
//     to cache safely; we'd rather miss-and-fetch than serve a stale
//     pre-game screen). Add per-route caching as the app matures.
//   * Handle push notifications — that's a separate phase that needs
//     VAPID keys and a subscription store. The `push` listener below is
//     a stub that we'll fill in when push is configured.

const CACHE_VERSION = "poker-tracker-v1";
const PRECACHE_URLS = ["/manifest.webmanifest", "/favicon.ico"];

self.addEventListener("install", (event) => {
  // Take over immediately on first install so subsequent navigations are
  // already controlled by this worker.
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .catch(() => {
        // Pre-cache is best-effort; missing assets shouldn't block install.
      }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Drop stale caches from older versions so we don't accumulate
  // megabytes of dead assets after every deploy.
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_VERSION)
          .map((k) => caches.delete(k)),
      ),
    ),
  );
  self.clients.claim();
});

// Network-first for HTML / navigation; cache-first for the precached
// shell assets. We intentionally DON'T cache app routes — see the header.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  // Try to serve precached assets straight from cache when available.
  const url = new URL(req.url);
  if (PRECACHE_URLS.includes(url.pathname)) {
    event.respondWith(
      caches.match(req).then((hit) => hit ?? fetch(req)),
    );
    return;
  }
});

// Push stub — when VAPID + subscription store land, this will dispatch
// notification clicks to the right route.
self.addEventListener("push", (event) => {
  if (!event.data) return;
  try {
    const payload = event.data.json();
    const title = payload.title ?? "Poker Tracker";
    const body = payload.body ?? "";
    const url = payload.url ?? "/";
    event.waitUntil(
      self.registration.showNotification(title, {
        body,
        icon: "/favicon.ico",
        data: { url },
      }),
    );
  } catch {
    // Malformed payload — silently drop rather than crash the worker.
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url ?? "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((wins) => {
      const existing = wins.find((w) => w.url.includes(self.location.origin));
      if (existing) {
        existing.navigate(target);
        return existing.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
