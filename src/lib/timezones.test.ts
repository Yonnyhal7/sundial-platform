import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formatDateInTimeZone } from "@/lib/localDate";
import { getTodayScheduleState } from "@/lib/scheduleTime";
import {
  COMMON_SCHOOL_TIME_ZONES,
  FALLBACK_TIME_ZONES,
  filterTimeZoneOptions,
  getMillisecondsUntilNextMidnight,
  getSupportedTimeZones,
  getTimeZoneClockParts,
  getTimeZoneLabel,
  getTimeZoneOptions,
  getTimeZoneOffsetLabel,
  isSupportedTimeZone,
  schoolLocalDateStartToUtc,
  timeZoneObservesDst,
} from "@/lib/timezones";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("school timezone catalog", () => {
  it("places common US school timezones first", () => {
    expect(getSupportedTimeZones().slice(0, COMMON_SCHOOL_TIME_ZONES.length)).toEqual(COMMON_SCHOOL_TIME_ZONES);
  });

  it("uses the runtime's complete supported list and a safe fallback", () => {
    const supplied = getSupportedTimeZones(() => ["Europe/London", "Asia/Tokyo"]);
    expect(supplied).toContain("Europe/London");
    expect(supplied).toContain("Asia/Tokyo");
    expect(getSupportedTimeZones(null)).toEqual(expect.arrayContaining([...FALLBACK_TIME_ZONES]));
  });

  it("rejects aliases, abbreviations, offsets, and unknown identifiers", () => {
    expect(isSupportedTimeZone("America/Los_Angeles")).toBe(true);
    for (const value of ["PST", "EST", "UTC-8", "Etc/GMT+8", "US/Pacific", "Mars/Olympus_Mons"]) {
      expect(isSupportedTimeZone(value)).toBe(false);
    }
  });

  it("searches friendly city labels and canonical identifiers", () => {
    const options = getTimeZoneOptions(new Date("2026-07-15T12:00:00Z"));
    expect(filterTimeZoneOptions(options, "Phoenix").map((option) => option.zone)).toContain("America/Phoenix");
    expect(filterTimeZoneOptions(options, "America/New_York").map((option) => option.zone)).toContain("America/New_York");
    expect(filterTimeZoneOptions(options, "not-a-zone")).toEqual([]);
  });

  it("renders current DST-sensitive offsets without manual offset math", () => {
    expect(getTimeZoneOffsetLabel("America/Los_Angeles", new Date("2026-01-15T12:00:00Z"))).toBe("UTC−08:00");
    expect(getTimeZoneOffsetLabel("America/Los_Angeles", new Date("2026-07-15T12:00:00Z"))).toBe("UTC−07:00");
    expect(getTimeZoneOffsetLabel("America/Denver", new Date("2026-07-15T12:00:00Z"))).toBe("UTC−06:00");
    expect(getTimeZoneOffsetLabel("America/Phoenix", new Date("2026-07-15T12:00:00Z"))).toBe("UTC−07:00");
    expect(getTimeZoneOffsetLabel("Pacific/Honolulu", new Date("2026-07-15T12:00:00Z"))).toBe("UTC−10:00");
    expect(timeZoneObservesDst("America/Phoenix", 2026)).toBe(false);
    expect(getTimeZoneLabel("America/Phoenix", new Date("2026-07-15T12:00:00Z"))).toContain("no DST");
  });
});

