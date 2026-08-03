import { describe, expect, it, vi } from "vitest";
import { PDFDocument } from "pdf-lib";
import { ImportSessionService } from "../services/ImportSessionService/ImportSessionService";
import { ArtifactRegistryService } from "../services/ArtifactRegistry/ArtifactRegistryService";
import { PipelineStateService } from "../services/PipelineState/PipelineStateService";
import { DocumentRendererService } from "../services/DocumentRenderer/DocumentRendererService";
import type { ImportArtifactStorage } from "../storage/ImportArtifactStorage";

describe("Advanced Import Session foundation", () => {
  it("creates an immutable session identity at the uploaded stage", async () => {
    const row = { id: "session-1", school_id: "school-1", user_id: "user-1", workflow_version: "2", pipeline_version: "beta-parity-with-workspace-v2", status: "active", current_stage: "uploaded", created_at: "now", started_at: "now", completed_at: null };
    const single = vi.fn().mockResolvedValue({ data: row, error: null });
    const db = { from: vi.fn(() => ({ insert: vi.fn(() => ({ select: vi.fn(() => ({ single })) })) })) };
    const session = await new ImportSessionService(db as never).create("school-1", "user-1");
    expect(session).toMatchObject({ id: "session-1", schoolId: "school-1", userId: "user-1", currentStage: "uploaded" });
  });

  it("stores and registers artifacts with a SHA-256 checksum", async () => {
    const storage: ImportArtifactStorage = { saveArtifact: vi.fn(), loadArtifact: vi.fn(), deleteArtifact: vi.fn(), listArtifacts: vi.fn(), createSignedUrl: vi.fn() };
    const row = { id: "artifact-1", session_id: "session-1", type: "pdf", path: "source/calendar.pdf", page_number: null, content_type: "application/pdf", size_bytes: 3, checksum_sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", metadata: {}, created_at: "now" };
    const db = { from: vi.fn(() => ({ insert: vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: row, error: null }) })) })) })) };
    const artifact = await new ArtifactRegistryService(db as never, storage).register({ sessionId: "session-1", type: "pdf", path: row.path, data: new TextEncoder().encode("abc"), contentType: row.content_type });
    expect(storage.saveArtifact).toHaveBeenCalledOnce();
    expect(artifact.checksumSha256).toBe(row.checksum_sha256);
  });

  it("enforces sequential pipeline transitions", async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { id: "session-1" }, error: null });
    const db = { from: vi.fn(() => ({ update: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ select: vi.fn(() => ({ maybeSingle })) })) })) })) })) };
    const service = new PipelineStateService(db as never);
    await expect(service.transition("session-1", "uploaded", "rendering_pages")).resolves.toBeUndefined();
    await expect(service.transition("session-1", "uploaded", "render_complete")).rejects.toThrow("Invalid import pipeline transition");
  });

  it("renders every PDF page as a 300 DPI PNG with metadata", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([144, 144]);
    pdf.addPage([144, 144]);
    const pages = await new DocumentRendererService().render(await pdf.save());
    expect(pages).toHaveLength(2);
    expect(pages[0].metadata).toMatchObject({ page: 1, width: 600, height: 600, dpi: 300, rotation: 0 });
    expect(Array.from(pages[0].png.slice(1, 4))).toEqual([80, 78, 71]);
  }, 20_000);
});
