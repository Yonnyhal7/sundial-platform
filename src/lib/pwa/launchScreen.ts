export const PWA_LAUNCH_SCREEN_ID = "sundial-pwa-launch";
// Sundial's launch surface. `background` is the product's established launch
// colour (the same slate-50 the root manifest and the app shell already use);
// the `*Dark` values are the existing Sundial dark surfaces. The synchronous
// theme bootstrap sets `.dark` on <html> before this CSS is applied, so the
// launch surface matches the resolved appearance on the very first paint and a
// dark-mode user never sees a bright flash.
export const PWA_LAUNCH_VISUAL = {
  background: "#f8fafc",
  backgroundDark: "#101214",
  accent: "#f8c531",
  track: "#e2e8f0",
  trackDark: "#374151",
  copyColor: "#64748b",
  copyColorDark: "#a1a1aa",
  titleColor: "#0f172a",
  titleColorDark: "#ffffff",
  // A small bundled mark, not the 605 KB source icon. It renders at 7.5rem, so
  // 288px covers high-DPI screens while staying light enough to arrive with the
  // first frame instead of seconds later on a slow connection.
  iconSrc: "/sundial-launch-mark.webp",
  title: "Sundial",
  copy: "Opening your school app…",
  markWidth: 288,
  markHeight: 313,
} as const;

export const PWA_LAUNCH_CRITICAL_CSS = `
  html, body {
    min-height: 100%;
    margin: 0;
  }
  html[data-pwa-app-launch="true"][data-pwa-launch="pending"],
  html[data-pwa-app-launch="true"][data-pwa-launch="pending"] body {
    background: ${PWA_LAUNCH_VISUAL.background};
  }
  html.dark[data-pwa-app-launch="true"][data-pwa-launch="pending"],
  html.dark[data-pwa-app-launch="true"][data-pwa-launch="pending"] body {
    background: ${PWA_LAUNCH_VISUAL.backgroundDark};
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
    background: ${PWA_LAUNCH_VISUAL.background};
    color: ${PWA_LAUNCH_VISUAL.titleColor};
    color-scheme: light;
  }
  html.dark #${PWA_LAUNCH_SCREEN_ID} {
    background: ${PWA_LAUNCH_VISUAL.backgroundDark};
    color: ${PWA_LAUNCH_VISUAL.titleColorDark};
    color-scheme: dark;
  }
  html[data-pwa-app-launch="true"] #${PWA_LAUNCH_SCREEN_ID}:not([hidden]) {
    display: flex;
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
    display: block;
    width: 7.5rem;
    height: auto;
  }
  .sundial-pwa-launch-title {
    margin: .25rem 0 0;
    color: inherit;
    font: 800 clamp(2rem, 9vw, 2.75rem)/1.05 system-ui, -apple-system, sans-serif;
    letter-spacing: -.035em;
  }
  .sundial-pwa-launch-copy {
    min-height: 1.25rem;
    margin: 0;
    color: ${PWA_LAUNCH_VISUAL.copyColor};
    font: 500 1rem/1.4 system-ui, -apple-system, sans-serif;
  }
  html.dark .sundial-pwa-launch-copy {
    color: ${PWA_LAUNCH_VISUAL.copyColorDark};
  }
  .sundial-pwa-launch-indicator {
    width: 3.5rem;
    height: .3rem;
    overflow: hidden;
    border-radius: 999px;
    background: ${PWA_LAUNCH_VISUAL.track};
  }
  html.dark .sundial-pwa-launch-indicator {
    background: ${PWA_LAUNCH_VISUAL.trackDark};
  }
  .sundial-pwa-launch-indicator::after {
    content: "";
    display: block;
    width: 45%;
    height: 100%;
    border-radius: inherit;
    background: var(--pwa-launch-accent, ${PWA_LAUNCH_VISUAL.accent});
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
  return `(()=>{const w=window,r=document.documentElement,p=location.pathname,k="__SUNDIAL_PWA_RESUME_DIAGNOSTICS__",add=(type,detail)=>{const e={type,at:new Date().toISOString(),visibility:document.visibilityState,detail:detail||Math.round(performance.now())+"ms"};w[k]=[...(w[k]||[]),e].slice(-48);try{sessionStorage.setItem("sundial:pwa-resume-diagnostics",JSON.stringify(w[k]))}catch{}};add("navigation_start","0ms");r.dataset.pwaAppLaunch=/^\\/(?:[^/]+\\/)?app(?:\\/|$)/.test(p)?"true":"false";if(r.dataset.pwaAppLaunch==="true"){r.dataset.pwaLaunch="pending";r.dataset.pwaStartupReady="false"}else{r.dataset.pwaStartupReady="true";r.style.removeProperty("background-color")}add("first_root_html_received");if("PerformanceObserver"in w){try{const o=new PerformanceObserver((list)=>{if(list.getEntries().some((e)=>e.name==="first-paint")){add("first_paint");o.disconnect()}});o.observe({type:"paint",buffered:true})}catch{}}})()`;
}

export type PwaStartupReadiness =
  | "booting"
  | "cached_snapshot_ready"
  | "app_shell_ready"
  | "onboarding_required"
  | "audience_retry_required"
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
  document.documentElement.style.removeProperty("background-color");
  document.body.style.removeProperty("background-color");
  document.documentElement.dataset.pwaLaunch = "ready";
}

export function preparePwaLaunchScreenForReload() {
  showPwaLaunchScreen("application_reload_pending");

  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}
