import { describe, expect, it } from "vitest";
import {
  KIOSK_DESIGN_HEIGHT,
  KIOSK_DESIGN_WIDTH,
  calculateKioskViewportLayout,
} from "./kioskViewport";

describe("calculateKioskViewportLayout", () => {
  it.each([
    [1920, 1080, 1],
    [1280, 720, 2 / 3],
    [1600, 900, 5 / 6],
    [3840, 1080, 1],
    [1080, 1920, 1080 / 1920],
  ])("fits %sx%s with one uniform scale", (width, height, expectedScale) => {
    const layout = calculateKioskViewportLayout(width, height);
    expect(layout.scale).toBeCloseTo(expectedScale);
    expect(layout.scaledWidth).toBeCloseTo(KIOSK_DESIGN_WIDTH * expectedScale);
    expect(layout.scaledHeight).toBeCloseTo(KIOSK_DESIGN_HEIGHT * expectedScale);
    expect(layout.left).toBeGreaterThanOrEqual(0);
    expect(layout.top).toBeGreaterThanOrEqual(0);
  });

  it("recalculates from changed CSS viewport dimensions such as resize or zoom", () => {
    const before = calculateKioskViewportLayout(1920, 900);
    const after = calculateKioskViewportLayout(1280, 600);
    expect(after.scale).toBeLessThan(before.scale);
    expect(after.scaledWidth / after.scaledHeight).toBeCloseTo(16 / 9);
  });
});
