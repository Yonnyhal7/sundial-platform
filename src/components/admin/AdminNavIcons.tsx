import type { ComponentType, PropsWithChildren } from "react";
import type { AdminPermissionKey } from "@/lib/auth/adminPermissions";

type IconProps = {
  className?: string;
};

function IconShell({ children, className = "" }: PropsWithChildren<IconProps>) {
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

export function DashboardIcon(props: IconProps) {
  return (
    <IconShell {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 5.5A1.5 1.5 0 0 1 5.5 4h4A1.5 1.5 0 0 1 11 5.5v4A1.5 1.5 0 0 1 9.5 11h-4A1.5 1.5 0 0 1 4 9.5v-4ZM13 5.5A1.5 1.5 0 0 1 14.5 4h4A1.5 1.5 0 0 1 20 5.5v4a1.5 1.5 0 0 1-1.5 1.5h-4A1.5 1.5 0 0 1 13 9.5v-4ZM4 14.5A1.5 1.5 0 0 1 5.5 13h4a1.5 1.5 0 0 1 1.5 1.5v4A1.5 1.5 0 0 1 9.5 20h-4A1.5 1.5 0 0 1 4 18.5v-4ZM13 14.5a1.5 1.5 0 0 1 1.5-1.5h4a1.5 1.5 0 0 1 1.5 1.5v4a1.5 1.5 0 0 1-1.5 1.5h-4a1.5 1.5 0 0 1-1.5-1.5v-4Z" />
    </IconShell>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <IconShell {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 3v3M17 3v3M4.5 9h15M6 5h12a2 2 0 0 1 2 2v11.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
    </IconShell>
  );
}

export function ScheduleIcon(props: IconProps) {
  return (
    <IconShell {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 3v3M17 3v3M4.5 9h15M6 5h8.25M6 5h12a2 2 0 0 1 2 2v6.25M5.5 9v9.5A1.5 1.5 0 0 0 7 20h6.25" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m16 18 1.6 1.6L21 16.2" />
      <circle cx="18" cy="18" r="4.25" />
    </IconShell>
  );
}

export function EventIcon(props: IconProps) {
  return (
    <IconShell {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 3v3M17 3v3M4.5 9h15M6 5h12a2 2 0 0 1 2 2v11.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m12 12.3.95 2 2.2.32-1.6 1.55.38 2.18L12 17.33l-1.95 1.02.38-2.18-1.6-1.55 2.2-.32.97-2Z" />
    </IconShell>
  );
}

export function MegaphoneIcon(props: IconProps) {
  return (
    <IconShell {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="m4 13 3.6-.9L17 6.5v11L7.6 11.9 4 11v2Zm3.6-.9 1 5.2a1.6 1.6 0 0 0 2.8.75l1-1.2" />
    </IconShell>
  );
}

export function TrophyIcon(props: IconProps) {
  return (
    <IconShell {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 4h8v3a4 4 0 0 1-8 0V4Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 6H5.5A1.5 1.5 0 0 0 4 7.5v.25A3.25 3.25 0 0 0 7.25 11H8M16 6h2.5A1.5 1.5 0 0 1 20 7.5v.25A3.25 3.25 0 0 1 16.75 11H16" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 11v4M9.5 20h5M10 15h4a1 1 0 0 1 1 1v4H9v-4a1 1 0 0 1 1-1Z" />
    </IconShell>
  );
}

export function ResourcesIcon(props: IconProps) {
  return (
    <IconShell {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 3.75h8.5L19 8.25V20a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 20V5.25A1.5 1.5 0 0 1 6 3.75Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.5 3.75v4.5H19M8 10.5h5M8 13.5h3.5M8 16.5h2" />
      <circle cx="15" cy="16" r="2.6" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m17 18 2.5 2.5" />
    </IconShell>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <IconShell {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20a7.5 7.5 0 0 1 15 0" />
    </IconShell>
  );
}

export const ADMIN_TAB_ICONS: Record<AdminPermissionKey, ComponentType<IconProps>> = {
  announcements: MegaphoneIcon,
  events: EventIcon,
  athletics: TrophyIcon,
  schedules: ScheduleIcon,
  calendar: CalendarIcon,
  resources: ResourcesIcon,
  kiosk: DashboardIcon,
  analytics: DashboardIcon,
  users: UserIcon,
};
