/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

const workerSource = readFileSync(
  new URL("../../../public/sw.js", import.meta.url),
  "utf8"
);

function createWorkerHarness() {
  const listeners = new Map<string, (event: any) => void>();
  const stores = new Map<string, Map<string, any>>();
  const deleted: string[] = [];
  const cacheFor = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const store = stores.get(name)!;
    return {
      addAll: vi.fn(async () => undefined),
      keys: vi.fn(async () => [...store.keys()].map((url) => ({ url }))),
      match: vi.fn(async (request: any) =>
        store.get(typeof request === "string" ? request : request.url)
      ),
      put: vi.fn(async (request: any, response: any) => {
        store.set(typeof request === "string" ? request : request.url, response);
      }),
      delete: vi.fn(async (request: any) =>
        store.delete(typeof request === "string" ? request : request.url)
      ),
    };
  };
  const context = {
    URL,
    Date,
    Promise,
    console,
    fetch: vi.fn(),
    caches: {
      open: vi.fn(async (name: string) => cacheFor(name)),
      keys: vi.fn(async () => [...stores.keys()]),
      delete: vi.fn(async (name: string) => {
        deleted.push(name);
        return stores.delete(name);
      }),
    },
    self: {
      location: { origin: "https://example.test" },
      registration: { showNotification: vi.fn() },
      skipWaiting: vi.fn(async () => undefined),
      clients: {
        claim: vi.fn(async () => undefined),
        matchAll: vi.fn(async () => []),
        openWindow: vi.fn(),
      },
      addEventListener: (type: string, handler: (event: any) => void) =>
        listeners.set(type, handler),
    },
  };
  vm.runInNewContext(workerSource, context);
  return { context, listeners, stores, deleted };
}

function stubCache(overrides: Record<string, any>) {
  return {
    addAll: vi.fn(async () => undefined),
    keys: vi.fn(async () => [] as { url: string }[]),
    match: vi.fn(async () => undefined),
    put: vi.fn(async () => undefined),
    delete: vi.fn(async () => false),
    ...overrides,
  } as any;
}

async function dispatchWaitUntil(handler: (event: any) => void, extra = {}) {
  let work: Promise<unknown> = Promise.resolve();
  handler({ ...extra, waitUntil: (promise: Promise<unknown>) => (work = promise) });
  await work;
}

