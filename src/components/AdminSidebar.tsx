"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  ADMIN_TAB_ICONS,
  CalendarIcon,
  DashboardIcon,
} from "@/components/admin/AdminNavIcons";
import SchoolLogo from "@/components/SchoolLogo";
import SetupProgress from "@/components/setup/SetupProgress";
import ThemeToggle from "@/components/ThemeToggle";
import type { AdminPermissionKey } from "@/lib/auth/adminPermissions";
import {
  getSetupStepStatus,
  normalizeSetupStep,
  SETUP_STEPS,
} from "@/lib/setupSteps";

type AdminSidebarProps = {
  school: string;
  schoolName: string;
  logoUrl?: string | null;
  canManageSettings?: boolean;
  allowedPermissionKeys?: AdminPermissionKey[];
  setupComplete?: boolean | null;
  setupStep?: string | null;
};

type SidebarNavItem = {
  label: string;
  href?: string;
  icon: ReactNode;
  exact?: boolean;
  locked?: boolean;
  badge?: string;
};

function SettingsGearIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.9"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.3 4.2h3.4l.55 2.15a6.4 6.4 0 0 1 1.35.78l2.08-.62 1.7 2.95-1.55 1.53a6.2 6.2 0 0 1 0 1.56l1.55 1.53-1.7 2.95-2.08-.62a6.4 6.4 0 0 1-1.35.78l-.55 2.15h-3.4l-.55-2.15a6.4 6.4 0 0 1-1.35-.78l-2.08.62-1.7-2.95 1.55-1.53a6.2 6.2 0 0 1 0-1.56L4.67 9.46l1.7-2.95 2.08.62a6.4 6.4 0 0 1 1.35-.78l.5-2.15Z"
      />
      <circle cx="12" cy="12" r="2.65" />
    </svg>
  );
}

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
  schoolName,
  logoUrl,
  canManageSettings = false,
  allowedPermissionKeys = [],
  setupComplete = true,
  setupStep,
}: AdminSidebarProps) {
  const pathname = usePathname();
  const activePathname = normalizeAdminPathname(pathname, school);
  const base = `/admin/${school}`;
  const isSetupIncomplete = setupComplete === false;

  const iconClass = "h-5 w-5 shrink-0";

  const SchedulesIcon = ADMIN_TAB_ICONS.schedules;
  const EventsIcon = ADMIN_TAB_ICONS.events;
  const AnnouncementsIcon = ADMIN_TAB_ICONS.announcements;
  const AthleticsIcon = ADMIN_TAB_ICONS.athletics;
  const ResourcesIcon = ADMIN_TAB_ICONS.resources;
  const UsersIcon = ADMIN_TAB_ICONS.users;
  const SettingsIcon = SettingsGearIcon;

  const canAccess = (permissionKey: AdminPermissionKey) =>
    allowedPermissionKeys.includes(permissionKey);

  const savedSetupStep = normalizeSetupStep(setupStep);

  const activeSetupSegment = activePathname.startsWith(`${base}/setup/`)
    ? activePathname.slice(`${base}/setup/`.length).split("/")[0]
    : null;

  const activeSetupStep = activeSetupSegment
    ? normalizeSetupStep(activeSetupSegment)
    : null;

  const navItems: SidebarNavItem[] = isSetupIncomplete
    ? []
    : [
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
        ...(canManageSettings
          ? [
              {
                label: "Settings",
                href: `${base}/settings`,
                icon: <SettingsIcon className={iconClass} />,
              },
            ]
          : []),
      ];

  function renderNavItem(item: SidebarNavItem, compact = false) {
    const isActive =
      item.href &&
      (item.exact
        ? activePathname === item.href
        : activePathname === item.href ||
          activePathname.startsWith(`${item.href}/`));

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
              Locked
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
            ? "bg-[var(--school-primary)] text-[var(--school-primary-text)] shadow-lg shadow-black/15"
            : "text-white hover:bg-white/10",
        ].join(" ")}
      >
        {item.icon}

        <span className="min-w-0 flex-1 truncate">{item.label}</span>

        {item.badge && (
          <span className="rounded-full bg-[var(--school-accent-visible-primary)] px-2 py-0.5 text-[0.65rem] font-semibold text-[var(--school-secondary-text)]">
            {item.badge}
          </span>
        )}
      </Link>
    );
  }

  function renderSetupStepItem(
    step: (typeof SETUP_STEPS)[number],
    compact = false,
  ) {
    const status = getSetupStepStatus(step.slug, savedSetupStep, false);
    const href = `${base}/setup/${step.slug}`;

    const isActive =
      activePathname === href ||
      (activeSetupStep !== null && step.slug === activeSetupStep);

    const itemClass = compact
      ? "flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition"
      : "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition";

    const stepLabel =
      status === "completed" ? "Complete" : isActive ? "Current" : "Upcoming";

    return (
      <Link
        key={step.slug}
        href={href}
        aria-current={isActive ? "step" : undefined}
        className={[
          itemClass,
          isActive
            ? "bg-[var(--school-primary)] text-[var(--school-primary-text)] shadow-lg shadow-black/15"
            : "text-white hover:bg-white/10",
        ].join(" ")}
      >
        <span
          className={[
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.7rem] font-bold",
            status === "completed"
              ? "bg-emerald-500 text-white"
              : isActive
                ? "bg-[var(--school-accent-visible-primary)] text-[var(--school-secondary-text)]"
                : "border border-white/25 text-white/65",
          ].join(" ")}
        >
          {status === "completed" ? "✓" : isActive ? "•" : ""}
        </span>

        <span className="min-w-0 flex-1 truncate">{step.label}</span>

        {!compact && (
          <span className="text-[0.65rem] font-semibold uppercase tracking-[0.12em] text-white/45">
            {stepLabel}
          </span>
        )}
      </Link>
    );
  }

  function renderSetupNav(compact = false) {
    return (
      <div className={compact ? "flex gap-2" : "space-y-2"}>
        {!compact && (
          <>
            <Link
              href={`${base}/setup`}
              className="block rounded-2xl border border-white/10 bg-white/5 px-4 py-4 transition hover:bg-white/10"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">
                Onboarding
              </p>

              <p className="mt-1 text-xl font-bold tracking-tight">
                School Setup
              </p>
            </Link>

            <SetupProgress
              savedStep={savedSetupStep}
              setupComplete={setupComplete}
              className="mb-3"
            />
          </>
        )}

        {SETUP_STEPS.map((step) => renderSetupStepItem(step, compact))}
      </div>
    );
  }

  return (
    <>
      <header className="admin-sidebar fixed inset-x-0 top-0 z-40 flex flex-col gap-3 bg-zinc-800 px-4 py-3 text-white shadow-xl shadow-black/15 dark:bg-black lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <Link
            href={isSetupIncomplete ? `${base}/setup` : base}
            className="flex min-w-0 items-center gap-3"
          >
            <SchoolLogo
              schoolName={schoolName}
              logoUrl={logoUrl}
              size="lg"
              className="h-12 w-12"
            />

            <span className="truncate text-xl font-bold tracking-tight">
              {isSetupIncomplete ? "School Setup" : schoolName}
            </span>
          </Link>

          {!isSetupIncomplete && (
            <ThemeToggle
              scope="admin"
              className="h-9 w-9 shrink-0 border-white/15 bg-white/10 text-white shadow-none hover:bg-white/15 dark:border-white/15 dark:bg-white/10 dark:hover:bg-white/15"
            />
          )}
        </div>

        <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {isSetupIncomplete
            ? renderSetupNav(true)
            : navItems.map((item) => renderNavItem(item, true))}
        </nav>
      </header>

      <aside className="admin-sidebar fixed inset-y-0 left-0 z-40 hidden w-[var(--admin-sidebar-width)] flex-col overflow-hidden bg-zinc-800 px-3 py-5 text-white shadow-2xl shadow-black/20 dark:bg-black min-[1180px]:px-4 min-[1180px]:py-6 lg:flex">
        <Link
          href={isSetupIncomplete ? `${base}/setup` : base}
          className="mb-6 flex flex-col items-center gap-4 border-b border-white/10 px-3 pb-6 text-center min-[1180px]:mb-8 min-[1180px]:pb-7"
        >
          <SchoolLogo
            schoolName={schoolName}
            logoUrl={logoUrl}
            size="xl"
            className="h-20 w-20 rounded-3xl min-[1180px]:h-24 min-[1180px]:w-24"
          />

          <span className="line-clamp-2 max-w-full text-balance text-xl font-bold leading-tight tracking-tight min-[1180px]:text-2xl">
            {schoolName}
          </span>
        </Link>

        <nav className="space-y-1.5 min-[1180px]:space-y-2">
          {isSetupIncomplete
            ? renderSetupNav()
            : navItems.map((item) => renderNavItem(item))}
        </nav>

        {!isSetupIncomplete && (
          <div className="mt-auto border-t border-white/10 pt-5">
            <div className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-3">
              <span className="text-sm font-medium text-white">Theme</span>

              <ThemeToggle
                scope="admin"
                className="h-9 w-9 border-white/15 bg-white/10 text-white shadow-none hover:bg-white/15 dark:border-white/15 dark:bg-white/10 dark:hover:bg-white/15"
              />
            </div>
          </div>
        )}
      </aside>
    </>
  );
}