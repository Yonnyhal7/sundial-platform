import type { RenderedPageMetadata } from "../../types/importSession";

export const ADVANCED_IMPORT_RENDER_DPI = 300;
export const ADVANCED_IMPORT_RENDERER = "pdf-parse/PDFParse.getScreenshot + @napi-rs/canvas";

export type RenderDiagnosticEvent = {
  step: "renderer_import" | "renderer_initialize" | "document_info" | "page_render" | "renderer_cleanup";
  phase: "before" | "after" | "error";
  pageNumber: number | null;
  elapsedMs: number;
  stepElapsedMs?: number;
  details?: Record<string, unknown>;
  error?: unknown;
};

type RenderObserver = (event: RenderDiagnosticEvent) => void | Promise<void>;

export class DocumentRendererService {
  async render(pdf: Uint8Array, observe: RenderObserver = () => undefined): Promise<Array<{ png: Uint8Array; metadata: RenderedPageMetadata }>> {
    const renderStartedAt = performance.now();
    const emit = (event: Omit<RenderDiagnosticEvent, "elapsedMs">) => observe({ ...event, elapsedMs: Math.round(performance.now() - renderStartedAt) });
    let stepStartedAt = performance.now();
    await emit({ step: "renderer_import", phase: "before", pageNumber: null, details: { pdfBytes: pdf.byteLength } });
    let PDFParse: typeof import("pdf-parse")["PDFParse"];
    try {
      ({ PDFParse } = await import("pdf-parse"));
      await emit({ step: "renderer_import", phase: "after", pageNumber: null, stepElapsedMs: Math.round(performance.now() - stepStartedAt) });
    } catch (error) {
      await emit({ step: "renderer_import", phase: "error", pageNumber: null, stepElapsedMs: Math.round(performance.now() - stepStartedAt), error });
      throw error;
    }
    stepStartedAt = performance.now();
    await emit({ step: "renderer_initialize", phase: "before", pageNumber: null });
    let parser: InstanceType<typeof PDFParse>;
    try {
      parser = new PDFParse({ data: pdf });
      await emit({ step: "renderer_initialize", phase: "after", pageNumber: null, stepElapsedMs: Math.round(performance.now() - stepStartedAt) });
    } catch (error) {
      await emit({ step: "renderer_initialize", phase: "error", pageNumber: null, stepElapsedMs: Math.round(performance.now() - stepStartedAt), error });
      throw error;
    }
    try {
      stepStartedAt = performance.now();
      await emit({ step: "document_info", phase: "before", pageNumber: null });
      let total: number;
      try {
        ({ total } = await parser.getInfo());
        await emit({ step: "document_info", phase: "after", pageNumber: null, stepElapsedMs: Math.round(performance.now() - stepStartedAt), details: { pageCount: total } });
      } catch (error) {
        await emit({ step: "document_info", phase: "error", pageNumber: null, stepElapsedMs: Math.round(performance.now() - stepStartedAt), error });
        throw error;
      }
      const pages = [];
      for (let pageNumber = 1; pageNumber <= total; pageNumber += 1) {
        const startedAt = performance.now();
        await emit({ step: "page_render", phase: "before", pageNumber, details: { dpi: ADVANCED_IMPORT_RENDER_DPI, scale: ADVANCED_IMPORT_RENDER_DPI / 72 } });
        try {
          const result = await parser.getScreenshot({ partial: [pageNumber], scale: ADVANCED_IMPORT_RENDER_DPI / 72, imageBuffer: true, imageDataUrl: false });
          const page = result.pages[0];
          if (!page?.data.byteLength) throw new Error(`PDF page ${pageNumber} produced no PNG data`);
          const renderTimeMs = Math.round(performance.now() - startedAt);
          pages.push({ png: page.data, metadata: { page: page.pageNumber, width: Math.round(page.width), height: Math.round(page.height), dpi: ADVANCED_IMPORT_RENDER_DPI, rotation: 0, renderTimeMs } });
          await emit({ step: "page_render", phase: "after", pageNumber, stepElapsedMs: renderTimeMs, details: { width: Math.round(page.width), height: Math.round(page.height), pngBytes: page.data.byteLength } });
        } catch (error) {
          await emit({ step: "page_render", phase: "error", pageNumber, stepElapsedMs: Math.round(performance.now() - startedAt), error, details: { dpi: ADVANCED_IMPORT_RENDER_DPI, scale: ADVANCED_IMPORT_RENDER_DPI / 72 } });
          throw error;
        }
      }
      return pages;
    } finally {
      stepStartedAt = performance.now();
      await emit({ step: "renderer_cleanup", phase: "before", pageNumber: null });
      try {
        await parser.destroy();
        await emit({ step: "renderer_cleanup", phase: "after", pageNumber: null, stepElapsedMs: Math.round(performance.now() - stepStartedAt) });
      } catch (error) {
        await emit({ step: "renderer_cleanup", phase: "error", pageNumber: null, stepElapsedMs: Math.round(performance.now() - stepStartedAt), error });
        throw error;
      }
    }
  }
}
