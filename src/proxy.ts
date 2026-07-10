import { NextRequest, NextResponse } from "next/server";
import {
  getForwardedHost,
  isSystemPath,
  parseSundialHost,
} from "@/lib/routing/hosts";

export function proxy(req: NextRequest) {
  const host = getForwardedHost(req.headers);
  const pathname = req.nextUrl.pathname;

  // Ignore framework, API, and static asset routes.
  if (isSystemPath(pathname)) {
    return NextResponse.next();
  }

  const parsedHost = parseSundialHost(host);
  const url = req.nextUrl.clone();
  const rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "sundialk12.com";
  const canonicalAdminHost = `www.${rootDomain}`;

  function redirectToCanonicalSchoolAdmin(
    school: string,
    restSegments: string[] = []
  ) {
    const destination = new URL(`https://${canonicalAdminHost}`);

    destination.pathname = `/${school}/admin${
      restSegments.length ? `/${restSegments.join("/")}` : ""
    }`;
    destination.search = req.nextUrl.search;

    return NextResponse.redirect(destination);
  }

  // sundialk12.com -> marketing/public product site.
  if (parsedHost.kind === "marketing") {
    if (parsedHost.hostname === `www.${rootDomain}` && pathname.startsWith("/admin/")) {
      const [, , school, ...rest] = pathname.split("/");

      if (school && school !== "dashboard" && school !== "select-school") {
        return redirectToCanonicalSchoolAdmin(school, rest);
      }
    }

    return NextResponse.next();
  }

  // admin.sundialk12.com is reserved and must never be treated as a school
  // subdomain. School admin paths redirect to the canonical /:school/admin URL.
  // This branch must run before generic school subdomain handling so the
  // reserved "admin" subdomain is never interpreted as a school tenant.
  if (parsedHost.kind === "admin") {
    if (
      pathname === "/admin" ||
      pathname === "/admin/dashboard" ||
      pathname.startsWith("/admin/dashboard/") ||
      pathname === "/admin/select-school" ||
      pathname.startsWith("/admin/select-school/")
    ) {
      return NextResponse.next();
    }

    if (pathname.startsWith("/admin/")) {
      const [, , school, ...rest] = pathname.split("/");

      if (!school) {
        return NextResponse.next();
      }

      if (school !== "dashboard" && school !== "select-school") {
        return redirectToCanonicalSchoolAdmin(school, rest);
      }
    }

    if (pathname === "/") {
      return NextResponse.redirect(new URL(`https://${canonicalAdminHost}`));
    }

    if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
      url.pathname = `/admin${pathname}`;
      return NextResponse.rewrite(url);
    }

    if (pathname === "/select-school" || pathname.startsWith("/select-school/")) {
      url.pathname = `/admin${pathname}`;
      return NextResponse.rewrite(url);
    }

    const [, school, maybeAdmin, ...rest] = pathname.split("/");

    if (!school) {
      return NextResponse.redirect(new URL(`https://${canonicalAdminHost}`));
    }

    return redirectToCanonicalSchoolAdmin(
      school,
      maybeAdmin === "admin"
        ? rest
        : maybeAdmin
          ? [maybeAdmin, ...rest]
          : []
    );
  }

  // localhost:3000/admin/:school/* mirrors admin.sundialk12.com/:school/*.
  if (parsedHost.kind === "dev" && (pathname === "/admin" || pathname.startsWith("/admin/"))) {
    const [, , school, ...rest] = pathname.split("/");

    if (!school) {
      return NextResponse.next();
    }

    if (school === "dashboard" || school === "select-school") {
      return NextResponse.next();
    }

    url.pathname = `/${school}/admin${rest.length ? `/${rest.join("/")}` : ""}`;
    return NextResponse.rewrite(url);
  }

  // [school].sundialk12.com/* -> /[school]/*.
  // Local subdomains such as deloro.localhost:3000 are also supported.
  if (parsedHost.kind === "school" || (parsedHost.kind === "dev" && parsedHost.school)) {
    const school = parsedHost.school;
    const schoolPath = `/${school}`;

    if (pathname === schoolPath || pathname.startsWith(`${schoolPath}/`)) {
      return NextResponse.next();
    }

    url.pathname = `${schoolPath}${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(url);
  }

  // Plain localhost keeps the existing path-based development routes:
  // /deloro, /deloro/app, /deloro/kiosk, /deloro/admin, and /admin/deloro.
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
