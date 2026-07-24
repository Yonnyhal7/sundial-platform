import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PWA_FOREGROUND_COALESCE_MS,
  PWA_FOREGROUND_FOLLOW_UP_MS,
  PWA_UPDATE_CHECK_INTERVAL_MS,
  startPwaUpdateLifecycle,
  type PwaDiagnostics,
} from "./updateLifecycle";

class FakeWorker extends EventTarget {
  state: ServiceWorkerState;
  scriptURL = "https://example.test/sw.js";
  postMessage = vi.fn();

  constructor(state: ServiceWorkerState = "installing") {
    super();
    this.state = state;
  }
}

class FakeRegistration extends EventTarget {
  installing: FakeWorker | null = null;
  waiting: FakeWorker | null = null;
  active: FakeWorker | null = null;
  update = vi.fn<() => Promise<void>>(async () => undefined);
}

type HarnessOptions = {
  online?: boolean;
  visibility?: DocumentVisibilityState;
  storage?: Map<string, string>;
  pageDeploymentVersion?: string | null;
};

function createHarness({
  online = true,
  visibility = "visible",
  storage = new Map<string, string>(),
  pageDeploymentVersion = null,
}: HarnessOptions = {}) {
  let currentOnline = online;
  let currentVisibility = visibility;
  let currentTime = 100_000;
  let controller: FakeWorker | null = new FakeWorker("activated");
  const serviceWorker = new EventTarget() as ServiceWorkerContainer;
  Object.defineProperty(serviceWorker, "controller", {
    configurable: true,
    get: () => controller,
  });
  const registration = new FakeRegistration();
  registration.active = controller;
  const documentTarget = new EventTarget() as Document;
  Object.defineProperty(documentTarget, "visibilityState", {
    configurable: true,
    get: () => currentVisibility,
  });
  const windowTarget = new EventTarget() as Window;
  const reload = vi.fn();
  Object.defineProperty(windowTarget, "navigator", {
    configurable: true,
    value: {},
  });
  Object.defineProperty(windowTarget.navigator, "onLine", {
    configurable: true,
    get: () => currentOnline,
  });
  Object.assign(windowTarget, {
    sessionStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    },
    scrollX: 0,
    scrollY: 0,
    location: { reload },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  });
  const prompt = vi.fn();
  const diagnostics = vi.fn<(value: PwaDiagnostics) => void>();
  const markApplicationUpdatePending = vi.fn();
  const resumeDiagnostics = vi.fn();
  const fetchDeploymentVersion = vi.fn(async () => pageDeploymentVersion);
  const lifecycle = startPwaUpdateLifecycle({
    serviceWorker,
    registration: registration as unknown as ServiceWorkerRegistration,
    window: windowTarget,
    document: documentTarget,
    pageDeploymentVersion,
    fetchDeploymentVersion:
      pageDeploymentVersion === null ? undefined : fetchDeploymentVersion,
    onUpdateReady: prompt,
    onDiagnostics: diagnostics,
    onApplicationUpdatePending: markApplicationUpdatePending,
    onResumeDiagnostic: resumeDiagnostics,
    now: () => currentTime,
  });

  return {
    serviceWorker,
    registration,
    documentTarget,
    windowTarget,
    storage,
    reload,
    prompt,
    diagnostics,
    markApplicationUpdatePending,
    resumeDiagnostics,
    fetchDeploymentVersion,
    lifecycle,
    setOnline(value: boolean) {
      currentOnline = value;
    },
    setVisibility(value: DocumentVisibilityState) {
      currentVisibility = value;
    },
    setController(value: FakeWorker | null) {
      controller = value;
      registration.active = value;
    },
    setNow(value: number) {
      currentTime = value;
    },
  };
}

async function settleLaunch(harness: ReturnType<typeof createHarness>) {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  harness.registration.update.mockClear();
  harness.fetchDeploymentVersion.mockClear();
}

async function runForeground() {
  await vi.advanceTimersByTimeAsync(PWA_FOREGROUND_COALESCE_MS);
  await Promise.resolve();
  await Promise.resolve();
}

