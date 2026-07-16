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

  it("rejects malformed PDFs through actual pdf.js without requiring browser globals", async () => {
    const { extractCalendarPdfText } = await import("./pdfTextExtraction.server");
    await expect(extractCalendarPdfText(pdfFile())).rejects.toThrow();
  });

  it("extracts text from a real small PDF fixture without browser globals", async () => {
    const { extractCalendarPdfText } = await import("./pdfTextExtraction.server");

    await expect(extractCalendarPdfText(realTextPdfFile())).resolves.toMatchObject({
      pageCount: 1,
      extractedLineCount: expect.any(Number),
    });
  });
});
