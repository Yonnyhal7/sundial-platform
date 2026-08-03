import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImportArtifactStorage } from "../../storage/ImportArtifactStorage";
import type { ImportArtifact } from "../../types/importSession";

export class ArtifactRegistryService {
  constructor(private readonly db: SupabaseClient, private readonly storage: ImportArtifactStorage) {}
  async register(input: { sessionId: string; type: string; path: string; data: Uint8Array; contentType: string; pageNumber?: number; metadata?: Record<string, unknown> }) {
    const checksum = createHash("sha256").update(input.data).digest("hex");
    await this.storage.saveArtifact(input);
    const { data, error } = await this.db.from("advanced_import_artifacts").insert({
      session_id: input.sessionId, type: input.type, path: input.path, page_number: input.pageNumber ?? null,
      content_type: input.contentType, size_bytes: input.data.byteLength, checksum_sha256: checksum, metadata: input.metadata || {},
    }).select("id,session_id,type,path,page_number,content_type,size_bytes,checksum_sha256,metadata,created_at").single();
    if (error) {
      await this.storage.deleteArtifact(input.sessionId, input.path).catch(() => undefined);
      throw error;
    }
    return mapArtifact(data);
  }
}

function mapArtifact(row: Record<string, unknown>): ImportArtifact {
  return { id: String(row.id), sessionId: String(row.session_id), type: String(row.type), path: String(row.path),
    pageNumber: row.page_number == null ? null : Number(row.page_number), contentType: String(row.content_type),
    sizeBytes: Number(row.size_bytes), checksumSha256: String(row.checksum_sha256),
    metadata: (row.metadata || {}) as Record<string, unknown>, createdAt: String(row.created_at) };
}
