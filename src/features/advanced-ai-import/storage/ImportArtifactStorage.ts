export type SaveArtifactInput = { sessionId: string; path: string; data: Uint8Array; contentType: string };

export interface ImportArtifactStorage {
  saveArtifact(input: SaveArtifactInput): Promise<void>;
  loadArtifact(sessionId: string, path: string): Promise<Uint8Array>;
  deleteArtifact(sessionId: string, path: string): Promise<void>;
  listArtifacts(sessionId: string, prefix?: string): Promise<string[]>;
  createSignedUrl(sessionId: string, path: string, expiresInSeconds?: number): Promise<string>;
}
