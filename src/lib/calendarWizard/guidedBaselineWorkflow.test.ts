import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const wizard = read("src/app/[school]/admin/calendar/wizard/schedule-wizard-client.tsx");
const sharedCalendar = read("src/components/admin/SchoolCalendar.tsx");

describe("guided baseline plus exceptions workflow", () => {
  it("uses the five baseline-oriented guided steps", () => {
    for (const label of [
      "School Year",
      "Schedule Names",
      "Normal Pattern",
      "Exceptions & Review",
      "Create Calendar",
    ]) {
      expect(wizard).toContain(label);
    }
  });

  it("keeps the shared calendar visible as the live guided workspace", () => {
    expect(wizard).toContain("Live Draft Calendar");
    expect(wizard).toContain("Baseline plus exceptions");
    expect(wizard).toContain('mode="guided-edit"');
  });

  it("supports direct single, bulk, and range exception actions", () => {
    for (const action of [
      "Select date range",
      "Clear selection",
      "Assign Schedule",
      "Mark No School",
      "Mark School Day",
      "Restore Normal Pattern",
      "Add Label",
      "Clear Override",
      "Undo last edit",
    ]) {
      expect(wizard).toContain(action);
    }
  });

  it("supports common and advanced baseline patterns", () => {
    expect(wizard).toContain("Same schedule every school day");
    expect(wizard).toContain("Alternate between two schedules");
    expect(wizard).toContain("Alternate by instructional day");
    expect(wizard).toContain("Alternate by calendar week");
    expect(wizard).toContain("Different schedule by weekday");
    expect(wizard).toContain("Custom repeating cycle · Advanced");
  });

  it("exposes accessible multi-select and shift-range behavior in the shared calendar", () => {
    expect(sharedCalendar).toContain('mode !== "guided-edit"');
    expect(sharedCalendar).toContain("event.shiftKey");
    expect(sharedCalendar).toContain("event.metaKey || event.ctrlKey");
    expect(sharedCalendar).toContain("aria-pressed");
  });

  it("keeps missing bell times informational", () => {
    expect(wizard).toContain("These schedules can be used now.");
    expect(wizard).toContain("Add periods and bell times later");
  });
});
