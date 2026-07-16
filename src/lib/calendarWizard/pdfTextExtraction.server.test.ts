import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

function pdfFile() {
  return new File(["%PDF-1.7\n1 0 obj\n<< /Type /Page >>\nendobj"], "calendar.pdf", {
    type: "application/pdf",
  });
}

describe("calendar PDF text extraction", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("loads CanvasFactory before PDFParse and destroys the parser after success", async () => {
    const importOrder: string[] = [];
    const destroy = vi.fn().mockResolvedValue(undefined);
    let parserOptions: unknown;

    class CanvasFactory {}
    class PDFParse {
      constructor(options: unknown) {
        parserOptions = options;
      }

      async getInfo() {
        return { total: 1 };
      }

      async getText() {
        return {
          total: 1,
          pages: [{ text: "August 12 Instruction Begins Brown Day" }],
        };
      }

      destroy = destroy;
    }

    vi.doMock("pdf-parse/worker", () => {
      importOrder.push("worker");
      return { CanvasFactory };
    });
    vi.doMock("pdf-parse", () => {
      importOrder.push("pdf-parse");
      return { PDFParse };
    });

    const { extractCalendarPdfText } = await import("./pdfTextExtraction.server");
    const result = await extractCalendarPdfText(pdfFile());

    expect(importOrder).toEqual(["worker", "pdf-parse"]);
    expect(parserOptions).toMatchObject({ CanvasFactory });
    expect(result.text).toContain("Brown Day");
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("keeps parser initialization errors inside the extraction call", async () => {
    vi.doMock("pdf-parse/worker", () => {
      throw new Error("canvas unavailable");
    });
    vi.doMock("pdf-parse", () => {
      throw new Error("PDFParse should not load after worker failure");
    });

    const { extractCalendarPdfText } = await import("./pdfTextExtraction.server");

    await expect(extractCalendarPdfText(pdfFile())).rejects.toThrow();
  });

  it("destroys the parser after extraction failure", async () => {
    const destroy = vi.fn().mockResolvedValue(undefined);

    class CanvasFactory {}
    class PDFParse {
      async getInfo() {
        return { total: 1 };
      }

      async getText() {
        throw new Error("parser failed");
      }

      destroy = destroy;
    }

    vi.doMock("pdf-parse/worker", () => ({ CanvasFactory }));
    vi.doMock("pdf-parse", () => ({ PDFParse }));

    const { extractCalendarPdfText } = await import("./pdfTextExtraction.server");

    await expect(extractCalendarPdfText(pdfFile())).rejects.toThrow("parser failed");
    expect(destroy).toHaveBeenCalledOnce();
  });
});
