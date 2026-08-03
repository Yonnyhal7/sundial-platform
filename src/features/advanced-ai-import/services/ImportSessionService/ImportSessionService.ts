import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImportSession } from "../../types/importSession";

export const ADVANCED_IMPORT_WORKFLOW_VERSION = "2";
export const ADVANCED_IMPORT_PIPELINE_VERSION = "beta-parity-with-workspace-v2";

export class ImportSessionService {
  constructor(private readonly db: SupabaseClient) {}
  async create(schoolId: string, userId: string): Promise<ImportSession> {
    const { data, error } = await this.db.from("advanced_import_sessions").insert({
      school_id: schoolId, user_id: userId, workflow_version: ADVANCED_IMPORT_WORKFLOW_VERSION,
      pipeline_version: ADVANCED_IMPORT_PIPELINE_VERSION, status: "active", current_stage: "uploaded",
    }).select("*").single();
    if (error) throw error;
    return { id: data.id, schoolId: data.school_id, userId: data.user_id, workflowVersion: data.workflow_version,
      pipelineVersion: data.pipeline_version, status: data.status, currentStage: data.current_stage,
      createdAt: data.created_at, startedAt: data.started_at, completedAt: data.completed_at };
  }
}
