import { OFFLINE_STATIC_ASSETS } from "../shared/gameAssets";

const OFFLINE_CACHE_NAME = "pounce-offline-v14";
const OFFLINE_PAGES = ["/", "/offline"];
const STATIC_ASSETS = OFFLINE_STATIC_ASSETS;

export async function cacheOfflineAssets() {
  if (!("caches" in window)) {
    return;
  }
  const cache = await caches.open(OFFLINE_CACHE_NAME);
  const urls = new Set<string>([...OFFLINE_PAGES, ...STATIC_ASSETS]);

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
        console.warn("Unable to cache offline page", page, error);
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
        console.warn("Unable to cache offline asset", url, error);
      }
    })
  );
}

export async function isOfflineCacheReady() {
  if (!("caches" in window)) {
    return false;
  }

  try {
    if (!(await caches.has(OFFLINE_CACHE_NAME))) {
      return false;
    }

    const cache = await caches.open(OFFLINE_CACHE_NAME);
    const urls = new Set<string>([...OFFLINE_PAGES, ...STATIC_ASSETS]);

    for (const page of OFFLINE_PAGES) {
      const response = await cache.match(page);
      if (!response?.ok) {
        return false;
      }

      collectSameOriginAssets(await response.clone().text()).forEach((url) =>
        urls.add(url)
      );
    }

    const cachedResponses = await Promise.all(
      Array.from(urls).map((url) => cache.match(url))
    );
    return cachedResponses.every((response) => response != null);
  } catch (error) {
    console.warn("Unable to inspect offline cache", error);
    return false;
  }
}

function collectSameOriginAssets(html: string): string[] {
  const urls: string[] = [];
  const assetPattern = /(?:href|src)="([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = assetPattern.exec(html)) != null) {
    try {
      const url = new URL(match[1], window.location.origin);
      if (url.origin === window.location.origin) {
        urls.push(url.pathname + url.search);
      }
    } catch (error) {
      // Ignore malformed URLs in generated markup.
    }
  }
  return urls;
}
