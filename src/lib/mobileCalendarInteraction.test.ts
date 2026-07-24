import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("mobile calendar interaction contract", () => {
  it("preloads adjacent months without adding database round trips", () => {
    const page = source("src/app/[school]/app/schedule/page.tsx");

    expect(page).toContain("const displayedMonths = [-1, 0, 1]");
    expect(page).toContain("monthDatesByKey");
    expect(page).toContain("months={months}");
    expect(page).not.toContain("previousMonthHref");
    expect(page).not.toContain("nextMonthHref");
  });

  it("switches cached months locally and uses a safe server fallback", () => {
    const client = source(
      "src/components/mobile-app/CalendarScheduleClient.tsx"
    );

    expect(client).toContain('const href = `?month=${targetMonthKey}`');
    expect(client).toContain('window.history.pushState(null, "", href)');
    expect(client).toContain("getSnapshotMonth(snapshot, monthKey)");
    expect(client).toContain("router.push(href, { scroll: false })");
    expect(client).not.toContain("/${school}/app/schedule");
  });

  it("owns horizontal swipes while preserving vertical touch scrolling", () => {
    const client = source(
      "src/components/mobile-app/CalendarScheduleClient.tsx"
    );

    expect(client).toContain("data-swipe-nav-ignore");
    expect(client).toContain("touch-pan-y");
    expect(client).toContain("getCalendarSwipeMonthOffset");
    expect(client).toContain("onPointerCancel={handlePointerEnd}");
    expect(client).toContain("suppressClickRef");
  });

  it("announces calendar state without relying on color alone", () => {
    const client = source(
      "src/components/mobile-app/CalendarScheduleClient.tsx"
    );

    expect(client).toContain("getCalendarDayAccessibleLabel");
    expect(client).toContain("aria-pressed={selected}");
  });

  it("announces the active bottom-navigation destination", () => {
    const bottomNav = source("src/components/mobile-app/AppBottomNav.tsx");

    expect(bottomNav).toContain('aria-current={active ? "page" : undefined}');
  });

  it("recognizes both tenant-host and path-based offline calendar routes", () => {
    const offlineContent = source(
      "src/components/offline/OfflineStudentAppContent.tsx"
    );

    expect(offlineContent).toContain('pathSegments[0] === "app"');
    expect(offlineContent).toContain('section === "schedule"');
  });
});
