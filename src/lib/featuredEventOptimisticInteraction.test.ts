import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const client = readFileSync("src/components/admin/AdminEventsList.tsx", "utf8");
const page = readFileSync("src/app/[school]/admin/events/page.tsx", "utf8");

describe("featured event optimistic interaction", () => {
  it("optimistically swaps the featured event and reconciles the result", () => {
    expect(client).toContain("useOptimistic(confirmedFeaturedId)");
    expect(client).toContain("setOptimisticFeaturedId(nextFeaturedId)");
    expect(client).toContain("reconcileFeaturedEventId");
  });

  it("blocks duplicate mutations and disables every control while pending", () => {
    expect(client).toContain("if (pendingRef.current) return");
    expect(client).toContain("pendingRef.current = true");
    expect(client).toContain("disabled={mutationPending ||");
    expect(client).toContain("Saving…");
  });

  it("preserves accessible labels and announces progress or failure", () => {
    expect(client).toContain("as the featured event`");
    expect(client).toContain('role="status" aria-live="polite"');
    expect(client).toContain('toast.kind === "error" ? "alert" : "status"');
  });

  it("returns mutation results without revalidating and refetching the admin route", () => {
    const action = page.slice(page.indexOf("async function setFeaturedEvent"), page.indexOf("const { data: events"));
    expect(action).toContain('rpc("set_school_featured_event"');
    expect(action).not.toContain("revalidatePath");
  });
});
