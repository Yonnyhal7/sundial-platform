import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/20260808140000_resource_quick_links.sql");
const adminPage = read("src/app/[school]/admin/resources/page.tsx");
const adminList = read("src/components/admin/AdminResourcesList.tsx");
const createPage = read("src/app/[school]/admin/resources/new/page.tsx");
const editPage = read("src/app/[school]/admin/resources/[resourceId]/edit/page.tsx");
const menuData = read("src/lib/mobileAppData.ts");
const appHeader = read("src/components/mobile-app/AppHeader.tsx");
const onlineResources = read("src/app/[school]/app/resources/page.tsx");
const snapshot = read("src/lib/offline/fetchSchoolSnapshot.server.ts");
const offlineResources = read("src/components/offline/OfflineStudentAppContent.tsx");

describe("Resource Quick Link management contracts", () => {
  it("backfills existing active rows, excludes inactive rows, and defaults new rows to false", () => {
    expect(migration).toContain("add column if not exists is_quick_link boolean not null default false");
    expect(migration).toContain("set is_quick_link = is_active is true");
    expect(migration).toContain("alter column is_quick_link set default false");
    expect(createPage).not.toContain('name="is_quick_link"');
  });

  it("authorizes and tenant-scopes Quick Link mutations", () => {
    expect(migration).toContain("current_user_can_manage_school_section(p_school_id, 'resources')");
    expect(migration.match(/school_id = p_school_id/g)?.length).toBeGreaterThanOrEqual(3);
    expect(migration).toContain("Inactive resources cannot be Quick Links");
    expect(adminPage).toContain('requireAdminSectionAccess(\n      schoolId,\n      "resources",');
    expect(adminPage).toContain('rpc("set_resource_quick_link"');
  });

  it("clears Quick Link state on deactivation and needs no separate deletion cleanup", () => {
    expect(migration).toContain("new.is_quick_link := false");
    expect(editPage).toContain('...(!isActive ? { is_quick_link: false } : {})');
    expect(adminPage).toContain('.from("resources")\n      .delete()');
    expect(migration).not.toContain("quick_links (");
  });

  it("provides optimistic list controls, count, guidance, rollback, and duplicate protection", () => {
    expect(adminList).toContain("useOptimistic(confirmedIds)");
    expect(adminList).toContain("if (pendingRef.current) return");
    expect(adminList).toContain("reconcileQuickLinkIds");
    expect(adminList).toContain("Quick Links: {selectedCount} selected");
    expect(adminList).toContain("selectedCount > QUICK_LINK_GUIDANCE_THRESHOLD");
    expect(adminList).toContain("Inactive resources cannot be Quick Links");
    expect(adminList).toContain('selected ? "Quick Link" : "Add to Quick Links"');
  });

  it("shows only active selected Resources in the online PWA menu and hides an empty section", () => {
    expect(menuData).toContain('.eq("is_active", true)');
    expect(menuData).toContain('.eq("is_quick_link", true)');
    expect(menuData).not.toContain(".limit(8)");
    expect(appHeader).toContain("visibleQuickLinks.length > 0 && <section>");
    expect(appHeader).not.toContain("No quick links are configured yet.");
  });

  it("keeps the full online Resources page independent of Quick Link state", () => {
    expect(onlineResources).toContain('.eq("is_active", true)');
    expect(onlineResources).not.toContain('.eq("is_quick_link", true)');
  });

  it("serializes Quick Link state offline while retaining every active Resource in the library", () => {
    expect(snapshot).toContain("category, is_quick_link");
    expect(snapshot).toContain('.eq("is_active", true)');
    expect(appHeader).toContain("resourceQuickLinks(snapshot.data.resources, school)");
    expect(offlineResources).toContain("snapshot.data.resources.map((resource)");
    expect(offlineResources).not.toContain("snapshot.data.resources.filter((resource) => resource.is_quick_link).map");
  });

  it("invalidates the PWA menu cache after toggles, deletes, and deactivation edits", () => {
    expect(adminPage.match(/updateTag\("mobile-app-quick-links"\)/g)?.length).toBeGreaterThanOrEqual(2);
    expect(editPage).toContain('updateTag("mobile-app-quick-links")');
  });
});
