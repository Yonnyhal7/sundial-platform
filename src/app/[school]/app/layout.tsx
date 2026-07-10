import type { CSSProperties, ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import AppBottomNav from "@/components/mobile-app/AppBottomNav";
import AppHeader from "@/components/mobile-app/AppHeader";
import { getSchoolThemeModes } from "@/lib/schoolTheme";
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
  "--school-accent-visible-light": string;
  "--school-accent-visible-dark": string;
  "--school-accent-visible-card-light": string;
  "--school-accent-visible-card-dark": string;
  "--school-accent-visible-primary-light": string;
  "--school-accent-visible-primary-dark": string;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ school: string }>;
}): Promise<Metadata> {
  const { school } = await params;

  return {
    title: "Sundial App",
    description: "Student and staff school app",
    manifest: `/${school}/manifest.webmanifest`,
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: "Sundial",
    },
    icons: {
      icon: [
        { url: "/favicon.ico" },
        { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
        { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
      ],
      apple: [
        {
          url: "/apple-touch-icon.png",
          type: "image/png",
          sizes: "180x180",
        },
      ],
    },
  };
}

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
  const schoolTheme = getSchoolThemeModes(schoolData);
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
          "--school-primary": schoolTheme.light.schoolColor,
          "--school-secondary": schoolTheme.light.accentColor,
          "--school-primary-text": schoolTheme.light.schoolColorText,
          "--school-secondary-text": schoolTheme.light.accentColorText,
          "--school-accent-visible-light": schoolTheme.light.visibleAccentOnPage,
          "--school-accent-visible-dark": schoolTheme.dark.visibleAccentOnPage,
          "--school-accent-visible-card-light": schoolTheme.light.visibleAccentOnCard,
          "--school-accent-visible-card-dark": schoolTheme.dark.visibleAccentOnCard,
          "--school-accent-visible-primary-light": schoolTheme.light.visibleAccentOnSchoolColor,
          "--school-accent-visible-primary-dark": schoolTheme.dark.visibleAccentOnSchoolColor,
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
