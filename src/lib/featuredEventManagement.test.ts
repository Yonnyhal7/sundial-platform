import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("featured event management", () => {
  const migration = read("sql/add_featured_event.sql");
  const admin = read("src/app/[school]/admin/events/page.tsx");
  const edit = read("src/app/[school]/admin/events/[eventId]/edit/page.tsx");
  const online = read("src/app/[school]/app/events/page.tsx");
  const offline = read("src/components/offline/OfflineStudentAppContent.tsx");
  const snapshot = read("src/lib/offline/fetchSchoolSnapshot.server.ts");

  it("enforces one independently featured event per school", () => {
    expect(migration).toContain("on public.events (school_id)");
    expect(migration).toContain("where is_featured is true");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("set is_featured = false");
    expect(migration).toContain("set is_featured = true");
  });

  it("authorizes and tenant-scopes every featured mutation", () => {
    expect(migration).toContain("current_user_can_manage_school_section(p_school_id, 'events')");
    expect(migration).toContain("id = p_event_id");
    expect(migration.match(/school_id = p_school_id/g)?.length).toBeGreaterThanOrEqual(4);
    expect(migration).toContain("Inactive events cannot be featured");
    expect(admin).toContain('requireAdminSectionAccess(\n      schoolId,\n      "events",');
  });

  it("supports making and removing featured status from the list", () => {
    expect(admin).toContain('rpc("set_school_featured_event"');
    expect(admin).toContain('event.is_featured ? "false" : "true"');
    expect(admin).toContain('event.is_featured ? "Featured" : "Make Featured"');
    expect(admin).toContain("Inactive events cannot be featured");
  });

  it("clears featured status when an event is deactivated and deletion needs no reference cleanup", () => {
    expect(edit).toContain('...(!isActive ? { is_featured: false } : {})');
    expect(migration).not.toContain("featured_event_id");
    expect(admin).toContain('.from("events")\n        .delete()');
  });

  it("uses explicit selection online and offline with the previous upcoming fallback", () => {
    for (const source of [online, offline]) {
      expect(source).toContain("getFeaturedEvent");
      expect(source).toContain("event.id !== featured?.id");
    }
  });

  it("serializes featured status into the bounded offline snapshot", () => {
    expect(snapshot).toContain("image_url, is_featured");
    expect(snapshot).toContain("is_featured.eq.true");
  });
});
