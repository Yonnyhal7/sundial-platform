"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  ADMIN_TAB_ICONS,
  CalendarIcon,
  DashboardIcon,
} from "@/components/admin/AdminNavIcons";
import AdminLogoutButton from "@/components/admin/AdminLogoutButton";
import SchoolLogo from "@/components/SchoolLogo";
import SetupProgress from "@/components/setup/SetupProgress";
import ThemeToggle from "@/components/ThemeToggle";
import type { AdminPermissionKey } from "@/lib/auth/adminPermissions";
import {
  getSetupStepStatus,
  normalizeSetupStep,
  SETUP_STEPS,
} from "@/lib/setupSteps";
import {
  getSchoolAdminBasePath,
  getSchoolAppUrl,
  getSchoolKioskUrl,
  getSchoolSetupPath,
  getSchoolSetupStepPath,
} from "@/lib/routing/paths";
import { setupAccent } from "@/lib/ui/setupStyles";

type AdminSidebarProps = {
  school: string;
  schoolName: string;
  logoUrl?: string | null;
  canManageSettings?: boolean;
  allowedPermissionKeys?: AdminPermissionKey[];
  setupComplete?: boolean | null;
  setupStep?: string | null;
  requestHostname?: string;
};

type SidebarNavItem = {
  label: string;
  href?: string;
  icon: ReactNode;
  exact?: boolean;
  locked?: boolean;
  badge?: string;
};

type SidebarExperienceItem = {
  label: string;
  href: string;
  icon: ReactNode;
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

function PhoneDeviceIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.9"
    >
      <rect x="7.25" y="3" width="9.5" height="18" rx="2.25" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.25 6h3.5M11 17.5h2" />
    </svg>
  );
}

function KioskDisplayIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.9"
    >
      <rect x="3.75" y="4.5" width="16.5" height="11" rx="2" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 20h6M12 15.5V20" />
    </svg>
  );
}

function ExternalLinkIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.9"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 5h5v5M19 5l-8 8" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 7H6.5A1.5 1.5 0 0 0 5 8.5v9A1.5 1.5 0 0 0 6.5 19h9a1.5 1.5 0 0 0 1.5-1.5V13" />
    </svg>
  );
}

