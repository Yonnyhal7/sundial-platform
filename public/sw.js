const SERVICE_WORKER_VERSION = "2026-07-24-pwa-update-v1";
const SHELL_CACHE = "sundial-shell-v3";
const ASSET_CACHE = "sundial-assets-v4";
const NAVIGATION_CACHE = "sundial-navigation-v3";

const PRECACHE_URLS = [
  "/favicon.ico",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
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

self.addEventListener("message", (event) => {
  if (event.data?.type === "GET_PWA_DIAGNOSTICS") {
    event.source?.postMessage({
      type: "PWA_DIAGNOSTICS",
      serviceWorkerVersion: SERVICE_WORKER_VERSION,
      cacheVersion: {
        shell: SHELL_CACHE,
        assets: ASSET_CACHE,
        navigation: NAVIGATION_CACHE,
      },
    });
    return;
  }

  if (event.data?.type === "SKIP_WAITING") {
    event.waitUntil(self.skipWaiting());
    return;
  }

  if (event.data?.type !== "PURGE_SCHOOL_CACHE") return;
  const schoolSlug = String(event.data.schoolSlug || "").trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(schoolSlug)) return;

  event.waitUntil(
    caches.open(NAVIGATION_CACHE).then(async (cache) => {
      const keys = await cache.keys();
      await Promise.all(
        keys.map((request) => {
          const url = new URL(request.url);
          const pathMatches =
            url.pathname === `/${schoolSlug}` ||
            url.pathname.startsWith(`/${schoolSlug}/`);
          const subdomainMatches =
            url.hostname.toLowerCase().startsWith(`${schoolSlug}.`) &&
            (/^\/app(?:\/|$)/.test(url.pathname) || /^\/kiosk(?:\/|$)/.test(url.pathname));
          return pathMatches || subdomainMatches ? cache.delete(request) : Promise.resolve(false);
        })
      );
    })
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

async function networkFirstResource(request, cacheName) {
  const cache = await caches.open(cacheName);

  try {
    const response = await fetch(request);

    if (response.ok) {
      await cache.put(request, response.clone());
    }

    return response;
  } catch {
    const cached = await cache.match(request);

    if (cached) return cached;
    throw new Error("No cached Sundial resource is available");
  }
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

  if (request.destination === "manifest") {
    event.respondWith(networkFirstResource(request, ASSET_CACHE));
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  if (
    request.destination === "style" ||
    request.destination === "script" ||
    request.destination === "font" ||
    request.destination === "image"
  ) {
    event.respondWith(networkFirstResource(request, ASSET_CACHE));
  }
});

self.addEventListener("push", (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { payload = {}; }
  const title = typeof payload.title === "string" ? payload.title.slice(0, 60) : "Sundial";
  const body = typeof payload.body === "string" ? payload.body.slice(0, 180) : "A school update is available.";
  const schoolSlug = typeof payload.schoolSlug === "string" && /^[a-z0-9-]+$/.test(payload.schoolSlug) ? payload.schoolSlug : "";
  const requestedPath = typeof payload.destinationPath === "string" ? payload.destinationPath : "";
  const destinationPath = schoolSlug && requestedPath.startsWith(`/${schoolSlug}/`) && !requestedPath.includes("..")
    ? requestedPath : schoolSlug ? `/${schoolSlug}/app` : "/";
  event.waitUntil(self.registration.showNotification(title, {
    body, icon: "/icon-192.png", badge: "/sundial-icon.png",
    data: { destinationPath, schoolSlug, campaignId: String(payload.campaignId || "") },
    tag: `sundial-${String(payload.campaignId || Date.now())}`,
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const schoolSlug = String(event.notification.data?.schoolSlug || "");
  const requestedPath = String(event.notification.data?.destinationPath || "");
  const destinationPath =
    /^[a-z0-9-]+$/.test(schoolSlug) &&
    requestedPath.startsWith(`/${schoolSlug}/`) &&
    !requestedPath.includes("..") &&
    !requestedPath.includes("\\")
      ? requestedPath
      : schoolSlug
        ? `/${schoolSlug}/app`
        : "/";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
    for (const client of clients) {
      const url = new URL(client.url);
      if (url.origin === self.location.origin && "focus" in client) {
        await client.navigate(destinationPath);
        return client.focus();
      }
    }
    return self.clients.openWindow(destinationPath);
  }));
});
