import "server-only";

import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDateInTimeZone } from "@/lib/localDate";
import { getTodayScheduleState, type SchedulePeriod } from "@/lib/scheduleTime";

export type PublicSchool = {
  id: string; name: string; subdomain: string; mascot: string | null;
  district_name: string | null; logo_url: string | null; primary_color: string | null;
  secondary_color: string | null; default_appearance: "light" | "dark" | "system" | null;
  timezone: string | null; main_office: string | null; address: string | null;
  phone_number: string | null; school_website: string | null;
};

export async function requirePublicSchool(slug: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("get_available_school_by_subdomain", {
    subdomain_input: slug,
  }).maybeSingle<PublicSchool>();
  if (!data) notFound();
  return { supabase, school: data };
}

export async function loadPublicHomepage(slug: string) {
  const { supabase, school } = await requirePublicSchool(slug);
  const today = formatDateInTimeZone(new Date(), school.timezone);
  const [announcementsResult, eventsResult, resourcesResult, dayResult, sportsResult, teamsResult, gamesResult] = await Promise.all([
    supabase.from("announcements").select("id, title, body, image_url, priority, publish_at").eq("school_id", school.id).eq("is_active", true).lte("publish_at", new Date().toISOString()).order("priority", { ascending: false }).order("publish_at", { ascending: false }).limit(4),
    supabase.from("events").select("id, title, description, location, event_date, start_time, end_time, image_url").eq("school_id", school.id).eq("is_active", true).gte("event_date", today).order("event_date").limit(4),
    supabase.from("resources").select("id, title, description, url, file_url, category").eq("school_id", school.id).eq("is_active", true).order("category").order("title").limit(9),
    supabase.from("calendar_days").select("id, date, label, is_school_day, schedule_id").eq("school_id", school.id).eq("date", today).maybeSingle(),
    supabase.from("sports").select("id, name, icon, icon_color").eq("school_id", school.id).eq("is_active", true),
    supabase.from("teams").select("id, sport_id, name").eq("school_id", school.id).eq("is_active", true),
    supabase.from("games").select("id, team_id, opponent, game_date, location, is_home").eq("school_id", school.id).gte("game_date", today).order("game_date").limit(4),
  ]);

  const day = dayResult.data;
  let schedule: { id: string; schedule_name: string; schedule_type: string | null; setup_status: string | null } | null = null;
  let periods: SchedulePeriod[] = [];
  if (day?.schedule_id && day.is_school_day !== false) {
    const [{ data: scheduleData }, { data: periodData }] = await Promise.all([
      supabase.from("schedules").select("id, schedule_name, schedule_type, setup_status").eq("school_id", school.id).eq("id", day.schedule_id).eq("active", true).maybeSingle(),
      supabase.from("periods").select("id, name, start_time, end_time, sort_order").eq("school_id", school.id).eq("schedule_id", day.schedule_id).order("sort_order"),
    ]);
    schedule = scheduleData;
    periods = (periodData || []).filter((p) => p.start_time && p.end_time) as SchedulePeriod[];
  }
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: school.timezone || undefined }));
  const scheduleState = getTodayScheduleState(periods, now, { needsTimes: schedule?.setup_status === "needs_times" });
  const sports = new Map((sportsResult.data || []).map((item) => [item.id, item]));
  const teams = new Map((teamsResult.data || []).map((item) => [item.id, item]));

  return {
    school, today, day, schedule, periods, scheduleState,
    announcements: announcementsResult.data || [], events: eventsResult.data || [],
    resources: resourcesResult.data || [],
    games: (gamesResult.data || []).map((game) => {
      const team = teams.get(game.team_id || "");
      return { ...game, team, sport: sports.get(team?.sport_id || "") };
    }),
  };
}
