import KioskDisplay from "./KioskDisplay";
import OfflineKioskRuntime from "@/components/offline/OfflineKioskRuntime";
import ThemeRouteSync from "@/components/ThemeRouteSync";
import { formatGameTime } from "@/lib/athletics";
import {
  getAssignedScheduleForCalendarDay,
  getScheduleByIdForSchool,
  getScheduleDisplayName,
  type CalendarDayScheduleSummary,
} from "@/lib/calendarDaySchedule";
import { addDaysToLocalDateString, formatDateInTimeZone } from "@/lib/localDate";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { normalizeAppearancePreference } from "@/lib/themeScope";

export const dynamic = "force-dynamic";

type Period = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  sort_order: number | null;
};

type CalendarDay = {
  id: string;
  school_id: string;
  date: string;
  is_school_day: boolean;
  label: string | null;
  schedule_id: string | null;
};

type Sport = {
  id: string;
  name: string;
  icon: string | null;
  icon_color: string | null;
};

type Team = {
  id: string;
  sport_id: string | null;
  name: string;
  level: string | null;
};

type Game = {
  id: string;
  team_id: string | null;
  opponent: string;
  game_date: string | null;
  location: string | null;
  is_home: boolean | null;
};

function formatTime(time: string) {
  const [hours, minutes] = time.split(":");
  const date = new Date();
  date.setHours(Number(hours), Number(minutes), 0, 0);

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatEventDate(value: string | null) {
  if (!value) return "";

  const [year, month, day] = value.split("-");

  if (!year || !month || !day) return value;

  return `${month}-${day}-${year}`;
}

export default async function KioskPage({
  params,
}: {
  params: Promise<{ school: string }>;
}) {
  const { school } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: schoolData } = await supabase
    .rpc("get_available_school_by_subdomain", {
      subdomain_input: school,
    })
    .single<{
      id: string;
      name: string;
      mascot: string | null;
      logo_url: string | null;
      primary_color: string | null;
      secondary_color: string | null;
      default_appearance: "light" | "dark" | "system" | null;
      timezone: string | null;
    }>();

  if (!schoolData) return null;

  const today = formatDateInTimeZone(new Date(), schoolData.timezone);

  const { data: calendarDay } = await supabase
    .from("calendar_days")
    .select(
      `
      id,
      school_id,
      date,
      is_school_day,
      label,
      schedule_id
    `
    )
    .eq("school_id", schoolData.id)
    .eq("date", today)
    .maybeSingle<CalendarDay>();

  let assignedSchedule: CalendarDayScheduleSummary | null = null;

  if (calendarDay?.schedule_id && calendarDay.is_school_day !== false) {
    const { data: schedules } = await supabase
      .from("schedules")
      .select("id, school_id, schedule_name, schedule_type, setup_status, active")
      .eq("school_id", schoolData.id)
      .eq("active", true)
      .eq("id", calendarDay.schedule_id)
      .returns<CalendarDayScheduleSummary[]>();

    assignedSchedule = getAssignedScheduleForCalendarDay(
      calendarDay,
      getScheduleByIdForSchool(schedules || [], schoolData.id)
    );
  }

  const scheduleName = assignedSchedule?.schedule_name || "No Schedule Assigned";
  const scheduleNeedsTimes = assignedSchedule?.setup_status === "needs_times";
  const dayType = assignedSchedule
    ? getScheduleDisplayName(assignedSchedule)
    : scheduleName;
  let periods: Period[] = [];

  if (assignedSchedule) {
    const { data: periodData } = await supabase
      .from("periods")
      .select("id, name, start_time, end_time, sort_order")
      .eq("school_id", schoolData.id)
      .eq("schedule_id", assignedSchedule.id)
      .order("sort_order", { ascending: true })
      .order("start_time", { ascending: true });

    periods = periodData || [];
  }

  const { data: priorityAnnouncement } = await supabase
    .from("announcements")
    .select("title, body")
    .eq("school_id", schoolData.id)
    .eq("priority", true)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  const { data: upcomingEvents } = await supabase
    .from("events")
    .select("title, event_date")
    .eq("school_id", schoolData.id)
    .eq("is_active", true)
    .gte("event_date", today)
    .order("event_date")
    .limit(3);

  const tomorrow = addDaysToLocalDateString(today, 1);
  const sportsResultWithColor = await supabase
    .from("sports")
    .select("id, name, icon, icon_color")
    .eq("school_id", schoolData.id)
    .returns<Sport[]>();
  let sports = sportsResultWithColor.data as Sport[] | null;

  if (sportsResultWithColor.error?.code === "42703") {
    const fallbackSportsResult = await supabase
      .from("sports")
      .select("id, name, icon")
      .eq("school_id", schoolData.id)
      .returns<Omit<Sport, "icon_color">[]>();

    sports = (fallbackSportsResult.data || []).map((sport) => ({
      ...sport,
      icon_color: null,
    }));
  }

  const [{ data: teams }, { data: todayGames }] = await Promise.all([
    supabase
      .from("teams")
      .select("id, sport_id, name, level")
      .eq("school_id", schoolData.id)
      .returns<Team[]>(),
    supabase
      .from("games")
      .select("id, team_id, opponent, game_date, location, is_home")
      .eq("school_id", schoolData.id)
      .gte("game_date", today)
      .lt("game_date", tomorrow)
      .order("game_date", { ascending: true })
      .limit(4)
      .returns<Game[]>(),
  ]);

  const sportById = new Map((sports || []).map((sport) => [sport.id, sport]));
  const teamById = new Map((teams || []).map((team) => [team.id, team]));

  const isNoSchool = calendarDay?.is_school_day === false;

  return (
    <>
      <ThemeRouteSync
        schoolDefaultAppearance={normalizeAppearancePreference(
          schoolData.default_appearance
        )}
        schoolSlug={school}
      />
      <OfflineKioskRuntime schoolId={schoolData.id} school={school}>
        <KioskDisplay
          schoolName={schoolData.name}
          schoolPrimaryColor={schoolData.primary_color || "#2563eb"}
          schoolSecondaryColor={schoolData.secondary_color || schoolData.primary_color || "#2563eb"}
          schoolMascot={schoolData.mascot}
          schoolLogoUrl={schoolData.logo_url || null}
          dayType={dayType}
          scheduleNeedsTimes={scheduleNeedsTimes}
          periods={periods.map((period) => ({
            id: period.id,
            name: period.name,
            startTime: formatTime(period.start_time),
            endTime: formatTime(period.end_time),
            rawStartTime: period.start_time,
            rawEndTime: period.end_time,
            sortOrder: period.sort_order,
          }))}
          events={
            upcomingEvents?.map((event) => ({
              id: `${event.title}-${event.event_date}`,
              title: event.title,
              date: formatEventDate(event.event_date),
            })) || []
          }
          games={
            todayGames?.map((game) => {
              const team = teamById.get(game.team_id || "");
              const sport = sportById.get(team?.sport_id || "");

              return {
                id: game.id,
                title: `${team?.name || "Team"} vs ${game.opponent}`,
                teamName: team?.name || "Team",
                opponent: game.opponent,
                time: formatGameTime(game.game_date),
                location: game.location || (game.is_home ? "Home" : "Away"),
                sportIcon: sport?.icon || "generic",
                sportIconColor: sport?.icon_color || null,
              };
            }) || []
          }
          athleticsHref={`/${school}/app/athletics`}
          announcement={
            priorityAnnouncement
              ? {
                  title: priorityAnnouncement.title,
                  body: priorityAnnouncement.body || "",
                }
              : null
          }
          isNoSchool={isNoSchool}
          noSchoolLabel={calendarDay?.label || "Enjoy your day"}
        />
      </OfflineKioskRuntime>
    </>
  );
}
