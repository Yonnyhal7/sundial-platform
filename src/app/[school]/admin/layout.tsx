import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import AdminSidebar from "@/components/AdminSidebar";
import { requireAdminPortalAccess } from "@/lib/auth/adminPermissions";
import { getSchoolTheme } from "@/lib/schoolTheme";
import { getSchoolForSetup } from "@/lib/schools";
import { isSchoolAdminRole, isSuperAdminRole } from "@/lib/userAccess";

type AdminLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ school: string }>;
};

type AdminStyle = CSSProperties & {
  "--school-primary": string;
  "--school-secondary": string;
  "--school-primary-text": string;
  "--school-secondary-text": string;
  "--school-accent-visible": string;
  "--school-accent-visible-card": string;
  "--school-accent-visible-primary": string;
};

export default async function AdminLayout({
  children,
  params,
}: AdminLayoutProps) {
  const { school } = await params;
  const setupSchoolData = await getSchoolForSetup(school);

  if (!setupSchoolData) {
    notFound();
  }

  const schoolTheme = getSchoolTheme(setupSchoolData, "light");
  const adminUser = await requireAdminPortalAccess(setupSchoolData.id, school);

  return (
    <div
      className="admin-theme min-h-screen bg-slate-50 dark:bg-black"
      style={
        {
          "--school-primary": schoolTheme.schoolColor,
          "--school-secondary": schoolTheme.accentColor,
          "--school-primary-text": schoolTheme.schoolColorText,
          "--school-secondary-text": schoolTheme.accentColorText,
          "--school-accent-visible": schoolTheme.visibleAccentOnPage,
          "--school-accent-visible-card": schoolTheme.visibleAccentOnCard,
          "--school-accent-visible-primary": schoolTheme.visibleAccentOnSchoolColor,
        } as AdminStyle
      }
    >
      <AdminSidebar
        school={school}
        schoolName={setupSchoolData.name}
        logoUrl={setupSchoolData.logo_url || null}
        setupComplete={setupSchoolData.setup_complete}
        setupStep={setupSchoolData.setup_step}
        canManageSettings={
          isSuperAdminRole(adminUser.profile.role) ||
          isSchoolAdminRole(adminUser.profile.role)
        }
        allowedPermissionKeys={adminUser.permissionKeys}
      />

      <div className="min-h-screen bg-slate-50 pt-[142px] dark:bg-black sm:pt-[132px] lg:pl-[var(--admin-sidebar-width)] lg:pt-0">
        {children}
      </div>
    </div>
  );
}
