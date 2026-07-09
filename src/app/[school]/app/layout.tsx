import type { CSSProperties, ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import AppBottomNav from "@/components/mobile-app/AppBottomNav";
import AppHeader from "@/components/mobile-app/AppHeader";
import { getSchoolTheme } from "@/lib/schoolTheme";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type AppLayoutProps = {
  children: ReactNode;
  params: Promise<{ school: string }>;
};

type School = {
  id: string;
  name: string;
  primary_color: string | null;
  secondary_color: string | null;
  logo_url?: string | null;
};

type QuickLinkResource = {
  title: string;
  url: string | null;
  file_url: string | null;
};

type AppStyle = CSSProperties & {
  "--school-primary": string;
  "--school-secondary": string;
  "--school-primary-text": string;
  "--school-secondary-text": string;
  "--school-accent-visible": string;
  "--school-accent-visible-card": string;
  "--school-accent-visible-primary": string;
};

export const metadata: Metadata = {
  title: "Sundial App",
  description: "Student and staff school app",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Sundial",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default async function AppLayout({ children, params }: AppLayoutProps) {
  const { school } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: schoolData } = await supabase
    .rpc("get_school_by_subdomain", { subdomain_input: school })
    .single<School>();

  if (!schoolData) {
    notFound();
  }

  const { data: resources } = await supabase
    .from("resources")
    .select("title, url, file_url")
    .eq("school_id", schoolData.id)
    .eq("is_active", true)
    .order("title", { ascending: true })
    .limit(8)
    .returns<QuickLinkResource[]>();
  const schoolTheme = getSchoolTheme(schoolData, "light");
  const quickLinks =
    resources
      ?.map((resource) => ({
        title: resource.title,
        href: resource.url || resource.file_url || `/${school}/app/resources`,
      }))
      .filter((resource) => resource.href) || [];

  return (
    <div
      className="mobile-app-theme min-h-screen bg-slate-50 text-slate-950 dark:bg-black dark:text-white"
      style={
        {
          "--school-primary": schoolTheme.schoolColor,
          "--school-secondary": schoolTheme.accentColor,
          "--school-primary-text": schoolTheme.schoolColorText,
          "--school-secondary-text": schoolTheme.accentColorText,
          "--school-accent-visible": schoolTheme.visibleAccentOnPage,
          "--school-accent-visible-card": schoolTheme.visibleAccentOnCard,
          "--school-accent-visible-primary": schoolTheme.visibleAccentOnSchoolColor,
        } as AppStyle
      }
    >
      <div className="mx-auto min-h-screen max-w-md px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))] md:max-w-2xl md:px-6">
        <AppHeader
          school={school}
          schoolName={schoolData.name}
          logoUrl={schoolData.logo_url || null}
          quickLinks={quickLinks}
        />
        <div className="mt-[clamp(1.25rem,3.2vw,1.75rem)]">
          {children}
        </div>
      </div>
      <AppBottomNav school={school} />
    </div>
  );
}
