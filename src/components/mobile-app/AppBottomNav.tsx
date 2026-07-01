"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarIcon,
  FolderIcon,
  HomeIcon,
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
    { label: "Schedule", href: `${base}/schedule`, icon: CalendarIcon },
    { label: "Events", href: `${base}/events`, icon: CalendarIcon },
    { label: "Resources", href: `${base}/resources`, icon: FolderIcon },
    { label: "More", href: `${base}/more`, icon: MoreIcon },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200/80 bg-white/95 px-4 pb-[calc(env(safe-area-inset-bottom)+0.85rem)] pt-3 shadow-[0_-12px_30px_rgb(15_23_42/0.08)] backdrop-blur-xl dark:border-[#3a3a3a] dark:bg-[#242424]/95">
      <div className="mx-auto grid max-w-md grid-cols-5 gap-1">
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
              className={`flex min-h-16 flex-col items-center justify-center gap-2 rounded-2xl text-xs font-black transition ${
                active
                  ? "text-[var(--school-primary)]"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-[#a3a3a3] dark:hover:bg-[#181818] dark:hover:text-white"
              }`}
            >
              <Icon className="h-7 w-7" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
