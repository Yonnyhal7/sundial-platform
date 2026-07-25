"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
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
  const [selectedAudience, setSelectedAudience] =
    useState<NotificationAudience | null>(null);

  useEffect(() => {
    recordPwaResumeDiagnostic("react_mounted");
    recordPwaResumeDiagnostic("tenant_resolved");
    dispatch({ type: "react_mounted" });
    dispatch({ type: "audience_lookup_started" });
    recordPwaResumeDiagnostic("audience_lookup_started");

    const installedApp = window.matchMedia(
      "(display-mode: standalone)"
    ).matches;
    void reuseAudienceLookup(schoolId, () =>
      resolveAudience(schoolId, school, installedApp)
    ).then((result) => {
      recordPwaResumeDiagnostic("audience_lookup_result", result.status);
      dispatch({ type: "audience_resolved", result });
    });
  }, [school, schoolId]);

  useEffect(() => {
    if (!cacheHydrated) return;
    recordPwaResumeDiagnostic(
      "cached_snapshot_ready",
      snapshot ? "available" : "empty"
    );
    dispatch({
      type: "cache_resolved",
      recoveryRequired:
        !snapshot && (!isOnline || syncState === "offline-empty"),
    });
  }, [cacheHydrated, isOnline, snapshot, syncState]);

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
        recordPwaResumeDiagnostic("launch_shell_removed", startup.state);
        if (startup.state === "ready") {
          recordPwaResumeDiagnostic("app_ready");
        } else if (startup.state === "recovery_required") {
          recordPwaResumeDiagnostic("recovery_shown");
        }
        setHandoffComplete(true);
      });
    });

    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [handoffComplete, stableState, startup.state]);

  const audience =
    selectedAudience ||
    (startup.audience?.status === "assigned"
      ? startup.audience.audience
      : null);
  const context = useMemo(
    () => ({ audience, startupReady: stableState }),
    [audience, stableState]
  );
  const showOnboarding =
    startup.state === "onboarding_required" && !selectedAudience;

  return (
    <PwaStartupContext.Provider value={context}>
      <div
        data-pwa-startup-state={startup.state}
        style={{
          visibility:
            handoffComplete && !showOnboarding ? "visible" : "hidden",
        }}
        aria-hidden={!handoffComplete || showOnboarding}
      >
        {children}
      </div>
      {showOnboarding && (
        <NotificationAudienceOnboarding
          schoolId={schoolId}
          school={school}
          onComplete={(nextAudience) => {
            recordPwaResumeDiagnostic("onboarding_selected");
            setSelectedAudience(nextAudience);
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
