import { isAdvancedAiImportEnabled } from "@/features/advanced-ai-import/constants/featureFlag";
import { SupabaseImportArtifactStorage } from "@/features/advanced-ai-import/storage/SupabaseImportArtifactStorage";
import { sourcePdfPath } from "@/features/advanced-ai-import/workspace/paths";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/serviceRole";

export async function GET(_request: Request, { params }: { params: Promise<{ school: string; sessionId: string }> }) {
  if (!isAdvancedAiImportEnabled() || process.env.ADVANCED_AI_IMPORT_DEBUG !== "true") return Response.json({ error: "Not found" }, { status: 404 });
  const { school, sessionId } = await params;
  const auth = await createSupabaseServerClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const db = createSupabaseServiceRoleClient();
  const { data: profile } = await db.from("users").select("role,is_active").eq("id", user.id).maybeSingle();
  if (!profile?.is_active || String(profile.role).replaceAll("_", "").toLowerCase() !== "superadmin") return Response.json({ error: "Forbidden" }, { status: 403 });
  const { data: session } = await db.from("advanced_import_sessions").select("*,schools!inner(subdomain)").eq("id", sessionId).eq("schools.subdomain", school).maybeSingle();
  if (!session) return Response.json({ error: "Not found" }, { status: 404 });
  const [{ data: artifacts }, { data: pages }, { data: diagnostics }] = await Promise.all([
    db.from("advanced_import_artifacts").select("*").eq("session_id", sessionId).order("created_at"),
    db.from("advanced_import_page_metadata").select("*").eq("session_id", sessionId).order("page_number"),
    db.from("advanced_import_diagnostics").select("*").eq("session_id", sessionId).order("created_at"),
  ]);
  const storage = new SupabaseImportArtifactStorage(db);
  const pageArtifacts = new Map((artifacts || []).filter((artifact) => artifact.type === "rendered_page").map((artifact) => [artifact.page_number, artifact.path]));
  const pageRows = await Promise.all((pages || []).map(async (page) => ({ ...page, signedUrl: pageArtifacts.get(page.page_number) ? await storage.createSignedUrl(sessionId, pageArtifacts.get(page.page_number)!) : undefined })));
  const sourcePdfUrl = (artifacts || []).some((artifact) => artifact.path === sourcePdfPath()) ? await storage.createSignedUrl(sessionId, sourcePdfPath()) : null;
  return Response.json({ session, sourcePdfUrl, pages: pageRows, artifacts: artifacts || [], diagnostics: diagnostics || [] });
}
