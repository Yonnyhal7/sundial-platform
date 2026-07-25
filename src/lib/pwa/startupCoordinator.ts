import type { NotificationAudience } from "@/lib/notifications";

export type PwaAudienceResolution =
  | { status: "assigned"; audience: NotificationAudience | null }
  | { status: "unassigned"; audience: null }
  | { status: "offline_unknown"; audience: null }
  | { status: "transport_error"; audience: null };

export type PwaStartupState =
  | "booting"
  | "hydrating_cached_state"
  | "checking_audience"
  | "onboarding_required"
  | "retry_required"
  | "ready"
  | "recovery_required"
  | "application_reload_pending";

export type PwaStartupSnapshot = {
  state: PwaStartupState;
  cacheResolved: boolean;
  recoveryRequired: boolean;
  audience: PwaAudienceResolution | null;
};

export type PwaStartupEvent =
  | { type: "react_mounted" }
  | { type: "audience_lookup_started" }
  | { type: "cache_resolved"; recoveryRequired: boolean }
  | { type: "audience_resolved"; result: PwaAudienceResolution }
  | { type: "onboarding_completed"; audience: NotificationAudience }
  | { type: "application_reload_pending" };

export const initialPwaStartupSnapshot: PwaStartupSnapshot = {
  state: "booting",
  cacheResolved: false,
  recoveryRequired: false,
  audience: null,
};

export function shouldWaitForPwaRoute(
  state: PwaStartupState,
  routeFallbackMounted: boolean
) {
  return state === "ready" && routeFallbackMounted;
}

function settleStartup(
  snapshot: PwaStartupSnapshot
): PwaStartupSnapshot {
  if (!snapshot.cacheResolved || !snapshot.audience) return snapshot;

  switch (snapshot.audience.status) {
    case "assigned":
      return {
        ...snapshot,
        state: snapshot.recoveryRequired ? "recovery_required" : "ready",
      };
    case "unassigned":
      return { ...snapshot, state: "onboarding_required" };
    case "offline_unknown":
      return { ...snapshot, state: "recovery_required" };
    case "transport_error":
      return { ...snapshot, state: "retry_required" };
  }
}

export function reducePwaStartup(
  snapshot: PwaStartupSnapshot,
  event: PwaStartupEvent
): PwaStartupSnapshot {
  if (
    snapshot.state === "application_reload_pending" ||
    snapshot.state === "ready"
  ) {
    return snapshot;
  }

  switch (event.type) {
    case "react_mounted":
      return { ...snapshot, state: "hydrating_cached_state" };
    case "audience_lookup_started":
      return { ...snapshot, state: "checking_audience", audience: null };
    case "cache_resolved":
      return settleStartup({
        ...snapshot,
        cacheResolved: true,
        recoveryRequired: event.recoveryRequired,
      });
    case "audience_resolved":
      return settleStartup({ ...snapshot, audience: event.result });
    case "onboarding_completed":
      return {
        ...snapshot,
        state: snapshot.recoveryRequired ? "recovery_required" : "ready",
        audience: { status: "assigned", audience: event.audience },
      };
    case "application_reload_pending":
      return { ...snapshot, state: "application_reload_pending" };
  }
}

const audienceLookups = new Map<string, Promise<PwaAudienceResolution>>();

export function reuseAudienceLookup(
  schoolId: string,
  lookup: () => Promise<PwaAudienceResolution>
) {
  const existing = audienceLookups.get(schoolId);
  if (existing) return existing;

  const promise = lookup().finally(() => {
    window.setTimeout(() => {
      if (audienceLookups.get(schoolId) === promise) {
        audienceLookups.delete(schoolId);
      }
    }, 0);
  });
  audienceLookups.set(schoolId, promise);
  return promise;
}

export function isInstalledPwaLaunch(
  matchStandalone: boolean,
  navigatorStandalone: unknown
) {
  return matchStandalone || navigatorStandalone === true;
}
