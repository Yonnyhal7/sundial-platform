import type { SchedulePeriod } from "@/lib/scheduleTime";

export const SCHOOL_OFFLINE_SCHEMA_VERSION = 2;

export type OfflineSchoolProfile = {
  id: string;
  name: string;
  subdomain: string;
  mascot: string | null;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  default_appearance: "light" | "dark" | "system" | null;
  timezone: string | null;
};

export type OfflineSchedule = {
  id: string;
  school_id: string;
  schedule_name: string;
  schedule_type: string | null;
  calendar_color: string | null;
  setup_status: string | null;
  active: boolean | null;
};

export type OfflineCalendarDay = {
  id: string;
  school_id: string;
  date: string;
  label: string | null;
  is_school_day: boolean;
  schedule_id: string | null;
};

export type OfflineAnnouncement = {
  id: string;
  school_id: string;
  title: string;
  body: string | null;
  priority: boolean | null;
  publish_at: string | null;
};

export type OfflineEvent = {
  id: string;
  school_id: string;
  title: string;
  location: string | null;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  image_url: string | null;
};

export type OfflineResource = {
  id: string;
  school_id: string;
  title: string;
  description: string | null;
  url: string | null;
  file_url: string | null;
  category: string | null;
};

export type OfflineSport = {
  id: string;
  school_id: string;
  name: string;
  icon: string | null;
  icon_color: string | null;
};

export type OfflineTeam = {
  id: string;
  school_id: string;
  sport_id: string | null;
  name: string;
  level: string | null;
  gender: string | null;
};

export type OfflineGame = {
  id: string;
  school_id: string;
  team_id: string | null;
  opponent: string;
  game_date: string | null;
  location: string | null;
  is_home: boolean | null;
};

export type SchoolOfflineSnapshot = {
  schemaVersion: typeof SCHOOL_OFFLINE_SCHEMA_VERSION;
  schoolId: string;
  schoolSlug: string;
  syncedAt: string;
  sourceUpdatedAt?: string | null;
  data: {
    school: OfflineSchoolProfile;
    schedules: OfflineSchedule[];
    periods: (SchedulePeriod & { schedule_id: string; school_id: string })[];
    calendarDays: OfflineCalendarDay[];
    announcements: OfflineAnnouncement[];
    events: OfflineEvent[];
    resources: OfflineResource[];
    sports: OfflineSport[];
    teams: OfflineTeam[];
    games: OfflineGame[];
    kioskSettings: Record<string, never>;
  };
};

export type OfflineSyncState =
  | "idle"
  | "loading-cache"
  | "syncing"
  | "current"
  | "cached"
  | "offline-empty"
  | "error";
