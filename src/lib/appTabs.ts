export const APP_TAB_DEFINITIONS = [
  { key: "home", label: "Home", segment: "" },
  { key: "schedule", label: "Schedule", segment: "schedule" },
  { key: "events", label: "Events", segment: "events" },
  { key: "athletics", label: "Athletics", segment: "athletics" },
] as const;

export type AppTabKey = (typeof APP_TAB_DEFINITIONS)[number]["key"];

export type AppTabRoute = (typeof APP_TAB_DEFINITIONS)[number] & {
  href: string;
};

export const APP_TAB_PENDING_EVENT = "sundial:app-tab-pending";

export type AppTabPendingEventDetail = {
  href: string;
  from: string;
};

export function getAppBasePath(school: string, pathname?: string | null) {
  if (pathname === "/app" || pathname?.startsWith("/app/")) {
    return "/app";
  }

  return `/${school}/app`;
}

export function getAppTabs(school: string, pathname?: string | null): AppTabRoute[] {
  const basePath = getAppBasePath(school, pathname);

  return APP_TAB_DEFINITIONS.map((tab) => ({
    ...tab,
    href: tab.segment ? `${basePath}/${tab.segment}` : basePath,
  }));
}

export function getActiveAppTabIndex(pathname: string, school: string) {
  const normalizedPathname =
    pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  const tabs = getAppTabs(school, pathname);

  return tabs.findIndex((tab, index) => {
    if (index === 0) {
      return normalizedPathname === tab.href;
    }

    return (
      normalizedPathname === tab.href ||
      normalizedPathname.startsWith(`${tab.href}/`)
    );
  });
}
