import {
  PWA_LAUNCH_SCREEN_ID,
  type PwaStartupReadiness,
} from "@/lib/pwa/launchScreen";

export default function PwaLaunchScreen({
  schoolName,
  primaryColor,
  readiness = "app_shell_ready",
}: {
  schoolName?: string | null;
  primaryColor?: string | null;
  readiness?: PwaStartupReadiness;
}) {
  const resolvedName = schoolName?.trim() || "Sundial";

  return (
    <>
      <style>{`
        #${PWA_LAUNCH_SCREEN_ID} {
          position: fixed;
          inset: 0;
          z-index: 2147483646;
          min-height: 100dvh;
          display: flex;
          align-items: center;
          justify-content: center;
          box-sizing: border-box;
          padding: calc(2rem + env(safe-area-inset-top)) 1.5rem calc(2rem + env(safe-area-inset-bottom));
          background: #f8fafc;
          color: #0f172a;
          color-scheme: light;
        }
        html.dark #${PWA_LAUNCH_SCREEN_ID} {
          background: #050505;
          color: #fff;
          color-scheme: dark;
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
          width: 5.25rem;
          height: 5.75rem;
          object-fit: contain;
        }
        .sundial-pwa-launch-title {
          margin: .25rem 0 0;
          font: 800 clamp(1.75rem, 8vw, 2.25rem)/1.05 var(--font-geist-sans), system-ui, sans-serif;
          letter-spacing: -.035em;
        }
        .sundial-pwa-launch-copy {
          min-height: 1.25rem;
          margin: 0;
          color: #64748b;
          font: 600 .9rem/1.4 var(--font-geist-sans), system-ui, sans-serif;
        }
        html.dark .sundial-pwa-launch-copy { color: #a3a3a3; }
        .sundial-pwa-launch-indicator {
          width: 2.75rem;
          height: .25rem;
          overflow: hidden;
          border-radius: 999px;
          background: color-mix(in srgb, var(--pwa-launch-accent, #2563eb) 18%, transparent);
        }
        .sundial-pwa-launch-indicator::after {
          content: "";
          display: block;
          width: 45%;
          height: 100%;
          border-radius: inherit;
          background: var(--pwa-launch-accent, #2563eb);
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
      `}</style>
      <div
        id={PWA_LAUNCH_SCREEN_ID}
        data-readiness={readiness}
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{
          "--pwa-launch-accent": primaryColor || "#2563eb",
        } as React.CSSProperties}
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
          <p className="sundial-pwa-launch-copy">
            {schoolName ? `Loading ${resolvedName}` : "Opening your school app…"}
          </p>
          <span className="sundial-pwa-launch-indicator" aria-hidden="true" />
        </div>
      </div>
    </>
  );
}
