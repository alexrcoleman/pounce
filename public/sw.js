const CACHE_NAME = "pounce-offline-v8";
const GAME_ASSET_MANIFEST_URL = "/game-assets.json";
const OFFLINE_PAGES = ["/", "/offline"];
const APP_SHELL = [...OFFLINE_PAGES, GAME_ASSET_MANIFEST_URL];

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
    url.pathname === GAME_ASSET_MANIFEST_URL ||
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
  const gameAssetUrls = await fetchGameAssetUrls(cache);
  gameAssetUrls.forEach((url) => urls.add(url));

  await Promise.all(
    OFFLINE_PAGES.map(async (page) => {
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

async function fetchGameAssetUrls(cache) {
  try {
    const response = await fetch(GAME_ASSET_MANIFEST_URL, { cache: "reload" });
    if (!response.ok) {
      return [];
    }

    await cache.put(GAME_ASSET_MANIFEST_URL, response.clone());
    return getGameAssetUrls(await response.json());
  } catch (error) {
    console.warn("Unable to cache game asset manifest", error);
    return [];
  }
}

function getGameAssetUrls(manifest) {
  manifest = manifest || {};
  const urls = [];
  if (Array.isArray(manifest.offline)) {
    manifest.offline.forEach((url) => {
      if (typeof url === "string") {
        urls.push(url);
      }
    });
  }

  if (Array.isArray(manifest.preload)) {
    manifest.preload.forEach((asset) => {
      if (asset && typeof asset.href === "string") {
        urls.push(asset.href);
      }
    });
  }

  const faceCards = manifest.faceCards || {};
  ["red", "black"].forEach((color) => {
    ["jack", "queen", "king"].forEach((rank) => {
      const href = faceCards[color] && faceCards[color][rank];
      if (typeof href === "string") {
        urls.push(href);
      }
    });
  });

  return urls;
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
