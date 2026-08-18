/*
  MyX service worker — hand-rolled, no build step, no Workbox.

  The one rule that matters here: this app's data is private and lives behind a
  bearer token on a *different* origin (the Worker API). Caching any of it would
  leave personal finances sitting in the browser cache after logout, so the
  fetch handler only ever touches same-origin GETs plus the Google Fonts CDN.
  Everything else — every /api/* call, every POST — falls straight through to
  the network untouched.

  Bump CACHE to force every client to drop its old entries on the next visit.
*/
const CACHE = "myx-v1";

// The offline shell. Vite fingerprints the JS/CSS, so those are picked up at
// runtime instead — hashed filenames are immutable and safe to cache forever.
const SHELL = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"];

const FONT_ORIGINS = ["https://fonts.googleapis.com", "https://fonts.gstatic.com"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // Individually, so one failed URL can't sink the whole install.
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Cache-first, used for immutable hashed assets and fonts. */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === "opaque") {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

/**
 * Network-first for navigations, so a deployed update is picked up immediately
 * and only a genuinely offline load falls back to the cached shell. The SPA
 * router then renders whichever route was requested.
 */
async function navigationHandler(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE);
      await cache.put("/", response.clone());
    }
    return response;
  } catch {
    return (await caches.match("/")) ?? Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  // Private API traffic is cross-origin and must never be intercepted.
  if (!sameOrigin && !FONT_ORIGINS.includes(url.origin)) return;
  if (sameOrigin && url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(navigationHandler(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});

// Lets the page tell a waiting worker to take over right away.
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
