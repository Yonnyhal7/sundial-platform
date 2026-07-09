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
  searchParams,
}: {
  params: Promise<{ school: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { school } = await params;
  const { error: errorParam } = await searchParams;
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

    if (!name) {
      redirect(`/${school}/admin/athletics/sports/new?error=1`);
    }

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
      redirect(`/${school}/admin/athletics/sports/new?error=1`);
    }

    redirect(`/${school}/admin/athletics`);
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 dark:bg-[#181818] dark:text-white">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="mb-8">
          <p className="text-sm text-slate-500 dark:text-[#a3a3a3]">{schoolName} Admin</p>
          <h1 className="mt-1 text-3xl font-bold">New Sport</h1>
        </div>

        {errorParam && (
          <p className="mb-6 inline-block rounded-full bg-red-500/15 px-4 py-2 text-sm font-semibold text-red-700 ring-1 ring-red-500/30 dark:text-red-300">
            Something went wrong saving this sport. Please try again.
          </p>
        )}

        <form action={createSport} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424] dark:shadow-none">
          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-[#d4d4d4]">Name</label>
              <input name="name" required className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none focus:border-[var(--school-primary)] dark:border-[#3a3a3a] dark:bg-[#181818] dark:text-white" />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-[#d4d4d4]">Icon</label>
              <select name="icon" defaultValue="generic" className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none focus:border-[var(--school-primary)] dark:border-[#3a3a3a] dark:bg-[#181818] dark:text-white">
                {SPORT_ICON_OPTIONS.map((icon) => (
                  <option key={icon} value={icon}>
                    {formatSportIconName(icon)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-[#d4d4d4]">Icon Color</label>
              <div className="flex items-center gap-3">
                <input
                  name="icon_color"
                  type="color"
                  defaultValue={DEFAULT_SPORT_ICON_COLOR}
                  className="h-12 w-16 cursor-pointer rounded-lg border border-slate-300 bg-white p-1 dark:border-[#3a3a3a] dark:bg-[#181818]"
                />
                <span className="text-sm text-slate-500 dark:text-[#a3a3a3]">
                  Pick the color used for this sport icon.
                </span>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-[#d4d4d4]">Season <span className="font-normal text-slate-500 dark:text-[#a3a3a3]">(optional)</span></label>
              <input name="season" className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none focus:border-[var(--school-primary)] dark:border-[#3a3a3a] dark:bg-[#181818] dark:text-white" />
            </div>

            <label className="flex items-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-3 dark:border-[#3a3a3a] dark:bg-[#181818]">
              <input name="is_active" type="checkbox" defaultChecked className="h-4 w-4 rounded border-[#4a4a4a]" />
              <span className="text-sm text-slate-700 dark:text-[#d4d4d4]">Active</span>
            </label>
          </div>

          <div className="mt-8 flex items-center justify-between border-t border-slate-200 pt-5 dark:border-[#3a3a3a]">
            <Link href={`/${school}/admin/athletics`} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-[#4a4a4a] dark:text-[#d4d4d4] dark:hover:bg-[#303030]">
              Cancel
            </Link>

            <button type="submit" className="cursor-pointer rounded-lg bg-[var(--school-primary)] px-5 py-2 text-sm font-semibold text-[var(--school-primary-text)] transition hover:opacity-90">
              Create Sport
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
