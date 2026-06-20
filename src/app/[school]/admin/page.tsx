import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";

export default async function SchoolAdminPage({
  params,
}: {
  params: Promise<{ school: string }>;
}) {
  const { school } = await params;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/${school}/login`);
  }

  const { data: profile } = await supabase
    .from("users")
    .select("role, school_id, is_active")
    .eq("id", user.id)
    .single();

  if (!profile || !profile.is_active) {
    redirect(`/${school}/login`);
  }

  const { data: schoolData } = await supabase
    .rpc("get_school_by_subdomain", {
      subdomain_input: school,
    })
    .single<{ id: string; name: string; subdomain: string }>();

  if (!schoolData) {
    notFound();
  }

  const allowed =
    profile.role === "SuperAdmin" ||
    (["SchoolAdmin", "Editor"].includes(profile.role) &&
      profile.school_id === schoolData.id);

  if (!allowed) {
    redirect(`/${school}`);
  }

  const adminLinks = [
    { label: "Manage Announcements", href: `/${school}/admin/announcements` },
    { label: "Manage Events", href: `/${school}/admin/events` },
    { label: "Manage Resources", href: `/${school}/admin/resources` },
    { label: "Manage Schedules", href: `/${school}/admin/schedules` },
    { label: "School Settings", href: `/${school}/admin/settings` },
    { label: "Manage Calendar", href: `/${school}/admin/calendar`},
  ];

  return (
    <main className="min-h-screen p-8">
      <p className="text-sm uppercase tracking-widest text-neutral-500">
        School Admin
      </p>

      <h1 className="mt-2 text-4xl font-bold">{schoolData.name}</h1>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {adminLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6 hover:bg-neutral-800"
          >
            <span className="text-xl font-semibold">{link.label}</span>
          </Link>
        ))}
      </div>
    </main>
  );
}