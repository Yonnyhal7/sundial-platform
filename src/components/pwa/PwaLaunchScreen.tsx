import Image from "next/image";
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
          <Image
            className="sundial-pwa-launch-icon"
            aria-hidden="true"
            alt=""
            src={PWA_LAUNCH_VISUAL.iconSrc}
            width={PWA_LAUNCH_VISUAL.markWidth}
            height={PWA_LAUNCH_VISUAL.markHeight}
            fetchPriority="high"
            unoptimized
          />
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
