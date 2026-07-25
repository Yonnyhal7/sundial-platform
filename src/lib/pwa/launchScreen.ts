export const PWA_LAUNCH_SCREEN_ID = "sundial-pwa-launch";
export const PWA_LAUNCH_MAX_MS = 4_000;

export type PwaStartupReadiness =
  | "cached_snapshot_ready"
  | "app_shell_ready"
  | "application_reload_pending"
  | "recovery_required";

function getLaunchScreen() {
  if (typeof document === "undefined") return null;
  return document.getElementById(PWA_LAUNCH_SCREEN_ID);
}

export function showPwaLaunchScreen(
  readiness: PwaStartupReadiness = "application_reload_pending"
) {
  const screen = getLaunchScreen();
  if (!screen) return;
  screen.dataset.readiness = readiness;
  screen.hidden = false;
  document.documentElement.dataset.pwaLaunch = "pending";
}

export function hidePwaLaunchScreen(readiness: PwaStartupReadiness) {
  const screen = getLaunchScreen();
  if (!screen) return;
  screen.dataset.readiness = readiness;
  screen.hidden = true;
  document.documentElement.dataset.pwaLaunch = "ready";
}

export function preparePwaLaunchScreenForReload() {
  showPwaLaunchScreen("application_reload_pending");

  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}
