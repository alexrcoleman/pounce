const CACHE_NAME = "pounce-offline-v7";
const APP_SHELL = [
  "/",
  "/offline",
  "/manifest.webmanifest",
  "/favicon.png",
  "/pwa-icon-192.png",
  "/pwa-icon-512.png",
  "/apple-touch-icon.png",
  "/card-back.png",
  "/card-faces/jack-red.webp",
  "/card-faces/queen-red.webp",
  "/card-faces/king-red.webp",
  "/card-faces/jack-black.webp",
  "/card-faces/queen-black.webp",
  "/card-faces/king-black.webp",
  "/notebook.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(cacheAppShell());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, "/offline"));
    return;
  }

  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname === "/manifest.webmanifest" ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".webp")
  ) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(networkFirst(request));
});

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }
  const response = await fetch(request);
  if (response.ok) {
    cache.put(request, response.clone());
  }
  return response;
}

async function cacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  const urls = new Set(APP_SHELL);

  await Promise.all(
    ["/", "/offline"].map(async (page) => {
      try {
        const response = await fetch(page, { cache: "reload" });
        if (response.ok) {
          await cache.put(page, response.clone());
          collectSameOriginAssets(await response.text()).forEach((url) =>
            urls.add(url)
          );
        }
      } catch (error) {
        console.warn("Unable to cache app shell page", page, error);
      }
    })
  );

  await Promise.all(
    Array.from(urls).map(async (url) => {
      try {
        const response = await fetch(url, { cache: "reload" });
        if (response.ok) {
          await cache.put(url, response);
        }
      } catch (error) {
        console.warn("Unable to cache app shell asset", url, error);
      }
    })
  );
}

function collectSameOriginAssets(html) {
  const urls = [];
  const assetPattern = /(?:href|src)="([^"]+)"/g;
  let match;
  while ((match = assetPattern.exec(html)) != null) {
    try {
      const url = new URL(match[1], self.location.origin);
      if (url.origin === self.location.origin) {
        urls.push(url.pathname + url.search);
      }
    } catch (error) {
      // Ignore malformed URLs in generated markup.
    }
  }
  return urls;
}

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }
    if (fallbackUrl) {
      const fallback = await cache.match(fallbackUrl);
      if (fallback) {
        return fallback;
      }
    }
    return cache.match("/");
  }
}
