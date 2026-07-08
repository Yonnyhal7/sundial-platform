"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  ADMIN_TAB_ICONS,
  CalendarIcon,
  DashboardIcon,
  ScheduleIcon,
} from "@/components/admin/AdminNavIcons";
import ThemeToggle from "@/components/ThemeToggle";
import type { AdminPermissionKey } from "@/lib/auth/adminPermissions";

type AdminSidebarProps = {
  school: string;
  allowedPermissionKeys?: AdminPermissionKey[];
};

type SidebarNavItem = {
  label: string;
  href?: string;
  icon: ReactNode;
  exact?: boolean;
  locked?: boolean;
  badge?: string;
};

function normalizeAdminPathname(pathname: string, school: string) {
  const canonicalBase = `/${school}/admin`;

  if (pathname === canonicalBase) {
    return `/admin/${school}`;
  }

  if (pathname.startsWith(`${canonicalBase}/`)) {
    return `/admin/${school}${pathname.slice(canonicalBase.length)}`;
  }

  return pathname;
}

export default function AdminSidebar({
  school,
  allowedPermissionKeys = [],
}: AdminSidebarProps) {
  const pathname = usePathname();
  const activePathname = normalizeAdminPathname(pathname, school);
  const base = `/admin/${school}`;
  const isSetupMode =
    activePathname === `${base}/setup` || activePathname.startsWith(`${base}/setup/`);
  const iconClass = "h-5 w-5 shrink-0";
  const SchedulesIcon = ADMIN_TAB_ICONS.schedules;
  const EventsIcon = ADMIN_TAB_ICONS.events;
  const AnnouncementsIcon = ADMIN_TAB_ICONS.announcements;
  const AthleticsIcon = ADMIN_TAB_ICONS.athletics;
  const ResourcesIcon = ADMIN_TAB_ICONS.resources;
  const UsersIcon = ADMIN_TAB_ICONS.users;
  const SettingsIcon = DashboardIcon;
  const canAccess = (permissionKey: AdminPermissionKey) =>
    allowedPermissionKeys.includes(permissionKey);

  const setupNavItems: SidebarNavItem[] = [
    {
      label: "Dashboard",
      href: base,
      icon: <DashboardIcon className={iconClass} />,
      exact: true,
    },
    {
      label: "School Setup",
      href: `${base}/setup`,
      icon: <ScheduleIcon className={iconClass} />,
      badge: "In Progress",
    },
    { label: "Announcements", icon: <AnnouncementsIcon className={iconClass} />, locked: true },
    { label: "Events", icon: <EventsIcon className={iconClass} />, locked: true },
    { label: "Resources", icon: <ResourcesIcon className={iconClass} />, locked: true },
    { label: "Schedules", icon: <SchedulesIcon className={iconClass} />, locked: true },
    { label: "Calendar", icon: <CalendarIcon className={iconClass} />, locked: true },
    { label: "Settings", icon: <SettingsIcon className={iconClass} />, locked: true },
    { label: "Users", icon: <UsersIcon className={iconClass} />, locked: true },
    { label: "Athletics", icon: <AthleticsIcon className={iconClass} />, locked: true },
  ];

  const navItems: SidebarNavItem[] = isSetupMode ? setupNavItems : [
    {
      label: "Dashboard",
      href: base,
      icon: <DashboardIcon className={iconClass} />,
      exact: true,
    },
    ...(canAccess("schedules")
      ? [
          {
            label: "Schedules",
            href: `${base}/schedules`,
            icon: <SchedulesIcon className={iconClass} />,
          },
        ]
      : []),
    ...(canAccess("calendar")
      ? [
          {
            label: "Calendar",
            href: `${base}/calendar`,
            icon: <CalendarIcon className={iconClass} />,
          },
        ]
      : []),
    ...(canAccess("events")
      ? [
          {
            label: "Events",
            href: `${base}/events`,
            icon: <EventsIcon className={iconClass} />,
          },
        ]
      : []),
    ...(canAccess("announcements")
      ? [
          {
            label: "Announcements",
            href: `${base}/announcements`,
            icon: <AnnouncementsIcon className={iconClass} />,
          },
        ]
      : []),
    ...(canAccess("athletics")
      ? [
          {
            label: "Athletics",
            href: `${base}/athletics`,
            icon: <AthleticsIcon className={iconClass} />,
          },
        ]
      : []),
    ...(canAccess("resources")
      ? [
          {
            label: "Resources",
            href: `${base}/resources`,
            icon: <ResourcesIcon className={iconClass} />,
          },
        ]
      : []),
    ...(canAccess("users")
      ? [
          {
            label: "Users",
            href: `${base}/users`,
            icon: <UsersIcon className={iconClass} />,
          },
        ]
      : []),
    {
      label: "Settings",
      href: `${base}/settings`,
      icon: <SettingsIcon className={iconClass} />,
    },
  ];

  function renderNavItem(item: SidebarNavItem, compact = false) {
    const isActive =
      item.href &&
      (item.exact
        ? activePathname === item.href
        : activePathname === item.href || activePathname.startsWith(`${item.href}/`));

    const baseClass = compact
      ? "flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition"
      : "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition";

    if (!item.href) {
      return (
        <div
          key={item.label}
          className={`${baseClass} cursor-not-allowed text-white/55`}
          aria-disabled="true"
        >
          {item.icon}
          <span className="min-w-0 flex-1 truncate">{item.label}</span>
          {item.locked && (
            <span className="text-xs text-white/45" aria-hidden="true">
              🔒
            </span>
          )}
        </div>
      );
    }

    return (
      <Link
        key={item.href}
        href={item.href}
        className={[
          baseClass,
          isActive
            ? "bg-[var(--school-primary)] text-white shadow-lg shadow-black/15"
            : "text-white hover:bg-white/10",
        ].join(" ")}
      >
        {item.icon}
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        {item.badge && (
          <span className="rounded-full bg-white/15 px-2 py-0.5 text-[0.65rem] font-semibold text-white">
            {item.badge}
          </span>
        )}
      </Link>
    );
  }

  return (
    <>
      <header className="admin-sidebar fixed inset-x-0 top-0 z-40 flex flex-col gap-3 bg-zinc-800 px-4 py-3 text-white shadow-xl shadow-black/15 dark:bg-black lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <Link href={base} className="flex min-w-0 items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden">
              <img
                src="/sundial-icon.png"
                alt="Sundial"
                className="h-full w-full object-contain"
              />
            </span>
            <span className="truncate text-xl font-bold tracking-tight">
              Sundial
            </span>
          </Link>

          <ThemeToggle
            scope="admin"
            className="h-9 w-9 shrink-0 border-white/15 bg-white/10 text-white shadow-none hover:bg-white/15 dark:border-white/15 dark:bg-white/10 dark:hover:bg-white/15"
          />
        </div>

        <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {navItems.map((item) => renderNavItem(item, true))}
        </nav>
      </header>

      <aside className="admin-sidebar fixed inset-y-0 left-0 z-40 hidden w-[var(--admin-sidebar-width)] flex-col overflow-y-auto bg-zinc-800 px-3 py-5 text-white shadow-2xl shadow-black/20 dark:bg-black min-[1180px]:px-4 min-[1180px]:py-6 lg:flex">
        <Link
          href={base}
          className="mb-6 flex items-center gap-3 px-2 min-[1180px]:mb-8 min-[1180px]:px-3"
        >
          <span className="flex h-18 w-18 shrink-0 items-center justify-center overflow-hidden min-[1180px]:h-18 min-[1180px]:w-18 min-[1500px]:h-12 min-[1500px]:w-12">
            <img
              src="/sundial-icon.png"
              alt="Sundial"
              className="h-full w-full object-contain"
            />
          </span>
          <span className="truncate text-xl font-bold tracking-tight min-[1180px]:text-2xl">
            Sundial
          </span>
        </Link>

        <nav className="space-y-1.5 min-[1180px]:space-y-2">
          {navItems.map((item) => renderNavItem(item))}
        </nav>

        <div className="mt-auto border-t border-white/10 pt-5">
          <div className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-3">
            <span className="text-sm font-medium text-white">Theme</span>
            <ThemeToggle
              scope="admin"
              className="h-9 w-9 border-white/15 bg-white/10 text-white shadow-none hover:bg-white/15 dark:border-white/15 dark:bg-white/10 dark:hover:bg-white/15"
            />
          </div>
        </div>
      </aside>
    </>
  );
}
