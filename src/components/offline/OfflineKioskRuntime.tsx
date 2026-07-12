"use client";

import type { ReactNode } from "react";
import KioskDisplay from "@/app/[school]/kiosk/KioskDisplay";
import OfflineStatusIndicator from "@/components/offline/OfflineStatusIndicator";
import { formatGameTime } from "@/lib/athletics";
import { addDaysToLocalDateString } from "@/lib/localDate";
import {
  getPeriodsByScheduleId,
  getScheduleById,
  getTodayDateKey,
} from "@/lib/offline/snapshotSelectors";
import {
  OfflineSchoolDataProvider,
  useOfflineSchoolData,
} from "@/lib/offline/useOfflineSchoolData";
import type { SchoolOfflineSnapshot } from "@/lib/offline/types";

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

function getStoredCalendarDatePrefix(value: string | null) {
  return value?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || null;
}

function OfflineKioskDisplay({ snapshot }: { snapshot: SchoolOfflineSnapshot }) {
  const today = getTodayDateKey();
  const calendarDay = snapshot.data.calendarDays.find((day) => day.date === today);
  const scheduleById = getScheduleById(snapshot);
  const periodsByScheduleId = getPeriodsByScheduleId(snapshot);
  const assignedSchedule = calendarDay?.schedule_id
    ? scheduleById.get(calendarDay.schedule_id) || null
    : null;
  const scheduleName = assignedSchedule?.schedule_name || "No Schedule Assigned";
  const scheduleType = assignedSchedule?.schedule_type || "";
  const scheduleNeedsTimes = assignedSchedule?.setup_status === "needs_times";
  const dayType = scheduleType ? `${scheduleName} (${scheduleType})` : scheduleName;
  const periods =
    calendarDay?.schedule_id && calendarDay.is_school_day !== false
      ? periodsByScheduleId[calendarDay.schedule_id] || []
      : [];
  const tomorrowKey = addDaysToLocalDateString(today, 1);
  const sportById = new Map(snapshot.data.sports.map((sport) => [sport.id, sport]));
  const teamById = new Map(snapshot.data.teams.map((team) => [team.id, team]));
  const priorityAnnouncement = snapshot.data.announcements.find(
    (announcement) => announcement.priority
  );

  return (
    <KioskDisplay
      schoolName={snapshot.data.school.name}
      schoolPrimaryColor={snapshot.data.school.primary_color || "#2563eb"}
      schoolSecondaryColor={
        snapshot.data.school.secondary_color ||
        snapshot.data.school.primary_color ||
        "#2563eb"
      }
      schoolMascot={snapshot.data.school.mascot}
      schoolLogoUrl={snapshot.data.school.logo_url}
      dayType={calendarDay?.is_school_day === false ? calendarDay.label || "No School" : dayType}
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
      events={snapshot.data.events.slice(0, 3).map((event) => ({
        id: event.id,
        title: event.title,
        date: formatEventDate(event.event_date),
      }))}
      games={snapshot.data.games
        .filter((game) => {
          const date = getStoredCalendarDatePrefix(game.game_date);
          return date && date >= today && date < tomorrowKey;
        })
        .slice(0, 4)
        .map((game) => {
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
        })}
      athleticsHref={`/${snapshot.schoolSlug}/app/athletics`}
      announcement={
        priorityAnnouncement
          ? {
              title: priorityAnnouncement.title,
              body: priorityAnnouncement.body || "",
            }
          : null
      }
      isNoSchool={calendarDay?.is_school_day === false}
      noSchoolLabel={calendarDay?.label || "Enjoy your day"}
    />
  );
}

function FirstLoadKioskOfflineState() {
  return (
    <main className="kiosk-theme grid h-[99dvh] w-screen place-items-center bg-[#f7f8fb] p-6 text-center text-[#07152f] dark:bg-black dark:text-white">
      <section className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]">
        <p className="text-2xl font-black">
          Connect to the internet once to download this school&apos;s Sundial data.
        </p>
      </section>
    </main>
  );
}

function OfflineKioskBody({ children }: { children: ReactNode }) {
  const { snapshot, syncState, isOnline, lastError } = useOfflineSchoolData();
  const shouldRenderSnapshot =
    Boolean(snapshot) && (!isOnline || syncState === "cached" || syncState === "error" || lastError);

  return (
    <>
      <OfflineStatusIndicator variant="kiosk" />
      {shouldRenderSnapshot && snapshot ? (
        <OfflineKioskDisplay snapshot={snapshot} />
      ) : !snapshot && (!isOnline || syncState === "offline-empty") ? (
        <FirstLoadKioskOfflineState />
      ) : (
        children
      )}
    </>
  );
}

export default function OfflineKioskRuntime({
  schoolId,
  school,
  children,
}: {
  schoolId: string;
  school: string;
  children: ReactNode;
}) {
  return (
    <OfflineSchoolDataProvider schoolId={schoolId} schoolSlug={school}>
      <OfflineKioskBody>{children}</OfflineKioskBody>
    </OfflineSchoolDataProvider>
  );
}
