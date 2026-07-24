export const PWA_UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;
export const PWA_FOREGROUND_COALESCE_MS = 200;
export const PWA_FOREGROUND_FOLLOW_UP_MS = 1_000;

const RELOAD_GUARD_KEY = "sundial:pwa-controller-reload";
const RELOAD_GUARD_MS = 30_000;
const RELOAD_RETRY_MS = 2_000;
const MAX_DIAGNOSTIC_EVENTS = 24;

export type PwaDiagnosticEventType =
  | "update_check_requested"
  | "update_check_completed"
  | "update_check_failed"
  | "updatefound"
  | "worker_installing"
  | "worker_waiting"
  | "skip_waiting_sent"
  | "controllerchange_received"
  | "deployment_version_changed"
  | "reload_scheduled"
  | "reload_suppressed"
  | "foreground_follow_up";

export type PwaDiagnosticEvent = {
  type: PwaDiagnosticEventType;
  at: string;
  reason?: string;
};

export type PwaDiagnostics = {
  serviceWorkerVersion: string | null;
  activeWorkerScriptVersion: string | null;
  pageDeploymentVersion: string | null;
  observedDeploymentVersion: string | null;
  cacheVersion: unknown;
  updateFound: boolean;
  newControllerActive: boolean;
  lastSuccessfulUpdateCheckAt: string | null;
  events: PwaDiagnosticEvent[];
};

export type PwaUpdateLifecycleOptions = {
  serviceWorker: ServiceWorkerContainer;
  registration: ServiceWorkerRegistration;
  window: Window;
  document: Document;
  pageDeploymentVersion?: string | null;
  fetchDeploymentVersion?: () => Promise<string | null>;
  onUpdateReady: (updateNow: () => void) => void;
  onDiagnostics?: (diagnostics: PwaDiagnostics) => void;
  onApplicationUpdatePending?: () => void;
  onUpdateCheckStart?: () => void;
  onUpdateCheckComplete?: () => void;
  onResumeDiagnostic?: (
    type:
      | "pageshow"
      | "focus"
      | "visibilitychange"
      | "deployment_version_check"
      | "controller_comparison"
      | "controllerchange"
      | "full_reload_scheduled"
      | "active_worker_script_version",
    detail?: string
  ) => void;
  now?: () => number;
  setTimeout?: typeof window.setTimeout;
  clearTimeout?: typeof window.clearTimeout;
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
    // Storage can be unavailable in private browsing; in-memory guards remain active.
  }
}

