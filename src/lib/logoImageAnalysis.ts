export type PixelBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type LogoImageAnalysis = {
  width: number;
  height: number;
  hasAlphaTransparency: boolean;
  hasSolidEdgeBackground: boolean;
  hasExcessPadding: boolean;
  artworkBounds: PixelBounds | null;
  trimBounds: PixelBounds | null;
  paddingRatio: number;
  confidence: "high" | "medium" | "low";
};

type AnalyzePixelsInput = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
};

function pixelOffset(width: number, x: number, y: number) {
  return (y * width + x) * 4;
}

function colorDistance(
  data: Uint8ClampedArray,
  offset: number,
  color: [number, number, number]
) {
  return (
    Math.abs(data[offset] - color[0]) +
    Math.abs(data[offset + 1] - color[1]) +
    Math.abs(data[offset + 2] - color[2])
  );
}

function getMedian(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] || 0;
}

function getEdgeColor({ width, height, data }: AnalyzePixelsInput): [number, number, number] {
  const red: number[] = [];
  const green: number[] = [];
  const blue: number[] = [];
  const sampleEvery = Math.max(1, Math.floor(Math.min(width, height) / 80));

  function sample(x: number, y: number) {
    const offset = pixelOffset(width, x, y);

    red.push(data[offset]);
    green.push(data[offset + 1]);
    blue.push(data[offset + 2]);
  }

  for (let x = 0; x < width; x += sampleEvery) {
    sample(x, 0);
    sample(x, height - 1);
  }

  for (let y = 0; y < height; y += sampleEvery) {
    sample(0, y);
    sample(width - 1, y);
  }

  return [getMedian(red), getMedian(green), getMedian(blue)];
}

export function analyzeLogoPixels(input: AnalyzePixelsInput): LogoImageAnalysis {
  const { width, height, data } = input;
  const edgeColor = getEdgeColor(input);
  const transparentAlphaThreshold = 245;
  const edgeSimilarityThreshold = 24;
  const artworkDifferenceThreshold = 54;
  let transparentPixels = 0;
  let edgePixels = 0;
  let edgeMatches = 0;
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = pixelOffset(width, x, y);
      const alpha = data[offset + 3];
      const isTransparent = alpha < transparentAlphaThreshold;
      const isEdge = x === 0 || y === 0 || x === width - 1 || y === height - 1;

      if (isTransparent) {
        transparentPixels += 1;
      }

      if (isEdge) {
        edgePixels += 1;

        if (isTransparent || colorDistance(data, offset, edgeColor) <= edgeSimilarityThreshold) {
          edgeMatches += 1;
        }
      }

      if (!isTransparent && colorDistance(data, offset, edgeColor) > artworkDifferenceThreshold) {
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);
      }
    }
  }

  const hasArtworkBounds = right >= left && bottom >= top;
  const artworkBounds = hasArtworkBounds ? { left, top, right, bottom } : null;
  const totalPixels = width * height;
  const artworkArea = artworkBounds
    ? (artworkBounds.right - artworkBounds.left + 1) *
      (artworkBounds.bottom - artworkBounds.top + 1)
    : totalPixels;
  const paddingRatio = Math.max(0, 1 - artworkArea / totalPixels);
  const safeMargin = Math.max(6, Math.round(Math.min(width, height) * 0.04));
  const trimBounds =
    artworkBounds && paddingRatio > 0.36
      ? {
          left: Math.max(0, artworkBounds.left - safeMargin),
          top: Math.max(0, artworkBounds.top - safeMargin),
          right: Math.min(width - 1, artworkBounds.right + safeMargin),
          bottom: Math.min(height - 1, artworkBounds.bottom + safeMargin),
        }
      : null;
  const hasAlphaTransparency = transparentPixels / totalPixels > 0.01;
  const edgeSolidRatio = edgePixels > 0 ? edgeMatches / edgePixels : 0;
  const hasSolidEdgeBackground = !hasAlphaTransparency && edgeSolidRatio > 0.93;

  return {
    width,
    height,
    hasAlphaTransparency,
    hasSolidEdgeBackground,
    hasExcessPadding: Boolean(trimBounds),
    artworkBounds,
    trimBounds,
    paddingRatio,
    confidence: hasSolidEdgeBackground && paddingRatio > 0.55 ? "medium" : "high",
  };
}
