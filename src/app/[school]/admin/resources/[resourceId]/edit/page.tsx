import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAdminSectionAccess } from "@/lib/auth/adminPermissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ResourceFileUpload from "@/components/admin/ResourceFileUpload";

export default async function EditResourcePage({
  params,
  searchParams,
}: {
  params: Promise<{ school: string; resourceId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { school, resourceId } = await params;
  const { error: errorParam } = await searchParams;
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
      redirect(`/${school}/admin/resources/${resourceId}/edit?error=1`);
    }

    redirect(`/${school}/admin/resources`);
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 dark:bg-black dark:text-white">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="mb-8 text-3xl font-bold">Edit Resource</h1>

        {errorParam && (
          <p className="mb-6 inline-block rounded-full bg-red-500/15 px-4 py-2 text-sm font-semibold text-red-700 ring-1 ring-red-500/30 dark:text-red-300">
            Something went wrong saving this resource. Please try again.
          </p>
        )}

        <form
          action={updateResource}
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]"
        >
          <div className="space-y-5">
            <input
              name="title"
              defaultValue={resource.title}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-[var(--school-primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--school-primary)_20%,transparent)] dark:border-[#3a3a3a] dark:bg-[#242424] dark:text-white"
            />

            <textarea
              name="description"
              defaultValue={resource.description}
              rows={4}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-[var(--school-primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--school-primary)_20%,transparent)] dark:border-[#3a3a3a] dark:bg-[#242424] dark:text-white"
            />

            <input
              name="url"
              defaultValue={resource.url || ""}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-[var(--school-primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--school-primary)_20%,transparent)] dark:border-[#3a3a3a] dark:bg-[#242424] dark:text-white"
            />

            <ResourceFileUpload initialFileUrl={resource.file_url || ""} />

            <input
              name="category"
              defaultValue={resource.category || ""}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-[var(--school-primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--school-primary)_20%,transparent)] dark:border-[#3a3a3a] dark:bg-[#242424] dark:text-white"
            />

            <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-[#3a3a3a] dark:bg-black/30">
              <input
                type="checkbox"
                name="is_active"
                defaultChecked={resource.is_active}
                className="h-4 w-4 rounded border-slate-300 dark:border-slate-600"
              />
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Active
              </span>
            </label>
          </div>

          <div className="mt-8 flex items-center justify-between border-t border-slate-200 pt-5 dark:border-[#3a3a3a]">
            <Link
              href={`/${school}/admin/resources`}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-white/10"
            >
              Cancel
            </Link>

            <button
              type="submit"
              className="cursor-pointer rounded-lg bg-[var(--school-primary)] px-5 py-2 text-sm font-semibold text-[var(--school-primary-text)] transition hover:opacity-90"
            >
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
