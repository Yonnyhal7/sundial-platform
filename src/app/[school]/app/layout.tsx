import type { CSSProperties, ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import AppBottomNav from "@/components/mobile-app/AppBottomNav";
import AppHeader from "@/components/mobile-app/AppHeader";
import AppRoutePrefetch from "@/components/mobile-app/AppRoutePrefetch";
import AppSwipeNavigation from "@/components/mobile-app/AppSwipeNavigation";
import OfflineStudentAppRuntime from "@/components/offline/OfflineStudentAppRuntime";
import ThemeRouteSync from "@/components/ThemeRouteSync";
import { getMobileAppQuickLinks, requireMobileAppSchool } from "@/lib/mobileAppData";
import {
  getSchoolAppIconUrl,
  getSchoolAppName,
  getSchoolAppShortName,
  getSchoolAppThemeColor,
} from "@/lib/pwa/schoolAppManifest";
import { getForwardedHost } from "@/lib/routing/hosts";
import {
  getSchoolAppCanonicalUrl,
  getSchoolAppManifestPath,
} from "@/lib/routing/paths";
import { getSchoolThemeModes } from "@/lib/schoolTheme";
import { normalizeAppearancePreference } from "@/lib/themeScope";

type AppLayoutProps = {
  children: ReactNode;
  params: Promise<{ school: string }>;
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
  const schoolData = await requireMobileAppSchool(school);
  const headerStore = await headers();
  const hostname = getForwardedHost(headerStore);
  const pathname = headerStore.get("x-sundial-pathname") || `/${school}/app`;
  const manifestPath = getSchoolAppManifestPath(school, pathname, hostname);
  const canonicalUrl = getSchoolAppCanonicalUrl(
    school,
    pathname,
    hostname,
    headerStore.get("x-forwarded-proto") || ""
  );
  const appTitle = getSchoolAppShortName(schoolData.name);
  const schoolIcon = getSchoolAppIconUrl(schoolData.logo_url);

  return {
    title: appTitle,
    description: "Student and staff school app",
    applicationName: getSchoolAppName(schoolData.name),
    alternates: { canonical: canonicalUrl },
    manifest: manifestPath,
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: appTitle,
    },
    other: {
      "apple-mobile-web-app-capable": "yes",
    },
    icons: {
      icon: [
        ...(schoolIcon ? [{ url: schoolIcon }] : []),
        { url: "/favicon.ico" },
        { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
        { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
      ],
      apple: [
        ...(schoolIcon ? [{ url: schoolIcon }] : []),
        {
          url: "/apple-touch-icon.png",
          type: "image/png",
          sizes: "180x180",
        },
      ],
    },
  };
}

export async function generateViewport({
  params,
}: {
  params: Promise<{ school: string }>;
}): Promise<Viewport> {
  const { school } = await params;
  const schoolData = await requireMobileAppSchool(school);

  return {
    themeColor: getSchoolAppThemeColor(schoolData.primary_color),
  };
}

export default async function AppLayout({ children, params }: AppLayoutProps) {
  const { school } = await params;
  const schoolData = await requireMobileAppSchool(school);
  const quickLinks = await getMobileAppQuickLinks(school, schoolData.id);
  const schoolTheme = getSchoolThemeModes(schoolData);
  const schoolDefaultAppearance = normalizeAppearancePreference(
    schoolData.default_appearance
  );

  return (
    <div
      className="mobile-app-theme min-h-dvh bg-slate-50 text-slate-950 dark:bg-black dark:text-white"
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
      <ThemeRouteSync
        schoolDefaultAppearance={schoolDefaultAppearance}
        schoolSlug={school}
      />
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))] md:max-w-2xl md:px-6">
        <AppHeader
          schoolId={schoolData.id}
          school={school}
          schoolName={schoolData.name}
          logoUrl={schoolData.logo_url || null}
          quickLinks={quickLinks}
          schoolDefaultAppearance={schoolDefaultAppearance}
        />
        <div className="mt-[clamp(1.25rem,3.2vw,1.75rem)] flex min-h-0 flex-1 flex-col">
          <AppSwipeNavigation
            school={school}
            className="flex min-h-0 flex-1 flex-col"
          >
            <OfflineStudentAppRuntime
              schoolId={schoolData.id}
              school={school}
              timeZone={schoolData.timezone || "America/Los_Angeles"}
            >
              {children}
            </OfflineStudentAppRuntime>
          </AppSwipeNavigation>
        </div>
      </div>
      <AppRoutePrefetch school={school} />
      <AppBottomNav school={school} />
    </div>
  );
}
