import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

function pdfFile() {
  return new File(["%PDF-1.7\n1 0 obj\n<< /Type /Page >>\nendobj"], "calendar.pdf", {
    type: "application/pdf",
  });
}

function realTextPdfFile() {
  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 77 >>
stream
BT
/F1 18 Tf
50 90 Td
(August 12 Instruction Begins Brown Day) Tj
ET
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
0000000241 00000 n
0000000368 00000 n
trailer
<< /Size 6 /Root 1 0 R >>
startxref
438
%%EOF`;
  return new File([pdf], "tiny-calendar.pdf", { type: "application/pdf" });
}

describe("calendar PDF text extraction", () => {
  afterEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("loads the worker path before PDFParse and destroys the parser after success", async () => {
    const importOrder: string[] = [];
    const destroy = vi.fn().mockResolvedValue(undefined);
    let parserOptions: unknown;
    const setWorker = vi.fn();

    class PDFParse {
      static setWorker = setWorker;

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
      return { getPath: () => "/tmp/pdf.worker.mjs" };
    });
    vi.doMock("pdf-parse", () => {
      importOrder.push("pdf-parse");
      return { PDFParse };
    });

    const { extractCalendarPdfText } = await import("./pdfTextExtraction.server");
    const result = await extractCalendarPdfText(pdfFile());

    expect(importOrder).toEqual(["worker", "pdf-parse"]);
    expect(setWorker).toHaveBeenCalledWith("/tmp/pdf.worker.mjs");
    expect(parserOptions).toEqual({
      data: expect.any(Uint8Array),
    });
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

    const setWorker = vi.fn();
    class PDFParse {
      static setWorker = setWorker;

      async getInfo() {
        return { total: 1 };
      }

      async getText() {
        throw new Error("parser failed");
      }

      destroy = destroy;
    }

    vi.doMock("pdf-parse/worker", () => ({ getPath: () => "/tmp/pdf.worker.mjs" }));
    vi.doMock("pdf-parse", () => ({ PDFParse }));

    const { extractCalendarPdfText } = await import("./pdfTextExtraction.server");

    await expect(extractCalendarPdfText(pdfFile())).rejects.toThrow("parser failed");
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("extracts text from a real small PDF fixture without browser globals", async () => {
    vi.doUnmock("pdf-parse/worker");
    vi.doUnmock("pdf-parse");
    const { extractCalendarPdfText } = await import("./pdfTextExtraction.server");

    await expect(extractCalendarPdfText(realTextPdfFile())).resolves.toMatchObject({
      pageCount: 1,
      extractedLineCount: expect.any(Number),
    });
  });
});
