import { describe, expect, it, vi } from "vitest";
import {
  applyMobileThemeSurface,
  bindMobileThemeSurfaceLifecycle,
  getMobileThemeSurfaceColor,
} from "./mobileThemeSurface";

function createStyle() {
  const values = new Map<string, string>();
  return {
    values,
    set backgroundColor(value: string) { values.set("background-color", value); },
    get backgroundColor() { return values.get("background-color") || ""; },
    setProperty(name: string, value: string) { values.set(name, value); },
  };
}

function createDocument() {
  const htmlStyle = createStyle();
  const bodyStyle = createStyle();
  const backdropStyle = createStyle();
  const rootStyle = createStyle();
  const metas = [{ content: "stale", setAttribute(name: string, value: string) { if (name === "content") this.content = value; } }];
  const target = {
    documentElement: { style: htmlStyle },
    body: { style: bodyStyle },
    querySelectorAll(selector: string) {
      return selector.startsWith("meta") ? metas : [{ style: backdropStyle }, { style: rootStyle }];
    },
  };
  return { target: target as unknown as Document, htmlStyle, bodyStyle, backdropStyle, rootStyle, metas };
}

describe("mobile PWA theme surface", () => {
  it.each(["dark", "light"] as const)("idempotently reapplies %s to every status-bar backing surface", (theme) => {
    const fixture = createDocument();
    applyMobileThemeSurface(theme, fixture.target);
    applyMobileThemeSurface(theme, fixture.target);
    const color = getMobileThemeSurfaceColor(theme);

    expect(fixture.htmlStyle.backgroundColor).toBe(color);
    expect(fixture.bodyStyle.backgroundColor).toBe(color);
    expect(fixture.backdropStyle.backgroundColor).toBe(color);
    expect(fixture.rootStyle.backgroundColor).toBe(color);
    expect(fixture.metas).toHaveLength(1);
    expect(fixture.metas[0].content).toBe(color);
  });

  it("reapplies on visible and pageshow, ignores hidden, and removes listeners", () => {
    const documentTarget = new EventTarget() as EventTarget & { visibilityState: DocumentVisibilityState };
    documentTarget.visibilityState = "hidden";
    const windowTarget = new EventTarget();
    const apply = vi.fn<(reason: string) => void>();
    const unbind = bindMobileThemeSurfaceLifecycle({ documentTarget, windowTarget, apply });

    documentTarget.dispatchEvent(new Event("visibilitychange"));
    expect(apply).not.toHaveBeenCalled();
    documentTarget.visibilityState = "visible";
    documentTarget.dispatchEvent(new Event("visibilitychange"));
    windowTarget.dispatchEvent(new Event("pageshow"));
    expect(apply).toHaveBeenCalledTimes(2);
    expect(apply.mock.calls[0][0]).toBe("visibilitychange:visible");
    expect(apply.mock.calls[1][0]).toBe("pageshow:persisted=false");

    unbind();
    documentTarget.dispatchEvent(new Event("visibilitychange"));
    windowTarget.dispatchEvent(new Event("pageshow"));
    expect(apply).toHaveBeenCalledTimes(2);
  });
});
