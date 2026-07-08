"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import KioskMenuControls from "@/components/KioskMenuControls";
import { getSchoolSiteBasePath } from "@/lib/routing/paths";

type SchoolPublicNavProps = {
  school: string;
};

export default function SchoolPublicNav({ school }: SchoolPublicNavProps) {
  const pathname = usePathname();
  const hostname =
    typeof window === "undefined" ? "" : window.location.hostname.toLowerCase();
  const base = getSchoolSiteBasePath(school, pathname, hostname);

  if (
    pathname === `${base}/app` ||
    pathname.startsWith(`${base}/app/`) ||
    pathname === `${base}/admin` ||
    pathname.startsWith(`${base}/admin/`) ||
    pathname.startsWith(`/admin/${school}`)
  ) {
    return null;
  }

  if (pathname === `${base}/kiosk` || pathname.startsWith(`${base}/kiosk/`)) {
    return (
      <nav className="school-menu-bar border-b border-slate-200 bg-white px-6 py-3 dark:border-neutral-800 dark:bg-black">
        <div className="flex items-center justify-end">
          <KioskMenuControls />
        </div>
      </nav>
    );
  }

  const navItems = [
    { label: "Home", href: base || "/" },
    { label: "Announcements", href: `${base}/announcements` },
    { label: "Events", href: `${base}/events` },
    { label: "Resources", href: `${base}/resources` },
    { label: "Schedule", href: `${base}/schedule` },
    { label: "Kiosk", href: `${base}/kiosk` },
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
