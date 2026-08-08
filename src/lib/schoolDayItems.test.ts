import { describe, expect, it } from "vitest";
import { getEventsForSchoolDate, getFeaturedEvent, getGamesForSchoolDate } from "./schoolDayItems";

const event = (id: string, date: string, time: string | null = null) => ({ id, title: id, location: null, event_date: date, start_time: time, end_time: null });
const game = (id: string, date: string) => ({ id, team_id: null, opponent: id, game_date: date, location: null, is_home: true });

describe("school-local day item selection", () => {
  it("selects only events on the requested date and sorts all-day first", () => {
    expect(getEventsForSchoolDate([event("late", "2026-08-07", "18:00"), event("adjacent", "2026-08-08", "00:01"), event("all-day", "2026-08-07")], "2026-08-07").map(({ id }) => id)).toEqual(["all-day", "late"]);
  });

  it("matches game wall-clock dates without UTC conversion and sorts by time", () => {
    expect(getGamesForSchoolDate([game("late", "2026-08-07T23:55:00-07:00"), game("adjacent", "2026-08-08T00:05:00Z"), game("early", "2026-08-07T08:00:00Z")], "2026-08-07").map(({ id }) => id)).toEqual(["early", "late"]);
  });

  it("gives Events and Calendar the same event set for the same school date", () => {
    const events = [event("today", "2026-08-07"), event("tomorrow", "2026-08-08")];
    expect(getEventsForSchoolDate(events, "2026-08-07")).toEqual(getEventsForSchoolDate(events, "2026-08-07"));
  });

  it("prefers the explicitly featured event and otherwise falls back to the next upcoming event", () => {
    const events = [
      { ...event("next", "2026-08-08"), is_featured: false },
      { ...event("selected", "2026-08-20"), is_featured: true },
    ];
    expect(getFeaturedEvent(events, "2026-08-07")?.id).toBe("selected");
    expect(getFeaturedEvent(events.map((item) => ({ ...item, is_featured: false })), "2026-08-07")?.id).toBe("next");
  });
});
