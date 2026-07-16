import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * A genuine (uncompressed) PDF with real content-stream fill/rectangle operators, rendered
 * through the actual pdfjs-dist parser rather than hand-built texts/rectangles arrays. This
 * guards the parts of extractPdfVectorCalendar that the pure matchVectorCalendarStructure
 * unit tests below can never exercise: reading pdf.js's real constructPath operator-list
 * shape and its real (version-dependent) fill-color argument encoding.
 */
function realVectorCalendarPdfFile() {
  const content = [
    "1 0 0 rg",
    "50 400 30 20 re f",
    "0.6 0.4 0.2 rg",
    "80 400 30 20 re f",
    "1 0.8 0 rg",
    "110 400 30 20 re f",
    "0.6 0.4 0.2 rg",
    "50 350 120 20 re f",
    "1 0.8 0 rg",
    "50 320 120 20 re f",
    "BT",
    "/F1 10 Tf",
    "10 470 Td",
    "(August 2026) Tj",
    "ET",
    "BT",
    "/F1 10 Tf",
    "60 405 Td",
    "(12) Tj",
    "ET",
    "BT",
    "/F1 10 Tf",
    "90 405 Td",
    "(13) Tj",
    "ET",
    "BT",
    "/F1 10 Tf",
    "120 405 Td",
    "(14) Tj",
    "ET",
    "BT",
    "/F1 10 Tf",
    "55 355 Td",
    "(Brown Day) Tj",
    "ET",
    "BT",
    "/F1 10 Tf",
    "60 325 Td",
    "(Gold Day) Tj",
    "ET",
  ].join("\n");

  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 400 500] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length ${content.length} >>
stream
${content}
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000280 00000 n
0000000550 00000 n
trailer
<< /Size 6 /Root 1 0 R >>
startxref
620
%%EOF`;

  return new File([pdf], "real-vector-calendar.pdf", { type: "application/pdf" });
}

describe("extractPdfVectorCalendar against a genuine PDF", () => {
  it("reads real pdf.js fill colors and path bounding boxes without crashing", async () => {
    const { extractPdfVectorCalendar } = await import("./pdfVectorCalendarExtraction.server");

    const result = await extractPdfVectorCalendar(realVectorCalendarPdfFile());

    expect(result.legend.map((entry) => entry.scheduleName).sort()).toEqual(["Brown Day", "Gold Day"]);
    expect(result.assignments.find((a) => a.date === "2026-08-13")?.scheduleName).toBe("Brown Day");
    expect(result.assignments.find((a) => a.date === "2026-08-14")?.scheduleName).toBe("Gold Day");
    for (const rect of [...result.legend]) {
      expect(rect.color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("polyfills DOMMatrix/Path2D/ImageData when they are unavailable (no native canvas package)", async () => {
    // Node has none of these globals natively, and pdfjs-dist's Node build only gets them
    // from the optional "@napi-rs/canvas" native package. In a deployment where that
    // package's platform binary isn't bundled (e.g. a serverless function built for a
    // different OS/arch than it was installed on), these stay undefined and pdfjs-dist's
    // own top-level `new DOMMatrix()` throws a ReferenceError on import. This test proves
    // our polyfill covers that case directly, independent of whether the native package
    // actually works in whatever environment the test happens to run in.
    const { ensurePdfjsNodeCanvasPolyfills } = await import("./pdfVectorCalendarExtraction.server");
    const g = globalThis as unknown as Record<"DOMMatrix" | "Path2D" | "ImageData", unknown>;
    const originals = { DOMMatrix: g.DOMMatrix, Path2D: g.Path2D, ImageData: g.ImageData };
    delete g.DOMMatrix;
    delete g.Path2D;
    delete g.ImageData;

    try {
      ensurePdfjsNodeCanvasPolyfills();
      expect(() => new (g.DOMMatrix as new () => unknown)()).not.toThrow();
      expect(() => new (g.Path2D as new () => unknown)()).not.toThrow();
      expect(() => new (g.ImageData as new () => unknown)()).not.toThrow();
    } finally {
      g.DOMMatrix = originals.DOMMatrix;
      g.Path2D = originals.Path2D;
      g.ImageData = originals.ImageData;
    }
  });
});
