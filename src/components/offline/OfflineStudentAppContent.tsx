"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useSearchParams } from "next/navigation";
import AppScheduleDashboard from "@/components/mobile-app/AppScheduleDashboard";
import BellScheduleClient from "@/components/mobile-app/BellScheduleClient";
import CalendarScheduleClient from "@/components/mobile-app/CalendarScheduleClient";
import {
  BellIcon,
  BookIcon,
  CalendarIcon,
  HomeIcon,
  LinkIcon,
  MapPinIcon,
} from "@/components/mobile-app/AppIcons";
import SportIcon from "@/components/SportIcon";
import { formatGameDateTime } from "@/lib/athletics";
import { getScheduleCalendarColor } from "@/lib/scheduleColors";
import { formatPeriodTime } from "@/lib/scheduleTime";
import {
  getCalendarScheduleDays,
  getMonthQuery,
  getPeriodsByScheduleId,
  getTodaySchedule,
} from "@/lib/offline/snapshotSelectors";
import type { SchoolOfflineSnapshot } from "@/lib/offline/types";

function formatEventDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatEventTime(event: SchoolOfflineSnapshot["data"]["events"][number]) {
  if (!event.start_time) return "All day";

  return event.end_time
    ? `${formatPeriodTime(event.start_time)} - ${formatPeriodTime(event.end_time)}`
    : formatPeriodTime(event.start_time);
}

function isModifiedSchedule(schedule: { schedule_name: string; schedule_type: string | null }) {
  const value = `${schedule.schedule_name} ${schedule.schedule_type || ""}`.toLowerCase();

  return ["rally", "assembly", "special", "early", "modified"].some((word) =>
    value.includes(word)
  );
}

function SectionHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <header>
      <p className="text-sm font-bold text-[var(--school-primary)]">{eyebrow}</p>
      <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950 dark:text-white">
        {title}
      </h1>
      {subtitle && (
        <p className="mt-2 text-sm font-semibold text-slate-500 dark:text-[#a3a3a3]">
          {subtitle}
        </p>
      )}
    </header>
  );
}

