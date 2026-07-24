import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("student app freshness integration", () => {
  it("wraps every installed-app page in the shared refresh runtime", () => {
    const layout = read("src/app/[school]/app/layout.tsx");
    expect(layout).toContain("<OfflineStudentAppRuntime");
    expect(layout).toContain("timeZone={schoolData.timezone");
    for (const route of ["page.tsx", "schedule/page.tsx", "events/page.tsx", "athletics/page.tsx"]) {
      expect(() => read(`src/app/[school]/app/${route}`)).not.toThrow();
    }
  });

  it("keeps school-data freshness separate from the service-worker lifecycle", () => {
    const runtime = read("src/components/offline/OfflineStudentAppRuntime.tsx");
    const lifecycle = read("src/lib/offline/schoolDataRefreshLifecycle.ts");
    expect(runtime).toContain("startSchoolDataRefreshLifecycle");
    expect(lifecycle).not.toContain("controllerchange");
    expect(lifecycle).not.toContain("location.reload");
  });
});
