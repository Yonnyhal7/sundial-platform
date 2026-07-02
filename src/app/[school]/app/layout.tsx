import type { CSSProperties, ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import AppBottomNav from "@/components/mobile-app/AppBottomNav";
import ThemeToggle from "@/components/ThemeToggle";
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
};

type AppStyle = CSSProperties & {
  "--school-primary": string;
  "--school-secondary": string;
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

  const primaryColor = schoolData.primary_color || "#2563eb";
  const secondaryColor = schoolData.secondary_color || primaryColor;

  return (
    <div
      className="mobile-app-theme min-h-screen bg-slate-50 text-slate-950 dark:bg-black dark:text-white"
      style={
        {
          "--school-primary": primaryColor,
          "--school-secondary": secondaryColor,
        } as AppStyle
      }
    >
      <div className="mx-auto min-h-screen max-w-md px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))] md:max-w-2xl md:px-6">
        {children}
      </div>
      <div className="fixed right-4 bottom-[calc(5.6rem+env(safe-area-inset-bottom))] z-50">
        <ThemeToggle scope="app" className="h-9 w-9" />
      </div>
      <AppBottomNav school={school} />
    </div>
  );
}
