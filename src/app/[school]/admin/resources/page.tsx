import Link from "next/link";
import { notFound } from "next/navigation";
import { revalidatePath, updateTag } from "next/cache";
import { requireAdminSectionAccess } from "@/lib/auth/adminPermissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import AdminResourcesList, {
  type AdminResourceListItem,
  type QuickLinkActionResult,
} from "@/components/admin/AdminResourcesList";

export default async function AdminResourcesPage({
  params,
}: {
  params: Promise<{ school: string }>;
}) {
  const { school } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: schoolData } = await supabase
    .rpc("get_available_school_by_subdomain", {
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

    updateTag("mobile-app-quick-links");
    revalidatePath(`/${school}/admin/resources`);
  }

  async function setQuickLink(
    resourceId: string,
    selected: boolean
  ): Promise<QuickLinkActionResult> {
    "use server";

    const { supabase } = await requireAdminSectionAccess(
      schoolId,
      "resources",
      school
    );
    const { error } = await supabase.rpc("set_resource_quick_link", {
      p_school_id: schoolId,
      p_resource_id: resourceId,
      p_is_quick_link: selected,
    });

    if (error) {
      console.error("Set Resource Quick Link error:", JSON.stringify(error, null, 2));
      return {
        status: "error",
        message: "Quick Link could not be updated. Please try again.",
      };
    }

    updateTag("mobile-app-quick-links");
    return {
      status: "success",
      message: selected ? "Resource added to Quick Links." : "Resource removed from Quick Links.",
    };
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
            <p className="text-sm text-slate-500 dark:text-slate-400">{schoolData.name} Admin</p>
            <h1 className="mt-1 text-3xl font-bold">Resources</h1>
          </div>

        </div>

        <div className="mb-6 flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]">
          <div>
            <h2 className="text-lg font-semibold">Manage Resources</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Links, documents, and downloads for students and staff.
            </p>
          </div>

          <Link
            href={`/${school}/admin/resources/new`}
            className="cursor-pointer rounded-lg bg-[var(--school-primary)] px-4 py-2 text-sm font-medium text-[var(--school-primary-text)] transition hover:opacity-90"
          >
            + New Resource
          </Link>
        </div>

        <AdminResourcesList
          school={school}
          resources={(resources || []) as AdminResourceListItem[]}
          setQuickLinkAction={setQuickLink}
          deleteAction={deleteResource}
        />
      </div>
    </main>
  );
}
