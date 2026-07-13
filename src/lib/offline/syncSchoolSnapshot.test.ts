import { beforeEach, describe, expect, it, vi } from "vitest";

const { clearSchoolSnapshot, saveSchoolSnapshot } = vi.hoisted(() => ({
  clearSchoolSnapshot: vi.fn(),
  saveSchoolSnapshot: vi.fn(),
}));

vi.mock("@/lib/offline/db", () => ({ clearSchoolSnapshot, saveSchoolSnapshot }));

import {
  fetchAndStoreSchoolSnapshot,
  SchoolSnapshotUnavailableError,
} from "@/lib/offline/syncSchoolSnapshot";

describe("offline lifecycle synchronization", () => {
  beforeEach(() => {
    clearSchoolSnapshot.mockReset();
    saveSchoolSnapshot.mockReset();
    vi.unstubAllGlobals();
  });

  it.each([404, 410])("purges the tenant snapshot after a %s lifecycle response", async (status) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status }));
    await expect(fetchAndStoreSchoolSnapshot("school-a", "school-a-id")).rejects.toBeInstanceOf(
      SchoolSnapshotUnavailableError
    );
    expect(clearSchoolSnapshot).toHaveBeenCalledWith("school-a-id");
    expect(saveSchoolSnapshot).not.toHaveBeenCalled();
  });

  it("keeps a cached snapshot on a temporary server error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(fetchAndStoreSchoolSnapshot("school-a", "school-a-id")).rejects.toThrow("503");
    expect(clearSchoolSnapshot).not.toHaveBeenCalled();
  });
});
