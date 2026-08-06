"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import NotificationAudienceOnboarding from "@/components/mobile-app/NotificationAudienceOnboarding";
import {
  OfflineSchoolDataProvider,
  useOfflineSchoolData,
} from "@/lib/offline/useOfflineSchoolData";
import {
  clearConfirmedNotificationAudience,
  getConfirmedNotificationAudience,
  getNotificationDeviceIdentityState,
  notificationDeviceHeaders,
  setConfirmedNotificationAudience,
} from "@/lib/notifications/deviceClient";
import {
  isNotificationAudience,
  type NotificationAudience,
} from "@/lib/notifications";
import { hidePwaLaunchScreen } from "@/lib/pwa/launchScreen";
import { recordPwaResumeDiagnostic } from "@/lib/pwa/resumeDiagnostics";
import {
  hasPwaDestination,
  initialPwaStartupSnapshot,
  isInstalledPwaLaunch,
  isPwaStartupComplete,
  reducePwaStartup,
  resolveLocalAudienceState,
  reuseAudienceLookup,
  shouldWaitForPwaRoute,
  type PwaAudienceResolution,
} from "@/lib/pwa/startupCoordinator";

type PwaStartupContextValue = {
  audience: NotificationAudience | null;
  startupReady: boolean;
};

const PwaStartupContext = createContext<PwaStartupContextValue>({
  audience: null,
  startupReady: false,
});

const AUDIENCE_LOOKUP_TIMEOUT_MS = 4_000;
const ROUTE_LOADING_SELECTOR = '[data-pwa-route-loading="true"]';

// Failure ceilings, never minimums. Startup never waits for one of these on the
// healthy path; they exist so a wedged probe, a stuck route fallback or a
// throttled frame callback cannot strand the launch overlay.
const CACHE_PROBE_FAILSAFE_MS = 4_000;
const ROUTE_FALLBACK_MAX_WAIT_MS = 3_000;
const PAINT_HANDOFF_FALLBACK_MS = 300;

/**
 * Device evidence. Every number is relative to navigation start, which is the
 * earliest moment the web layer exists — so any black the user sees *before*
 * 0 ms is the platform's own launch surface and no web code can shorten it.
 * Readable on a real device over Safari Web Inspector or chrome://inspect.
 */
function reportStartupTimeline(phase: string) {
  try {
    const navigation = performance.getEntriesByType(
      "navigation"
    )[0] as PerformanceNavigationTiming | undefined;
    const paint = performance
      .getEntriesByType("paint")
      .find((entry) => entry.name === "first-contentful-paint");

    console.info("[sundial:startup]", {
      destination: phase,
      standalone: window.matchMedia("(display-mode: standalone)").matches,
      ttfbMs: navigation ? Math.round(navigation.responseStart) : null,
      documentCompleteMs: navigation
        ? Math.round(navigation.responseEnd)
        : null,
      firstContentfulPaintMs: paint ? Math.round(paint.startTime) : null,
      launchOverlayReleasedMs: Math.round(performance.now()),
      note: "relative to navigation start; black before 0ms is the platform launch surface",
    });
  } catch {
    // Diagnostics must never affect startup.
  }
}

/**
 * Background reconciliation of the device's notification audience. This never
 * gates startup: the launch destination is chosen from local state, and this
 * result is only persisted for the next launch.
 */
export async function resolveAudience(
  schoolId: string,
  school: string,
  installedApp: boolean
): Promise<PwaAudienceResolution> {
  if (!installedApp) return { status: "assigned", audience: null };

  const identityState = getNotificationDeviceIdentityState(schoolId);
  if (identityState.status === "unavailable") {
    clearConfirmedNotificationAudience(schoolId);
    return { status: "unassigned", audience: null };
  }
  if (identityState.status === "missing") {
    clearConfirmedNotificationAudience(schoolId);
    return { status: "unassigned", audience: null };
  }
  const identity = identityState.identity;
  if (!navigator.onLine) {
    const cachedAudience = getConfirmedNotificationAudience(schoolId);
    return cachedAudience
      ? { status: "assigned", audience: cachedAudience }
      : { status: "offline_unknown", audience: null };
  }

  try {
    const response = await fetch(
      `/api/schools/${encodeURIComponent(school)}/notifications`,
      {
        headers: notificationDeviceHeaders(identity),
        signal: AbortSignal.timeout(AUDIENCE_LOOKUP_TIMEOUT_MS),
      }
    );
    if (response.status === 401 || response.status === 404) {
      clearConfirmedNotificationAudience(schoolId);
      return { status: "unassigned", audience: null };
    }
    if (!response.ok) return { status: "transport_error", audience: null };

    const payload = await response.json();
    const audience = String(payload?.audience || "");
    if (!isNotificationAudience(audience)) {
      return { status: "transport_error", audience: null };
    }
    setConfirmedNotificationAudience(schoolId, audience);
    return { status: "assigned", audience };
  } catch {
    return navigator.onLine
      ? { status: "transport_error", audience: null }
      : { status: "offline_unknown", audience: null };
  }
}

