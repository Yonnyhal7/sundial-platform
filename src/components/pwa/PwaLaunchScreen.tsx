import {
  PWA_LAUNCH_SCREEN_ID,
  PWA_LAUNCH_VISUAL,
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
        style={{ "--pwa-launch-accent": PWA_LAUNCH_VISUAL.accent } as React.CSSProperties}
        suppressHydrationWarning
      >
        <div className="sundial-pwa-launch-card">
          <svg
            className="sundial-pwa-launch-icon"
            aria-hidden="true"
            width={PWA_LAUNCH_VISUAL.markWidth}
            height={PWA_LAUNCH_VISUAL.markHeight}
            viewBox="0 0 84 92"
            fill="none"
          >
            <circle cx="42" cy="46" r="29" fill="currentColor" opacity=".14" />
            <circle cx="42" cy="46" r="22" stroke="currentColor" strokeWidth="5" />
            <path d="M42 29v18l12 8" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M42 7v7M42 78v7M3 46h7M74 46h7M14 18l5 5M65 69l5 5M70 18l-5 5M19 69l-5 5" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
          </svg>
          <p className="sundial-pwa-launch-title">{PWA_LAUNCH_VISUAL.title}</p>
          <p className="sundial-pwa-launch-copy">{PWA_LAUNCH_VISUAL.copy}</p>
          <span className="sundial-pwa-launch-indicator" aria-hidden="true" />
        </div>
      </div>
      <script
        dangerouslySetInnerHTML={{
          __html: `(()=>{const r=document.documentElement;if(r.dataset.pwaAppLaunch!=="true"){r.style.removeProperty("background-color");document.body.style.removeProperty("background-color");return}const w=window,k="__SUNDIAL_PWA_RESUME_DIAGNOSTICS__",a=(type)=>({type,at:new Date().toISOString(),visibility:document.visibilityState,detail:Math.round(performance.now())+"ms"}),add=(type)=>{w[k]=[...(w[k]||[]),a(type)].slice(-48);try{sessionStorage.setItem("sundial:pwa-resume-diagnostics",JSON.stringify(w[k]))}catch{}};add("launch_shell_markup_present");add("server_launch_shell_present");add("prepaint_shell_shown");requestAnimationFrame(()=>add("root_shell_first_paint"))})()`,
        }}
      />
    </>
  );
}