export default function AdminSidebar({
  school,
  schoolName,
  logoUrl,
  canManageSettings = false,
  allowedPermissionKeys = [],
  setupComplete = true,
  setupStep,
  requestHostname = "",
}: AdminSidebarProps) {
  const pathname = usePathname();
  const base = getSchoolAdminBasePath(school, pathname, "");
  const setupLandingHref = getSchoolSetupPath(school, pathname, "");
  const activePathname = pathname;
  const isSetupIncomplete = setupComplete === false;

  const iconClass = "h-5 w-5 shrink-0";

  const SchedulesIcon = ADMIN_TAB_ICONS.schedules;
  const EventsIcon = ADMIN_TAB_ICONS.events;
  const AnnouncementsIcon = ADMIN_TAB_ICONS.announcements;
  const AthleticsIcon = ADMIN_TAB_ICONS.athletics;
  const ResourcesIcon = ADMIN_TAB_ICONS.resources;
  const UsersIcon = ADMIN_TAB_ICONS.users;
  const SettingsIcon = SettingsGearIcon;
  const AppIcon = PhoneDeviceIcon;
  const KioskIcon = KioskDisplayIcon;

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

  const experienceNavItems: SidebarExperienceItem[] = isSetupIncomplete
    ? []
    : [
        {
          label: "View App",
          href: getSchoolAppUrl(school, pathname, requestHostname),
          icon: <AppIcon className={iconClass} />,
        },
        {
          label: "View Kiosk",
          href: getSchoolKioskUrl(school, pathname, requestHostname),
          icon: <KioskIcon className={iconClass} />,
        },
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

  function renderExperienceItem(item: SidebarExperienceItem, compact = false) {
    const baseClass = compact
      ? "flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-white transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/45"
      : "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-white transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/45";

    return (
      <a
        key={item.label}
        href={item.href}
        target="_blank"
        rel="noopener noreferrer"
        className={baseClass}
        aria-label={`${item.label} for ${schoolName}. Opens in a new tab.`}
      >
        {item.icon}

        <span className="min-w-0 flex-1 truncate">{item.label}</span>

        <ExternalLinkIcon className="h-3.5 w-3.5 shrink-0 opacity-70" />
      </a>
    );
  }

  function renderMainNav(compact = false) {
    if (isSetupIncomplete) {
      return renderSetupNav(compact);
    }

    if (compact) {
      return (
        <>
          {navItems.map((item) => renderNavItem(item, true))}

          {experienceNavItems.length > 0 && (
            <>
              <span
                className="my-2 h-8 w-px shrink-0 bg-white/15"
                aria-hidden="true"
              />
              {experienceNavItems.map((item) => renderExperienceItem(item, true))}
            </>
          )}
        </>
      );
    }

    return (
      <>
        {navItems.map((item) => renderNavItem(item))}

        {experienceNavItems.length > 0 && (
          <div className="mt-4 border-t border-white/10 pt-4">
            <p className="px-4 pb-2 text-[0.65rem] font-bold uppercase tracking-[0.16em] text-white/45">
              School experience
            </p>
            <div className="space-y-1.5 min-[1180px]:space-y-2">
              {experienceNavItems.map((item) => renderExperienceItem(item))}
            </div>
          </div>
        )}
      </>
    );
  }

  function renderSetupStepItem(
    step: (typeof SETUP_STEPS)[number],
    compact = false,
  ) {
    const status = getSetupStepStatus(step.slug, savedSetupStep, false);
    const href = getSchoolSetupStepPath(school, pathname, "", step.slug);

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
            ? setupAccent.activeNav
            : "text-white hover:bg-white/10",
        ].join(" ")}
      >
        <span
          className={[
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.7rem] font-bold",
            status === "completed"
              ? "bg-emerald-500 text-white"
              : isActive
                ? setupAccent.activeIndicator
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
          <SetupProgress
            savedStep={savedSetupStep}
            setupComplete={setupComplete}
            className="mb-3"
          />
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
            href={isSetupIncomplete ? setupLandingHref : base}
            className="flex min-w-0 items-center gap-3"
          >
            {isSetupIncomplete ? (
              <Image
                src="/sundial-icon.png"
                alt=""
                width={40}
                height={40}
                className="h-10 w-10 object-contain"
                priority
              />
            ) : (
              <SchoolLogo
                schoolName={schoolName}
                logoUrl={logoUrl}
                variant="adminSidebar"
                className="h-12 w-12"
              />
            )}

            <span className="truncate text-xl font-bold tracking-tight">
              {isSetupIncomplete ? "Sundial" : schoolName}
            </span>
          </Link>

          <ThemeToggle
            scope="admin"
            className="h-9 w-9 shrink-0 border-white/15 bg-white/10 text-white shadow-none hover:bg-white/15 dark:border-white/15 dark:bg-white/10 dark:hover:bg-white/15"
          />
          <AdminLogoutButton school={school} compact />
        </div>

        <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {renderMainNav(true)}
        </nav>
      </header>

      <aside className="admin-sidebar fixed inset-y-0 left-0 z-40 hidden w-[var(--admin-sidebar-width)] flex-col overflow-hidden bg-zinc-800 px-3 py-5 text-white shadow-2xl shadow-black/20 dark:bg-black min-[1180px]:px-4 min-[1180px]:py-6 lg:flex">
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-white/10 px-3 pb-4">
          {isSetupIncomplete ? (
            <Link href={setupLandingHref} className="flex min-w-0 items-center gap-3">
              <Image
                src="/sundial-icon.png"
                alt=""
                width={42}
                height={42}
                className="h-10 w-10 shrink-0 object-contain min-[1180px]:h-11 min-[1180px]:w-11"
                priority
              />
              <span className="truncate text-2xl font-bold tracking-tight">
                Sundial
              </span>
            </Link>
          ) : (
            <Link href={base} className="flex min-w-0 items-center gap-3">
              <SchoolLogo
                schoolName={schoolName}
                logoUrl={logoUrl}
                variant="adminSidebar"
                className="h-11 w-11 shrink-0"
              />

              <span className="line-clamp-2 min-w-0 text-lg font-bold leading-tight tracking-tight">
                {schoolName}
              </span>
            </Link>
          )}

          <ThemeToggle
            scope="admin"
            className="h-9 w-9 shrink-0 border-white/15 bg-white/10 text-white shadow-none hover:bg-white/15 dark:border-white/15 dark:bg-white/10 dark:hover:bg-white/15"
          />
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto pr-1 space-y-1.5 min-[1180px]:space-y-2">
          {renderMainNav()}
        </nav>

        <div className="mt-auto border-t border-white/10 pt-4">
          <AdminLogoutButton school={school} />
        </div>

      </aside>
    </>
  );
}
