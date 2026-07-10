"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  CalendarIcon,
  HomeIcon,
  ClockIcon,
} from "@/components/mobile-app/AppIcons";
import SportIcon from "@/components/SportIcon";
import {
  APP_TAB_PENDING_EVENT,
  type AppTabPendingEventDetail,
  getAppTabs,
} from "@/lib/appTabs";

type AppBottomNavProps = {
  school: string;
};

function AthleticsIcon({ className }: { className?: string }) {
  return <SportIcon icon="football" className={className} />;
}

export default function AppBottomNav({ school }: AppBottomNavProps) {
  const pathname = usePathname();
  const [pendingNavigation, setPendingNavigation] = useState<{
    href: string;
    from: string;
  } | null>(null);

  useEffect(() => {
    function handlePendingNavigation(event: Event) {
      const detail = (event as CustomEvent<AppTabPendingEventDetail>).detail;

      if (!detail?.href || !detail.from) {
        return;
      }

      setPendingNavigation({ href: detail.href, from: detail.from });
    }

    window.addEventListener(APP_TAB_PENDING_EVENT, handlePendingNavigation);

    return () => {
      window.removeEventListener(APP_TAB_PENDING_EVENT, handlePendingNavigation);
    };
  }, []);

  const tabs = getAppTabs(school, pathname);
  const base = tabs[0].href;
  const activePathname =
    pendingNavigation?.from === pathname ? pendingNavigation.href : pathname;
  const navItems = [
    { ...tabs[0], icon: HomeIcon },
    { ...tabs[1], icon: ClockIcon },
    { ...tabs[2], icon: CalendarIcon },
    { ...tabs[3], icon: AthleticsIcon },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-[-2px] z-50 border-t border-slate-200/80 bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 shadow-[0_-10px_24px_rgb(15_23_42/0.08)] backdrop-blur-xl dark:border-[#3a3a3a] dark:bg-[#242424]/95">
      <div className="mx-auto grid w-full max-w-3xl grid-cols-4 gap-x-3 gap-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active =
            item.href === base
              ? activePathname === base
              : activePathname === item.href || activePathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              onClick={() => setPendingNavigation({ href: item.href, from: pathname })}
              className={`flex min-h-[3.5rem] sm:min-h-16 w-full flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 sm:py-1 text-[0.7rem] font-semibold transition ${
                active
                  ? "bg-[color-mix(in_srgb,var(--school-primary)_10%,transparent)] text-[var(--school-primary)]"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-[#a3a3a3] dark:hover:bg-[#181818] dark:hover:text-white"
              }`}
            >
              <Icon className="h-7 w-7" />
              <span className="mt-0.5 text-center leading-tight max-[480px]:sr-only">
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
