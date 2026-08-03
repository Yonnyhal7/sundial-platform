import type { SupabaseClient } from "@supabase/supabase-js";
import { IMPORT_PIPELINE_STAGES, type ImportPipelineStage } from "../../types/importSession";

export class PipelineStateService {
  constructor(private readonly db: SupabaseClient) {}
  async transition(sessionId: string, from: ImportPipelineStage, to: ImportPipelineStage) {
    const fromIndex = IMPORT_PIPELINE_STAGES.indexOf(from);
    const toIndex = IMPORT_PIPELINE_STAGES.indexOf(to);
    if (to !== "failed" && toIndex !== fromIndex + 1) throw new Error(`Invalid import pipeline transition: ${from} -> ${to}`);
    const terminal = to === "completed" || to === "failed";
    const { data, error } = await this.db.from("advanced_import_sessions").update({
      current_stage: to, status: to === "failed" ? "failed" : to === "completed" ? "completed" : "active",
      completed_at: terminal ? new Date().toISOString() : null, updated_at: new Date().toISOString(),
    }).eq("id", sessionId).eq("current_stage", from).select("id").maybeSingle();
    if (error) throw error;
    if (!data) throw new Error(`Import session ${sessionId} changed concurrently`);
  }
}
