import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  SCHOOL_OFFLINE_SCHEMA_VERSION,
  type OfflineCalendarDay,
  type OfflineGame,
  type OfflineSchoolProfile,
  type OfflineSport,
  type OfflineTeam,
  type SchoolOfflineSnapshot,
} from "@/lib/offline/types";
import { assertValidSchoolOfflineSnapshot } from "@/lib/offline/schoolSnapshot";
import type { SchedulePeriod } from "@/lib/scheduleTime";

type PeriodWithSchedule = SchedulePeriod & {
  schedule_id: string;
};

function formatDate(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");

  return `${yyyy}-${mm}-${dd}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);

  return next;
}

function getSnapshotDateRange() {
  const today = new Date();

  return {
    startDate: formatDate(addDays(today, -45)),
    endDate: formatDate(addDays(today, 420)),
  };
}

export async function fetchSchoolOfflineSnapshot(
  schoolSlug: string
): Promise<SchoolOfflineSnapshot> {
  const supabase = await createSupabaseServerClient();
  const normalizedSchoolSlug = schoolSlug.trim().toLowerCase();
  const { startDate, endDate } = getSnapshotDateRange();

  const { data: school, error: schoolError } = await supabase
    .rpc("get_school_by_subdomain", {
      subdomain_input: normalizedSchoolSlug,
    })
    .single<OfflineSchoolProfile>();

  if (schoolError || !school) {
    throw new Error(schoolError?.message || "School not found");
  }

  const [
    schedulesResult,
    calendarDaysResult,
    announcementsResult,
    eventsResult,
    resourcesResult,
    sportsResultWithColor,
    teamsResult,
    gamesResult,
  ] = await Promise.all([
    supabase
      .from("schedules")
      .select("id, schedule_name, schedule_type, calendar_color, setup_status, active")
      .eq("school_id", school.id)
      .eq("active", true)
      .returns<SchoolOfflineSnapshot["data"]["schedules"]>(),
    supabase
      .from("calendar_days")
      .select("id, date, label, is_school_day, schedule_id")
      .eq("school_id", school.id)
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: true })
      .returns<OfflineCalendarDay[]>(),
    supabase
      .from("announcements")
      .select("id, title, body, priority, publish_at")
      .eq("school_id", school.id)
      .eq("is_active", true)
      .order("priority", { ascending: false })
      .order("publish_at", { ascending: false })
      .limit(25)
      .returns<SchoolOfflineSnapshot["data"]["announcements"]>(),
    supabase
      .from("events")
      .select("id, title, location, event_date, start_time, end_time, image_url")
      .eq("school_id", school.id)
      .eq("is_active", true)
      .gte("event_date", startDate)
      .order("event_date", { ascending: true })
      .limit(50)
      .returns<SchoolOfflineSnapshot["data"]["events"]>(),
    supabase
      .from("resources")
      .select("id, title, description, url, file_url, category")
      .eq("school_id", school.id)
      .eq("is_active", true)
      .order("category", { ascending: true })
      .order("title", { ascending: true })
      .limit(50)
      .returns<SchoolOfflineSnapshot["data"]["resources"]>(),
    supabase
      .from("sports")
      .select("id, name, icon, icon_color")
      .eq("school_id", school.id)
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(50)
      .returns<OfflineSport[]>(),
    supabase
      .from("teams")
      .select("id, sport_id, name, level, gender")
      .eq("school_id", school.id)
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(100)
      .returns<OfflineTeam[]>(),
    supabase
      .from("games")
      .select("id, team_id, opponent, game_date, location, is_home")
      .eq("school_id", school.id)
      .gte("game_date", startDate)
      .order("game_date", { ascending: true })
      .limit(100)
      .returns<OfflineGame[]>(),
  ]);

  for (const result of [
    schedulesResult,
    calendarDaysResult,
    announcementsResult,
    eventsResult,
    resourcesResult,
    teamsResult,
    gamesResult,
  ]) {
    if (result.error) {
      throw new Error(result.error.message);
    }
  }

  let sports = sportsResultWithColor.data as OfflineSport[] | null;

  if (sportsResultWithColor.error?.code === "42703") {
    const fallbackSportsResult = await supabase
      .from("sports")
      .select("id, name, icon")
      .eq("school_id", school.id)
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(50)
      .returns<Omit<OfflineSport, "icon_color">[]>();

    if (fallbackSportsResult.error) {
      throw new Error(fallbackSportsResult.error.message);
    }

    sports = (fallbackSportsResult.data || []).map((sport) => ({
      ...sport,
      icon_color: null,
    }));
  } else if (sportsResultWithColor.error) {
    throw new Error(sportsResultWithColor.error.message);
  }

  const scheduleIds = (schedulesResult.data || []).map((schedule) => schedule.id);
  let periods: PeriodWithSchedule[] = [];

  if (scheduleIds.length > 0) {
    const { data, error } = await supabase
      .from("periods")
      .select("id, schedule_id, name, start_time, end_time, sort_order")
      .in("schedule_id", scheduleIds)
      .returns<PeriodWithSchedule[]>();

    if (error) {
      throw new Error(error.message);
    }

    periods = data || [];
  }

  const snapshot: SchoolOfflineSnapshot = {
    schemaVersion: SCHOOL_OFFLINE_SCHEMA_VERSION,
    schoolId: school.id,
    schoolSlug: school.subdomain,
    syncedAt: new Date().toISOString(),
    sourceUpdatedAt: null,
    data: {
      school,
      schedules: schedulesResult.data || [],
      periods,
      calendarDays: calendarDaysResult.data || [],
      announcements: announcementsResult.data || [],
      events: eventsResult.data || [],
      resources: resourcesResult.data || [],
      sports: sports || [],
      teams: teamsResult.data || [],
      games: gamesResult.data || [],
      kioskSettings: {},
    },
  };

  assertValidSchoolOfflineSnapshot(snapshot);

  return snapshot;
}
