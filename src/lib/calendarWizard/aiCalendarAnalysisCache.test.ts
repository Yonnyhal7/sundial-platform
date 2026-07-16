import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: mocks.createSupabaseServerClient,
}));

import {
  markStaleCalendarAnalysisIfNeeded,
  type CalendarAnalysisCacheKey,
} from "./aiCalendarAnalysisCache.server";

const cacheKey: CalendarAnalysisCacheKey = {
  schoolId: "school-1",
  pdfHash: "a".repeat(64),
  strategy: "pdf-gpt5",
  model: "gpt-5",
  version: "calendar-v3",
};

function mockSupabaseCacheRow(row: Record<string, unknown> | null) {
  const state: {
    mode: "read" | "update";
    patch: Record<string, unknown> | null;
  } = {
    mode: "read",
    patch: null,
  };

  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    is: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => {
      if (!row) return { data: null, error: null };
      if (state.mode === "update") {
        return { data: { ...row, ...state.patch }, error: null };
      }
      return { data: row, error: null };
    }),
    update: vi.fn((patch: Record<string, unknown>) => {
      state.mode = "update";
      state.patch = patch;
      return builder;
    }),
  };

  mocks.createSupabaseServerClient.mockResolvedValue({
    from: vi.fn(() => builder),
  });

  return { builder, state };
}

describe("AI calendar analysis cache stale lifecycle", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("marks a pending analyzing job stale after the analyzer deadline and heartbeat grace", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-16T00:04:00.000Z"));
    const { state } = mockSupabaseCacheRow({
      status: "pending",
      current_stage: "analyzing_pdf",
      stage_strategy: "pdf-gpt5",
      request_id: "request-1",
      reason_code: null,
      created_at: "2026-07-16T00:00:00.000Z",
      updated_at: "2026-07-16T00:02:00.000Z",
      last_heartbeat_at: "2026-07-16T00:02:00.000Z",
    });

    const result = await markStaleCalendarAnalysisIfNeeded(cacheKey, {
      analyzerDeadlineMs: 180_000,
      heartbeatStaleMs: 45_000,
      deadlineGraceMs: 15_000,
    });

    expect(result).toMatchObject({
      status: "failed",
      stage: "confirmed_failed",
      reasonCode: "analysis_job_stale",
      strategy: "pdf-gpt5",
      requestId: "request-1",
    });
    expect(state.patch).toMatchObject({
      status: "failed",
      current_stage: "confirmed_failed",
      reason_code: "analysis_job_stale",
    });
  });

  it("does not mark a job stale when heartbeats are still fresh", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-16T00:04:00.000Z"));
    mockSupabaseCacheRow({
      status: "pending",
      current_stage: "analyzing_pdf",
      stage_strategy: "pdf-gpt5",
      request_id: "request-1",
      reason_code: null,
      created_at: "2026-07-16T00:00:00.000Z",
      updated_at: "2026-07-16T00:03:45.000Z",
      last_heartbeat_at: "2026-07-16T00:03:45.000Z",
    });

    await expect(
      markStaleCalendarAnalysisIfNeeded(cacheKey, {
        analyzerDeadlineMs: 180_000,
        heartbeatStaleMs: 45_000,
        deadlineGraceMs: 15_000,
      })
    ).resolves.toBeNull();
  });
});
