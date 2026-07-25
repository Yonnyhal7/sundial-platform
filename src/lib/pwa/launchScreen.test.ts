import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hidePwaLaunchScreen,
  preparePwaLaunchScreenForReload,
  PWA_LAUNCH_SCREEN_ID,
  showPwaLaunchScreen,
} from "./launchScreen";

function installDom() {
  const screen = {
    hidden: true,
    dataset: {} as Record<string, string>,
  };
  const root = { dataset: {} as Record<string, string> };
  const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });

  vi.stubGlobal("document", {
    documentElement: root,
    getElementById: (id: string) =>
      id === PWA_LAUNCH_SCREEN_ID ? screen : null,
  });
  vi.stubGlobal("window", { requestAnimationFrame });

  return { screen, root, requestAnimationFrame };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("PWA launch screen contract", () => {
  it("reveals a single existing launch layer for a real update", () => {
    const { screen, root } = installDom();

    showPwaLaunchScreen();
    showPwaLaunchScreen();

    expect(screen.hidden).toBe(false);
    expect(screen.dataset.readiness).toBe("application_reload_pending");
    expect(root.dataset.pwaLaunch).toBe("pending");
  });

  it("marks the usable readiness state before hiding", () => {
    const { screen, root } = installDom();

    hidePwaLaunchScreen("cached_snapshot_ready");

    expect(screen.hidden).toBe(true);
    expect(screen.dataset.readiness).toBe("cached_snapshot_ready");
    expect(root.dataset.pwaLaunch).toBe("ready");
  });

  it("waits one paint frame after showing the update layer", async () => {
    const { screen, requestAnimationFrame } = installDom();

    await preparePwaLaunchScreenForReload();

    expect(screen.hidden).toBe(false);
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
  });
});
