import type { RenderedPageMetadata } from "../../types/importSession";

export const ADVANCED_IMPORT_RENDER_DPI = 300;

export class DocumentRendererService {
  async render(pdf: Uint8Array): Promise<Array<{ png: Uint8Array; metadata: RenderedPageMetadata }>> {
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: pdf });
    try {
      const { total } = await parser.getInfo();
      const pages = [];
      for (let pageNumber = 1; pageNumber <= total; pageNumber += 1) {
        const startedAt = performance.now();
        const result = await parser.getScreenshot({ partial: [pageNumber], scale: ADVANCED_IMPORT_RENDER_DPI / 72, imageBuffer: true, imageDataUrl: false });
        const page = result.pages[0];
        if (!page?.data.byteLength) throw new Error(`PDF page ${pageNumber} produced no PNG data`);
        pages.push({ png: page.data, metadata: { page: page.pageNumber, width: Math.round(page.width), height: Math.round(page.height), dpi: ADVANCED_IMPORT_RENDER_DPI, rotation: 0, renderTimeMs: Math.round(performance.now() - startedAt) } });
      }
      return pages;
    } finally {
      await parser.destroy();
    }
  }
}
