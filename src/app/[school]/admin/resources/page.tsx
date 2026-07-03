import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdminSectionAccess } from "@/lib/auth/adminPermissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function AdminResourcesPage({
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
    .single<{ id: string; name: string; subdomain: string }>();

  if (!schoolData) {
    notFound();
  }

  const schoolId = schoolData.id;
  await requireAdminSectionAccess(schoolId, "resources", school);

  async function deleteResource(formData: FormData) {
    "use server";

    const { supabase } = await requireAdminSectionAccess(
      schoolId,
      "resources",
      school
    );
    const resourceId = String(formData.get("resource_id") || "");

    const { error } = await supabase
      .from("resources")
      .delete()
      .eq("id", resourceId)
      .eq("school_id", schoolId);

    if (error) {
      console.error("Delete resource error:", JSON.stringify(error, null, 2));
      return;
    }

    revalidatePath(`/${school}/admin/resources`);
  }

  const { data: resources, error } = await supabase
    .from("resources")
    .select("*")
    .eq("school_id", schoolId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Admin resources error:", JSON.stringify(error, null, 2));
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 dark:bg-black dark:text-white">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-400">{schoolData.name} Admin</p>
            <h1 className="mt-1 text-3xl font-bold">Resources</h1>
          </div>

        </div>

        <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900/70 p-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Manage Resources</h2>
            <p className="mt-1 text-sm text-slate-400">
              Links, documents, and downloads for students and staff.
            </p>
          </div>

          <Link
            href={`/${school}/admin/resources/new`}
            className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
          >
            + New Resource
          </Link>
        </div>

        <section className="space-y-4">
          {!resources || resources.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-8 text-center">
              <h3 className="text-lg font-semibold">No resources yet</h3>
            </div>
          ) : (
            resources.map((resource) => (
              <article
                key={resource.id}
                className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5"
              >
                <div className="flex justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3">
                      <h3 className="text-xl font-semibold">{resource.title}</h3>

                      {resource.is_active && (
                        <span className="rounded-full bg-green-500/15 px-3 py-1 text-xs font-semibold text-green-300 ring-1 ring-green-500/30">
                          Active
                        </span>
                      )}
                    </div>

                    {resource.description && (
                      <p className="mt-2 text-sm text-slate-300">
                        {resource.description}
                      </p>
                    )}

                    {resource.category && (
                      <p className="mt-2 text-sm text-slate-400">
                        Category: {resource.category}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-5 flex gap-3 border-t border-slate-800 pt-4">
                  <Link
                    href={`/${school}/admin/resources/${resource.id}/edit`}
                    className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
                  >
                    Edit
                  </Link>

                  <form action={deleteResource}>
                    <input
                      type="hidden"
                      name="resource_id"
                      value={resource.id}
                    />

                    <button
                      type="submit"
                      className="cursor-pointer rounded-lg border border-red-900/60 px-3 py-2 text-sm text-red-300 hover:bg-red-950/40"
                    >
                      Delete
                    </button>
                  </form>
                </div>
              </article>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
