"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarIcon,
  FolderIcon,
  HomeIcon,
  ClockIcon,
  MoreIcon,
} from "@/components/mobile-app/AppIcons";

type AppBottomNavProps = {
  school: string;
};

export default function AppBottomNav({ school }: AppBottomNavProps) {
  const pathname = usePathname();
  const base = `/${school}/app`;
  const navItems = [
    { label: "Home", href: base, icon: HomeIcon },
    { label: "Schedule", href: `${base}/schedule`, icon: ClockIcon },
    { label: "Events", href: `${base}/events`, icon: CalendarIcon },
    { label: "Resources", href: `${base}/resources`, icon: FolderIcon },
    { label: "More", href: `${base}/more`, icon: MoreIcon },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-[-2px] z-50 border-t border-slate-200/80 bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 shadow-[0_-10px_24px_rgb(15_23_42/0.08)] backdrop-blur-xl dark:border-[#3a3a3a] dark:bg-[#242424]/95">
      <div className="mx-auto grid w-full max-w-3xl grid-cols-5 gap-x-3 gap-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active =
            item.href === base
              ? pathname === base
              : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-h-[3.5rem] sm:min-h-16 w-full flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 sm:py-1 text-[0.7rem] font-semibold transition ${
                active
                  ? "text-[var(--school-primary)]"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-[#a3a3a3] dark:hover:bg-[#181818] dark:hover:text-white"
              }`}
            >
              <Icon className="h-7 w-7" />
              <span className="mt-0.5 leading-tight text-center max-[480px]:hidden block">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
