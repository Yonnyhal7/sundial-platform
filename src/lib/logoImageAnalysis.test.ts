import { describe, expect, it } from "vitest";
import { analyzeLogoPixels } from "@/lib/logoImageAnalysis";

function createPixels(width: number, height: number, color: [number, number, number, number]) {
  const data = new Uint8ClampedArray(width * height * 4);

  for (let index = 0; index < data.length; index += 4) {
    data[index] = color[0];
    data[index + 1] = color[1];
    data[index + 2] = color[2];
    data[index + 3] = color[3];
  }

  return data;
}

function fillRect(
  data: Uint8ClampedArray,
  width: number,
  left: number,
  top: number,
  right: number,
  bottom: number,
  color: [number, number, number, number]
) {
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const offset = (y * width + x) * 4;

      data[offset] = color[0];
      data[offset + 1] = color[1];
      data[offset + 2] = color[2];
      data[offset + 3] = color[3];
    }
  }
}

describe("logo image analysis", () => {
  it("detects alpha transparency in transparent PNG-style pixels", () => {
    const data = createPixels(20, 20, [255, 255, 255, 0]);

    fillRect(data, 20, 5, 5, 14, 14, [20, 20, 20, 255]);

    expect(analyzeLogoPixels({ width: 20, height: 20, data })).toMatchObject({
      hasAlphaTransparency: true,
      hasSolidEdgeBackground: false,
    });
  });

  it("warns for JPEG-style solid edge backgrounds", () => {
    const data = createPixels(40, 40, [255, 255, 255, 255]);

    fillRect(data, 40, 14, 14, 25, 25, [20, 20, 20, 255]);

    expect(analyzeLogoPixels({ width: 40, height: 40, data })).toMatchObject({
      hasAlphaTransparency: false,
      hasSolidEdgeBackground: true,
    });
  });

  it("detects excessive empty padding and keeps a margin around artwork", () => {
    const data = createPixels(100, 100, [255, 255, 255, 255]);

    fillRect(data, 100, 45, 45, 54, 54, [0, 0, 0, 255]);

    const analysis = analyzeLogoPixels({ width: 100, height: 100, data });

    expect(analysis.hasExcessPadding).toBe(true);
    expect(analysis.artworkBounds).toEqual({
      left: 45,
      top: 45,
      right: 54,
      bottom: 54,
    });
    expect(analysis.trimBounds?.left).toBeLessThanOrEqual(45);
    expect(analysis.trimBounds?.top).toBeLessThanOrEqual(45);
    expect(analysis.trimBounds?.right).toBeGreaterThanOrEqual(54);
    expect(analysis.trimBounds?.bottom).toBeGreaterThanOrEqual(54);
  });
});