function StartupCoordinator({
  schoolId,
  school,
  children,
}: {
  schoolId: string;
  school: string;
  children: ReactNode;
}) {
  const { cacheHydrated, snapshot, isOnline, syncState } =
    useOfflineSchoolData();
  const [startup, dispatch] = useReducer(
    reducePwaStartup,
    initialPwaStartupSnapshot
  );
  const diagnosticsRef = useRef(new Set<string>());
  const previousPhaseRef = useRef(startup.phase);
  const handoffScheduledRef = useRef(false);

  const recordOnce = useCallback((type: Parameters<typeof recordPwaResumeDiagnostic>[0], detail?: string) => {
    if (diagnosticsRef.current.has(type)) return;
    diagnosticsRef.current.add(type);
    recordPwaResumeDiagnostic(type, detail);
  }, []);

  // Synchronous local state decides the destination. No network involved.
  useEffect(() => {
    recordOnce("react_hydration_start");
    recordOnce("react_startup_boundary_mounted");
    recordOnce("react_mounted");
    recordOnce("tenant_resolved");
    recordOnce("cache_hydration_started");

    const installedApp = isInstalledPwaLaunch(
      window.matchMedia("(display-mode: standalone)").matches,
      (navigator as Navigator & { standalone?: boolean }).standalone
    );
    const local = resolveLocalAudienceState(
      installedApp,
      getConfirmedNotificationAudience(schoolId)
    );
    recordPwaResumeDiagnostic(
      "audience_lookup_result",
      local.audienceRequired ? "local_missing" : "local_present"
    );
    dispatch({ type: "local_state_resolved", ...local });

    // Reconciliation only — the result is persisted for the next launch.
    recordPwaResumeDiagnostic("audience_lookup_started");
    void reuseAudienceLookup(schoolId, () =>
      resolveAudience(schoolId, school, installedApp)
    ).then((result) => {
      recordPwaResumeDiagnostic(
        "device_registration_result",
        result.status === "assigned"
          ? "registered"
          : result.status === "unassigned"
            ? "not_registered"
            : result.status
      );
      dispatch({ type: "audience_sync_completed", result });
    });

    return () => {
      recordPwaResumeDiagnostic("startup_boundary_unmounted");
    };
  }, [recordOnce, school, schoolId]);

  useEffect(() => {
    const previous = previousPhaseRef.current;
    if (previous !== startup.phase) {
      recordPwaResumeDiagnostic(
        "startup_state_transition",
        `${previous}->${startup.phase}`
      );
      previousPhaseRef.current = startup.phase;
    }
  }, [startup.phase]);

  useEffect(() => {
    if (!cacheHydrated) return;
    recordOnce("cache_hydration_complete", snapshot ? "available" : "empty");
    dispatch({
      type: "cache_resolved",
      recoveryRequired:
        !snapshot && (!isOnline || syncState === "offline-empty"),
    });
  }, [cacheHydrated, isOnline, recordOnce, snapshot, syncState]);

  // Failure ceiling: IndexedDB can hang when another tab holds an upgrade
  // transaction. The server already rendered a usable screen, so give up on the
  // probe rather than showing a loader the user cannot dismiss.
  useEffect(() => {
    if (cacheHydrated || startup.cacheResolved) return;
    const failsafe = window.setTimeout(() => {
      recordOnce("cache_hydration_complete", "abandoned");
      dispatch({ type: "cache_probe_abandoned" });
    }, CACHE_PROBE_FAILSAFE_MS);
    return () => window.clearTimeout(failsafe);
  }, [cacheHydrated, recordOnce, startup.cacheResolved]);

  const destinationChosen = hasPwaDestination(startup);
  const startupComplete = isPwaStartupComplete(startup);

  // The single handoff. The destination is already rendered underneath the
  // overlay; this only releases the overlay once that destination has painted,
  // so one surface replaces another with no gap and no flash.
  useEffect(() => {
    if (!destinationChosen || startup.overlayReleased) return;
    if (handoffScheduledRef.current) return;
    handoffScheduledRef.current = true;

    let cancelled = false;
    let observer: MutationObserver | null = null;
    let firstFrame = 0;
    let secondFrame = 0;
    let paintFallback = 0;
    let routeFallbackTimer = 0;

    const finish = () => {
      if (cancelled) return;
      cancelled = true;
      recordOnce("stable_destination_painted", startup.phase);
      recordOnce("react_loader_hidden");
      hidePwaLaunchScreen(
        startup.phase === "recovery"
          ? "recovery_required"
          : startup.phase === "audience_selection"
            ? "onboarding_required"
            : "app_shell_ready"
      );
      recordOnce("launch_shell_removed", startup.phase);
      dispatch({ type: "overlay_released" });
    };

    const releaseAfterPaint = () => {
      if (cancelled) return;
      // requestAnimationFrame never fires in a hidden or throttled tab, so pair
      // it with a timeout that cannot leave the overlay up.
      paintFallback = window.setTimeout(finish, PAINT_HANDOFF_FALLBACK_MS);
      if (typeof window.requestAnimationFrame !== "function") {
        finish();
        return;
      }
      firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(finish);
      });
    };

    const routeIsLoading = shouldWaitForPwaRoute(
      startup.phase,
      Boolean(document.querySelector(ROUTE_LOADING_SELECTOR))
    );

    if (routeIsLoading) {
      recordOnce("react_loader_rendered");
      const stopWaiting = () => {
        observer?.disconnect();
        observer = null;
        releaseAfterPaint();
      };
      observer = new MutationObserver(() => {
        if (document.querySelector(ROUTE_LOADING_SELECTOR)) return;
        stopWaiting();
      });
      observer.observe(document.body, { childList: true, subtree: true });
      // Failure ceiling: a route that never resolves its fallback must not hold
      // the overlay.
      routeFallbackTimer = window.setTimeout(
        stopWaiting,
        ROUTE_FALLBACK_MAX_WAIT_MS
      );
    } else {
      releaseAfterPaint();
    }

    return () => {
      cancelled = true;
      // Allow a re-run if this tore down before releasing; the guard above
      // short-circuits once `overlayReleased` is true, so it still runs once.
      handoffScheduledRef.current = false;
      observer?.disconnect();
      if (firstFrame) window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
      if (paintFallback) window.clearTimeout(paintFallback);
      if (routeFallbackTimer) window.clearTimeout(routeFallbackTimer);
    };
  }, [destinationChosen, recordOnce, startup.overlayReleased, startup.phase]);

  useEffect(() => {
    if (!startupComplete) return;
    reportStartupTimeline(startup.phase);
    if (startup.phase === "app_ready") {
      document.documentElement.dataset.pwaStartupReady = "true";
      recordOnce("app_ready");
      recordOnce("app_shell_revealed");
    }
    if (startup.phase === "recovery") {
      document.documentElement.dataset.pwaStartupReady = "true";
      recordOnce("recovery_shown");
    }
    if (startup.phase === "audience_selection") {
      recordOnce("onboarding_shown");
      recordOnce("audience_screen_painted");
    }
  }, [recordOnce, startup.phase, startupComplete]);

  const context = useMemo(
    () => ({
      audience: startup.audience,
      startupReady: startup.phase === "app_ready",
    }),
    [startup.audience, startup.phase]
  );

  const showAudienceSelection = startup.phase === "audience_selection";
  const showRecovery = startup.phase === "recovery";
  // While a full-screen startup surface owns the viewport the application is
  // still mounted and initializing underneath it, but must not be reachable.
  const applicationCovered =
    !startup.overlayReleased || showAudienceSelection || showRecovery;

  return (
    <PwaStartupContext.Provider value={context}>
      <div
        data-pwa-startup-phase={startup.phase}
        aria-hidden={applicationCovered || undefined}
      >
        {children}
      </div>
      {showRecovery && (
        <main className="sundial-startup-surface">
          <section className="max-w-sm rounded-[2rem] border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]">
            <h1 className="text-xl font-black">Connect to finish opening Sundial</h1>
            <p className="mt-2 text-sm font-semibold text-slate-500 dark:text-[#a3a3a3]">
              This installation needs one online sync before it can open offline.
            </p>
          </section>
        </main>
      )}
      {showAudienceSelection && (
        <NotificationAudienceOnboarding
          schoolId={schoolId}
          school={school}
          onComplete={(nextAudience) => {
            dispatch({ type: "audience_selected", audience: nextAudience });
          }}
        />
      )}
    </PwaStartupContext.Provider>
  );
}

export default function PwaStartupBoundary({
  schoolId,
  school,
  children,
}: {
  schoolId: string;
  school: string;
  children: ReactNode;
}) {
  return (
    <OfflineSchoolDataProvider schoolId={schoolId} schoolSlug={school}>
      <StartupCoordinator schoolId={schoolId} school={school}>
        {children}
      </StartupCoordinator>
    </OfflineSchoolDataProvider>
  );
}

export function usePwaStartup() {
  return useContext(PwaStartupContext);
}
