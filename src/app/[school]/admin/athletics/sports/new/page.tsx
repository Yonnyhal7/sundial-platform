import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAdminSectionAccess } from "@/lib/auth/adminPermissions";
import {
  DEFAULT_SPORT_ICON_COLOR,
  formatSportIconName,
  normalizeSportIconColor,
  SPORT_ICON_OPTIONS,
} from "@/lib/athletics";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function NewSportPage({
  params,
}: {
  params: Promise<{ school: string }>;
}) {
  const { school } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: schoolData } = await supabase
    .rpc("get_school_by_subdomain", { subdomain_input: school })
    .single<{ id: string; name: string }>();

  if (!schoolData) notFound();
  const schoolId = schoolData.id;
  const schoolName = schoolData.name;
  await requireAdminSectionAccess(schoolId, "athletics", school);

  async function createSport(formData: FormData) {
    "use server";

    const { supabase } = await requireAdminSectionAccess(
      schoolId,
      "athletics",
      school
    );
    const name = String(formData.get("name") || "").trim();
    const icon = String(formData.get("icon") || "generic").trim();
    const iconColor = normalizeSportIconColor(String(formData.get("icon_color") || ""));
    const season = String(formData.get("season") || "").trim();
    const isActive = formData.get("is_active") === "on";

    if (!name) return;

    const insertPayload = {
      school_id: schoolId,
      name,
      icon,
      icon_color: iconColor,
      season: season || null,
      is_active: isActive,
    };

    let { error } = await supabase.from("sports").insert(insertPayload);

    if (error?.code === "42703") {
      ({ error } = await supabase.from("sports").insert({
        school_id: schoolId,
        name,
        icon,
        season: season || null,
        is_active: isActive,
      }));
    }

    if (error) {
      console.error("Create sport error:", JSON.stringify(error, null, 2));
      return;
    }

    redirect(`/${school}/admin/athletics`);
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 dark:bg-[#181818] dark:text-white">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="mb-8">
          <p className="text-sm text-[#a3a3a3]">{schoolName} Admin</p>
          <h1 className="mt-1 text-3xl font-bold">New Sport</h1>
        </div>

        <form action={createSport} className="rounded-2xl border border-[#3a3a3a] bg-[#242424] p-6">
          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-[#d4d4d4]">Name</label>
              <input name="name" required className="w-full rounded-lg border border-[#3a3a3a] bg-[#181818] px-4 py-3 text-white outline-none focus:border-blue-500" />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-[#d4d4d4]">Icon</label>
              <select name="icon" defaultValue="generic" className="w-full rounded-lg border border-[#3a3a3a] bg-[#181818] px-4 py-3 text-white outline-none focus:border-blue-500">
                {SPORT_ICON_OPTIONS.map((icon) => (
                  <option key={icon} value={icon}>
                    {formatSportIconName(icon)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-[#d4d4d4]">Icon Color</label>
              <div className="flex items-center gap-3">
                <input
                  name="icon_color"
                  type="color"
                  defaultValue={DEFAULT_SPORT_ICON_COLOR}
                  className="h-12 w-16 cursor-pointer rounded-lg border border-[#3a3a3a] bg-[#181818] p-1"
                />
                <span className="text-sm text-[#a3a3a3]">
                  Pick the color used for this sport icon.
                </span>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-[#d4d4d4]">Season <span className="font-normal text-[#a3a3a3]">(optional)</span></label>
              <input name="season" className="w-full rounded-lg border border-[#3a3a3a] bg-[#181818] px-4 py-3 text-white outline-none focus:border-blue-500" />
            </div>

            <label className="flex items-center gap-3 rounded-lg border border-[#3a3a3a] bg-[#181818] px-4 py-3">
              <input name="is_active" type="checkbox" defaultChecked className="h-4 w-4 rounded border-[#4a4a4a]" />
              <span className="text-sm text-[#d4d4d4]">Active</span>
            </label>
          </div>

          <div className="mt-8 flex items-center justify-between border-t border-[#3a3a3a] pt-5">
            <Link href={`/${school}/admin/athletics`} className="rounded-lg border border-[#4a4a4a] px-4 py-2 text-sm text-[#d4d4d4] hover:bg-[#303030]">
              Cancel
            </Link>

            <button type="submit" className="cursor-pointer rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500">
              Create Sport
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
