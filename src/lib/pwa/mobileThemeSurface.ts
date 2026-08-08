import { PWA_LAUNCH_VISUAL } from "@/lib/pwa/launchScreen";
import type { Theme } from "@/lib/themeScope";

type LifecycleTarget = Pick<EventTarget, "addEventListener" | "removeEventListener">;

export function getMobileThemeSurfaceColor(theme: Theme) {
  return theme === "dark"
    ? PWA_LAUNCH_VISUAL.backgroundDark
    : PWA_LAUNCH_VISUAL.background;
}

export function applyMobileThemeSurface(theme: Theme, target = document) {
  const color = getMobileThemeSurfaceColor(theme);

  target.documentElement.style.backgroundColor = color;
  target.documentElement.style.setProperty("--pwa-theme-surface", color);
  target.body.style.backgroundColor = color;
  target
    .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
    .forEach((meta) => meta.setAttribute("content", color));
  target
    .querySelectorAll<HTMLElement>(
      "[data-pwa-status-bar-background], [data-mobile-app-theme-root]"
    )
    .forEach((surface) => {
      surface.style.backgroundColor = color;
    });
}

export function bindMobileThemeSurfaceLifecycle({
  documentTarget,
  windowTarget,
  apply,
}: {
  documentTarget: LifecycleTarget & { visibilityState: DocumentVisibilityState };
  windowTarget: LifecycleTarget;
  apply: (reason: string) => void;
}) {
  const handleVisibilityChange = () => {
    if (documentTarget.visibilityState === "visible") apply("visibilitychange:visible");
  };
  const handlePageShow = (event: Event) =>
    apply(`pageshow:persisted=${String(Boolean((event as PageTransitionEvent).persisted))}`);

  documentTarget.addEventListener("visibilitychange", handleVisibilityChange);
  windowTarget.addEventListener("pageshow", handlePageShow);

  return () => {
    documentTarget.removeEventListener("visibilitychange", handleVisibilityChange);
    windowTarget.removeEventListener("pageshow", handlePageShow);
  };
}
