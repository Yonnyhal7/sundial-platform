export function isLocalhost(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1"
  );
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

export function getSchoolAdminBasePath(
  school: string,
  pathname: string,
  hostname: string
) {
  if (hostname.startsWith("admin.")) {
    return `/${school}`;
  }

  if (isLocalhost(hostname) && pathname.startsWith(`/admin/${school}`)) {
    return `/admin/${school}`;
  }

  return `/${school}/admin`;
}

export function getAdminUtilityPath(pathname: string, hostname: string, path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (isLocalhost(hostname) && pathname.startsWith("/admin")) {
    return `/admin${normalizedPath}`;
  }

  return normalizedPath;
}