function latestDiagnostics(harness: ReturnType<typeof createHarness>) {
  return harness.diagnostics.mock.calls.at(-1)?.[0];
}

describe("PWA update lifecycle", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it.each(["visibilitychange", "pageshow", "focus"] as const)(
    "checks for an update on %s foreground",
    async (eventName) => {
      const harness = createHarness();
      await settleLaunch(harness);

      const target =
        eventName === "visibilitychange"
          ? harness.documentTarget
          : harness.windowTarget;
      target.dispatchEvent(new Event(eventName));
      await runForeground();

      expect(harness.registration.update).toHaveBeenCalledTimes(1);
      harness.lifecycle.dispose();
    }
  );

  it("coalesces multiple foreground signals into one update operation", async () => {
    const harness = createHarness();
    await settleLaunch(harness);

    harness.documentTarget.dispatchEvent(new Event("visibilitychange"));
    harness.windowTarget.dispatchEvent(new Event("pageshow"));
    harness.windowTarget.dispatchEvent(new Event("focus"));
    await runForeground();

    expect(harness.registration.update).toHaveBeenCalledTimes(1);
    expect(
      harness.resumeDiagnostics.mock.calls
        .map(([type]) => type)
        .filter((type) =>
          ["visibilitychange", "pageshow", "focus"].includes(type)
        )
    ).toEqual(["visibilitychange", "pageshow", "focus"]);
    harness.lifecycle.dispose();
  });

  it("marks a deployment update pending before scheduling its one reload", async () => {
    const harness = createHarness({ pageDeploymentVersion: "page-v1" });
    await settleLaunch(harness);
    harness.fetchDeploymentVersion.mockResolvedValue("page-v2");

    harness.windowTarget.dispatchEvent(new Event("pageshow"));
    await runForeground();
    await vi.runOnlyPendingTimersAsync();

    expect(harness.markApplicationUpdatePending).toHaveBeenCalled();
    expect(harness.reload).toHaveBeenCalledTimes(1);
    expect(harness.resumeDiagnostics).toHaveBeenCalledWith(
      "deployment_version_check",
      "changed"
    );
    expect(harness.resumeDiagnostics).toHaveBeenCalledWith(
      "full_reload_scheduled",
      "new_deployment"
    );
    harness.lifecycle.dispose();
  });

  it("keeps launch, online, and interval checks", async () => {
    const harness = createHarness();
    await settleLaunch(harness);
    expect(harness.registration.update).not.toHaveBeenCalled();

    harness.windowTarget.dispatchEvent(new Event("online"));
    await runForeground();
    expect(harness.registration.update).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(
      PWA_UPDATE_CHECK_INTERVAL_MS - PWA_FOREGROUND_COALESCE_MS
    );
    await Promise.resolve();
    expect(harness.registration.update).toHaveBeenCalledTimes(3);
    harness.lifecycle.dispose();
  });

  it("does not overlap registration update calls", async () => {
    const harness = createHarness();
    await settleLaunch(harness);
    let resolveUpdate: (() => void) | undefined;
    harness.registration.update.mockImplementation(
      () => new Promise<void>((resolve) => (resolveUpdate = resolve))
    );

    harness.documentTarget.dispatchEvent(new Event("visibilitychange"));
    await runForeground();
    void harness.lifecycle.checkForUpdate();
    expect(harness.registration.update).toHaveBeenCalledTimes(1);

    resolveUpdate?.();
    for (let index = 0; index < 6; index += 1) await Promise.resolve();
    void harness.lifecycle.checkForUpdate();
    expect(harness.registration.update).toHaveBeenCalledTimes(2);
    harness.lifecycle.dispose();
  });

  it("keeps listening after registration.update resolves before worker activation", async () => {
    const harness = createHarness();
    await settleLaunch(harness);

    harness.windowTarget.dispatchEvent(new Event("pageshow"));
    await runForeground();
    expect(harness.reload).not.toHaveBeenCalled();

    const installing = new FakeWorker();
    harness.registration.installing = installing;
    harness.registration.dispatchEvent(new Event("updatefound"));
    installing.state = "installed";
    installing.dispatchEvent(new Event("statechange"));
    expect(installing.postMessage).toHaveBeenCalledWith({
      type: "SKIP_WAITING",
    });

    harness.registration.installing = null;
    harness.setController(new FakeWorker("activated"));
    harness.serviceWorker.dispatchEvent(new Event("controllerchange"));
    await vi.advanceTimersByTimeAsync(1);
    expect(harness.reload).toHaveBeenCalledTimes(1);
    harness.lifecycle.dispose();
  });

  it("reloads once when a new active controller is observed on resume", async () => {
    const harness = createHarness();
    await settleLaunch(harness);
    harness.setController(new FakeWorker("activated"));

    harness.windowTarget.dispatchEvent(new Event("pageshow"));
    await runForeground();
    await vi.advanceTimersByTimeAsync(1);

    expect(harness.reload).toHaveBeenCalledTimes(1);
    harness.lifecycle.dispose();
  });

  it("defers a suspended controllerchange until the next foreground", async () => {
    const harness = createHarness({ visibility: "hidden" });
    await settleLaunch(harness);
    harness.setController(new FakeWorker("activated"));
    harness.serviceWorker.dispatchEvent(new Event("controllerchange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.reload).not.toHaveBeenCalled();

    harness.setVisibility("visible");
    harness.windowTarget.dispatchEvent(new Event("pageshow"));
    await runForeground();
    await vi.advanceTimersByTimeAsync(1);

    expect(harness.reload).toHaveBeenCalledTimes(1);
    harness.lifecycle.dispose();
  });

  it("detects an app-only deployment and reloads after the worker follow-up window", async () => {
    const harness = createHarness({ pageDeploymentVersion: "deployment-a" });
    await settleLaunch(harness);
    harness.fetchDeploymentVersion.mockResolvedValue("deployment-b");

    harness.windowTarget.dispatchEvent(new Event("pageshow"));
    await runForeground();
    expect(harness.reload).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(PWA_FOREGROUND_FOLLOW_UP_MS);
    for (let index = 0; index < 6; index += 1) await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1);

    expect(harness.reload).toHaveBeenCalledTimes(1);
    expect(
      latestDiagnostics(harness)?.events.some(
        (event) => event.type === "deployment_version_changed"
      )
    ).toBe(true);
    harness.lifecycle.dispose();
  });

  it("does not let a recent guard suppress a genuinely later deployment", async () => {
    const harness = createHarness();
    await settleLaunch(harness);
    harness.storage.set("sundial:pwa-controller-reload", "90000");
    harness.setController(new FakeWorker("activated"));
    harness.serviceWorker.dispatchEvent(new Event("controllerchange"));
    await vi.advanceTimersByTimeAsync(1);
    expect(harness.reload).not.toHaveBeenCalled();

    harness.setNow(121_000);
    harness.windowTarget.dispatchEvent(new Event("focus"));
    await runForeground();
    await vi.advanceTimersByTimeAsync(1);

    expect(harness.reload).toHaveBeenCalledTimes(1);
    harness.lifecycle.dispose();
  });

  it("prevents a reload loop across controller events and the reloaded page", async () => {
    const storage = new Map<string, string>();
    const first = createHarness({ storage });
    await settleLaunch(first);
    first.setController(new FakeWorker("activated"));
    first.serviceWorker.dispatchEvent(new Event("controllerchange"));
    first.serviceWorker.dispatchEvent(new Event("controllerchange"));
    await vi.advanceTimersByTimeAsync(1);
    expect(first.reload).toHaveBeenCalledTimes(1);
    first.lifecycle.dispose();

    const reloaded = createHarness({ storage });
    await settleLaunch(reloaded);
    reloaded.setController(new FakeWorker("activated"));
    reloaded.serviceWorker.dispatchEvent(new Event("controllerchange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(reloaded.reload).not.toHaveBeenCalled();
    reloaded.lifecycle.dispose();
  });

  it("retries once on a later foreground if iOS discarded the first reload", async () => {
    const harness = createHarness();
    await settleLaunch(harness);
    harness.setController(new FakeWorker("activated"));
    harness.serviceWorker.dispatchEvent(new Event("controllerchange"));
    await vi.advanceTimersByTimeAsync(1);
    expect(harness.reload).toHaveBeenCalledTimes(1);

    harness.setNow(103_000);
    harness.windowTarget.dispatchEvent(new Event("focus"));
    await runForeground();
    await vi.advanceTimersByTimeAsync(1);
    expect(harness.reload).toHaveBeenCalledTimes(2);
    harness.lifecycle.dispose();
  });

  it("keeps Later session-scoped and Update now can override unsaved work", async () => {
    const harness = createHarness();
    await settleLaunch(harness);
    harness.windowTarget.addEventListener("beforeunload", (event) =>
      event.preventDefault()
    );
    harness.setController(new FakeWorker("activated"));
    harness.serviceWorker.dispatchEvent(new Event("controllerchange"));
    expect(harness.prompt).toHaveBeenCalledTimes(1);
    expect(harness.reload).not.toHaveBeenCalled();

    harness.lifecycle.dismissPrompt();
    harness.windowTarget.dispatchEvent(new Event("pageshow"));
    await runForeground();
    expect(harness.prompt).toHaveBeenCalledTimes(1);
    expect(harness.reload).not.toHaveBeenCalled();

    harness.lifecycle.applyUpdate();
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.reload).toHaveBeenCalledTimes(1);
    harness.lifecycle.dispose();
  });

  it("Update now activates a waiting worker and reloads after it controls the page", async () => {
    const harness = createHarness();
    await settleLaunch(harness);
    harness.windowTarget.addEventListener("beforeunload", (event) =>
      event.preventDefault()
    );
    const waiting = new FakeWorker("installed");
    harness.registration.waiting = waiting;

    harness.lifecycle.applyUpdate();
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });

    harness.registration.waiting = null;
    harness.setController(new FakeWorker("activated"));
    harness.serviceWorker.dispatchEvent(new Event("controllerchange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.reload).toHaveBeenCalledTimes(1);
    harness.lifecycle.dispose();
  });

  it("does not reload offline and applies the pending controller on reconnect", async () => {
    const harness = createHarness({ online: false });
    await settleLaunch(harness);
    harness.setController(new FakeWorker("activated"));
    harness.serviceWorker.dispatchEvent(new Event("controllerchange"));
    await vi.advanceTimersByTimeAsync(0);
    expect(harness.reload).not.toHaveBeenCalled();
    expect(harness.registration.update).not.toHaveBeenCalled();

    harness.setOnline(true);
    harness.windowTarget.dispatchEvent(new Event("online"));
    await runForeground();
    await vi.advanceTimersByTimeAsync(1);

    expect(harness.reload).toHaveBeenCalledTimes(1);
    expect(harness.registration.update).toHaveBeenCalledTimes(1);
    harness.lifecycle.dispose();
  });

  it("records bounded lifecycle diagnostics including the active worker version", async () => {
    const harness = createHarness();
    await settleLaunch(harness);
    const message = new Event("message") as MessageEvent;
    Object.defineProperty(message, "data", {
      value: {
        type: "PWA_DIAGNOSTICS",
        serviceWorkerVersion: "worker-v2",
        cacheVersion: { shell: "shell-v3" },
      },
    });
    harness.serviceWorker.dispatchEvent(message);
    for (let index = 0; index < 30; index += 1) {
      void harness.lifecycle.checkForUpdate();
    }
    await Promise.resolve();

    const value = latestDiagnostics(harness);
    expect(value?.activeWorkerScriptVersion).toBe("worker-v2");
    expect(value?.events.length).toBeLessThanOrEqual(24);
    expect(
      value?.events.some((event) => event.type === "update_check_requested")
    ).toBe(true);
    harness.lifecycle.dispose();
  });
});