export function startPwaUpdateLifecycle(options: PwaUpdateLifecycleOptions) {
  const now = options.now || Date.now;
  const setTimeoutFn =
    options.setTimeout || options.window.setTimeout.bind(options.window);
  const clearTimeoutFn =
    options.clearTimeout || options.window.clearTimeout.bind(options.window);
  const setIntervalFn =
    options.setInterval || options.window.setInterval.bind(options.window);
  const clearIntervalFn =
    options.clearInterval || options.window.clearInterval.bind(options.window);

  let checkInFlight: Promise<void> | null = null;
  let foregroundTimer: number | null = null;
  let foregroundFollowUpTimer: number | null = null;
  let reloadTimer: number | null = null;
  let foregroundCycleActive = false;
  let disposed = false;
  let promptDismissed = false;
  let promptShown = false;
  let updateApprovalGranted = false;
  let updateReady = false;
  let pendingControllerRefresh = false;
  let pendingDeploymentRefresh = false;
  let reloadAttemptedAt: number | null = null;
  let lastKnownController = options.serviceWorker.controller;
  const foregroundReasons = new Set<string>();
  const observedWorkers = new WeakSet<ServiceWorker>();
  const skipWaitingWorkers = new WeakSet<ServiceWorker>();
  const diagnostics: PwaDiagnostics = {
    serviceWorkerVersion: null,
    activeWorkerScriptVersion: null,
    pageDeploymentVersion: options.pageDeploymentVersion || null,
    observedDeploymentVersion: options.pageDeploymentVersion || null,
    cacheVersion: null,
    updateFound: false,
    newControllerActive: false,
    lastSuccessfulUpdateCheckAt: null,
    events: [],
  };

  const publishDiagnostics = () => {
    options.onDiagnostics?.({
      ...diagnostics,
      events: [...diagnostics.events],
    });
  };

  const recordDiagnostic = (
    type: PwaDiagnosticEventType,
    reason?: string
  ) => {
    diagnostics.events.push({
      type,
      at: new Date(now()).toISOString(),
      ...(reason ? { reason } : {}),
    });
    if (diagnostics.events.length > MAX_DIAGNOSTIC_EVENTS) {
      diagnostics.events.splice(
        0,
        diagnostics.events.length - MAX_DIAGNOSTIC_EVENTS
      );
    }
    publishDiagnostics();
  };

  const markApplicationUpdatePending = () => {
    options.onApplicationUpdatePending?.();
  };

  const requestDiagnostics = () => {
    options.serviceWorker.controller?.postMessage({
      type: "GET_PWA_DIAGNOSTICS",
    });
  };

  const saveScrollPosition = () => {
    try {
      options.window.sessionStorage.setItem(
        "sundial:pwa-scroll-position",
        JSON.stringify({
          x: options.window.scrollX,
          y: options.window.scrollY,
        })
      );
    } catch {
      // A reload is still safe if scroll restoration storage is unavailable.
    }
  };

  const reloadIfSafe = (force = false) => {
    if (!pendingControllerRefresh && !pendingDeploymentRefresh) return;

    if (options.document.visibilityState !== "visible") {
      recordDiagnostic("reload_suppressed", "document_hidden");
      return;
    }
    if (!options.window.navigator.onLine) {
      recordDiagnostic("reload_suppressed", "offline");
      return;
    }
    if (reloadTimer !== null) {
      recordDiagnostic("reload_suppressed", "reload_already_scheduled");
      return;
    }

    const attemptAge =
      reloadAttemptedAt === null ? null : now() - reloadAttemptedAt;
    if (attemptAge !== null && attemptAge < RELOAD_RETRY_MS) {
      recordDiagnostic("reload_suppressed", "recent_reload_attempt");
      return;
    }
    if (
      reloadAttemptedAt === null &&
      isReloadGuarded(options.window, now())
    ) {
      recordDiagnostic("reload_suppressed", "recent_page_reload");
      return;
    }

    if (!force && hasUnsavedWork(options.window)) {
      if (promptDismissed) {
        recordDiagnostic("reload_suppressed", "later_selected");
        return;
      }
      recordDiagnostic("reload_suppressed", "unsaved_work");
      if (!promptShown) {
        promptShown = true;
        options.onUpdateReady(() => {
          updateApprovalGranted = true;
          promptShown = false;
          reloadIfSafe(true);
        });
      }
      return;
    }

    recordDiagnostic(
      "reload_scheduled",
      pendingControllerRefresh ? "new_controller" : "new_deployment"
    );
    options.onResumeDiagnostic?.(
      "full_reload_scheduled",
      pendingControllerRefresh ? "new_controller" : "new_deployment"
    );
    reloadTimer = setTimeoutFn(() => {
      reloadTimer = null;
      if (disposed) return;
      if (options.document.visibilityState !== "visible") {
        recordDiagnostic("reload_suppressed", "document_hidden_before_reload");
        return;
      }
      if (!options.window.navigator.onLine) {
        recordDiagnostic("reload_suppressed", "offline_before_reload");
        return;
      }
      if (!force && !updateApprovalGranted && hasUnsavedWork(options.window)) {
        recordDiagnostic("reload_suppressed", "unsaved_work_before_reload");
        return;
      }
      reloadAttemptedAt = now();
      markReload(options.window, reloadAttemptedAt);
      saveScrollPosition();
      options.window.location.reload();
    }, 0);
  };

  const sendSkipWaiting = (worker: ServiceWorker) => {
    if (skipWaitingWorkers.has(worker)) return;
    skipWaitingWorkers.add(worker);
    worker.postMessage({ type: "SKIP_WAITING" });
    recordDiagnostic("skip_waiting_sent");
  };

  const announceWaitingWorker = (worker: ServiceWorker) => {
    updateReady = true;
    diagnostics.updateFound = true;
    markApplicationUpdatePending();
    recordDiagnostic("worker_waiting");
    sendSkipWaiting(worker);
  };

  const observeWorker = (worker: ServiceWorker | null) => {
    if (!worker) return;
    if (!observedWorkers.has(worker)) {
      observedWorkers.add(worker);
      recordDiagnostic("worker_installing", worker.state);
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed") {
          announceWaitingWorker(worker);
        } else if (worker.state === "activating") {
          recordDiagnostic("worker_waiting", "activating");
        }
      });
    }
    if (worker.state === "installed") announceWaitingWorker(worker);
  };

  const inspectWorkerLifecycle = (reason: string) => {
    const controller = options.serviceWorker.controller;
    options.onResumeDiagnostic?.(
      "controller_comparison",
      controller === lastKnownController ? "unchanged" : "changed"
    );
    if (controller && controller !== lastKnownController) {
      lastKnownController = controller;
      pendingControllerRefresh = true;
      markApplicationUpdatePending();
      diagnostics.newControllerActive = true;
      recordDiagnostic("controllerchange_received", `${reason}:observed`);
      requestDiagnostics();
    }
    observeWorker(options.registration.installing);
    if (options.registration.waiting) {
      announceWaitingWorker(options.registration.waiting);
    }
    if (pendingControllerRefresh) {
      reloadIfSafe(updateApprovalGranted);
    }
  };

  const handleUpdateFound = () => {
    markApplicationUpdatePending();
    diagnostics.updateFound = true;
    recordDiagnostic("updatefound");
    observeWorker(options.registration.installing);
    if (options.registration.waiting) {
      announceWaitingWorker(options.registration.waiting);
    }
  };

  const checkDeploymentVersion = async () => {
    if (
      !options.fetchDeploymentVersion ||
      !diagnostics.pageDeploymentVersion
    ) {
      return;
    }
    options.onResumeDiagnostic?.("deployment_version_check", "requested");
    const observedVersion = await options.fetchDeploymentVersion();
    if (!observedVersion || disposed) return;
    diagnostics.observedDeploymentVersion = observedVersion;
    if (observedVersion !== diagnostics.pageDeploymentVersion) {
      pendingDeploymentRefresh = true;
      markApplicationUpdatePending();
      options.onResumeDiagnostic?.("deployment_version_check", "changed");
      diagnostics.updateFound = true;
      recordDiagnostic("deployment_version_changed");
    } else {
      options.onResumeDiagnostic?.("deployment_version_check", "current");
      publishDiagnostics();
    }
  };

  const checkForUpdate = (reason = "manual") => {
    recordDiagnostic("update_check_requested", reason);
    if (checkInFlight || !options.window.navigator.onLine) {
      return checkInFlight || Promise.resolve();
    }

    options.onUpdateCheckStart?.();
    checkInFlight = Promise.allSettled([
      options.registration.update(),
      checkDeploymentVersion(),
    ])
      .then((results) => {
        if (results.some((result) => result.status === "rejected")) {
          recordDiagnostic("update_check_failed", reason);
          return;
        }
        diagnostics.lastSuccessfulUpdateCheckAt = new Date(now()).toISOString();
        recordDiagnostic("update_check_completed", reason);
        inspectWorkerLifecycle(`${reason}:completed`);
      })
      .finally(() => {
        checkInFlight = null;
        options.onUpdateCheckComplete?.();
      });
    return checkInFlight;
  };

  const runForegroundFollowUp = () => {
    foregroundFollowUpTimer = null;
    if (disposed) return;
    if (options.document.visibilityState !== "visible") {
      foregroundCycleActive = false;
      return;
    }
    recordDiagnostic("foreground_follow_up");
    inspectWorkerLifecycle("foreground_follow_up");
    void checkForUpdate("foreground_follow_up").finally(() => {
      inspectWorkerLifecycle("foreground_follow_up:completed");
      if (
        pendingDeploymentRefresh &&
        !options.registration.installing &&
        !options.registration.waiting &&
        !pendingControllerRefresh
      ) {
        reloadIfSafe(updateApprovalGranted);
      }
      foregroundCycleActive = false;
    });
  };

  const runForegroundCheck = () => {
    foregroundTimer = null;
    if (disposed) return;
    if (options.document.visibilityState !== "visible") {
      foregroundCycleActive = false;
      foregroundReasons.clear();
      return;
    }

    const reason = [...foregroundReasons].sort().join("+") || "foreground";
    foregroundReasons.clear();
    inspectWorkerLifecycle(reason);
    void checkForUpdate(reason).finally(() => {
      inspectWorkerLifecycle(`${reason}:completed`);
      if (foregroundFollowUpTimer === null) {
        foregroundFollowUpTimer = setTimeoutFn(
          runForegroundFollowUp,
          PWA_FOREGROUND_FOLLOW_UP_MS
        );
      }
    });
  };

  const requestForegroundCheck = (reason: string) => {
    if (options.document.visibilityState !== "visible") return;
    foregroundReasons.add(reason);
    if (foregroundCycleActive) return;
    foregroundCycleActive = true;
    foregroundTimer = setTimeoutFn(
      runForegroundCheck,
      PWA_FOREGROUND_COALESCE_MS
    );
  };

  const handleVisibilityChange = () => {
    options.onResumeDiagnostic?.(
      "visibilitychange",
      options.document.visibilityState
    );
    if (options.document.visibilityState === "visible") {
      requestForegroundCheck("visibilitychange");
    }
  };
  const handlePageShow = (event: PageTransitionEvent) => {
    options.onResumeDiagnostic?.(
      "pageshow",
      event.persisted ? "persisted" : "not_persisted"
    );
    requestForegroundCheck(event.persisted ? "pageshow:persisted" : "pageshow");
  };
  const handleFocus = () => {
    options.onResumeDiagnostic?.("focus");
    requestForegroundCheck("focus");
  };
  const handleOnline = () => requestForegroundCheck("online");
  const handleControllerChange = () => {
    lastKnownController = options.serviceWorker.controller;
    pendingControllerRefresh = true;
    markApplicationUpdatePending();
    options.onResumeDiagnostic?.("controllerchange", "event");
    diagnostics.newControllerActive = true;
    recordDiagnostic("controllerchange_received", "event");
    requestDiagnostics();
    reloadIfSafe(updateApprovalGranted);
  };
  const handleMessage = (event: MessageEvent) => {
    if (event.data?.type !== "PWA_DIAGNOSTICS") return;
    diagnostics.serviceWorkerVersion = event.data.serviceWorkerVersion || null;
    diagnostics.activeWorkerScriptVersion =
      event.data.serviceWorkerVersion || null;
    diagnostics.cacheVersion = event.data.cacheVersion || null;
    options.onResumeDiagnostic?.(
      "active_worker_script_version",
      diagnostics.activeWorkerScriptVersion || "unavailable"
    );
    publishDiagnostics();
  };

  options.registration.addEventListener("updatefound", handleUpdateFound);
  options.serviceWorker.addEventListener(
    "controllerchange",
    handleControllerChange
  );
  options.serviceWorker.addEventListener("message", handleMessage);
  options.document.addEventListener(
    "visibilitychange",
    handleVisibilityChange
  );
  options.window.addEventListener("pageshow", handlePageShow);
  options.window.addEventListener("focus", handleFocus);
  options.window.addEventListener("online", handleOnline);

  const intervalId = setIntervalFn(() => {
    if (options.document.visibilityState === "visible") {
      inspectWorkerLifecycle("interval");
      void checkForUpdate("interval");
    }
  }, PWA_UPDATE_CHECK_INTERVAL_MS);

  requestDiagnostics();
  inspectWorkerLifecycle("launch");
  void checkForUpdate("launch");

  return {
    checkForUpdate: () => checkForUpdate("manual"),
    dismissPrompt() {
      promptDismissed = true;
      promptShown = false;
    },
    applyUpdate() {
      promptDismissed = false;
      updateApprovalGranted = true;
      promptShown = false;
      if (options.registration.waiting) {
        sendSkipWaiting(options.registration.waiting);
      } else if (updateReady || pendingControllerRefresh || pendingDeploymentRefresh) {
        reloadIfSafe(true);
      }
    },
    dispose() {
      disposed = true;
      options.registration.removeEventListener("updatefound", handleUpdateFound);
      options.serviceWorker.removeEventListener(
        "controllerchange",
        handleControllerChange
      );
      options.serviceWorker.removeEventListener("message", handleMessage);
      options.document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
      options.window.removeEventListener("pageshow", handlePageShow);
      options.window.removeEventListener("focus", handleFocus);
      options.window.removeEventListener("online", handleOnline);
      if (foregroundTimer !== null) clearTimeoutFn(foregroundTimer);
      if (foregroundFollowUpTimer !== null) {
        clearTimeoutFn(foregroundFollowUpTimer);
      }
      if (reloadTimer !== null) clearTimeoutFn(reloadTimer);
      clearIntervalFn(intervalId);
    },
  };
}
