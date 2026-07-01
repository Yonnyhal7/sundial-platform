import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import ThemeToggle from "@/components/ThemeToggle";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type AdminLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ school: string }>;
};

type School = {
  id: string;
  name: string;
  primary_color: string | null;
};

type AdminStyle = CSSProperties & {
  "--school-primary": string;
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

  return (
    <div
      className="admin-theme min-h-screen"
      style={{ "--school-primary": primaryColor } as AdminStyle}
    >
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 px-6 py-3 backdrop-blur dark:border-[#3a3a3a] dark:bg-black/90">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <Link
            href={`/${school}/admin`}
            className="min-w-0 text-sm font-semibold text-slate-900 hover:text-[var(--school-primary)] dark:text-white"
          >
            {schoolData.name} Admin
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href={`/${school}`}
              className="hidden rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-[var(--school-primary)] hover:text-[var(--school-primary)] dark:border-[#3a3a3a] dark:text-[#d4d4d4] sm:inline-flex"
            >
              View Site
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {children}
    </div>
  );
}
