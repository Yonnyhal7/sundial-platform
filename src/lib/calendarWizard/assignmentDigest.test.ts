import { describe, expect, it } from "vitest";
import {
  computeAssignmentDigest,
  computeCalendarClassificationDigest,
  findAssignmentDigestDifferences,
} from "./assignmentDigest";

describe("calendar assignment digest", () => {
  it("matches preview and creation payloads across temporary and persisted schedule IDs", async () => {
    const preview = await computeAssignmentDigest([
      { date: "2026-08-12", isSchoolDay: true, scheduleId: "temp-all" },
      { date: "2026-08-13", isSchoolDay: true, scheduleId: "temp-brown" },
    ], (id) => ({ "temp-all": "All Periods 1-6", "temp-brown": "Brown Day" })[id]);
    const creation = await computeAssignmentDigest([
      { date: "2026-08-12", isSchoolDay: true, scheduleId: "uuid-all" },
      { date: "2026-08-13", isSchoolDay: true, scheduleId: "uuid-brown" },
    ], (id) => ({ "uuid-all": "All-Periods 1–6", "uuid-brown": "Brown Day" })[id]);
    expect(creation).toBe(preview);
  });

  it("is order-independent and compares instructional assignments only", async () => {
    const first = await computeAssignmentDigest([
      { date: "2026-09-07", isSchoolDay: false, scheduleId: null },
      { date: "2026-08-13", isSchoolDay: true, scheduleId: "brown" },
    ], (id) => id);
    const second = await computeAssignmentDigest([
      { date: "2026-08-13", isSchoolDay: true, scheduleId: "brown" },
    ], (id) => id);
    expect(first).toBe(second);
  });

  it("reports the first differing assignment dates safely", () => {
    expect(findAssignmentDigestDifferences(
      [{ date: "2026-08-13", isSchoolDay: true, scheduleId: "brown" }],
      [{ date: "2026-08-13", isSchoolDay: true, scheduleId: "gold" }],
      (id) => id,
      (id) => id
    )).toEqual(["2026-08-13"]);
  });

  it("includes staff-only and neutral classifications in the classification digest", async () => {
    const staff = await computeCalendarClassificationDigest([
      { date: "2026-08-10", isSchoolDay: false, scheduleId: null, classification: "staff_only", labels: ["Teacher Orientation"] },
    ], (id) => id);
    const neutral = await computeCalendarClassificationDigest([
      { date: "2026-08-10", isSchoolDay: false, scheduleId: null, classification: "neutral_non_operating", labels: ["Teacher Orientation"] },
    ], (id) => id);
    expect(staff).not.toBe(neutral);
  });
});
