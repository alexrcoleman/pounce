const OFFLINE_CACHE_NAME = "pounce-offline-v7";
const OFFLINE_PAGES = ["/", "/offline"];
const STATIC_ASSETS = [
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
          cache.put(page, response.clone());
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
