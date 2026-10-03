/* Service worker — Action bla ghla
   - coque de l'app (HTML/JS/CSS) : réseau d'abord, cache en secours (toujours à jour après un déploiement)
   - images, icônes, polices : cache d'abord, rafraîchi en arrière-plan
   - /api : jamais mis en cache (données privées, session) */
const VERSION = "v1";
const SHELL_CACHE = `abg-shell-${VERSION}`;
const ASSET_CACHE = `abg-assets-${VERSION}`;
const MAX_ASSETS = 120;
const SHELL_URLS = ["/offline.html", "/styles.css", "/modern.css", "/app.js", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("abg-") && key !== SHELL_CACHE && key !== ASSET_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - maxEntries)).map((key) => cache.delete(key)));
}

async function networkFirst(request, cacheName, timeoutMs = 4000) {
  const cache = await caches.open(cacheName);
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), timeoutMs)),
    ]);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    throw error;
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const refresh = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone()).then(() => trimCache(cacheName, MAX_ASSETS));
      }
      return response;
    })
    .catch(() => cached);
  return cached || refresh;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") {
    return;
  }

  const sameOrigin = url.origin === self.location.origin;
  const isFont = url.origin === "https://fonts.googleapis.com" || url.origin === "https://fonts.gstatic.com";

  if (!sameOrigin && !isFont) {
    return;
  }

  if (sameOrigin && (url.pathname.startsWith("/api/") || url.pathname === "/sw.js")) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      networkFirst(request, SHELL_CACHE).catch(() => caches.match("/offline.html")),
    );
    return;
  }

  if (isFont || /\.(png|jpe?g|webp|svg|gif|ico|woff2?)$/i.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, ASSET_CACHE));
    return;
  }

  if (/\.(js|css|webmanifest)$/i.test(url.pathname)) {
    event.respondWith(networkFirst(request, SHELL_CACHE));
  }
});
