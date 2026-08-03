import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImportArtifactStorage, SaveArtifactInput } from "./ImportArtifactStorage";

const BUCKET = "advanced-import-artifacts";
const objectPath = (sessionId: string, path: string) => `${sessionId}/${path}`;

export class SupabaseImportArtifactStorage implements ImportArtifactStorage {
  constructor(private readonly db: SupabaseClient) {}
  async saveArtifact({ sessionId, path, data, contentType }: SaveArtifactInput) {
    const { error } = await this.db.storage.from(BUCKET).upload(objectPath(sessionId, path), data, { contentType, upsert: false });
    if (error) throw error;
  }
  async loadArtifact(sessionId: string, path: string) {
    const { data, error } = await this.db.storage.from(BUCKET).download(objectPath(sessionId, path));
    if (error) throw error;
    return new Uint8Array(await data.arrayBuffer());
  }
  async deleteArtifact(sessionId: string, path: string) {
    const { error } = await this.db.storage.from(BUCKET).remove([objectPath(sessionId, path)]);
    if (error) throw error;
  }
  async listArtifacts(sessionId: string, prefix = "") {
    const { data, error } = await this.db.storage.from(BUCKET).list(`${sessionId}/${prefix}`);
    if (error) throw error;
    return (data || []).map((item) => `${prefix}${prefix && !prefix.endsWith("/") ? "/" : ""}${item.name}`);
  }
  async createSignedUrl(sessionId: string, path: string, expiresInSeconds = 900) {
    const { data, error } = await this.db.storage.from(BUCKET).createSignedUrl(objectPath(sessionId, path), expiresInSeconds);
    if (error) throw error;
    return data.signedUrl;
  }
}
