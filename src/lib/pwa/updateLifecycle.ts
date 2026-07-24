export const PWA_UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;
const RELOAD_GUARD_KEY = "sundial:pwa-controller-reload";
const RELOAD_GUARD_MS = 30_000;

export type PwaDiagnostics = {
  serviceWorkerVersion: string | null;
  cacheVersion: unknown;
  updateFound: boolean;
  newControllerActive: boolean;
  lastSuccessfulUpdateCheckAt: string | null;
};

export type PwaUpdateLifecycleOptions = {
  serviceWorker: ServiceWorkerContainer;
  registration: ServiceWorkerRegistration;
  window: Window;
  document: Document;
  onUpdateReady: (updateNow: () => void) => void;
  onDiagnostics?: (diagnostics: PwaDiagnostics) => void;
  now?: () => number;
  setInterval?: typeof window.setInterval;
  clearInterval?: typeof window.clearInterval;
};

function hasUnsavedWork(windowObject: Window) {
  const event = new Event("beforeunload", { cancelable: true });
  windowObject.dispatchEvent(event);
  return event.defaultPrevented;
}

function isReloadGuarded(windowObject: Window, now: number) {
  try {
    const lastReload = Number(windowObject.sessionStorage.getItem(RELOAD_GUARD_KEY));
    return Number.isFinite(lastReload) && now - lastReload < RELOAD_GUARD_MS;
  } catch {
    return false;
  }
}

function markReload(windowObject: Window, now: number) {
  try {
    windowObject.sessionStorage.setItem(RELOAD_GUARD_KEY, String(now));
  } catch {
    // Storage can be unavailable in private browsing; the in-memory guard still applies.
  }
}

export function startPwaUpdateLifecycle(options: PwaUpdateLifecycleOptions) {
  const now = options.now || Date.now;
  const setIntervalFn = options.setInterval || options.window.setInterval.bind(options.window);
  const clearIntervalFn =
    options.clearInterval || options.window.clearInterval.bind(options.window);
  let checkInFlight: Promise<void> | null = null;
  let controllerHandled = false;
  let promptDismissed = false;
  let updateReady = false;
  const diagnostics: PwaDiagnostics = {
    serviceWorkerVersion: null,
    cacheVersion: null,
    updateFound: false,
    newControllerActive: false,
    lastSuccessfulUpdateCheckAt: null,
  };

  const publishDiagnostics = () => options.onDiagnostics?.({ ...diagnostics });

  const requestDiagnostics = () => {
    options.serviceWorker.controller?.postMessage({ type: "GET_PWA_DIAGNOSTICS" });
  };

  const reloadIfSafe = () => {
    if (controllerHandled || isReloadGuarded(options.window, now())) return;
    if (hasUnsavedWork(options.window)) {
      if (!promptDismissed) options.onUpdateReady(reloadIfSafe);
      return;
    }
    controllerHandled = true;
    markReload(options.window, now());
    const scrollPosition = {
      x: options.window.scrollX,
      y: options.window.scrollY,
    };
    try {
      options.window.sessionStorage.setItem(
        "sundial:pwa-scroll-position",
        JSON.stringify(scrollPosition)
      );
    } catch {
      // A reload is still safe if scroll restoration storage is unavailable.
    }
    options.window.location.reload();
  };

  const announceUpdate = (worker = options.registration.waiting) => {
    updateReady = true;
    diagnostics.updateFound = true;
    publishDiagnostics();
    worker?.postMessage({ type: "SKIP_WAITING" });
  };

  const handleUpdateFound = () => {
    diagnostics.updateFound = true;
    publishDiagnostics();
    const installing = options.registration.installing;
    installing?.addEventListener("statechange", () => {
      if (installing.state === "installed") announceUpdate(installing);
    });
  };

  const checkForUpdate = () => {
    if (checkInFlight || !options.window.navigator.onLine) {
      return checkInFlight || Promise.resolve();
    }
    checkInFlight = options.registration
      .update()
      .then(() => {
        diagnostics.lastSuccessfulUpdateCheckAt = new Date(now()).toISOString();
        publishDiagnostics();
        if (options.registration.waiting) announceUpdate();
      })
      .finally(() => {
        checkInFlight = null;
      });
    return checkInFlight;
  };

  const handleVisibilityChange = () => {
    if (options.document.visibilityState === "visible") void checkForUpdate();
  };
  const handleOnline = () => void checkForUpdate();
  const handleControllerChange = () => {
    diagnostics.newControllerActive = true;
    publishDiagnostics();
    requestDiagnostics();
    if (updateReady || diagnostics.updateFound) reloadIfSafe();
  };
  const handleMessage = (event: MessageEvent) => {
    if (event.data?.type !== "PWA_DIAGNOSTICS") return;
    diagnostics.serviceWorkerVersion = event.data.serviceWorkerVersion || null;
    diagnostics.cacheVersion = event.data.cacheVersion || null;
    publishDiagnostics();
  };

  options.registration.addEventListener("updatefound", handleUpdateFound);
  options.serviceWorker.addEventListener("controllerchange", handleControllerChange);
  options.serviceWorker.addEventListener("message", handleMessage);
  options.document.addEventListener("visibilitychange", handleVisibilityChange);
  options.window.addEventListener("online", handleOnline);
  const intervalId = setIntervalFn(() => {
    if (options.document.visibilityState === "visible") void checkForUpdate();
  }, PWA_UPDATE_CHECK_INTERVAL_MS);
  requestDiagnostics();
  void checkForUpdate();

  return {
    checkForUpdate,
    dismissPrompt() {
      promptDismissed = true;
    },
    applyUpdate() {
      promptDismissed = false;
      if (options.registration.waiting) {
        options.registration.waiting.postMessage({ type: "SKIP_WAITING" });
      } else {
        reloadIfSafe();
      }
    },
    dispose() {
      options.registration.removeEventListener("updatefound", handleUpdateFound);
      options.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
      options.serviceWorker.removeEventListener("message", handleMessage);
      options.document.removeEventListener("visibilitychange", handleVisibilityChange);
      options.window.removeEventListener("online", handleOnline);
      clearIntervalFn(intervalId);
    },
  };
}
