import { NextRequest, NextResponse } from "next/server";
import {
  getForwardedHost,
  isReservedSchoolSlug,
  isSundialMarketingHostname,
  isSystemPath,
  parseSundialHost,
} from "@/lib/routing/hosts";
import { getTenantAvailability } from "@/lib/routing/tenantAvailability";

const RESERVED_ADMIN_PATHS = new Set([
  "admin",
  "api",
  "dashboard",
  "invitations",
  "forgot-password",
  "schools",
  "select-school",
  "status",
  "support",
  "www",
]);

function routingDiagnosticsEnabled() {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.SUNDIAL_ROUTING_DEBUG === "true"
  );
}

function logRoutingDecision({
  hostname,
  kind,
  school,
  action,
  destination,
}: {
  hostname: string;
  kind: string;
  school: string | null;
  action: "next" | "rewrite" | "redirect";
  destination: string | null;
}) {
  if (!routingDiagnosticsEnabled()) return;
  console.info("[Sundial tenant routing]", {
    hostname,
    hostKind: kind,
    tenantSlug: school,
    action,
    destination,
  });
}

export async function proxy(req: NextRequest) {
  const host = getForwardedHost(req.headers);
  const pathname = req.nextUrl.pathname;

  // Ignore framework, API, and static asset routes.
  if (isSystemPath(pathname)) {
    return NextResponse.next();
  }

  const parsedHost = parseSundialHost(host);
  const url = req.nextUrl.clone();

  function diagnose(
    action: "next" | "rewrite" | "redirect",
    destination: URL | null = null,
    school: string | null = "school" in parsedHost ? parsedHost.school : null
  ) {
    logRoutingDecision({
      hostname: parsedHost.hostname,
      kind: parsedHost.kind,
      school,
      action,
      destination: destination?.toString() ?? null,
    });
  }

  function rewritePreservingHost(destination: URL) {
    const requestHeaders = new Headers(req.headers);

    requestHeaders.set("x-sundial-forwarded-host", host);
    requestHeaders.set("x-sundial-pathname", pathname);
    requestHeaders.set("x-forwarded-host", host);

    return NextResponse.rewrite(destination, {
      request: {
        headers: requestHeaders,
      },
    });
  }

  function nextPreservingPath() {
    const requestHeaders = new Headers(req.headers);

    requestHeaders.set("x-sundial-forwarded-host", host);
    requestHeaders.set("x-sundial-pathname", pathname);
    requestHeaders.set("x-forwarded-host", host);

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  // sundialk12.com -> marketing/public product site.
  if (parsedHost.kind === "marketing") {
    const [school, ...rest] = pathname.split("/").filter(Boolean);

    if (
      school &&
      isSundialMarketingHostname(parsedHost.hostname) &&
      !isReservedSchoolSlug(school) &&
      (await getTenantAvailability(school)) === "available"
    ) {
      const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "sundialk12.com";
      url.protocol = "https:";
      url.hostname = `${school}.${rootDomain}`;
      url.port = "";
      url.pathname = rest.length ? `/${rest.join("/")}` : "/";
      diagnose("redirect", url, school);
      return NextResponse.redirect(url, 308);
    }

    diagnose("next", null, school || null);
    return nextPreservingPath();
  }

  // admin.sundialk12.com is reserved and must never be treated as a school
  // subdomain. It only exposes SuperAdmin routes and must run before generic
  // school subdomain handling.
  if (parsedHost.kind === "admin") {
    if (pathname === "/auth/recovery") {
      return nextPreservingPath();
    }

    if (pathname === "/forgot-password") {
      url.pathname = "/admin/forgot-password";
      return rewritePreservingHost(url);
    }

    if (pathname === "/admin/forgot-password") {
      url.pathname = "/forgot-password";
      return NextResponse.redirect(url);
    }
    if (pathname === "/") {
      url.pathname = "/admin";
      return NextResponse.rewrite(url);
    }

    if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
      url.pathname = `/admin${pathname}`;
      return NextResponse.rewrite(url);
    }

    if (pathname === "/schools" || pathname.startsWith("/schools/")) {
      url.pathname = `/admin/dashboard${pathname}`;
      return NextResponse.rewrite(url);
    }

    if (pathname === "/select-school" || pathname.startsWith("/select-school/")) {
      url.pathname = `/admin${pathname}`;
      return NextResponse.rewrite(url);
    }

    if (pathname === "/invitations" || pathname.startsWith("/invitations/")) {
      url.pathname = `/admin${pathname}`;
      return rewritePreservingHost(url);
    }

    // Keep internal /admin/* paths out of the visible admin-subdomain URL.
    if (pathname === "/admin") {
      url.pathname = "/";
      return NextResponse.redirect(url);
    }

    if (pathname === "/admin/dashboard") {
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }

    if (pathname.startsWith("/admin/dashboard/")) {
      url.pathname = pathname.replace(/^\/admin\/dashboard/, "/dashboard");
      return NextResponse.redirect(url);
    }

    if (pathname === "/admin/select-school") {
      url.pathname = "/select-school";
      return NextResponse.redirect(url);
    }

    if (pathname.startsWith("/admin/select-school/")) {
      url.pathname = pathname.replace(/^\/admin\/select-school/, "/select-school");
      return NextResponse.redirect(url);
    }

    const segments = pathname.split("/").filter(Boolean);
    const [school, section, ...rest] = segments;

    if (
      segments.length === 1 &&
      school &&
      !RESERVED_ADMIN_PATHS.has(school)
    ) {
      url.pathname = `/${school}/dashboard`;
      return NextResponse.redirect(url);
    }

    if (school && section === "admin" && !RESERVED_ADMIN_PATHS.has(school)) {
      url.pathname = `/${school}/dashboard${rest.length ? `/${rest.join("/")}` : ""}`;
      return NextResponse.redirect(url);
    }

    if (school && section === "dashboard" && !RESERVED_ADMIN_PATHS.has(school)) {
      url.pathname = `/${school}/admin${rest.length ? `/${rest.join("/")}` : ""}`;
      return rewritePreservingHost(url);
    }

    if (school && section === "login" && !RESERVED_ADMIN_PATHS.has(school)) {
      return NextResponse.next();
    }

    url.pathname = "/admin/dashboard";
    return NextResponse.redirect(url);
  }

  // localhost:3000/admin/:school/* mirrors admin.sundialk12.com/:school/*.
  if (parsedHost.kind === "dev" && (pathname === "/admin" || pathname.startsWith("/admin/"))) {
    const [, , school, ...rest] = pathname.split("/");

    if (!school) {
      return nextPreservingPath();
    }

    if (school === "dashboard" || school === "select-school" || school === "invitations" || school === "forgot-password") {
      return nextPreservingPath();
    }

    url.pathname = `/${school}/admin${rest.length ? `/${rest.join("/")}` : ""}`;
    return NextResponse.rewrite(url);
  }

  // [school].sundialk12.com/* -> /[school]/*.
  // Local subdomains such as deloro.localhost:3000 are also supported.
  if (parsedHost.kind === "school" || (parsedHost.kind === "dev" && parsedHost.school)) {
    const school = parsedHost.school;
    if (!school) return nextPreservingPath();
    const schoolPath = `/${school}`;

    if ((await getTenantAvailability(school)) !== "available") {
      // Preserve the existing dynamic-route not-found/unavailable behavior.
      url.pathname = `${schoolPath}${pathname === "/" ? "" : pathname}`;
      diagnose("rewrite", url, school);
      return rewritePreservingHost(url);
    }

    if (pathname === schoolPath || pathname.startsWith(`${schoolPath}/`)) {
      url.pathname = pathname.slice(schoolPath.length) || "/";
      diagnose("redirect", url, school);
      return NextResponse.redirect(url, 308);
    }

    url.pathname = `${schoolPath}${pathname === "/" ? "" : pathname}`;
    diagnose("rewrite", url, school);
    return rewritePreservingHost(url);
  }

  // Plain localhost keeps the existing path-based development routes:
  // /deloro, /deloro/app, /deloro/kiosk, /deloro/admin, and /admin/deloro.
  return nextPreservingPath();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
