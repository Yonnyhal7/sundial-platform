import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSchoolAdminRole, isSuperAdminRole, normalizeAdminRole } from "@/lib/userAccess";
import { parseSundialHost } from "@/lib/routing/hosts";

type School = {
  id: string;
  name: string;
  subdomain: string;
};

export default async function SelectSchoolPage() {
  const supabase = await createSupabaseServerClient();
  const headerStore = await headers();
  const parsedHost = parseSundialHost(headerStore.get("host") || "");
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(parsedHost.kind === "dev" ? "/admin" : "/");
  }

  const { data: profile } = await supabase
    .from("users")
    .select("id, first_name, role, school_id, is_active")
    .eq("id", user.id)
    .maybeSingle<{
      id: string;
      first_name: string | null;
      role: string | null;
      school_id: string | null;
      is_active: boolean | null;
    }>();

  if (!profile?.is_active) {
    redirect(parsedHost.kind === "dev" ? "/admin" : "/");
  }

  const isSuperAdmin = isSuperAdminRole(profile.role);
  const isSchoolAdmin = isSchoolAdminRole(profile.role);
  const isEditor = normalizeAdminRole(profile.role) === "editor";

  const { data: schools } = isSuperAdmin
    ? await supabase
        .from("schools")
        .select("id, name, subdomain")
        .order("name", { ascending: true })
        .returns<School[]>()
    : profile.school_id && (isSchoolAdmin || isEditor)
      ? await supabase
          .from("schools")
          .select("id, name, subdomain")
          .eq("id", profile.school_id)
          .returns<School[]>()
      : { data: [] };

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto w-full max-w-4xl">
        <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-400">
          Sundial Admin
        </p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight">Select School</h1>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {schools?.map((school) => (
            <Link
              key={school.id}
              href={
                parsedHost.kind === "dev"
                  ? `/admin/${school.subdomain}`
                  : `/${school.subdomain}`
              }
              className="rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:border-white/30 hover:bg-white/10"
            >
              <h2 className="text-xl font-semibold">{school.name}</h2>
              <p className="mt-2 text-sm text-slate-400">
                {school.subdomain}.sundialk12.com
              </p>
            </Link>
          ))}
        </div>

        {!schools?.length && (
          <p className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-slate-300">
            No schools are available for this admin account.
          </p>
        )}
      </div>
    </main>
  );
}
