import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAdminSectionAccess } from "@/lib/auth/adminPermissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ResourceFileUpload from "@/components/admin/ResourceFileUpload";
import { isTenantScopedStorageObject, storageObjectFromPublicUrl } from "@/lib/schoolLifecycle";

export default async function NewResourcePage({
  params,
  searchParams,
}: {
  params: Promise<{ school: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { school } = await params;
  const { error: errorParam } = await searchParams;
  const supabase = await createSupabaseServerClient();

  const { data: schoolData } = await supabase
    .rpc("get_available_school_by_subdomain", {
      subdomain_input: school,
    })
    .single<{ id: string; name: string }>();

  if (!schoolData) {
    notFound();
  }

  const schoolId = schoolData.id;
  await requireAdminSectionAccess(schoolId, "resources", school);

  async function createResource(formData: FormData) {
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
    const storageObject = storageObjectFromPublicUrl(fileUrl);
    if (fileUrl && (!storageObject || !isTenantScopedStorageObject(storageObject, schoolId))) {
      throw new Error("The uploaded file does not belong to this school.");
    }
    const category = String(formData.get("category") || "");
    const isActive = formData.get("is_active") === "on";

    const { error } = await supabase.from("resources").insert({
      school_id: schoolId,
      title,
      description,
      url: url || null,
      file_url: fileUrl || null,
      category: category || null,
      is_active: isActive,
    });

    if (error) {
      console.error("Create resource error:", JSON.stringify(error, null, 2));
      redirect(`/${school}/admin/resources/new?error=1`);
    }

    redirect(`/${school}/admin/resources`);
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 dark:bg-black dark:text-white">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="mb-8">
          <p className="text-sm text-slate-500 dark:text-slate-400">{schoolData.name} Admin</p>
          <h1 className="mt-1 text-3xl font-bold">New Resource</h1>
        </div>

        {errorParam && (
          <p className="mb-6 inline-block rounded-full bg-red-500/15 px-4 py-2 text-sm font-semibold text-red-700 ring-1 ring-red-500/30 dark:text-red-300">
            Something went wrong saving this resource. Please try again.
          </p>
        )}

        <form
          action={createResource}
          className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]"
        >
          <div className="space-y-5">
            <input
              name="title"
              required
              placeholder="Resource title"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-[var(--school-primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--school-primary)_20%,transparent)] dark:border-[#3a3a3a] dark:bg-[#242424] dark:text-white"
            />

            <textarea
              name="description"
              rows={4}
              placeholder="Description"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-[var(--school-primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--school-primary)_20%,transparent)] dark:border-[#3a3a3a] dark:bg-[#242424] dark:text-white"
            />

            <input
              name="url"
              placeholder="External URL (optional)"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-[var(--school-primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--school-primary)_20%,transparent)] dark:border-[#3a3a3a] dark:bg-[#242424] dark:text-white"
            />

            <ResourceFileUpload schoolId={schoolId} />

            <input
              name="category"
              placeholder="Category (Example: Counseling)"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-[var(--school-primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--school-primary)_20%,transparent)] dark:border-[#3a3a3a] dark:bg-[#242424] dark:text-white"
            />

            <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-[#3a3a3a] dark:bg-black/30">
              <input
                type="checkbox"
                name="is_active"
                defaultChecked
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
              Create Resource
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
