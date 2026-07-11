export const MAX_CALENDAR_PDF_BYTES = 20 * 1024 * 1024;

export type PdfValidationResult =
  | { valid: true }
  | { valid: false; message: string };

export function validateCalendarPdfFileMetadata(file: File): PdfValidationResult {
  const fileName = file.name || "";
  const isPdf =
    file.type === "application/pdf" || fileName.toLowerCase().endsWith(".pdf");

  if (!isPdf || file.size === 0 || file.size > MAX_CALENDAR_PDF_BYTES) {
    return {
      valid: false,
      message: "Please upload a PDF calendar smaller than 20 MB.",
    };
  }

  return { valid: true };
}

export function hasPdfSignature(bytes: ArrayBuffer | Uint8Array) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return (
    view.length >= 5 &&
    view[0] === 0x25 &&
    view[1] === 0x50 &&
    view[2] === 0x44 &&
    view[3] === 0x46 &&
    view[4] === 0x2d
  );
}

export async function validateCalendarPdfFile(file: File): Promise<PdfValidationResult> {
  const metadata = validateCalendarPdfFileMetadata(file);
  if (!metadata.valid) return metadata;

  const header = await file.slice(0, 5).arrayBuffer();
  if (!hasPdfSignature(header)) {
    return {
      valid: false,
      message: "This file does not appear to be a valid PDF.",
    };
  }

  return { valid: true };
}