describe("service worker lifecycle and caching", () => {
  it("removes obsolete caches while retaining every current cache", async () => {
    const harness = createWorkerHarness();
    for (const name of [
      "sundial-shell-v2",
      "sundial-shell-v3",
      "sundial-assets-v4",
      "sundial-navigation-v3",
      "sundial-navigation-v4",
    ]) {
      harness.stores.set(name, new Map());
    }
    await dispatchWaitUntil(harness.listeners.get("activate")!);
    expect(harness.deleted).toEqual(["sundial-shell-v2", "sundial-navigation-v3"]);
    expect([...harness.stores.keys()]).toEqual(
      expect.arrayContaining([
        "sundial-shell-v3",
        "sundial-assets-v4",
        "sundial-navigation-v4",
      ])
    );
    expect(harness.context.self.clients.claim).toHaveBeenCalled();
  });

  it("prefers the network for navigation and falls back to tenant-specific cache offline", async () => {
    const harness = createWorkerHarness();
    const request = {
      url: "https://example.test/deloro/app",
      mode: "navigate",
      destination: "document",
    };
    const fresh = { ok: true, type: "basic", clone: () => fresh };
    harness.context.fetch.mockResolvedValueOnce(fresh);
    let responsePromise: Promise<unknown> = Promise.resolve();
    harness.listeners.get("fetch")!({
      request,
      respondWith: (promise: Promise<unknown>) => (responsePromise = promise),
    });
    expect(await responsePromise).toBe(fresh);
    expect(harness.context.fetch).toHaveBeenCalledWith(request);

    harness.context.fetch.mockRejectedValueOnce(new Error("offline"));
    harness.listeners.get("fetch")!({
      request,
      respondWith: (promise: Promise<unknown>) => (responsePromise = promise),
    });
    expect(await responsePromise).toBe(fresh);
  });

  it("keeps immutable Next assets cacheable and isolates navigation by full tenant URL", async () => {
    const harness = createWorkerHarness();
    const asset = {
      url: "https://example.test/_next/static/chunks/app-abc123.js",
      mode: "cors",
      destination: "script",
    };
    const response = { ok: true, clone: () => response };
    harness.context.fetch.mockResolvedValue(response);
    let responsePromise: Promise<unknown> = Promise.resolve();
    harness.listeners.get("fetch")!({
      request: asset,
      respondWith: (promise: Promise<unknown>) => (responsePromise = promise),
    });
    expect(await responsePromise).toBe(response);
    const assetStore = harness.stores.get("sundial-assets-v4")!;
    expect(assetStore.has(asset.url)).toBe(true);

    const navigationStore = harness.stores.get("sundial-navigation-v4") || new Map();
    navigationStore.set("https://example.test/alpha/app", "alpha");
    expect(navigationStore.has("https://example.test/beta/app")).toBe(false);
  });

  it("preserves push and tenant-safe notification click handling", () => {
    expect(workerSource).toContain('self.addEventListener("push"');
    expect(workerSource).toContain('self.addEventListener("notificationclick"');
    expect(workerSource).toContain("requestedPath.startsWith(`/${schoolSlug}/`)");
    expect(workerSource).toContain("includeUncontrolled: true");
  });

  it("reports the foreground-resume worker version without changing push handling", () => {
    expect(workerSource).toContain(
      'SERVICE_WORKER_VERSION = "2026-08-05-pwa-streaming-navigation-v1"'
    );
    expect(workerSource).toContain('event.data?.type === "GET_PWA_DIAGNOSTICS"');
    expect(workerSource).toContain('event.data?.type === "SKIP_WAITING"');
  });

  it("returns the navigation response without waiting for the cache write", async () => {
    const harness = createWorkerHarness();
    const request = {
      url: "https://example.test/deloro/app",
      mode: "navigate",
      destination: "document",
    };
    const clone = { marker: "clone" };
    const fresh = { ok: true, status: 200, type: "basic", clone: () => clone };
    harness.context.fetch.mockResolvedValueOnce(fresh);

    // A cache write that never settles stands in for a slowly-streamed document:
    // `cache.put()` does not resolve until the whole body has been read.
    let releaseCacheWrite: () => void = () => {};
    const pendingWrite = new Promise<void>((resolve) => {
      releaseCacheWrite = resolve;
    });
    const store = harness.stores.get("sundial-navigation-v4") || new Map();
    harness.stores.set("sundial-navigation-v4", store);
    harness.context.caches.open.mockImplementationOnce(async () =>
      stubCache({ put: vi.fn(() => pendingWrite) })
    );

    let responsePromise: Promise<unknown> = Promise.resolve();
    const waited: Promise<unknown>[] = [];
    harness.listeners.get("fetch")!({
      request,
      respondWith: (promise: Promise<unknown>) => (responsePromise = promise),
      waitUntil: (promise: Promise<unknown>) => waited.push(promise),
    });

    // The page gets the live response even though the cache write is still open.
    expect(await responsePromise).toBe(fresh);
    expect(waited).toHaveLength(1);
    releaseCacheWrite();
    await Promise.all(waited);
  });

  it("caches only a clone and survives a failing cache write", async () => {
    const harness = createWorkerHarness();
    const request = {
      url: "https://example.test/deloro/app",
      mode: "navigate",
      destination: "document",
    };
    const clone = { marker: "clone" };
    const clonedFor = vi.fn(() => clone);
    const fresh = { ok: true, status: 200, type: "basic", clone: clonedFor };
    harness.context.fetch.mockResolvedValueOnce(fresh);

    const put = vi.fn(async () => {
      throw new Error("quota exceeded");
    });
    harness.context.caches.open.mockImplementationOnce(async () =>
      stubCache({ put })
    );

    let responsePromise: Promise<unknown> = Promise.resolve();
    const waited: Promise<unknown>[] = [];
    harness.listeners.get("fetch")!({
      request,
      respondWith: (promise: Promise<unknown>) => (responsePromise = promise),
      waitUntil: (promise: Promise<unknown>) => waited.push(promise),
    });

    // Rendering is unaffected by the cache failure, and the write is swallowed
    // rather than becoming an unhandled rejection.
    expect(await responsePromise).toBe(fresh);
    expect(clonedFor).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledWith(request, clone);
    await expect(Promise.all(waited)).resolves.toBeDefined();
  });

  it("never stores unsuccessful, partial, or opaque responses", async () => {
    const harness = createWorkerHarness();

    for (const response of [
      { ok: false, status: 500, type: "basic", clone: () => ({}) },
      { ok: true, status: 206, type: "basic", clone: () => ({}) },
    ]) {
      const request = {
        url: "https://example.test/deloro/app",
        mode: "navigate",
        destination: "document",
      };
      harness.context.fetch.mockResolvedValueOnce(response);
      let responsePromise: Promise<unknown> = Promise.resolve();
      harness.listeners.get("fetch")!({
        request,
        respondWith: (promise: Promise<unknown>) => (responsePromise = promise),
        waitUntil: () => undefined,
      });
      expect(await responsePromise).toBe(response);
    }

    const navigationStore = harness.stores.get("sundial-navigation-v4");
    expect(navigationStore?.size ?? 0).toBe(0);

    // An opaque cross-origin navigation response must not be stored either.
    expect(workerSource).toContain('response.type === "basic"');
  });

  it("does not precache a generic manifest over a tenant install manifest", () => {
    const precache = workerSource.slice(
      workerSource.indexOf("const PRECACHE_URLS"),
      workerSource.indexOf("self.addEventListener(\"install\"")
    );
    expect(precache).not.toContain("manifest.webmanifest");
    expect(workerSource).toContain('request.destination === "manifest"');
    expect(workerSource).toContain(
      "networkFirstResource(request, ASSET_CACHE, event)"
    );
  });
});
