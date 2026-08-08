import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

const experience = source("src/components/mobile-app/AthleticsExperience.tsx");
const onlinePage = source("src/app/[school]/app/athletics/page.tsx");
const offlinePage = source(
  "src/components/offline/OfflineStudentAppContent.tsx",
);
const calendar = source("src/components/mobile-app/CalendarScheduleClient.tsx");

describe("personalized PWA Athletics experience", () => {
  it("keeps the existing Athletics shell and Games/Teams segmented control", () => {
    expect(experience).toContain("Athletics");
    expect(experience).toContain("Games and Teams");
    expect(experience).toContain('(["games", "teams"] as const)');
    expect(experience).toContain('aria-label="Athletics views"');
  });

  it("renders accessible Follow and Following controls", () => {
    expect(experience).toContain(
      'aria-label={`${following ? "Unfollow" : "Follow"} ${team.name}`}',
    );
    expect(experience).toContain("aria-pressed={following}");
    expect(experience).toContain('following ? "Following" : "Follow"');
  });

  it("renders separate Following and All Teams sections", () => {
    expect(experience).toContain("teamSections.following.length > 0");
    expect(experience).toContain("Following");
    expect(experience).toContain("All Teams");
    expect(experience).toContain("teamSections.allTeams.map");
  });

  it("shows distinct zero-follow and no-upcoming-games states", () => {
    expect(experience).toContain('title="No teams followed yet"');
    expect(experience).toContain(
      "Follow teams to see their upcoming games here.",
    );
    expect(experience).toContain('title="No upcoming games"');
    expect(experience).toContain(
      "Your followed teams don&apos;t have any upcoming games scheduled.",
    );
  });

  it("switches Browse Teams locally without creating another route", () => {
    expect(experience).toContain('onClick={() => switchTab("teams")}');
    expect(experience).toContain("Browse Teams");
    expect(experience).toContain("window.history.replaceState");
  });

  it("uses one shared component for online and cached offline Athletics", () => {
    expect(onlinePage).toContain("<AthleticsExperience");
    expect(onlinePage).toContain("schoolId={schoolData.id}");
    expect(offlinePage).toContain("<AthleticsExperience");
    expect(offlinePage).toContain("schoolId={snapshot.schoolId}");
    expect(offlinePage).toContain("games={snapshot.data.games}");
  });

  it("keeps Calendar Sports independent from team follows", () => {
    expect(calendar).toContain(
      "getGamesForSchoolDate(calendarGames, selectedDay.date)",
    );
    expect(calendar).not.toContain("athleticsTeamFollows");
    expect(calendar).not.toContain("followedTeamIds");
  });
});
