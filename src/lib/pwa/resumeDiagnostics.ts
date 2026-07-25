export const PWA_RESUME_DIAGNOSTICS_KEY = "sundial:pwa-resume-diagnostics";
export const PWA_RESUME_DIAGNOSTICS_LIMIT = 48;

export type PwaResumeDiagnosticType =
  | "pageshow"
  | "focus"
  | "visibilitychange"
  | "deployment_version_check"
  | "snapshot_refresh_start"
  | "snapshot_refresh_end"
  | "router_refresh"
  | "controller_comparison"
  | "controllerchange"
  | "full_reload_scheduled"
  | "active_worker_script_version"
  | "theme_read"
  | "theme_class_applied"
  | "theme_bootstrap_executed"
  | "startup_timeout"
  | "prepaint_shell_shown"
  | "navigation_start"
  | "first_root_html_received"
  | "launch_shell_markup_present"
  | "first_paint"
  | "server_launch_shell_present"
  | "react_mounted"
  | "tenant_resolved"
  | "cached_snapshot_ready"
  | "cache_hydration_complete"
  | "audience_lookup_started"
  | "audience_lookup_result"
  | "onboarding_selected"
  | "onboarding_shown"
  | "audience_screen_painted"
  | "audience_selected"
  | "notification_permission_requested"
  | "notification_permission_result"
  | "app_ready"
  | "launch_shell_removed"
  | "recovery_shown";

export type PwaResumeDiagnostic = {
  type: PwaResumeDiagnosticType;
  at: string;
  visibility: DocumentVisibilityState | "unavailable";
  detail?: string;
};

type DiagnosticWindow = Window & {
  __SUNDIAL_PWA_RESUME_DIAGNOSTICS__?: PwaResumeDiagnostic[];
};

export function recordPwaResumeDiagnostic(
  type: PwaResumeDiagnosticType,
  detail?: string
) {
  if (typeof window === "undefined") return;

  const diagnosticWindow = window as DiagnosticWindow;
  const event: PwaResumeDiagnostic = {
    type,
    at: new Date().toISOString(),
    visibility:
      typeof document === "undefined"
        ? "unavailable"
        : document.visibilityState,
    ...(detail ? { detail } : {}),
  };
  const events = [
    ...(diagnosticWindow.__SUNDIAL_PWA_RESUME_DIAGNOSTICS__ || []),
    event,
  ].slice(-PWA_RESUME_DIAGNOSTICS_LIMIT);

  diagnosticWindow.__SUNDIAL_PWA_RESUME_DIAGNOSTICS__ = events;

  try {
    window.sessionStorage.setItem(
      PWA_RESUME_DIAGNOSTICS_KEY,
      JSON.stringify(events)
    );
  } catch {
    // Diagnostics must never interfere with PWA resume.
  }
}