export default function OfflineStudentAppContent({
  school,
  snapshot,
}: {
  school: string;
  snapshot: SchoolOfflineSnapshot;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const section = pathname.split("/").filter(Boolean)[2] || "home";

  if (section === "schedule") {
    return <OfflineSchedulePage school={school} snapshot={snapshot} month={searchParams.get("month")} />;
  }

  if (section === "events") {
    return <OfflineEventsPage snapshot={snapshot} />;
  }

  if (section === "athletics") {
    return <OfflineAthleticsPage school={school} snapshot={snapshot} activeTab={searchParams.get("tab") === "teams" ? "teams" : "games"} />;
  }

  if (section === "resources") {
    return <OfflineResourcesPage school={school} snapshot={snapshot} />;
  }

  if (section === "more") {
    return <OfflineMorePage school={school} snapshot={snapshot} />;
  }

  if (section === "bell") {
    return <OfflineBellPage school={school} snapshot={snapshot} />;
  }

  return <OfflineHomePage school={school} snapshot={snapshot} />;
}

function OfflineHomePage({
  school,
  snapshot,
}: {
  school: string;
  snapshot: SchoolOfflineSnapshot;
}) {
  const today = getTodaySchedule(snapshot);
  const todayLabel = new Date(`${today.date}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <main className="space-y-[clamp(1.25rem,3.2vw,1.75rem)]">
      <section className="pt-[clamp(0.75rem,2vw,1rem)] text-center">
        <p className="text-[clamp(1.25rem,3.5vw,1.7rem)] font-medium leading-tight text-[var(--school-primary)]">
          Offline mode
        </p>
        <h1 className="mt-[clamp(0.5rem,1.5vw,0.75rem)] text-[clamp(1.75rem,5.4vw,2.65rem)] font-black leading-none tracking-tight text-slate-950 dark:text-white">
          {snapshot.data.school.name}
        </h1>
        <p className="mt-[clamp(1.25rem,3vw,1.5rem)] text-[clamp(0.95rem,2.2vw,1.1rem)] font-black text-slate-500 dark:text-[#a3a3a3]">
          {todayLabel}
        </p>
        <div className="mx-auto mt-[clamp(1.25rem,3vw,1.5rem)] h-0.5 w-[clamp(3.5rem,10vw,3.75rem)] rounded-full bg-[var(--school-accent-visible)]" />
      </section>

      <AppScheduleDashboard
        school={school}
        periods={today.periods}
        todayScheduleLabel={today.todayScheduleLabel}
        noSchool={today.noSchool}
        scheduleNeedsTimes={today.scheduleNeedsTimes}
      />
    </main>
  );
}

function OfflineSchedulePage({
  school,
  snapshot,
  month,
}: {
  school: string;
  snapshot: SchoolOfflineSnapshot;
  month: string | null;
}) {
  const { baseMonth, today, days } = getCalendarScheduleDays(snapshot, month);

  return (
    <main className="space-y-5">
      <SectionHeader
        eyebrow="Calendar"
        title="Calendar"
        subtitle="Tap a date to view that day's schedule"
      />
      <CalendarScheduleClient
        key={getMonthQuery(baseMonth)}
        monthLabel={baseMonth.toLocaleDateString("en-US", {
          month: "long",
          year: "numeric",
        })}
        previousMonthHref={`/${school}/app/schedule?month=${getMonthQuery(
          new Date(baseMonth.getFullYear(), baseMonth.getMonth() - 1, 1)
        )}`}
        nextMonthHref={`/${school}/app/schedule?month=${getMonthQuery(
          new Date(baseMonth.getFullYear(), baseMonth.getMonth() + 1, 1)
        )}`}
        today={today}
        days={days}
      />
    </main>
  );
}

function OfflineEventsPage({ snapshot }: { snapshot: SchoolOfflineSnapshot }) {
  const events = snapshot.data.events;
  const featured = events[0];
  const upcoming = featured ? events.slice(1) : events;

  return (
    <main className="space-y-5">
      <SectionHeader eyebrow="Events" title="What's Coming Up" />
      {featured ? (
        <section
          className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-slate-900 p-6 text-white shadow-sm"
          style={{
            backgroundImage: featured.image_url
              ? undefined
              : "linear-gradient(135deg, var(--school-primary), #111827)",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        >
          {featured.image_url && (
            <>
              <Image
                src={featured.image_url}
                alt=""
                fill
                sizes="(max-width: 768px) 100vw, 42rem"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-slate-950/25 to-slate-950/90" />
            </>
          )}
          <p className="relative text-xs font-black uppercase tracking-[0.24em] text-white/75">
            Featured Event
          </p>
          <h2 className="relative mt-16 text-3xl font-black tracking-tight">
            {featured.title}
          </h2>
          <div className="relative mt-4 flex flex-wrap gap-2 text-xs font-bold">
            <span className="rounded-full bg-white/18 px-3 py-1.5 backdrop-blur">
              {formatEventDate(featured.event_date)}
            </span>
            <span className="rounded-full bg-white/18 px-3 py-1.5 backdrop-blur">
              {formatEventTime(featured)}
            </span>
          </div>
        </section>
      ) : (
        <EmptyCard>No upcoming events are posted yet.</EmptyCard>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-black text-slate-950 dark:text-white">
          Upcoming Events
        </h2>
        {upcoming.map((event) => (
          <article key={event.id} className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]">
            <div className="flex gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--school-primary)_12%,white)] text-[var(--school-primary)] dark:bg-[color-mix(in_srgb,var(--school-primary)_18%,#242424)]">
                <CalendarIcon className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-black text-slate-950 dark:text-white">{event.title}</h3>
                <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-[#a3a3a3]">
                  {formatEventDate(event.event_date)} at {formatEventTime(event)}
                </p>
                {event.location && (
                  <p className="mt-2 flex items-center gap-1 text-sm font-semibold text-slate-500 dark:text-[#a3a3a3]">
                    <MapPinIcon className="h-4 w-4" />
                    {event.location}
                  </p>
                )}
              </div>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

function OfflineAthleticsPage({
  school,
  snapshot,
  activeTab,
}: {
  school: string;
  snapshot: SchoolOfflineSnapshot;
  activeTab: "games" | "teams";
}) {
  const sportById = new Map(snapshot.data.sports.map((sport) => [sport.id, sport]));
  const teamById = new Map(snapshot.data.teams.map((team) => [team.id, team]));

  return (
    <main className="space-y-5">
      <SectionHeader eyebrow="Athletics" title="Games and Teams" />
      <nav className="grid grid-cols-2 rounded-[1.25rem] border border-slate-200 bg-white p-1 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]">
        {[
          ["games", "Games"],
          ["teams", "Teams"],
        ].map(([value, label]) => {
          const active = activeTab === value;

          return (
            <Link
              key={value}
              href={`/${school}/app/athletics${value === "teams" ? "?tab=teams" : ""}`}
              className={`rounded-2xl px-4 py-3 text-center text-sm font-black transition ${
                active
                  ? "bg-[var(--school-primary)] text-white"
                  : "text-slate-500 dark:text-[#a3a3a3]"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {activeTab === "games" ? (
        <section className="space-y-3">
          <h2 className="text-lg font-black text-slate-950 dark:text-white">
            Upcoming Games
          </h2>
          {snapshot.data.games.map((game) => {
            const team = teamById.get(game.team_id || "");
            const sport = sportById.get(team?.sport_id || "");

            return (
              <article key={game.id} className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]">
                <div className="flex gap-3">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--school-primary)_12%,white)] text-sm font-black text-[var(--school-primary)] dark:bg-[color-mix(in_srgb,var(--school-primary)_18%,#242424)]">
                    <SportIcon icon={sport?.icon} color={sport?.icon_color} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-black text-slate-950 dark:text-white">
                      {team?.name || "Team"} vs {game.opponent}
                    </h3>
                    <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-[#a3a3a3]">
                      {formatGameDateTime(game.game_date)}
                    </p>
                  </div>
                </div>
              </article>
            );
          })}
          {snapshot.data.games.length === 0 && <EmptyCard>No upcoming games are posted yet.</EmptyCard>}
        </section>
      ) : (
        <section className="space-y-3">
          <h2 className="text-lg font-black text-slate-950 dark:text-white">Teams</h2>
          {snapshot.data.teams.map((team) => {
            const sport = sportById.get(team.sport_id || "");

            return (
              <article key={team.id} className="flex items-center gap-3 rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-100 text-sm font-black text-slate-600 dark:bg-[#181818] dark:text-[#d4d4d4]">
                  <SportIcon icon={sport?.icon} color={sport?.icon_color} className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-black text-slate-950 dark:text-white">{team.name}</h3>
                  <p className="mt-1 text-sm font-semibold text-slate-500 dark:text-[#a3a3a3]">
                    {sport?.name || "Sport"}
                  </p>
                </div>
              </article>
            );
          })}
          {snapshot.data.teams.length === 0 && <EmptyCard>No active teams are posted yet.</EmptyCard>}
        </section>
      )}
    </main>
  );
}

function OfflineResourcesPage({
  school,
  snapshot,
}: {
  school: string;
  snapshot: SchoolOfflineSnapshot;
}) {
  const quickLinks = [
    { title: "Resources", label: "Helpful links", href: `/${school}/app/resources`, icon: BookIcon },
    { title: "Clubs", label: "Student life", href: `/${school}/app/more`, icon: CalendarIcon },
    { title: "Athletics", label: "Teams and games", href: `/${school}/app/athletics`, icon: BellIcon },
    { title: "Bell Schedule", label: "Period times", href: `/${school}/app/bell`, icon: BellIcon },
  ];

  return (
    <main className="space-y-5">
      <SectionHeader eyebrow="Resources" title="Find What You Need" />
      <section className="grid grid-cols-2 gap-3">
        {quickLinks.map((item) => {
          const Icon = item.icon;

          return (
            <Link key={item.title} href={item.href} className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--school-primary)_12%,white)] text-[var(--school-primary)] dark:bg-[color-mix(in_srgb,var(--school-primary)_18%,#242424)]">
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="mt-4 font-black text-slate-950 dark:text-white">{item.title}</h2>
              <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-[#a3a3a3]">{item.label}</p>
            </Link>
          );
        })}
      </section>
      <ResourceList school={school} snapshot={snapshot} />
    </main>
  );
}

function OfflineMorePage({
  school,
  snapshot,
}: {
  school: string;
  snapshot: SchoolOfflineSnapshot;
}) {
  const items = [
    { title: "Bell Schedule", href: `/${school}/app/bell`, icon: BellIcon },
    { title: "Calendar", href: `/${school}/app/schedule`, icon: CalendarIcon },
    { title: "Athletics", href: `/${school}/app/athletics`, icon: BellIcon },
    { title: "Resources", href: `/${school}/app/resources`, icon: BookIcon },
    { title: "Public Website", href: `/${school}`, icon: HomeIcon },
  ];

  return (
    <main className="space-y-5">
      <SectionHeader eyebrow="More" title={snapshot.data.school.name} />
      <section className="grid grid-cols-2 gap-3">
        {items.map((item) => {
          const Icon = item.icon;

          return (
            <Link key={item.title} href={item.href} className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--school-primary)_12%,white)] text-[var(--school-primary)] dark:bg-[color-mix(in_srgb,var(--school-primary)_18%,#242424)]">
                <Icon className="h-5 w-5" />
              </div>
              <h2 className="mt-4 font-black text-slate-950 dark:text-white">{item.title}</h2>
            </Link>
          );
        })}
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-black text-slate-950 dark:text-white">Announcements</h2>
        {snapshot.data.announcements.slice(0, 5).map((announcement) => (
          <article key={announcement.id} className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]">
            <h3 className="font-black text-slate-950 dark:text-white">{announcement.title}</h3>
            {announcement.body && (
              <p className="mt-2 line-clamp-3 text-sm font-semibold text-slate-500 dark:text-[#a3a3a3]">
                {announcement.body}
              </p>
            )}
          </article>
        ))}
        {snapshot.data.announcements.length === 0 && <EmptyCard>No announcements are posted yet.</EmptyCard>}
      </section>
    </main>
  );
}

