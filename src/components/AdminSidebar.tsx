"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import type { AdminPermissionKey } from "@/lib/auth/adminPermissions";

type AdminSidebarProps = {
  school: string;
  allowedPermissionKeys?: AdminPermissionKey[];
};

type IconProps = {
  className?: string;
};

function IconShell({ children, className = "" }: React.PropsWithChildren<IconProps>) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.9"
    >
      {children}
    </svg>
  );
}

function DashboardIcon(props: IconProps) {
  return (
    <IconShell {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 5.5A1.5 1.5 0 0 1 5.5 4h4A1.5 1.5 0 0 1 11 5.5v4A1.5 1.5 0 0 1 9.5 11h-4A1.5 1.5 0 0 1 4 9.5v-4ZM13 5.5A1.5 1.5 0 0 1 14.5 4h4A1.5 1.5 0 0 1 20 5.5v4a1.5 1.5 0 0 1-1.5 1.5h-4A1.5 1.5 0 0 1 13 9.5v-4ZM4 14.5A1.5 1.5 0 0 1 5.5 13h4a1.5 1.5 0 0 1 1.5 1.5v4A1.5 1.5 0 0 1 9.5 20h-4A1.5 1.5 0 0 1 4 18.5v-4ZM13 14.5a1.5 1.5 0 0 1 1.5-1.5h4a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-4a1.5 1.5 0 0 1-1.5-1.5v-4Z" />
    </IconShell>
  );
}

function CalendarIcon(props: IconProps) {
  return (
    <IconShell {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 3v3M17 3v3M4.5 9h15M6 5h12a2 2 0 0 1 2 2v11.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
    </IconShell>
  );
}

function MegaphoneIcon(props: IconProps) {
  return (
    <IconShell {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m4 13 3.6-.9L17 6.5v11L7.6 11.9 4 11v2Zm3.6-.9 1 5.2a1.6 1.6 0 0 0 2.8.75l1-1.2" />
    </IconShell>
  );
}

function UserIcon(props: IconProps) {
  return (
    <IconShell {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20a7.5 7.5 0 0 1 15 0" />
    </IconShell>
  );
}

function PlaceholderIcon(props: IconProps) {
  return (
    <IconShell {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 19 19 5M7 8h.01M16 17h.01M8.5 8a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0ZM18.5 17a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" />
    </IconShell>
  );
}

export default function AdminSidebar({
  school,
  allowedPermissionKeys = [],
}: AdminSidebarProps) {
  const pathname = usePathname();
  const iconClass = "h-5 w-5 shrink-0";
  const canAccess = (permissionKey: AdminPermissionKey) =>
    allowedPermissionKeys.includes(permissionKey);

  const navItems = [
    {
      label: "Dashboard",
      href: `/${school}/admin`,
      icon: <DashboardIcon className={iconClass} />,
      exact: true,
    },
    ...(canAccess("schedules")
      ? [
          {
            label: "Schedules",
            href: `/${school}/admin/schedules`,
            icon: <CalendarIcon className={iconClass} />,
          },
        ]
      : []),
    ...(canAccess("calendar")
      ? [
          {
            label: "Calendar",
            href: `/${school}/admin/calendar`,
            icon: <CalendarIcon className={iconClass} />,
          },
        ]
      : []),
    ...(canAccess("events")
      ? [
          {
            label: "Events",
            href: `/${school}/admin/events`,
            icon: <CalendarIcon className={iconClass} />,
          },
        ]
      : []),
    ...(canAccess("announcements")
      ? [
          {
            label: "Announcements",
            href: `/${school}/admin/announcements`,
            icon: <MegaphoneIcon className={iconClass} />,
          },
        ]
      : []),
    ...(canAccess("athletics")
      ? [
          {
            label: "Athletics",
            href: `/${school}/admin/athletics`,
            icon: <PlaceholderIcon className={iconClass} />,
          },
        ]
      : []),
    ...(canAccess("resources")
      ? [
          {
            label: "Resources",
            href: `/${school}/admin/resources`,
            icon: <PlaceholderIcon className={iconClass} />,
          },
        ]
      : []),
    ...(canAccess("users")
      ? [
          {
            label: "Users",
            href: `/${school}/admin/users`,
            icon: <UserIcon className={iconClass} />,
          },
        ]
      : []),
  ];

  function renderNavItem(item: (typeof navItems)[number], compact = false) {
    const isActive =
      item.href &&
      (item.exact
        ? pathname === item.href
        : pathname === item.href || pathname.startsWith(`${item.href}/`));

    const baseClass = compact
      ? "flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition"
      : "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition";

    if (!item.href) {
      return (
        <div key={item.label} className={`${baseClass} text-white`}>
          {item.icon}
          {item.label}
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
        {item.label}
      </Link>
    );
  }

  return (
    <>
      <header className="admin-sidebar fixed inset-x-0 top-0 z-40 flex flex-col gap-3 bg-zinc-800 px-4 py-3 text-white shadow-xl shadow-black/15 dark:bg-black lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <Link href={`/${school}/admin`} className="flex min-w-0 items-center gap-3">
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
          href={`/${school}/admin`}
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
