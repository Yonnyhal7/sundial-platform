export const IMPORT_PIPELINE_STAGES = ["uploaded", "rendering_pages", "render_complete", "classification", "extraction", "building", "verification", "validation", "review", "completed", "failed"] as const;
export type ImportPipelineStage = typeof IMPORT_PIPELINE_STAGES[number];
export type ImportSessionStatus = "active" | "completed" | "failed";

export type ImportSession = {
  id: string; schoolId: string; userId: string; workflowVersion: string;
  pipelineVersion: string; status: ImportSessionStatus; currentStage: ImportPipelineStage;
  createdAt: string; startedAt: string; completedAt: string | null;
};

export type ImportArtifact = {
  id: string; sessionId: string; type: string; path: string; pageNumber: number | null;
  contentType: string; sizeBytes: number; checksumSha256: string;
  metadata: Record<string, unknown>; createdAt: string;
};

export type RenderedPageMetadata = {
  page: number; width: number; height: number; dpi: number; rotation: number; renderTimeMs: number;
};
