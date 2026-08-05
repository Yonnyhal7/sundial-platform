import type { NotificationAudience } from "@/lib/notifications";

export type PwaAudienceResolution =
  | { status: "assigned"; audience: NotificationAudience | null }
  | { status: "unassigned"; audience: null }
  | { status: "offline_unknown"; audience: null }
  | { status: "transport_error"; audience: null };

/**
 * Startup readiness for the installed app.
 *
 * The launch overlay is removed when the *minimum usable app shell* is ready,
 * which means all of the following are true:
 *
 *  1. the tenant is resolved — guaranteed by the time the document exists, since
 *     the server renders tenant branding, appearance and content into the HTML;
 *  2. React has mounted the startup boundary, so the interface underneath the
 *     overlay is live rather than static markup;
 *  3. the local snapshot probe has settled, so we know whether the first screen
 *     renders cached data or the server-rendered content — or the probe has been
 *     abandoned, so a wedged IndexedDB can never strand the overlay;
 *  4. no route-level `loading.tsx` fallback is still mounted;
 *  5. one frame has painted, so the reveal shows a drawn interface.
 *
 * Readiness deliberately does NOT wait for: the notification audience lookup,
 * device registration, the background snapshot refresh, service-worker update
 * checks, route prefetching, analytics, or optional images and fonts. Those keep
 * running behind the overlay and reconcile the interface once they land.
 */
export type PwaStartupState =
  | "booting"
  | "hydrating_cached_state"
  | "ready"
  | "recovery_required"
  | "application_reload_pending";

export type PwaStartupSnapshot = {
  state: PwaStartupState;
  cacheResolved: boolean;
  recoveryRequired: boolean;
  /** Informational only — the audience never gates the launch overlay. */
  audience: PwaAudienceResolution | null;
  onboardingCompleted: boolean;
};

export type PwaStartupEvent =
  | { type: "react_mounted" }
  | { type: "cache_resolved"; recoveryRequired: boolean }
  | { type: "cache_probe_abandoned" }
  | { type: "audience_resolved"; result: PwaAudienceResolution }
  | { type: "onboarding_completed"; audience: NotificationAudience }
  | { type: "application_reload_pending" };

export const initialPwaStartupSnapshot: PwaStartupSnapshot = {
  state: "booting",
  cacheResolved: false,
  recoveryRequired: false,
  audience: null,
  onboardingCompleted: false,
};

/** The overlay waits for a route fallback only when the app is the destination. */
export function shouldWaitForPwaRoute(
  state: PwaStartupState,
  routeFallbackMounted: boolean
) {
  return state === "ready" && routeFallbackMounted;
}

/** True once the launch overlay may be removed. */
export function isPwaShellReady(state: PwaStartupState) {
  return state === "ready" || state === "recovery_required";
}

/**
 * Onboarding is a destination *above* a ready shell, not a startup gate. A
 * failed or offline lookup leaves the app usable and retries in the background.
 */
export function shouldShowAudienceOnboarding(snapshot: PwaStartupSnapshot) {
  if (snapshot.onboardingCompleted) return false;
  if (!isPwaShellReady(snapshot.state)) return false;
  return snapshot.audience?.status === "unassigned";
}

function settleStartup(snapshot: PwaStartupSnapshot): PwaStartupSnapshot {
  if (!snapshot.cacheResolved) return snapshot;

  return {
    ...snapshot,
    state: snapshot.recoveryRequired ? "recovery_required" : "ready",
  };
}

export function reducePwaStartup(
  snapshot: PwaStartupSnapshot,
  event: PwaStartupEvent
): PwaStartupSnapshot {
  if (snapshot.state === "application_reload_pending") {
    return snapshot;
  }

  switch (event.type) {
    case "react_mounted":
      return snapshot.state === "booting"
        ? { ...snapshot, state: "hydrating_cached_state" }
        : snapshot;
    case "cache_resolved":
      return settleStartup({
        ...snapshot,
        cacheResolved: true,
        recoveryRequired: event.recoveryRequired,
      });
    case "cache_probe_abandoned":
      // The probe never settled. The server already rendered a usable screen,
      // so reveal it rather than holding a loader the user cannot dismiss.
      return snapshot.cacheResolved
        ? snapshot
        : settleStartup({ ...snapshot, cacheResolved: true });
    case "audience_resolved":
      // Recorded for onboarding, never for readiness.
      return { ...snapshot, audience: event.result };
    case "onboarding_completed":
      return {
        ...snapshot,
        onboardingCompleted: true,
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
