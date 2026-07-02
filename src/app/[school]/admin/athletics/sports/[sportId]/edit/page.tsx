import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { formatSportIconName, SPORT_ICON_OPTIONS } from "@/lib/athletics";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function EditSportPage({
  params,
}: {
  params: Promise<{ school: string; sportId: string }>;
}) {
  const { school, sportId } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: schoolData } = await supabase
    .rpc("get_school_by_subdomain", { subdomain_input: school })
    .single<{ id: string; name: string }>();

  if (!schoolData) notFound();
  const schoolId = schoolData.id;

  const { data: sport } = await supabase
    .from("sports")
    .select("id, name, icon, season, is_active")
    .eq("id", sportId)
    .eq("school_id", schoolId)
    .single<{ id: string; name: string; icon: string | null; season: string | null; is_active: boolean | null }>();

  if (!sport) notFound();

  async function updateSport(formData: FormData) {
    "use server";

    const supabase = await createSupabaseServerClient();
    const name = String(formData.get("name") || "").trim();
    const icon = String(formData.get("icon") || "generic").trim();
    const season = String(formData.get("season") || "").trim();
    const isActive = formData.get("is_active") === "on";

    if (!name) return;

    const { error } = await supabase
      .from("sports")
      .update({
        name,
        icon,
        season: season || null,
        is_active: isActive,
      })
      .eq("id", sportId)
      .eq("school_id", schoolId);

    if (error) {
      console.error("Update sport error:", JSON.stringify(error, null, 2));
      return;
    }

    redirect(`/${school}/admin/athletics`);
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 dark:bg-black dark:text-white">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="mb-8 text-3xl font-bold">Edit Sport</h1>

        <form action={updateSport} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">Name</label>
              <input name="name" required defaultValue={sport.name} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500" />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">Icon</label>
              <select name="icon" required defaultValue={sport.icon || "generic"} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500">
                {SPORT_ICON_OPTIONS.map((icon) => (
                  <option key={icon} value={icon}>
                    {formatSportIconName(icon)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">Season <span className="font-normal text-slate-500">(optional)</span></label>
              <input name="season" defaultValue={sport.season || ""} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500" />
            </div>

            <label className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950 px-4 py-3">
              <input name="is_active" type="checkbox" defaultChecked={sport.is_active ?? false} className="h-4 w-4 rounded border-slate-600" />
              <span className="text-sm text-slate-300">Active</span>
            </label>
          </div>

          <div className="mt-8 flex items-center justify-between border-t border-slate-800 pt-5">
            <Link href={`/${school}/admin/athletics`} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-900">
              Cancel
            </Link>

            <button type="submit" className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500">
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
