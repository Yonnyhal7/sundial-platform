import type { NotificationAudience } from "@/lib/notifications";

export type PwaAudienceResolution =
  | { status: "assigned"; audience: NotificationAudience | null }
  | { status: "unassigned"; audience: null }
  | { status: "offline_unknown"; audience: null }
  | { status: "transport_error"; audience: null };

/**
 * Startup has exactly one owner of what fills the screen.
 *
 *   launching → audience_selection → app_ready
 *   launching → app_ready
 *   launching → recovery
 *
 * `phase` decides which full-screen surface is on top; `overlayReleased` decides
 * whether the server-rendered launch overlay still covers it. Both are monotonic
 * — startup can never fall back to an earlier phase, and the overlay can never
 * be shown again once released — so the launch screen cannot flash, remount or
 * restart.
 *
 * The destination is chosen from synchronous local state (the IndexedDB probe
 * plus the audience persisted in localStorage). No network request participates:
 * the audience sync, snapshot refresh, service-worker update check, prefetching
 * and analytics all run behind whichever surface is showing.
 */
export type PwaStartupPhase =
  | "launching"
  | "audience_selection"
  | "app_ready"
  | "recovery";

const PHASE_RANK: Record<PwaStartupPhase, number> = {
  launching: 0,
  audience_selection: 1,
  recovery: 1,
  app_ready: 2,
};

export type PwaStartupSnapshot = {
  phase: PwaStartupPhase;
  /** Monotonic false → true. The launch overlay is visible until this is true. */
  overlayReleased: boolean;
  cacheResolved: boolean;
  localStateResolved: boolean;
  recoveryRequired: boolean;
  audienceRequired: boolean;
  audience: NotificationAudience | null;
  /** Background reconciliation only — never affects `phase`. */
  audienceSync: PwaAudienceResolution | null;
};

export type PwaStartupEvent =
  | {
      type: "local_state_resolved";
      audience: NotificationAudience | null;
      audienceRequired: boolean;
    }
  | { type: "cache_resolved"; recoveryRequired: boolean }
  | { type: "cache_probe_abandoned" }
  | { type: "audience_selected"; audience: NotificationAudience }
  | { type: "audience_sync_completed"; result: PwaAudienceResolution }
  | { type: "overlay_released" };

export const initialPwaStartupSnapshot: PwaStartupSnapshot = {
  phase: "launching",
  overlayReleased: false,
  cacheResolved: false,
  localStateResolved: false,
  recoveryRequired: false,
  audienceRequired: false,
  audience: null,
  audienceSync: null,
};

/** Refuses any transition that would move startup backwards. */
function advance(
  snapshot: PwaStartupSnapshot,
  phase: PwaStartupPhase
): PwaStartupSnapshot {
  if (PHASE_RANK[phase] <= PHASE_RANK[snapshot.phase]) return snapshot;
  return { ...snapshot, phase };
}

/**
 * Decide the destination once both local inputs have settled. Only ever runs
 * while the launch overlay still owns the screen.
 */
function settleDestination(snapshot: PwaStartupSnapshot): PwaStartupSnapshot {
  if (snapshot.phase !== "launching") return snapshot;
  if (!snapshot.cacheResolved || !snapshot.localStateResolved) return snapshot;
  if (snapshot.recoveryRequired) return advance(snapshot, "recovery");
  if (snapshot.audienceRequired) return advance(snapshot, "audience_selection");
  return advance(snapshot, "app_ready");
}

export function reducePwaStartup(
  snapshot: PwaStartupSnapshot,
  event: PwaStartupEvent
): PwaStartupSnapshot {
  switch (event.type) {
    case "local_state_resolved":
      return settleDestination({
        ...snapshot,
        localStateResolved: true,
        audience: snapshot.audience ?? event.audience,
        audienceRequired: event.audienceRequired,
      });
    case "cache_resolved":
      return settleDestination({
        ...snapshot,
        cacheResolved: true,
        recoveryRequired: event.recoveryRequired,
      });
    case "cache_probe_abandoned":
      // The probe never settled. The server already rendered a usable screen,
      // so choose a destination rather than holding the overlay forever.
      return snapshot.cacheResolved
        ? snapshot
        : settleDestination({ ...snapshot, cacheResolved: true });
    case "audience_selected":
      return advance(
        { ...snapshot, audience: event.audience, audienceRequired: false },
        "app_ready"
      );
    case "audience_sync_completed":
      // Recorded for the next launch; it must never move the current one.
      return { ...snapshot, audienceSync: event.result };
    case "overlay_released":
      return snapshot.phase === "launching" || snapshot.overlayReleased
        ? snapshot
        : { ...snapshot, overlayReleased: true };
  }
}

/** True once a destination has been chosen and may be painted. */
export function hasPwaDestination(snapshot: PwaStartupSnapshot) {
  return snapshot.phase !== "launching";
}

/** True once the destination is visible and the overlay is gone. */
export function isPwaStartupComplete(snapshot: PwaStartupSnapshot) {
  return hasPwaDestination(snapshot) && snapshot.overlayReleased;
}

/**
 * The overlay waits for a route fallback only when the app itself is the
 * destination — the audience and recovery surfaces do not depend on the route.
 */
export function shouldWaitForPwaRoute(
  phase: PwaStartupPhase,
  routeFallbackMounted: boolean
) {
  return phase === "app_ready" && routeFallbackMounted;
}

/**
 * Resolve the audience from persisted local state alone. A device with no saved
 * choice goes straight to the full-screen selection step; the network lookup
 * only reconciles it afterwards.
 */
export function resolveLocalAudienceState(
  installedApp: boolean,
  storedAudience: NotificationAudience | null
): { audience: NotificationAudience | null; audienceRequired: boolean } {
  if (!installedApp) return { audience: storedAudience, audienceRequired: false };
  return {
    audience: storedAudience,
    audienceRequired: storedAudience === null,
  };
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
