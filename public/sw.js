const SHELL_CACHE = "sundial-shell-v1";
const ASSET_CACHE = "sundial-assets-v1";
const NAVIGATION_CACHE = "sundial-navigation-v1";

const PRECACHE_URLS = [
  "/favicon.ico",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/manifest.webmanifest",
  "/sundial-icon.png",
  "/sundial-logo.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter(
              (key) =>
                ![SHELL_CACHE, ASSET_CACHE, NAVIGATION_CACHE].includes(key)
            )
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

function isAppOrKioskPath(pathname) {
  return (
    /^\/[^/]+\/app(?:\/|$)/.test(pathname) ||
    /^\/[^/]+\/kiosk(?:\/|$)/.test(pathname) ||
    /^\/app(?:\/|$)/.test(pathname) ||
    /^\/kiosk(?:\/|$)/.test(pathname)
  );
}

function isAdminOrApiPath(pathname) {
  return (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/admin") ||
    /^\/[^/]+\/admin(?:\/|$)/.test(pathname)
  );
}

function getNavigationFallbacks(url) {
  const segments = url.pathname.split("/").filter(Boolean);

  if (segments.length >= 2 && segments[1] === "app") {
    return [`/${segments[0]}/app`, url.pathname];
  }

  if (segments.length >= 2 && segments[1] === "kiosk") {
    return [`/${segments[0]}/kiosk`, url.pathname];
  }

  if (segments[0] === "app") return ["/app", url.pathname];
  if (segments[0] === "kiosk") return ["/kiosk", url.pathname];

  return [url.pathname];
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(NAVIGATION_CACHE);

  try {
    const response = await fetch(request);

    if (response.ok && response.type === "basic") {
      await cache.put(request, response.clone());
    }

    return response;
  } catch {
    const url = new URL(request.url);
    const cached = await cache.match(request);

    if (cached) return cached;

    for (const fallback of getNavigationFallbacks(url)) {
      const fallbackResponse = await cache.match(fallback);

      if (fallbackResponse) return fallbackResponse;
    }

    throw new Error("No cached Sundial app shell is available");
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  if (cached) return cached;

  const response = await fetch(request);

  if (response.ok) {
    await cache.put(request, response.clone());
  }

  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin && request.destination !== "image") {
    return;
  }

  if (isAdminOrApiPath(url.pathname)) {
    return;
  }

  if (request.mode === "navigate" && isAppOrKioskPath(url.pathname)) {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (
    url.pathname.startsWith("/_next/static/") ||
    request.destination === "style" ||
    request.destination === "script" ||
    request.destination === "font" ||
    request.destination === "manifest" ||
    request.destination === "image"
  ) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
  }
});
