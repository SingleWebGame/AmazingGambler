const CACHE_NAME = "amazing-gambler-v3";
const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);

    const response = await cache.match("/");
    if (!response) return;
    const html = await response.text();
    const assets = new Set(
      [...html.matchAll(/(?:src|href)="([^"]*\/_next\/static\/[^"]+)"/g)]
        .map((match) => new URL(match[1], self.location.origin).href)
        .filter((url) => new URL(url).origin === self.location.origin),
    );
    await Promise.all([...assets].map(async (url) => {
      try {
        const asset = await fetch(url);
        if (asset.ok) await cache.put(url, asset);
      } catch {
        // The online shell still works; assets can be cached when requested later.
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.filter((name) => name.startsWith("amazing-gambler-") && name !== CACHE_NAME).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          await cache.put("/", response.clone());
        }
        return response;
      } catch {
        const offlinePage = await caches.match("/");
        if (offlinePage) return offlinePage;
        return new Response("You are offline. Reconnect to continue your adventure.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
    })());
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || APP_SHELL.includes(url.pathname)) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    })());
  }
});
