"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
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
import {
  hidePwaLaunchScreen,
} from "@/lib/pwa/launchScreen";
import { recordPwaResumeDiagnostic } from "@/lib/pwa/resumeDiagnostics";
import {
  initialPwaStartupSnapshot,
  isInstalledPwaLaunch,
  reducePwaStartup,
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
  const [handoffComplete, setHandoffComplete] = useState(false);
  const diagnosticsRef = useRef(new Set<string>());
  const previousStartupStateRef = useRef(startup.state);

  const recordOnce = useCallback((type: Parameters<typeof recordPwaResumeDiagnostic>[0], detail?: string) => {
    if (diagnosticsRef.current.has(type)) return;
    diagnosticsRef.current.add(type);
    recordPwaResumeDiagnostic(type, detail);
  }, []);

  const runAudienceLookup = useCallback(() => {
    dispatch({ type: "audience_lookup_started" });
    recordPwaResumeDiagnostic("audience_lookup_started");
    const installedApp = isInstalledPwaLaunch(
      window.matchMedia("(display-mode: standalone)").matches,
      (navigator as Navigator & { standalone?: boolean }).standalone
    );
    void reuseAudienceLookup(schoolId, () =>
      resolveAudience(schoolId, school, installedApp)
    ).then((result) => {
      recordPwaResumeDiagnostic("audience_lookup_result", result.status);
      recordPwaResumeDiagnostic(
        "device_registration_result",
        result.status === "assigned"
          ? "registered"
          : result.status === "unassigned"
            ? "not_registered"
            : result.status
      );
      dispatch({ type: "audience_resolved", result });
    });
  }, [school, schoolId]);

  useEffect(() => {
    recordOnce("react_hydration_start");
    recordOnce("react_startup_boundary_mounted");
    recordOnce("react_mounted");
    recordOnce("tenant_resolved");
    recordOnce("cache_hydration_started");
    dispatch({ type: "react_mounted" });
    runAudienceLookup();
    return () => {
      recordPwaResumeDiagnostic("startup_boundary_unmounted");
    };
  }, [recordOnce, runAudienceLookup]);

  useEffect(() => {
    const previous = previousStartupStateRef.current;
    if (previous !== startup.state) {
      recordPwaResumeDiagnostic(
        "startup_state_transition",
        `${previous}->${startup.state}`
      );
      previousStartupStateRef.current = startup.state;
    }
  }, [startup.state]);

  useEffect(() => {
    if (!cacheHydrated) return;
    recordOnce(
      "cache_hydration_complete",
      snapshot ? "available" : "empty"
    );
    dispatch({
      type: "cache_resolved",
      recoveryRequired:
        !snapshot && (!isOnline || syncState === "offline-empty"),
    });
  }, [cacheHydrated, isOnline, recordOnce, snapshot, syncState]);

  const stableState =
    startup.state === "onboarding_required" ||
    startup.state === "retry_required" ||
    startup.state === "ready" ||
    startup.state === "recovery_required";

  useEffect(() => {
    if (!stableState || handoffComplete) return;

    let observer: MutationObserver | null = null;
    let firstFrame = 0;
    let secondFrame = 0;

    const completeHandoff = () => {
      firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => {
          recordOnce("stable_destination_painted", startup.state);
          recordOnce("react_loader_hidden");
          hidePwaLaunchScreen(
            startup.state === "recovery_required"
              ? "recovery_required"
              : startup.state === "retry_required"
                ? "audience_retry_required"
                : startup.state === "ready"
                  ? "app_shell_ready"
                  : "onboarding_required"
          );
          recordOnce("launch_shell_removed", startup.state);
          setHandoffComplete(true);
        });
      });
    };

    const routeIsLoading = shouldWaitForPwaRoute(
      startup.state,
      Boolean(document.querySelector(ROUTE_LOADING_SELECTOR))
    );

    if (routeIsLoading) {
      recordOnce("react_loader_rendered");
      observer = new MutationObserver(() => {
        if (document.querySelector(ROUTE_LOADING_SELECTOR)) return;
        observer?.disconnect();
        observer = null;
        completeHandoff();
      });
      observer.observe(document.body, { childList: true, subtree: true });
    } else {
      completeHandoff();
    }

    return () => {
      observer?.disconnect();
      if (firstFrame) window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [handoffComplete, recordOnce, stableState, startup.state]);

  useEffect(() => {
    if (!handoffComplete) return;
    if (startup.state === "ready") {
      document.documentElement.dataset.pwaStartupReady = "true";
      recordOnce("app_ready");
      recordOnce("app_shell_revealed");
    }
    if (startup.state === "recovery_required") {
      document.documentElement.dataset.pwaStartupReady = "true";
      recordOnce("recovery_shown");
    }
    if (startup.state === "onboarding_required") {
      recordOnce("onboarding_shown");
      const paintFrame = window.requestAnimationFrame(() =>
        recordOnce("audience_screen_painted")
      );
      return () => window.cancelAnimationFrame(paintFrame);
    }
  }, [handoffComplete, recordOnce, startup.state]);

  const audience =
    startup.audience?.status === "assigned"
      ? startup.audience.audience
      : null;
  const context = useMemo(
    () => ({ audience, startupReady: startup.state === "ready" }),
    [audience, startup.state]
  );
  const showOnboarding = startup.state === "onboarding_required";
  const showApp = startup.state === "ready" && handoffComplete;
  const appDestinationMounted = startup.state === "ready";
  const showRecovery = startup.state === "recovery_required";
  const showRetry =
    startup.state === "retry_required" ||
    (startup.state === "checking_audience" && handoffComplete);

  return (
    <PwaStartupContext.Provider value={context}>
      <div
        data-pwa-startup-state={startup.state}
        style={{ visibility: appDestinationMounted ? "visible" : "hidden" }}
        aria-hidden={!showApp}
      >
        {children}
      </div>
      {showRecovery && (
        <main className="grid min-h-dvh place-items-center bg-slate-50 px-5 text-slate-950 dark:bg-black dark:text-white">
          <section className="max-w-sm rounded-[2rem] border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]">
            <h1 className="text-xl font-black">Connect to finish opening Sundial</h1>
            <p className="mt-2 text-sm font-semibold text-slate-500 dark:text-[#a3a3a3]">
              This installation needs one online sync before it can open offline.
            </p>
          </section>
        </main>
      )}
      {showRetry && (
        <main className="grid min-h-dvh place-items-center bg-slate-50 px-5 text-slate-950 dark:bg-black dark:text-white">
          <section className="max-w-sm rounded-[2rem] border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]">
            <h1 className="text-xl font-black">We couldn&apos;t finish opening Sundial</h1>
            <p className="mt-2 text-sm font-semibold text-slate-500 dark:text-[#a3a3a3]">
              Check your connection and try the device setup check again.
            </p>
            <button
              type="button"
              onClick={runAudienceLookup}
              className="mt-5 min-h-12 w-full rounded-xl bg-[var(--school-primary)] px-4 py-3 font-black text-[var(--school-primary-text)]"
            >
              Try again
            </button>
          </section>
        </main>
      )}
      {showOnboarding && (
        <NotificationAudienceOnboarding
          schoolId={schoolId}
          school={school}
          onComplete={(nextAudience) => {
            dispatch({ type: "onboarding_completed", audience: nextAudience });
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
