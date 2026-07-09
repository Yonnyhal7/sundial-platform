import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import AdminSidebar from "@/components/AdminSidebar";
import { requireAdminPortalAccess } from "@/lib/auth/adminPermissions";
import { getSchoolThemeModes } from "@/lib/schoolTheme";
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
  "--school-accent-visible-light": string;
  "--school-accent-visible-dark": string;
  "--school-accent-visible-card-light": string;
  "--school-accent-visible-card-dark": string;
  "--school-accent-visible-primary-light": string;
  "--school-accent-visible-primary-dark": string;
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

  const schoolTheme = getSchoolThemeModes(setupSchoolData);
  const adminUser = await requireAdminPortalAccess(setupSchoolData.id, school);

  return (
    <div
      className="admin-theme min-h-screen bg-slate-50 dark:bg-black"
      style={
        {
          "--school-primary": schoolTheme.light.schoolColor,
          "--school-secondary": schoolTheme.light.accentColor,
          "--school-primary-text": schoolTheme.light.schoolColorText,
          "--school-secondary-text": schoolTheme.light.accentColorText,
          "--school-accent-visible-light":
            schoolTheme.light.visibleAccentOnPage,
          "--school-accent-visible-dark":
            schoolTheme.dark.visibleAccentOnPage,
          "--school-accent-visible-card-light":
            schoolTheme.light.visibleAccentOnCard,
          "--school-accent-visible-card-dark":
            schoolTheme.dark.visibleAccentOnCard,
          "--school-accent-visible-primary-light":
            schoolTheme.light.visibleAccentOnSchoolColor,
          "--school-accent-visible-primary-dark":
            schoolTheme.dark.visibleAccentOnSchoolColor,
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

      <div className="flex min-h-screen flex-col bg-slate-50 pt-[142px] dark:bg-black sm:pt-[132px] lg:pl-[var(--admin-sidebar-width)] lg:pt-0">
        <div className="flex-1">{children}</div>

        <footer className="mt-auto px-6 pb-8 pt-10 lg:px-10">
          <div className="flex items-center justify-center gap-2 text-slate-500 opacity-70 dark:text-slate-400">
            <img
              src="/sundial-icon.png"
              alt=""
              aria-hidden="true"
              className="h-5 w-5 shrink-0 object-contain"
            />
            <span className="text-xs font-semibold">
              Powered by Sundial by Mr. H Codes
            </span>
          </div>
        </footer>
      </div>
    </div>
  );
}
