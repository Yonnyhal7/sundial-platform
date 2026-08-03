import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArtifactRegistryService } from "../ArtifactRegistry/ArtifactRegistryService";
import { DocumentRendererService } from "../DocumentRenderer/DocumentRendererService";
import { PipelineStateService } from "../PipelineState/PipelineStateService";
import { DiagnosticsService } from "../../diagnostics/DiagnosticsService";
import { SupabaseImportArtifactStorage } from "../../storage/SupabaseImportArtifactStorage";
import { renderedPageMetadataPath, renderedPagePath, sourceMetadataPath, sourcePdfPath } from "../../workspace/paths";
import { ImportSessionService } from "./ImportSessionService";

const jsonBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value, null, 2));

export async function prepareImportSession(input: { db: SupabaseClient; schoolId: string; userId: string; upload: File }) {
  const { db, schoolId, userId, upload } = input;
  const session = await new ImportSessionService(db).create(schoolId, userId);
  const storage = new SupabaseImportArtifactStorage(db);
  const registry = new ArtifactRegistryService(db, storage);
  const pipeline = new PipelineStateService(db);
  const diagnostics = new DiagnosticsService(db);
  const uploadStartedAt = performance.now();
  const pdf = new Uint8Array(await upload.arrayBuffer());

  try {
    await registry.register({ sessionId: session.id, type: "pdf", path: sourcePdfPath(), data: pdf, contentType: "application/pdf", metadata: { originalFileName: upload.name, immutable: true } });
    await registry.register({ sessionId: session.id, type: "source_metadata", path: sourceMetadataPath(), data: jsonBytes({ originalFileName: upload.name, size: upload.size, contentType: upload.type, uploadedAt: new Date().toISOString() }), contentType: "application/json" });
    await diagnostics.record(session.id, "upload", "file_size_bytes", upload.size);
    await diagnostics.record(session.id, "timing", "upload_duration_ms", Math.round(performance.now() - uploadStartedAt));
    await pipeline.transition(session.id, "uploaded", "rendering_pages");

    const renderStartedAt = performance.now();
    const pages = await new DocumentRendererService().render(pdf);
    for (const page of pages) {
      const artifact = await registry.register({ sessionId: session.id, type: "rendered_page", path: renderedPagePath(page.metadata.page), data: page.png, contentType: "image/png", pageNumber: page.metadata.page, metadata: page.metadata });
      await registry.register({ sessionId: session.id, type: "page_metadata", path: renderedPageMetadataPath(page.metadata.page), data: jsonBytes(page.metadata), contentType: "application/json", pageNumber: page.metadata.page });
      const { error } = await db.from("advanced_import_page_metadata").insert({ session_id: session.id, page_number: page.metadata.page, width: page.metadata.width, height: page.metadata.height, dpi: page.metadata.dpi, rotation: page.metadata.rotation, render_time_ms: page.metadata.renderTimeMs, artifact_id: artifact.id });
      if (error) throw error;
    }
    await diagnostics.record(session.id, "document", "page_count", pages.length);
    await diagnostics.record(session.id, "timing", "render_duration_ms", Math.round(performance.now() - renderStartedAt));
    await diagnostics.record(session.id, "rendering", "skipped_pages", []);
    await diagnostics.record(session.id, "rendering", "warnings", []);
    await pipeline.transition(session.id, "rendering_pages", "render_complete");
    return session;
  } catch (error) {
    await diagnostics.record(session.id, "rendering", "error", { message: error instanceof Error ? error.message : "Unknown rendering error" }).catch(() => undefined);
    await pipeline.transition(session.id, "rendering_pages", "failed").catch(() => pipeline.transition(session.id, "uploaded", "failed").catch(() => undefined));
    throw Object.assign(error instanceof Error ? error : new Error("Import workspace preparation failed"), { importSessionId: session.id });
  }
}
