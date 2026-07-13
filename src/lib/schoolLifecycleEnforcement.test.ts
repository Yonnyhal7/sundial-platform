import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("archived school enforcement wiring", () => {
  it("uses only the archive-aware school lookup in application code", () => {
    const files = [
      "src/lib/mobileAppData.ts",
      "src/lib/offline/fetchSchoolSnapshot.server.ts",
      "src/lib/schools.ts",
      "src/app/[school]/layout.tsx",
    ];
    for (const file of files) {
      expect(source(file)).not.toContain('.rpc("get_school_by_subdomain"');
    }
    expect(source("src/lib/schools.ts")).toContain('.is("archived_at", null)');
  });

  it("rechecks SuperAdmin and current database identity in every lifecycle action", () => {
    const actions = source("src/app/admin/dashboard/schools/lifecycle-actions.ts");
    expect(actions.match(/requireSuperAdminAccess\(\)/g)?.length).toBeGreaterThanOrEqual(4);
    expect(actions).toContain("getLifecycleSchool");
    expect(actions).toContain("targetMatches");
    expect(actions).toContain("confirmationMatches");
    expect(actions).toContain('field(formData, "irreversible") !== "yes"');
  });

  it("returns a lifecycle status and purges offline state", () => {
    const route = source("src/app/api/schools/[school]/offline-snapshot/route.ts");
    const sync = source("src/lib/offline/syncSchoolSnapshot.ts");
    const worker = source("public/sw.js");
    expect(route).toContain("status: 410");
    expect(route).toContain("getSchoolLifecycleBySubdomain");
    expect(sync).toContain("await clearSchoolSnapshot(expectedSchoolId)");
    expect(worker).toContain('type !== "PURGE_SCHOOL_CACHE"');
    expect(worker).toContain("cache.delete(request)");
  });

  it("uses immutable tenant-owned paths for all new uploads", () => {
    expect(source("src/components/admin/ResourceFileUpload.tsx")).toContain(
      "schools/${schoolId}/resources/${fileName}"
    );
    expect(source("src/app/[school]/admin/settings/actions.ts")).toContain(
      "schools/${schoolData.id}/logos/"
    );
    expect(source("src/app/[school]/admin/setup/actions.ts")).toContain(
      "schools/${schoolData.id}/logos/"
    );
  });
});
