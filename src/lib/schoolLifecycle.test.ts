import { describe, expect, it } from "vitest";
import {
  confirmationMatches,
  dedupeStorageManifest,
  isTenantScopedStorageObject,
  normalizeDeletionCounts,
  storageObjectFromPublicUrl,
} from "@/lib/schoolLifecycle";

const supabaseUrl = "https://tenant-test.supabase.co";
const schoolA = "11111111-1111-4111-8111-111111111111";
const schoolB = "22222222-2222-4222-8222-222222222222";

describe("school lifecycle guards", () => {
  it("requires an exact school name or slug", () => {
    expect(confirmationMatches("Disposable School", "Disposable School", "disposable-school")).toBe(true);
    expect(confirmationMatches("disposable-school", "Disposable School", "disposable-school")).toBe(true);
    expect(confirmationMatches("Disposable school", "Disposable School", "disposable-school")).toBe(false);
    expect(confirmationMatches("other-school", "Disposable School", "disposable-school")).toBe(false);
  });

  it("accepts only this school's immutable Storage prefix", () => {
    const own = storageObjectFromPublicUrl(
      `${supabaseUrl}/storage/v1/object/public/resource-file/schools/${schoolA}/resources/guide.pdf`,
      supabaseUrl
    );
    const foreign = storageObjectFromPublicUrl(
      `${supabaseUrl}/storage/v1/object/public/resource-file/schools/${schoolB}/resources/guide.pdf`,
      supabaseUrl
    );
    expect(own && isTenantScopedStorageObject(own, schoolA)).toBe(true);
    expect(foreign && isTenantScopedStorageObject(foreign, schoolA)).toBe(false);
  });

  it("rejects external, malformed, and traversal Storage URLs", () => {
    expect(storageObjectFromPublicUrl("https://example.com/file.pdf", supabaseUrl)).toBeNull();
    expect(storageObjectFromPublicUrl(`${supabaseUrl}/not-storage/file.pdf`, supabaseUrl)).toBeNull();
    expect(
      storageObjectFromPublicUrl(
        `${supabaseUrl}/storage/v1/object/public/resource-file/schools/${schoolA}/../other.pdf`,
        supabaseUrl
      )
    ).toBeNull();
  });

  it("deduplicates cleanup entries without combining tenants", () => {
    expect(
      dedupeStorageManifest([
        { bucket: "resource-file", path: `schools/${schoolA}/resources/a.pdf` },
        { bucket: "resource-file", path: `schools/${schoolA}/resources/a.pdf` },
        { bucket: "resource-file", path: `schools/${schoolB}/resources/a.pdf` },
      ])
    ).toHaveLength(2);
  });

  it("normalizes deletion summaries without trusting malformed counts", () => {
    const counts = normalizeDeletionCounts({ schedules: 2, users: "3", periods: -1 });
    expect(counts.schedules).toBe(2);
    expect(counts.users).toBe(3);
    expect(counts.periods).toBe(0);
    expect(counts.storedFiles).toBe(0);
  });
});
