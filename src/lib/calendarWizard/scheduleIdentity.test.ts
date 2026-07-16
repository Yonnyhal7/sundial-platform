import { describe, expect, it } from "vitest";
import { canonicalScheduleName } from "./scheduleIdentity";

describe("canonicalScheduleName", () => {
  it.each(["All Periods 1-6", "All-Periods 1-6", "All Periods 1–6", "All-Periods 1–6", " all periods 1 - 6 "])("normalizes %s", (name) => {
    expect(canonicalScheduleName(name)).toBe("all-periods-1-6");
  });
  it("keeps semantically different schedule names distinct", () => {
    expect(canonicalScheduleName("Brown Day")).not.toBe(canonicalScheduleName("Brown Assembly Day"));
  });
});
