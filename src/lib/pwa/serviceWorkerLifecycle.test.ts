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
    ]) {
      harness.stores.set(name, new Map());
    }
    await dispatchWaitUntil(harness.listeners.get("activate")!);
    expect(harness.deleted).toEqual(["sundial-shell-v2"]);
    expect([...harness.stores.keys()]).toEqual(
      expect.arrayContaining([
        "sundial-shell-v3",
        "sundial-assets-v4",
        "sundial-navigation-v3",
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

    const navigationStore = harness.stores.get("sundial-navigation-v3") || new Map();
    navigationStore.set("https://example.test/alpha/app", "alpha");
    expect(navigationStore.has("https://example.test/beta/app")).toBe(false);
  });

  it("preserves push and tenant-safe notification click handling", () => {
    expect(workerSource).toContain('self.addEventListener("push"');
    expect(workerSource).toContain('self.addEventListener("notificationclick"');
    expect(workerSource).toContain("requestedPath.startsWith(`/${schoolSlug}/`)");
    expect(workerSource).toContain("includeUncontrolled: true");
  });

  it("does not precache a generic manifest over a tenant install manifest", () => {
    const precache = workerSource.slice(
      workerSource.indexOf("const PRECACHE_URLS"),
      workerSource.indexOf("self.addEventListener(\"install\"")
    );
    expect(precache).not.toContain("manifest.webmanifest");
    expect(workerSource).toContain('request.destination === "manifest"');
    expect(workerSource).toContain("networkFirstResource(request, ASSET_CACHE)");
  });
});
