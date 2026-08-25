/*
  MyX service worker — hand-rolled, no build step, no Workbox.

  The one rule that matters here: this app's data is private and lives behind a
  bearer token on a *different* origin (the Worker API). Caching any of it would
  leave personal finances sitting in the browser cache after logout, so the
  fetch handler only ever touches same-origin GETs plus the Google Fonts CDN.
  Everything else — every /api/* call, every POST — falls straight through to
  the network untouched.

  CACHE carries a build id stamped in by vite.config.ts. That is load-bearing in
  two ways, and both were broken while it was the hardcoded "myx-v1" it started
  as: the activate handler below can only drop stale entries when the name it
  compares against actually changes, and — the expensive one — a browser only
  installs a new worker when this file's *bytes* differ. Identical bytes every
  deploy meant `updatefound` never fired, so the whole update-and-reload path in
  src/lib/pwa.ts was dead code and clients kept running old JS against new
  assets until someone reloaded by hand.
*/
const CACHE = "myx-__BUILD_ID__";

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

/*
  Is this the SPA fallback wearing an asset's URL?

  Cloudflare Pages answers an unknown path with index.html and a 200, so a
  hashed asset that has not propagated yet — the ordinary state of things for a
  second or two during a deploy — comes back as HTML that looks perfectly
  cacheable. Storing it pins the app to a broken boot: cache-first then serves
  HTML where a module belongs, the entry graph fails, the app never runs, its
  registration code never runs, this worker never updates, and nothing clears
  the entry. A reload does not help.

  _redirects now makes /assets/* 404 properly, which stops it at the source.
  This stays because it is the layer that can also *heal* a client already
  holding a poisoned entry, and because the same trap applies to any future
  path the catch-all covers.
*/
function isSpaFallback(request, response) {
  if (request.destination === "document" || request.mode === "navigate") return false;
  const type = response.headers.get("content-type") || "";
  return type.includes("text/html");
}

/** Cache-first, used for immutable hashed assets and fonts. */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  // A cached entry is checked as well as a fresh one, so a client that already
  // stored the fallback repairs itself on the next load rather than staying
  // broken until someone clears site data by hand.
  if (cached && !isSpaFallback(request, cached)) return cached;
  if (cached) await (await caches.open(CACHE)).delete(request);

  const response = await fetch(request);
  if ((response.ok || response.type === "opaque") && !isSpaFallback(request, response)) {
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
