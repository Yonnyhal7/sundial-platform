import type { SupabaseClient } from "@supabase/supabase-js";

export class DiagnosticsService {
  constructor(private readonly db: SupabaseClient) {}
  async record(sessionId: string, category: string, name: string, value: unknown) {
    const { error } = await this.db.from("advanced_import_diagnostics").insert({ session_id: sessionId, category, name, value });
    if (error) throw error;
  }
}
