import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import AdminSidebar from "@/components/AdminSidebar";
import { canManageUsers, type AdminProfile } from "@/lib/adminUsers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type AdminLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ school: string }>;
};

type School = {
  id: string;
  name: string;
  primary_color: string | null;
  secondary_color: string | null;
};

type AdminStyle = CSSProperties & {
  "--school-primary": string;
  "--school-secondary": string;
};

export default async function AdminLayout({
  children,
  params,
}: AdminLayoutProps) {
  const { school } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: schoolData } = await supabase
    .rpc("get_school_by_subdomain", {
      subdomain_input: school,
    })
    .single<School>();

  if (!schoolData) {
    notFound();
  }

  const primaryColor = schoolData.primary_color || "#2563eb";
  const secondaryColor = schoolData.secondary_color || "#64748b";
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase
        .from("users")
        .select("id, role, school_id, is_active")
        .eq("id", user.id)
        .maybeSingle<AdminProfile>()
    : { data: null };
  const showUsersNav = canManageUsers(profile, schoolData.id);

  return (
    <div
      className="admin-theme min-h-screen bg-slate-50 dark:bg-black"
      style={
        {
          "--school-primary": primaryColor,
          "--school-secondary": secondaryColor,
        } as AdminStyle
      }
    >
      <AdminSidebar school={school} canManageUsers={showUsersNav} />

      <div className="min-h-screen bg-slate-50 pt-[142px] dark:bg-black sm:pt-[132px] lg:pl-[var(--admin-sidebar-width)] lg:pt-0">
        {children}
      </div>
    </div>
  );
}
