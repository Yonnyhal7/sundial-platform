import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAdminSectionAccess } from "@/lib/auth/adminPermissions";
import { buildTeamDisplayName, TEAM_GENDER_OPTIONS, TEAM_LEVEL_OPTIONS } from "@/lib/athletics";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function NewTeamPage({
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

  const { data: sports } = await supabase
    .from("sports")
    .select("id, name")
    .eq("school_id", schoolId)
    .order("name", { ascending: true });

  async function createTeam(formData: FormData) {
    "use server";

    const { supabase } = await requireAdminSectionAccess(
      schoolId,
      "athletics",
      school
    );
    const sportId = String(formData.get("sport_id") || "");
    const level = String(formData.get("level") || "").trim();
    const gender = String(formData.get("gender") || "").trim();

    if (!sportId || !level || !gender) {
      redirect(`/${school}/admin/athletics/teams/new?error=1`);
    }

    const { data: sport } = await supabase
      .from("sports")
      .select("id, name")
      .eq("id", sportId)
      .eq("school_id", schoolId)
      .single<{ id: string; name: string }>();

    if (!sport) {
      redirect(`/${school}/admin/athletics/teams/new?error=1`);
    }

    const name = buildTeamDisplayName({
      level,
      gender,
      sportName: sport.name,
    });

    const { error } = await supabase.from("teams").insert({
      school_id: schoolId,
      sport_id: sportId,
      name,
      level,
      gender,
      coach_name: String(formData.get("coach_name") || "").trim() || null,
      coach_email: String(formData.get("coach_email") || "").trim() || null,
      is_active: formData.get("is_active") === "on",
    });

    if (error) {
      console.error("Create team error:", JSON.stringify(error, null, 2));
      redirect(`/${school}/admin/athletics/teams/new?error=1`);
    }

    redirect(`/${school}/admin/athletics`);
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 dark:bg-[#181818] dark:text-white">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="mb-8">
          <p className="text-sm text-slate-500 dark:text-[#a3a3a3]">{schoolName} Admin</p>
          <h1 className="mt-1 text-3xl font-bold">New Team</h1>
        </div>

        {errorParam && (
          <p className="mb-6 inline-block rounded-full bg-red-500/15 px-4 py-2 text-sm font-semibold text-red-700 ring-1 ring-red-500/30 dark:text-red-300">
            Something went wrong saving this team. Please check the required fields and try again.
          </p>
        )}

        <form action={createTeam} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424] dark:shadow-none">
          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-[#d4d4d4]">Sport</label>
              <select name="sport_id" required className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none focus:border-[var(--school-primary)] dark:border-[#3a3a3a] dark:bg-[#181818] dark:text-white">
                <option value="">Select sport</option>
                {(sports || []).map((sport) => (
                  <option key={sport.id} value={sport.id}>{sport.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-[#d4d4d4]">Level</label>
              <select name="level" required className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none focus:border-[var(--school-primary)] dark:border-[#3a3a3a] dark:bg-[#181818] dark:text-white">
                <option value="">Select level</option>
                {TEAM_LEVEL_OPTIONS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-[#d4d4d4]">Gender</label>
              <select name="gender" required defaultValue="Coed" className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none focus:border-[var(--school-primary)] dark:border-[#3a3a3a] dark:bg-[#181818] dark:text-white">
                {TEAM_GENDER_OPTIONS.map((gender) => (
                  <option key={gender} value={gender}>
                    {gender}
                  </option>
                ))}
              </select>
            </div>

            {["coach_name", "coach_email"].map((field) => (
              <div key={field}>
                <label className="mb-2 block text-sm font-medium text-slate-700 dark:text-[#d4d4d4]">
                  {field.split("_").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ")} <span className="font-normal text-slate-500 dark:text-[#a3a3a3]">(optional)</span>
                </label>
                <input
                  name={field}
                  type={field === "coach_email" ? "email" : "text"}
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-slate-950 outline-none focus:border-[var(--school-primary)] dark:border-[#3a3a3a] dark:bg-[#181818] dark:text-white"
                />
              </div>
            ))}

            <label className="flex items-center gap-3 rounded-lg border border-slate-300 bg-white px-4 py-3 dark:border-[#3a3a3a] dark:bg-[#181818]">
              <input name="is_active" type="checkbox" defaultChecked className="h-4 w-4 rounded border-[#4a4a4a]" />
              <span className="text-sm text-slate-700 dark:text-[#d4d4d4]">Active</span>
            </label>
          </div>

          <div className="mt-8 flex items-center justify-between border-t border-slate-200 pt-5 dark:border-[#3a3a3a]">
            <Link href={`/${school}/admin/athletics`} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-[#4a4a4a] dark:text-[#d4d4d4] dark:hover:bg-[#303030]">Cancel</Link>
            <button type="submit" className="cursor-pointer rounded-lg bg-[var(--school-primary)] px-5 py-2 text-sm font-semibold text-[var(--school-primary-text)] transition hover:opacity-90">Create Team</button>
          </div>
        </form>
      </div>
    </main>
  );
}
