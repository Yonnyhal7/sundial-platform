import { describe, expect, it } from "vitest";
import { computeAssignmentDigest } from "./assignmentDigest";

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
});