function OfflineBellPage({
  school,
  snapshot,
}: {
  school: string;
  snapshot: SchoolOfflineSnapshot;
}) {
  const periodsByScheduleId = getPeriodsByScheduleId(snapshot);
  const schedules = snapshot.data.schedules.filter((schedule) => schedule.active).map((schedule) => ({
    id: schedule.id,
    name: schedule.schedule_name,
    type: schedule.schedule_type,
    calendarColor: getScheduleCalendarColor({
      id: schedule.id,
      name: schedule.schedule_name,
      calendarColor: schedule.calendar_color,
    }),
    setupStatus: schedule.setup_status,
    periods: periodsByScheduleId[schedule.id] || [],
  }));

  return (
    <main className="space-y-5">
      <SectionHeader eyebrow="Bell Schedule" title="Period Times" />
      <BellScheduleClient
        school={school}
        standardSchedules={schedules.filter((schedule) =>
          !isModifiedSchedule({
            schedule_name: schedule.name,
            schedule_type: schedule.type,
          })
        )}
        modifiedSchedules={schedules.filter((schedule) =>
          isModifiedSchedule({
            schedule_name: schedule.name,
            schedule_type: schedule.type,
          })
        )}
      />
    </main>
  );
}

function ResourceList({
  school,
  snapshot,
}: {
  school: string;
  snapshot: SchoolOfflineSnapshot;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-black text-slate-950 dark:text-white">School Links</h2>
      {snapshot.data.resources.map((resource) => {
        const href = resource.url || resource.file_url || `/${school}/app/resources`;
        const external = Boolean(resource.url || resource.file_url);
        const content = (
          <>
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-[#181818] dark:text-[#a3a3a3]">
              <LinkIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="truncate font-black text-slate-950 dark:text-white">{resource.title}</h3>
              <p className="mt-1 line-clamp-2 text-sm font-semibold text-slate-500 dark:text-[#a3a3a3]">
                {resource.description || resource.category || "Open resource"}
              </p>
            </div>
          </>
        );

        return external ? (
          <a key={resource.id} href={href} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]">
            {content}
          </a>
        ) : (
          <Link key={resource.id} href={href} className="flex items-center gap-3 rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]">
            {content}
          </Link>
        );
      })}
      {snapshot.data.resources.length === 0 && <EmptyCard>No school resources are posted yet.</EmptyCard>}
    </section>
  );
}

function EmptyCard({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-[1.5rem] border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-500 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424] dark:text-[#a3a3a3]">
      {children}
    </p>
  );
}
