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
  getNotificationDeviceIdentityState,
  notificationDeviceHeaders,
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
  reducePwaStartup,
  reuseAudienceLookup,
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

async function resolveAudience(
  schoolId: string,
  school: string,
  installedApp: boolean
): Promise<PwaAudienceResolution> {
  if (!installedApp) return { status: "assigned", audience: null };
  if (!navigator.onLine) return { status: "offline_unknown", audience: null };

  const identityState = getNotificationDeviceIdentityState(schoolId);
  if (identityState.status === "unavailable") {
    return { status: "transport_error", audience: null };
  }
  if (identityState.status === "missing") {
    return { status: "unassigned", audience: null };
  }
  const identity = identityState.identity;

  try {
    const response = await fetch(
      `/api/schools/${encodeURIComponent(school)}/notifications`,
      {
        headers: notificationDeviceHeaders(identity),
        signal: AbortSignal.timeout(AUDIENCE_LOOKUP_TIMEOUT_MS),
      }
    );
    if (response.status === 401 || response.status === 404) {
      return { status: "unassigned", audience: null };
    }
    if (!response.ok) return { status: "transport_error", audience: null };

    const payload = await response.json();
    const audience = String(payload?.audience || "");
    return isNotificationAudience(audience)
      ? { status: "assigned", audience }
      : { status: "transport_error", audience: null };
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

  const recordOnce = useCallback((type: Parameters<typeof recordPwaResumeDiagnostic>[0], detail?: string) => {
    if (diagnosticsRef.current.has(type)) return;
    diagnosticsRef.current.add(type);
    recordPwaResumeDiagnostic(type, detail);
  }, []);

  useEffect(() => {
    recordOnce("react_mounted");
    recordOnce("tenant_resolved");
    dispatch({ type: "react_mounted" });
    dispatch({ type: "audience_lookup_started" });
    recordOnce("audience_lookup_started");

    const installedApp = window.matchMedia(
      "(display-mode: standalone)"
    ).matches;
    void reuseAudienceLookup(schoolId, () =>
      resolveAudience(schoolId, school, installedApp)
    ).then((result) => {
      recordOnce("audience_lookup_result", result.status);
      dispatch({ type: "audience_resolved", result });
    });
  }, [recordOnce, school, schoolId]);

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
    startup.state === "ready" ||
    startup.state === "recovery_required";

  useEffect(() => {
    if (!stableState || handoffComplete) return;

    let secondFrame = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        hidePwaLaunchScreen(
          startup.state === "recovery_required"
            ? "recovery_required"
            : startup.state === "ready"
              ? "app_shell_ready"
              : "onboarding_required"
        );
        recordOnce("launch_shell_removed", startup.state);
        setHandoffComplete(true);
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [handoffComplete, recordOnce, stableState, startup.state]);

  useEffect(() => {
    if (!handoffComplete) return;
    if (startup.state === "ready") {
      document.documentElement.dataset.pwaStartupReady = "true";
      recordOnce("app_ready");
    }
    if (startup.state === "recovery_required") {
      document.documentElement.dataset.pwaStartupReady = "true";
      recordOnce("recovery_shown");
    }
    if (startup.state === "onboarding_required") recordOnce("onboarding_shown");
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
  const showRecovery =
    startup.state === "recovery_required" && handoffComplete;

  return (
    <PwaStartupContext.Provider value={context}>
      <div
        data-pwa-startup-state={startup.state}
        style={{ visibility: showApp ? "visible" : "hidden" }}
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
