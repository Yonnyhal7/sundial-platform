import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ResourceFileUpload from "./resource-file-upload";

export default async function NewResourcePage({
  params,
}: {
  params: Promise<{ school: string }>;
}) {
  const { school } = await params;
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

  async function createResource(formData: FormData) {
    "use server";

    const supabase = await createSupabaseServerClient();

    const title = String(formData.get("title") || "");
    const description = String(formData.get("description") || "");
    const url = String(formData.get("url") || "");
    const fileUrl = String(formData.get("file_url") || "");
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
      return;
    }

    redirect(`/${school}/admin/resources`);
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 dark:bg-black dark:text-white">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="mb-8">
          <p className="text-sm text-slate-400">{schoolData.name} Admin</p>
          <h1 className="mt-1 text-3xl font-bold">New Resource</h1>
        </div>

        <form
          action={createResource}
          className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6"
        >
          <div className="space-y-5">
            <input
              name="title"
              required
              placeholder="Resource title"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
            />

            <textarea
              name="description"
              rows={4}
              placeholder="Description"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
            />

            <input
              name="url"
              placeholder="External URL (optional)"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
            />

            <ResourceFileUpload />

            <input
              name="category"
              placeholder="Category (Example: Counseling)"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3"
            />

            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                name="is_active"
                defaultChecked
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
              className="rounded-lg bg-blue-600 px-4 py-2"
            >
              Create Resource
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}