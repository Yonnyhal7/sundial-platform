import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAdminSectionAccess } from "@/lib/auth/adminPermissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ResourceFileUpload from "./resource-file-upload";
export default async function EditResourcePage({
  params,
}: {
  params: Promise<{ school: string; resourceId: string }>;
}) {
  const { school, resourceId } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: schoolData } = await supabase
    .rpc("get_school_by_subdomain", {
      subdomain_input: school,
    })
    .single<{ id: string; name: string }>();

  if (!schoolData) {
    notFound();
  }

  const schoolId = schoolData.id;
  await requireAdminSectionAccess(schoolId, "resources", school);

  const { data: resource } = await supabase
    .from("resources")
    .select("*")
    .eq("id", resourceId)
    .eq("school_id", schoolId)
    .single();

  if (!resource) {
    notFound();
  }

  async function updateResource(formData: FormData) {
    "use server";

    const { supabase } = await requireAdminSectionAccess(
      schoolId,
      "resources",
      school
    );

    const title = String(formData.get("title") || "");
    const description = String(formData.get("description") || "");
    const url = String(formData.get("url") || "");
    const fileUrl = String(formData.get("file_url") || "");
    const category = String(formData.get("category") || "");
    const isActive = formData.get("is_active") === "on";

    const { error } = await supabase
      .from("resources")
      .update({
        title,
        description,
        url: url || null,
        file_url: fileUrl || null,
        category: category || null,
        is_active: isActive,
      })
      .eq("id", resourceId)
      .eq("school_id", schoolId);

    if (error) {
      console.error("Update resource error:", JSON.stringify(error, null, 2));
      return;
    }

    redirect(`/${school}/admin/resources`);
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 dark:bg-black dark:text-white">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="mb-8 text-3xl font-bold">Edit Resource</h1>

        <form
          action={updateResource}
          className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6"
        >
          <div className="space-y-5">
            <input
              name="title"
              defaultValue={resource.title}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
            />

            <textarea
              name="description"
              defaultValue={resource.description}
              rows={4}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
            />

            <input
              name="url"
              defaultValue={resource.url || ""}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
            />

            <ResourceFileUpload initialFileUrl={resource.file_url || ""} />

            <input
              name="category"
              defaultValue={resource.category || ""}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
            />

            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                name="is_active"
                defaultChecked={resource.is_active}
              />
              Active
            </label>
          </div>

          <div className="mt-6 flex justify-between">
            <Link href={`/${school}/admin/resources`}>
              Cancel
            </Link>

            <button
              type="submit"
              className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