describe("timezone boundaries", () => {
  it("represents the fall repeated hour and spring missing hour", () => {
    expect(getTimeZoneClockParts(new Date("2026-11-01T08:30:00Z"), "America/Los_Angeles").hour).toBe(1);
    expect(getTimeZoneClockParts(new Date("2026-11-01T09:30:00Z"), "America/Los_Angeles").hour).toBe(1);
    expect(getTimeZoneClockParts(new Date("2026-03-08T09:59:00Z"), "America/Los_Angeles").hour).toBe(1);
    expect(getTimeZoneClockParts(new Date("2026-03-08T10:00:00Z"), "America/Los_Angeles").hour).toBe(3);
  });

  it("uses the school-local date when UTC is on another day and at the school-year boundary", () => {
    expect(formatDateInTimeZone(new Date("2026-07-01T02:00:00Z"), "America/Los_Angeles")).toBe("2026-06-30");
    expect(formatDateInTimeZone(new Date("2027-01-01T06:30:00Z"), "America/Los_Angeles")).toBe("2026-12-31");
  });

  it("converts true timestamp inputs at school-local midnight without shifting date-only values", () => {
    const instant = schoolLocalDateStartToUtc("2026-12-15", "America/Los_Angeles");
    expect(instant?.toISOString()).toBe("2026-12-15T08:00:00.000Z");
    expect(formatDateInTimeZone(instant!, "America/Los_Angeles")).toBe("2026-12-15");
  });

  it("schedules refresh for the affected school's next midnight", () => {
    const now = new Date("2026-07-20T06:30:00Z"); // 11:30 PM Pacific
    const delay = getMillisecondsUntilNextMidnight("America/Los_Angeles", now);
    expect(delay).toBeGreaterThanOrEqual(29 * 60 * 1000);
    expect(delay).toBeLessThanOrEqual(31 * 60 * 1000);
  });

  it("calculates current periods from the school's timezone, not the device timezone", () => {
    const periods = [{ id: "one", name: "First", start_time: "08:00:00", end_time: "09:00:00", sort_order: 1 }];
    const now = new Date("2026-07-20T15:30:00Z");
    expect(getTodayScheduleState(periods, now, { timeZone: "America/Los_Angeles" }).status).toBe("in_period");
    expect(getTodayScheduleState(periods, now, { timeZone: "America/New_York" }).status).toBe("after_school");
  });
});

describe("timezone workflow contracts", () => {
  it("keeps the selector searchable, keyboard-operable, and screen-reader described", () => {
    const source = read("src/components/TimezoneSelect.tsx");
    expect(source).toContain('role="combobox"');
    expect(source).toContain('role="listbox"');
    expect(source).toContain('aria-activedescendant');
    expect(source).toContain('event.key === "ArrowDown"');
    expect(source).toContain('event.key === "Escape"');
    expect(source).toContain("focus-within:ring-2");
  });

  it("uses the shared selector for platform and tenant settings", () => {
    expect(read("src/app/admin/dashboard/settings/SettingsForms.tsx")).toContain("<TimezoneSelect");
    expect(read("src/app/[school]/admin/settings/TimezoneSettingsForm.tsx")).toContain("<TimezoneSelect");
  });

  it("enforces tenant authorization, confirmation, archive, audit, and stale-write gates in SQL", () => {
    const sql = read("supabase/migrations/20260720200000_school_timezone_management.sql");
    expect(sql).toContain("membership.school_id = p_school_id");
    expect(sql).toContain("membership.role = 'SchoolAdmin'");
    expect(sql).not.toContain("membership.role = 'Editor'");
    expect(sql).toContain("v_before.archived_at is not null");
    expect(sql).toContain("p_confirmed is not true");
    expect(sql).toContain("v_before.timezone_version <> p_expected_version");
    expect(sql).toContain("v_actor uuid := auth.uid()");
    expect(sql).toContain("school_timezone_audit");
    expect(sql).toContain("enforce_supported_school_timezone");
    expect(sql).toContain("create or replace function public.update_platform_settings");
    expect(sql).toContain("revoke all on function public.update_school_timezone");
  });

  it("versions tenant snapshots and avoids showing stale cached timezone data while online", () => {
    expect(read("src/lib/offline/types.ts")).toContain("SCHOOL_OFFLINE_SCHEMA_VERSION = 3");
    expect(read("src/lib/offline/fetchSchoolSnapshot.server.ts")).toContain("timezoneVersion");
    const runtime = read("src/components/offline/OfflineStudentAppRuntime.tsx");
    expect(runtime).not.toContain('syncState === "cached"');
  });
});
