import { describe, expect, it, vi } from "vitest";
import { startPwaUpdateLifecycle } from "./updateLifecycle";

class FakeWorker extends EventTarget {
  state: ServiceWorkerState = "installing";
  postMessage = vi.fn();
}

class FakeRegistration extends EventTarget {
  installing: FakeWorker | null = null;
  waiting: FakeWorker | null = null;
  update = vi.fn<() => Promise<void>>(async () => undefined);
}

function createHarness() {
  const serviceWorker = new EventTarget() as ServiceWorkerContainer;
  Object.defineProperty(serviceWorker, "controller", {
    configurable: true,
    value: { postMessage: vi.fn() },
  });
  const registration = new FakeRegistration();
  const documentTarget = new EventTarget() as Document;
  Object.defineProperty(documentTarget, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  const windowTarget = new EventTarget() as Window;
  const storage = new Map<string, string>();
  const reload = vi.fn();
  Object.assign(windowTarget, {
    navigator: { onLine: true },
    sessionStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
    scrollX: 0,
    scrollY: 0,
    location: { reload },
  });
  const prompt = vi.fn();
  let intervalCallback: (() => void) | undefined;
  let intervalDelay: number | undefined;
  const lifecycle = startPwaUpdateLifecycle({
    serviceWorker,
    registration: registration as unknown as ServiceWorkerRegistration,
    window: windowTarget,
    document: documentTarget,
    onUpdateReady: prompt,
    setInterval: ((callback: () => void, delay: number) => {
      intervalCallback = callback;
      intervalDelay = delay;
      return 1;
    }) as unknown as typeof window.setInterval,
    clearInterval: vi.fn() as unknown as typeof window.clearInterval,
    now: () => 100_000,
  });
  return {
    serviceWorker,
    registration,
    documentTarget,
    windowTarget,
    reload,
    prompt,
    lifecycle,
    runInterval: () => intervalCallback?.(),
    intervalDelay: () => intervalDelay,
  };
}

describe("PWA update lifecycle", () => {
  it("checks on launch, foreground, and online without overlapping checks", async () => {
    const harness = createHarness();
    await Promise.resolve();
    await Promise.resolve();
    expect(harness.registration.update).toHaveBeenCalledTimes(1);

    harness.documentTarget.dispatchEvent(new Event("visibilitychange"));
    await Promise.resolve();
    await Promise.resolve();
    expect(harness.registration.update).toHaveBeenCalledTimes(2);

    harness.windowTarget.dispatchEvent(new Event("online"));
    await Promise.resolve();
    await Promise.resolve();
    expect(harness.registration.update).toHaveBeenCalledTimes(3);

    harness.runInterval();
    await Promise.resolve();
    await Promise.resolve();
    expect(harness.registration.update).toHaveBeenCalledTimes(4);
    expect(harness.intervalDelay()).toBe(15 * 60 * 1000);
  });

  it("prevents overlapping registration update checks", async () => {
    const harness = createHarness();
    await Promise.resolve();
    await Promise.resolve();
    let resolveUpdate: (() => void) | undefined;
    harness.registration.update.mockImplementation(
      () => new Promise<void>((resolve) => (resolveUpdate = resolve))
    );

    harness.documentTarget.dispatchEvent(new Event("visibilitychange"));
    harness.windowTarget.dispatchEvent(new Event("online"));
    expect(harness.registration.update).toHaveBeenCalledTimes(2);
    resolveUpdate?.();
    await Promise.resolve();
    await Promise.resolve();
    harness.windowTarget.dispatchEvent(new Event("online"));
    expect(harness.registration.update).toHaveBeenCalledTimes(3);
  });

  it("activates a newly installed worker and reloads exactly once on controllerchange", async () => {
    const harness = createHarness();
    const installing = new FakeWorker();
    harness.registration.installing = installing;
    harness.registration.dispatchEvent(new Event("updatefound"));
    installing.state = "installed";
    installing.dispatchEvent(new Event("statechange"));

    expect(installing.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    harness.serviceWorker.dispatchEvent(new Event("controllerchange"));
    harness.serviceWorker.dispatchEvent(new Event("controllerchange"));
    expect(harness.reload).toHaveBeenCalledTimes(1);
  });

  it("prevents forced refresh for unsaved work and does not reopen a dismissed prompt", () => {
    const harness = createHarness();
    harness.windowTarget.addEventListener("beforeunload", (event) =>
      event.preventDefault()
    );
    harness.registration.waiting = new FakeWorker();
    harness.registration.dispatchEvent(new Event("updatefound"));
    harness.serviceWorker.dispatchEvent(new Event("controllerchange"));
    expect(harness.reload).not.toHaveBeenCalled();
    expect(harness.prompt).toHaveBeenCalledTimes(1);

    harness.lifecycle.dismissPrompt();
    harness.serviceWorker.dispatchEvent(new Event("controllerchange"));
    expect(harness.prompt).toHaveBeenCalledTimes(1);
  });

  it("does not reload again when a recent reload guard exists", () => {
    const harness = createHarness();
    harness.windowTarget.sessionStorage.setItem(
      "sundial:pwa-controller-reload",
      "90000"
    );
    harness.registration.waiting = new FakeWorker();
    harness.registration.dispatchEvent(new Event("updatefound"));
    harness.serviceWorker.dispatchEvent(new Event("controllerchange"));
    expect(harness.reload).not.toHaveBeenCalled();
  });

  it("Update now activates a waiting worker", () => {
    const harness = createHarness();
    const waiting = new FakeWorker();
    harness.registration.waiting = waiting;
    harness.lifecycle.applyUpdate();
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
  });
});
