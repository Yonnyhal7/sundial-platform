import { describe, expect, it } from "vitest";
import {
  getFollowedUpcomingGames,
  getTeamFollowStorageKey,
  readFollowedTeamIds,
  splitTeamsByFollowState,
  toggleFollowedTeam,
  writeFollowedTeamIds,
  type TeamFollowStorage,
} from "@/lib/athleticsTeamFollows";
import { getGamesForSchoolDate } from "@/lib/schoolDayItems";

class MemoryStorage implements TeamFollowStorage {
  values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

const teams = [
  { id: "football", name: "Varsity Boys Football" },
  { id: "volleyball", name: "Varsity Girls Volleyball" },
  { id: "soccer", name: "JV Boys Soccer" },
];

const games = [
  {
    id: "football-today-late",
    team_id: "football",
    opponent: "Eagles",
    game_date: "2026-08-07T19:00:00",
    location: null,
    is_home: true,
  },
  {
    id: "football-today-early",
    team_id: "football",
    opponent: "Tigers",
    game_date: "2026-08-07T08:00:00",
    location: null,
    is_home: false,
  },
  {
    id: "volleyball-tomorrow",
    team_id: "volleyball",
    opponent: "Bears",
    game_date: "2026-08-08T16:00:00",
    location: null,
    is_home: true,
  },
  {
    id: "soccer-yesterday",
    team_id: "soccer",
    opponent: "Wolves",
    game_date: "2026-08-06T20:00:00",
    location: null,
    is_home: true,
  },
];

describe("tenant-scoped athletics team follows", () => {
  it("follows a team and unfollows it with the same toggle", () => {
    const followed = toggleFollowedTeam([], "football");
    expect(followed).toEqual(["football"]);
    expect(toggleFollowedTeam(followed, "football")).toEqual([]);
  });

  it("puts followed teams in Following and unfollowed teams in All Teams", () => {
    const sections = splitTeamsByFollowState(teams, ["football"]);
    expect(sections.following.map((team) => team.id)).toEqual(["football"]);
    expect(sections.allTeams.map((team) => team.id)).toEqual([
      "volleyball",
      "soccer",
    ]);
  });

  it("never duplicates followed teams between sections", () => {
    const sections = splitTeamsByFollowState(teams, ["football", "soccer"]);
    const renderedIds = [
      ...sections.following.map((team) => team.id),
      ...sections.allTeams.map((team) => team.id),
    ];
    expect(new Set(renderedIds).size).toBe(teams.length);
    expect(renderedIds).toHaveLength(teams.length);
  });

  it("persists followed teams across preference reads", () => {
    const storage = new MemoryStorage();
    writeFollowedTeamIds("school-a", ["football", "volleyball"], storage);
    expect(readFollowedTeamIds("school-a", undefined, storage)).toEqual([
      "football",
      "volleyball",
    ]);
  });

  it("keeps follows usable in memory when browser storage is unavailable", () => {
    writeFollowedTeamIds("school-without-storage", ["football"], null);
    expect(
      readFollowedTeamIds("school-without-storage", undefined, null),
    ).toEqual(["football"]);

    writeFollowedTeamIds("school-without-storage", [], null);
    expect(
      readFollowedTeamIds("school-without-storage", undefined, null),
    ).toEqual([]);
  });

  it("deduplicates and rejects malformed stored preferences", () => {
    const storage = new MemoryStorage();
    storage.setItem(
      getTeamFollowStorageKey("school-a"),
      JSON.stringify(["football", "football", "", 42]),
    );
    expect(readFollowedTeamIds("school-a", undefined, storage)).toEqual([
      "football",
    ]);
    storage.setItem(getTeamFollowStorageKey("school-a"), "not-json");
    expect(readFollowedTeamIds("school-a", undefined, storage)).toEqual([]);
  });

  it("removes the storage entry when no teams remain followed", () => {
    const storage = new MemoryStorage();
    writeFollowedTeamIds("school-a", ["football"], storage);
    writeFollowedTeamIds("school-a", [], storage);
    expect(storage.getItem(getTeamFollowStorageKey("school-a"))).toBeNull();
  });

  it("scopes preference keys to immutable school IDs", () => {
    expect(getTeamFollowStorageKey("school-a")).not.toBe(
      getTeamFollowStorageKey("school-b"),
    );
  });

  it("does not leak School A follows into School B", () => {
    const storage = new MemoryStorage();
    writeFollowedTeamIds("school-a", ["football"], storage);
    writeFollowedTeamIds("school-b", ["volleyball"], storage);
    expect(readFollowedTeamIds("school-a", undefined, storage)).toEqual([
      "football",
    ]);
    expect(readFollowedTeamIds("school-b", undefined, storage)).toEqual([
      "volleyball",
    ]);
  });

  it("ignores followed IDs that are not active teams in the current tenant", () => {
    const storage = new MemoryStorage();
    writeFollowedTeamIds("school-a", ["football", "removed"], storage);
    expect(
      readFollowedTeamIds(
        "school-a",
        teams.map((team) => team.id),
        storage,
      ),
    ).toEqual(["football"]);
  });
});

describe("personalized athletics game selection", () => {
  it("shows only games belonging to followed stable team IDs", () => {
    expect(
      getFollowedUpcomingGames(games, ["football"], "2026-08-07").map(
        (game) => game.id,
      ),
    ).toEqual(["football-today-early", "football-today-late"]);
  });

  it("shows Football and Volleyball games when both teams are followed", () => {
    expect(
      getFollowedUpcomingGames(
        games,
        ["football", "volleyball"],
        "2026-08-07",
      ).map((game) => game.id),
    ).toEqual([
      "football-today-early",
      "football-today-late",
      "volleyball-tomorrow",
    ]);
  });

  it("removes Football games immediately after Football is unfollowed", () => {
    const remainingFollows = toggleFollowedTeam(
      ["football", "volleyball"],
      "football",
    );
    expect(
      getFollowedUpcomingGames(games, remainingFollows, "2026-08-07").map(
        (game) => game.id,
      ),
    ).toEqual(["volleyball-tomorrow"]);
  });

  it("returns no personalized games when no teams are followed", () => {
    expect(getFollowedUpcomingGames(games, [], "2026-08-07")).toEqual([]);
  });

  it("keeps games from earlier today visible all day", () => {
    expect(
      getFollowedUpcomingGames(games, ["football"], "2026-08-07").map(
        (game) => game.id,
      ),
    ).toContain("football-today-early");
  });

  it("excludes games before the current school-local date", () => {
    expect(getFollowedUpcomingGames(games, ["soccer"], "2026-08-07")).toEqual(
      [],
    );
  });

  it("sorts by date and then wall-clock time", () => {
    const unsorted = [games[2], games[0], games[1]];
    expect(
      getFollowedUpcomingGames(
        unsorted,
        ["football", "volleyball"],
        "2026-08-07",
      ).map((game) => game.id),
    ).toEqual([
      "football-today-early",
      "football-today-late",
      "volleyball-tomorrow",
    ]);
  });

  it("sorts date-only/TBD games consistently before timed games that day", () => {
    const tbd = {
      ...games[0],
      id: "football-tbd",
      game_date: "2026-08-07",
    };
    expect(
      getFollowedUpcomingGames(
        [games[0], tbd, games[1]],
        ["football"],
        "2026-08-07",
      ).map((game) => game.id),
    ).toEqual(["football-tbd", "football-today-early", "football-today-late"]);
  });

  it("ignores games without a team relationship or scheduled date", () => {
    expect(
      getFollowedUpcomingGames(
        [
          { ...games[0], id: "no-team", team_id: null },
          { ...games[0], id: "no-date", game_date: null },
        ],
        ["football"],
        "2026-08-07",
      ),
    ).toEqual([]);
  });

  it("uses the same filtering for cached offline game records", () => {
    const cachedGames = games.map((game) => ({
      ...game,
      school_id: "school-a",
    }));
    expect(
      getFollowedUpcomingGames(cachedGames, ["volleyball"], "2026-08-07").map(
        (game) => game.id,
      ),
    ).toEqual(["volleyball-tomorrow"]);
  });

  it("leaves Calendar Sports school-wide and unfiltered", () => {
    const calendarGames = getGamesForSchoolDate(games, "2026-08-07");
    const personalizedGames = getFollowedUpcomingGames(
      games,
      ["volleyball"],
      "2026-08-07",
    );
    expect(calendarGames.map((game) => game.id)).toEqual([
      "football-today-early",
      "football-today-late",
    ]);
    expect(personalizedGames.map((game) => game.id)).toEqual([
      "volleyball-tomorrow",
    ]);
  });
});
