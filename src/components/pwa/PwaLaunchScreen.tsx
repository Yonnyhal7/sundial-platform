import {
  PWA_LAUNCH_SCREEN_ID,
  type PwaStartupReadiness,
} from "@/lib/pwa/launchScreen";

export default function PwaLaunchScreen({
  readiness = "booting",
}: {
  readiness?: PwaStartupReadiness;
}) {
  return (
    <>
      <div
        id={PWA_LAUNCH_SCREEN_ID}
        data-readiness={readiness}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{ "--pwa-launch-accent": "#2563eb" } as React.CSSProperties}
        suppressHydrationWarning
      >
        <div className="sundial-pwa-launch-card">
          {/* A direct static asset remains available from the service-worker shell cache. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="sundial-pwa-launch-icon"
            src="/sundial-icon.png"
            alt=""
            aria-hidden="true"
            width="84"
            height="92"
          />
          <p className="sundial-pwa-launch-title">Sundial</p>
          <p className="sundial-pwa-launch-copy">Opening your school app…</p>
          <span className="sundial-pwa-launch-indicator" aria-hidden="true" />
        </div>
      </div>
      <script
        dangerouslySetInnerHTML={{
          __html: `(()=>{if(document.documentElement.dataset.pwaAppLaunch!=="true")return;const w=window,k="__SUNDIAL_PWA_RESUME_DIAGNOSTICS__",a=(type)=>({type,at:new Date().toISOString(),visibility:document.visibilityState});w[k]=[...(w[k]||[]),a("server_launch_shell_present"),a("prepaint_shell_shown")].slice(-48)})()`,
        }}
      />
    </>
  );
}
