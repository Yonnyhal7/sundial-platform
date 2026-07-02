import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { buildTeamDisplayName, TEAM_GENDER_OPTIONS, TEAM_LEVEL_OPTIONS } from "@/lib/athletics";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function EditTeamPage({
  params,
}: {
  params: Promise<{ school: string; teamId: string }>;
}) {
  const { school, teamId } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: schoolData } = await supabase
    .rpc("get_school_by_subdomain", { subdomain_input: school })
    .single<{ id: string; name: string }>();

  if (!schoolData) notFound();
  const schoolId = schoolData.id;

  const [{ data: sports }, { data: team }] = await Promise.all([
    supabase
      .from("sports")
      .select("id, name")
      .eq("school_id", schoolId)
      .order("name", { ascending: true }),
    supabase
      .from("teams")
      .select("id, sport_id, name, level, gender, coach_name, coach_email, is_active")
      .eq("id", teamId)
      .eq("school_id", schoolId)
      .single<{
        id: string;
        sport_id: string | null;
        name: string;
        level: string | null;
        gender: string | null;
        coach_name: string | null;
        coach_email: string | null;
        is_active: boolean | null;
      }>(),
  ]);

  if (!team) notFound();

  async function updateTeam(formData: FormData) {
    "use server";

    const supabase = await createSupabaseServerClient();
    const sportId = String(formData.get("sport_id") || "");
    const level = String(formData.get("level") || "").trim();
    const gender = String(formData.get("gender") || "").trim();

    if (!sportId || !level || !gender) return;

    const { data: sport } = await supabase
      .from("sports")
      .select("id, name")
      .eq("id", sportId)
      .eq("school_id", schoolId)
      .single<{ id: string; name: string }>();

    if (!sport) return;

    const name = buildTeamDisplayName({
      level,
      gender,
      sportName: sport.name,
    });

    const { error } = await supabase
      .from("teams")
      .update({
        sport_id: sportId,
        name,
        level,
        gender,
        coach_name: String(formData.get("coach_name") || "").trim() || null,
        coach_email: String(formData.get("coach_email") || "").trim() || null,
        is_active: formData.get("is_active") === "on",
      })
      .eq("id", teamId)
      .eq("school_id", schoolId);

    if (error) {
      console.error("Update team error:", JSON.stringify(error, null, 2));
      return;
    }

    redirect(`/${school}/admin/athletics`);
  }

  const fields = [
    ["coach_name", "Coach Name", team.coach_name || "", "text", false],
    ["coach_email", "Coach Email", team.coach_email || "", "email", false],
  ] as const;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950 dark:bg-black dark:text-white">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="mb-8 text-3xl font-bold">Edit Team</h1>

        <form action={updateTeam} className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">Sport</label>
              <select name="sport_id" required defaultValue={team.sport_id || ""} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500">
                <option value="">Select sport</option>
                {(sports || []).map((sport) => (
                  <option key={sport.id} value={sport.id}>{sport.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">Level</label>
              <select name="level" required defaultValue={team.level || ""} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500">
                <option value="">Select level</option>
                {TEAM_LEVEL_OPTIONS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300">Gender</label>
              <select name="gender" required defaultValue={team.gender || "Coed"} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500">
                {TEAM_GENDER_OPTIONS.map((gender) => (
                  <option key={gender} value={gender}>
                    {gender}
                  </option>
                ))}
              </select>
            </div>

            <p className="rounded-lg border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-400">
              Team display name is generated from level, gender, and sport.
            </p>

            {fields.map(([name, label, value, type, required]) => (
              <div key={name}>
                <label className="mb-2 block text-sm font-medium text-slate-300">{label} <span className="font-normal text-slate-500">(optional)</span></label>
                <input name={name} type={type} required={required} defaultValue={value} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-blue-500" />
              </div>
            ))}

            <label className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950 px-4 py-3">
              <input name="is_active" type="checkbox" defaultChecked={team.is_active ?? false} className="h-4 w-4 rounded border-slate-600" />
              <span className="text-sm text-slate-300">Active</span>
            </label>
          </div>

          <div className="mt-8 flex items-center justify-between border-t border-slate-800 pt-5">
            <Link href={`/${school}/admin/athletics`} className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-900">Cancel</Link>
            <button type="submit" className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-500">Save Changes</button>
          </div>
        </form>
      </div>
    </main>
  );
}
