import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArtifactRegistryService } from "../ArtifactRegistry/ArtifactRegistryService";
import { ADVANCED_IMPORT_RENDERER, DocumentRendererService, type RenderDiagnosticEvent } from "../DocumentRenderer/DocumentRendererService";
import { PipelineStateService } from "../PipelineState/PipelineStateService";
import { DiagnosticsService } from "../../diagnostics/DiagnosticsService";
import { SupabaseImportArtifactStorage } from "../../storage/SupabaseImportArtifactStorage";
import { renderedPageMetadataPath, renderedPagePath, sourceMetadataPath, sourcePdfPath } from "../../workspace/paths";
import { ImportSessionService } from "./ImportSessionService";
import { advancedImportLogger } from "../../logging/logger";
import { serializeErrorDetails } from "../../diagnostics/errorDetails";

const jsonBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value, null, 2));

function renderingRuntimeEnvironment() {
  return {
    nodeVersion: process.version,
    nodeVersions: { node: process.versions.node, modules: process.versions.modules, napi: process.versions.napi, uv: process.versions.uv },
    platform: process.platform,
    architecture: process.arch,
    runtime: "nodejs",
    deploymentProvider: process.env.VERCEL ? "vercel" : process.env.AWS_LAMBDA_FUNCTION_NAME ? "aws-lambda" : process.env.FUNCTIONS_WORKER_RUNTIME ? "azure-functions" : "unknown-or-local",
    vercelRegion: process.env.VERCEL_REGION || null,
    awsRegion: process.env.AWS_REGION || null,
    memoryUsageBytes: process.memoryUsage(),
    rendererPackage: "pdf-parse",
    canvasPackage: "@napi-rs/canvas",
    spawnedCommand: null,
    exitCode: null,
  };
}

export async function prepareImportSession(input: { db: SupabaseClient; schoolId: string; userId: string; upload: File }) {
  const { db, schoolId, userId, upload } = input;
  const session = await new ImportSessionService(db).create(schoolId, userId);
  const storage = new SupabaseImportArtifactStorage(db);
  const registry = new ArtifactRegistryService(db, storage);
  const pipeline = new PipelineStateService(db);
  const diagnostics = new DiagnosticsService(db);
  const uploadStartedAt = performance.now();
  const pdf = new Uint8Array(await upload.arrayBuffer());
  const runtimeEnvironment = renderingRuntimeEnvironment();
  const renderFailure: { current: RenderDiagnosticEvent | null } = { current: null };

  try {
    await registry.register({ sessionId: session.id, type: "pdf", path: sourcePdfPath(), data: pdf, contentType: "application/pdf", metadata: { originalFileName: upload.name, immutable: true } });
    await registry.register({ sessionId: session.id, type: "source_metadata", path: sourceMetadataPath(), data: jsonBytes({ originalFileName: upload.name, size: upload.size, contentType: upload.type, uploadedAt: new Date().toISOString() }), contentType: "application/json" });
    await diagnostics.record(session.id, "upload", "file_size_bytes", upload.size);
    await diagnostics.record(session.id, "timing", "upload_duration_ms", Math.round(performance.now() - uploadStartedAt));
    await pipeline.transition(session.id, "uploaded", "rendering_pages");

    const renderStartedAt = performance.now();
    const pages = await new DocumentRendererService().render(pdf, async (event) => {
      if (event.phase === "error" && !renderFailure.current) renderFailure.current = event;
      const diagnostic = {
        sessionId: session.id,
        currentStage: "rendering_pages",
        rendererImplementation: ADVANCED_IMPORT_RENDERER,
        pageNumber: event.pageNumber,
        elapsedMs: event.elapsedMs,
        stepElapsedMs: event.stepElapsedMs ?? null,
        step: event.step,
        phase: event.phase,
        runtimeEnvironment,
        rendererDetails: { spawnedCommand: null, exitCode: null, ...(event.details || {}) },
        ...(event.error ? { exception: serializeErrorDetails(event.error) } : {}),
      };
      const message = `Renderer ${event.step} ${event.phase}`;
      if (event.phase === "error") advancedImportLogger.error(message, diagnostic);
      else advancedImportLogger.info(message, diagnostic);
      await diagnostics.record(session.id, "rendering_pipeline", `${event.step}_${event.phase}`, diagnostic).catch((diagnosticError) => {
        advancedImportLogger.warn("Rendering diagnostic persistence failed", { sessionId: session.id, currentStage: "rendering_pages", rendererImplementation: ADVANCED_IMPORT_RENDERER, pageNumber: event.pageNumber, elapsedMs: event.elapsedMs, runtimeEnvironment, exception: serializeErrorDetails(diagnosticError) });
      });
    });
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
    const exception = serializeErrorDetails(error);
    const failure = {
      sessionId: session.id,
      currentStage: "rendering_pages",
      failingStep: renderFailure.current?.step || "workspace_post_render",
      pageNumber: renderFailure.current?.pageNumber ?? null,
      elapsedMs: renderFailure.current?.elapsedMs ?? Math.round(performance.now() - uploadStartedAt),
      rendererImplementation: ADVANCED_IMPORT_RENDERER,
      runtimeEnvironment,
      exception,
    };
    advancedImportLogger.error("Rendering pipeline failed", failure);
    await diagnostics.record(session.id, "rendering_failure", "exception", failure).catch((diagnosticError) => {
      advancedImportLogger.error("Rendering failure diagnostic persistence failed", { ...failure, persistenceException: serializeErrorDetails(diagnosticError) });
    });
    await pipeline.transition(session.id, "rendering_pages", "failed").catch(() => pipeline.transition(session.id, "uploaded", "failed").catch(() => undefined));
    throw Object.assign(error instanceof Error ? error : new Error("Import workspace preparation failed"), { importSessionId: session.id, importDiagnostic: failure });
  }
}
