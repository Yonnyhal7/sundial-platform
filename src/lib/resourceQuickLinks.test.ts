import { describe, expect, it } from "vitest";
import {
  QUICK_LINK_GUIDANCE_THRESHOLD,
  getOptimisticQuickLinkIds,
  reconcileQuickLinkIds,
  resourceQuickLinks,
} from "@/lib/resourceQuickLinks";

const resources = [
  { id: "a", title: "ParentVUE", url: "https://example.com/vue", file_url: null, is_quick_link: true },
  { id: "b", title: "Handbook", url: null, file_url: "/handbook.pdf", is_quick_link: false },
  { id: "c", title: "Lunch", url: null, file_url: null, is_quick_link: true },
];

describe("Resource Quick Links", () => {
  it("allows multiple resources to be selected and removed independently", () => {
    const selected = getOptimisticQuickLinkIds(["a"], "c", true);
    expect(selected).toEqual(["a", "c"]);
    expect(getOptimisticQuickLinkIds(selected, "a", false)).toEqual(["c"]);
  });

  it("rolls an optimistic selection back after a failed mutation", () => {
    expect(reconcileQuickLinkIds({ previousIds: ["a"], optimisticIds: ["a", "c"], succeeded: false })).toEqual(["a"]);
    expect(reconcileQuickLinkIds({ previousIds: ["a"], optimisticIds: ["a", "c"], succeeded: true })).toEqual(["a", "c"]);
  });

  it("builds the menu from selected resources without filtering the resource library", () => {
    expect(resourceQuickLinks(resources, "deloro")).toEqual([
      { title: "ParentVUE", href: "https://example.com/vue" },
      { title: "Lunch", href: "/deloro/app/resources" },
    ]);
    expect(resources).toHaveLength(3);
  });

  it("uses a named soft-guidance threshold", () => {
    expect(QUICK_LINK_GUIDANCE_THRESHOLD).toBe(8);
  });
});
