import { normalizeHostname, parseSundialHost } from "./hosts";

export function isLocalhost(hostname: string) {
  return parseSundialHost(hostname).kind === "dev";
}

function logDevelopmentRouteGeneration({
  helper,
  school,
  hostname,
  pathname,
  generatedPath,
}: {
  helper: string;
  school: string;
  hostname: string;
  pathname: string;
  generatedPath: string;
}) {
  if (process.env.NODE_ENV !== "development") return;

  console.info("[Sundial routing]", {
    helper,
    school,
    host: hostname || "(client)",
    forwardedPathname: pathname,
    generatedPath,
  });
}

export function getSchoolSiteBasePath(
  school: string,
  pathname: string,
  hostname: string
) {
  if (isLocalhost(hostname)) {
    return pathname === `/${school}` || pathname.startsWith(`/${school}/`)
      ? `/${school}`
      : "";
  }

  return hostname.startsWith(`${school}.`) ? "" : `/${school}`;
}

export function getSchoolAppBasePath(
  school: string,
  pathname: string,
  hostname: string
) {
  return `${getSchoolSiteBasePath(school, pathname, hostname)}/app`;
}

export function getSchoolKioskBasePath(
  school: string,
  pathname: string,
  hostname: string
) {
  return `${getSchoolSiteBasePath(school, pathname, hostname)}/kiosk`;
}

function getRootDomain() {
  return process.env.NEXT_PUBLIC_ROOT_DOMAIN || "sundialk12.com";
}

function getPublicSchoolExperienceBase(
  school: string,
  pathname: string,
  hostname: string
) {
  const normalizedHostname = normalizeHostname(hostname);
  const rootDomain = getRootDomain();

  if (normalizedHostname === `admin.${rootDomain}`) {
    return `https://${school}.${rootDomain}`;
  }

  return getSchoolSiteBasePath(school, pathname, normalizedHostname);
}

export function getSchoolAppUrl(
  school: string,
  pathname: string,
  hostname: string
) {
  return `${getPublicSchoolExperienceBase(school, pathname, hostname)}/app`;
}

export function getSchoolKioskUrl(
  school: string,
  pathname: string,
  hostname: string
) {
  return `${getPublicSchoolExperienceBase(school, pathname, hostname)}/kiosk`;
}

export function getSchoolAdminBasePath(
  school: string,
  pathname: string,
  hostname: string
) {
  if (pathname === `/${school}/dashboard` || pathname.startsWith(`/${school}/dashboard/`)) {
    return `/${school}/dashboard`;
  }

  if (hostname.startsWith("admin.")) {
    return `/${school}/dashboard`;
  }

  if (isLocalhost(hostname)) {
    return `/${school}/admin`;
  }

  if (pathname === `/admin/${school}` || pathname.startsWith(`/admin/${school}/`)) {
    const generatedPath = `/${school}/admin`;
    logDevelopmentRouteGeneration({
      helper: "getSchoolAdminBasePath",
      school,
      hostname,
      pathname,
      generatedPath,
    });
    return generatedPath;
  }

  return `/${school}/admin`;
}

export function getSchoolAdminPath(
  school: string,
  pathname: string,
  hostname: string,
  section?: string
) {
  const base = getSchoolAdminBasePath(school, pathname, hostname);
  return section ? `${base}/${section}` : base;
}

export function getSchoolSetupPath(
  school: string,
  pathname: string,
  hostname: string
) {
  return `${getSchoolAdminPath(school, pathname, hostname)}/setup/welcome`;
}

export function getSchoolSetupStepPath(
  school: string,
  pathname: string,
  hostname: string,
  step: string
) {
  const visibleStep = step === "complete" ? "launch" : step;
  return `${getSchoolAdminPath(school, pathname, hostname)}/setup/${visibleStep}`;
}

export function getSchoolLoginDestination(
  school: string,
  pathname: string,
  hostname: string,
  setupComplete: boolean
) {
  return setupComplete
    ? getSchoolAdminPath(school, pathname, hostname)
    : getSchoolSetupPath(school, pathname, hostname);
}

export function getAdminUtilityPath(pathname: string, hostname: string, path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (isLocalhost(hostname) && pathname.startsWith("/admin")) {
    return `/admin${normalizedPath}`;
  }

  return normalizedPath;
}
