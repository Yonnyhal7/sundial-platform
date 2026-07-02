"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import KioskMenuControls from "@/components/KioskMenuControls";

type SchoolPublicNavProps = {
  school: string;
};

export default function SchoolPublicNav({ school }: SchoolPublicNavProps) {
  const pathname = usePathname();

  if (
    pathname === `/${school}/app` ||
    pathname.startsWith(`/${school}/app/`) ||
    pathname === `/${school}/admin` ||
    pathname.startsWith(`/${school}/admin/`)
  ) {
    return null;
  }

  if (pathname === `/${school}/kiosk` || pathname.startsWith(`/${school}/kiosk/`)) {
    return (
      <nav className="school-menu-bar border-b border-slate-200 bg-white px-6 py-3 dark:border-neutral-800 dark:bg-black">
        <div className="flex items-center justify-end">
          <KioskMenuControls />
        </div>
      </nav>
    );
  }

  const navItems = [
    { label: "Home", href: `/${school}` },
    { label: "Announcements", href: `/${school}/announcements` },
    { label: "Events", href: `/${school}/events` },
    { label: "Resources", href: `/${school}/resources` },
    { label: "Schedule", href: `/${school}/schedule` },
    { label: "Kiosk", href: `/${school}/kiosk` },
  ];

  return (
    <nav className="school-menu-bar border-b border-slate-200 bg-white px-6 py-4 dark:border-neutral-800 dark:bg-black">
      <div className="flex flex-wrap items-center gap-6">
        <div className="flex flex-wrap gap-6">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-slate-600 hover:text-slate-950 dark:text-neutral-300 dark:hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </div>

        <KioskMenuControls />
      </div>
    </nav>
  );
}
