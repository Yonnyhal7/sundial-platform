export const PWA_LAUNCH_SCREEN_ID = "sundial-pwa-launch";

export const PWA_LAUNCH_CRITICAL_CSS = `
  html, body {
    min-height: 100%;
    margin: 0;
    background: #f8fafc;
  }
  html.dark, html.dark body {
    background: #050505;
  }
  #${PWA_LAUNCH_SCREEN_ID} {
    position: fixed;
    inset: 0;
    z-index: 2147483646;
    min-height: 100dvh;
    display: none;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    padding: calc(2rem + env(safe-area-inset-top)) 1.5rem calc(2rem + env(safe-area-inset-bottom));
    background: #f8fafc;
    color: #0f172a;
    color-scheme: light;
  }
  html[data-pwa-app-launch="true"] #${PWA_LAUNCH_SCREEN_ID}:not([hidden]) {
    display: flex;
  }
  html.dark #${PWA_LAUNCH_SCREEN_ID} {
    background: #050505;
    color: #fff;
    color-scheme: dark;
  }
  #${PWA_LAUNCH_SCREEN_ID}[hidden] { display: none; }
  .sundial-pwa-launch-card {
    display: grid;
    width: min(100%, 22rem);
    justify-items: center;
    gap: 1rem;
    text-align: center;
  }
  .sundial-pwa-launch-icon {
    width: 5.25rem;
    height: 5.75rem;
    object-fit: contain;
  }
  .sundial-pwa-launch-title {
    margin: .25rem 0 0;
    font: 800 clamp(1.75rem, 8vw, 2.25rem)/1.05 system-ui, -apple-system, sans-serif;
    letter-spacing: -.035em;
  }
  .sundial-pwa-launch-copy {
    min-height: 1.25rem;
    margin: 0;
    color: #64748b;
    font: 600 .9rem/1.4 system-ui, -apple-system, sans-serif;
  }
  html.dark .sundial-pwa-launch-copy { color: #a3a3a3; }
  .sundial-pwa-launch-indicator {
    width: 2.75rem;
    height: .25rem;
    overflow: hidden;
    border-radius: 999px;
    background: color-mix(in srgb, var(--pwa-launch-accent, #2563eb) 18%, transparent);
  }
  .sundial-pwa-launch-indicator::after {
    content: "";
    display: block;
    width: 45%;
    height: 100%;
    border-radius: inherit;
    background: var(--pwa-launch-accent, #2563eb);
    animation: sundial-pwa-launch 1.35s ease-in-out infinite alternate;
  }
  @keyframes sundial-pwa-launch {
    from { transform: translateX(0); }
    to { transform: translateX(122%); }
  }
  @media (prefers-reduced-motion: reduce) {
    .sundial-pwa-launch-indicator::after {
      width: 100%;
      animation: none;
      opacity: .72;
    }
  }
`;

export function getPwaLaunchPrepaintScript() {
  return `(()=>{const r=document.documentElement,p=location.pathname;r.dataset.pwaAppLaunch=/^\\/(?:[^/]+\\/)?app(?:\\/|$)/.test(p)?"true":"false";if(r.dataset.pwaAppLaunch==="true"){r.dataset.pwaLaunch="pending";r.dataset.pwaStartupReady="false"}else{r.dataset.pwaStartupReady="true"}})()`;
}

export type PwaStartupReadiness =
  | "booting"
  | "cached_snapshot_ready"
  | "app_shell_ready"
  | "onboarding_required"
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
