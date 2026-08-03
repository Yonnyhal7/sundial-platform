import { describe, expect, it } from "vitest";
import {
  initialEmailDeliverySelection,
  isEmailDeliverySelectionDirty,
  reconcileEmailDeliverySelection,
  selectEmailDeliveryProvider,
} from "./emailDeliverySelection";

describe("Email Delivery provider selection", () => {
  it.each(["resend", "google_workspace"] as const)(
    "initially selects the persisted %s provider",
    (active) => {
      expect(initialEmailDeliverySelection(active)).toEqual({ active, selected: active });
    }
  );

  it.each([
    ["resend", "google_workspace"],
    ["google_workspace", "resend"],
  ] as const)("keeps %s → %s selected after a successful save", (initial, saved) => {
    const attempted = selectEmailDeliveryProvider(initialEmailDeliverySelection(initial), saved);
    const revalidated = reconcileEmailDeliverySelection(attempted, saved);
    expect(revalidated).toEqual({ active: saved, selected: saved });
    expect(isEmailDeliverySelectionDirty(revalidated)).toBe(false);
  });

  it("preserves the attempted selection when a save fails", () => {
    const attempted = selectEmailDeliveryProvider(
      initialEmailDeliverySelection("resend"),
      "google_workspace"
    );
    expect(reconcileEmailDeliverySelection(attempted, "resend")).toBe(attempted);
    expect(isEmailDeliverySelectionDirty(attempted)).toBe(true);
  });

  it("keeps summary and radio selection aligned after success and reload", () => {
    const saved = reconcileEmailDeliverySelection(
      selectEmailDeliveryProvider(initialEmailDeliverySelection("resend"), "google_workspace"),
      "google_workspace"
    );
    const reloaded = initialEmailDeliverySelection(saved.active);
    expect(saved.selected).toBe(saved.active);
    expect(reloaded).toEqual(saved);
  });
});
