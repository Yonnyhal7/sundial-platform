import type { ReactNode } from "react";
import { requireSuperAdminAccess } from "@/lib/auth/adminPermissions";
import SuperAdminLogoutButton from "./superadmin-logout-button";
import SuperAdminSidebar from "./superadmin-sidebar";

type SuperAdminDashboardLayoutProps = {
  children: ReactNode;
};

export default async function SuperAdminDashboardLayout({
  children,
}: SuperAdminDashboardLayoutProps) {
  const { profile } = await requireSuperAdminAccess();
  const userName = profile.first_name?.trim() || "Super Admin";

  return (
    <div className="admin-theme min-h-screen bg-slate-50 text-slate-950 dark:bg-black dark:text-white">
      <SuperAdminSidebar />

      <div className="min-h-screen lg:pl-[var(--admin-sidebar-width)]">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-6 py-4 backdrop-blur-xl dark:border-slate-800 dark:bg-black/90">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="lg:hidden">
              <p className="text-lg font-bold tracking-tight">Sundial</p>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                SuperAdmin
              </p>
            </div>

            <div className="ml-auto flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm font-semibold">{userName}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Signed in
                </p>
              </div>
              <SuperAdminLogoutButton />
            </div>
          </div>
        </header>

        <main className="px-6 py-8 lg:px-10">{children}</main>
      </div>
    </div>
  );
}
