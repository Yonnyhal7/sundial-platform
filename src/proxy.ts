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

  // sundialk12.com -> marketing/public product site.
  if (parsedHost.kind === "marketing") {
    return NextResponse.next();
  }

  // admin.sundialk12.com is reserved and must never be treated as a school
  // subdomain. It only exposes SuperAdmin routes and must run before generic
  // school subdomain handling.
  if (parsedHost.kind === "admin") {
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

    if (
      pathname === "/admin" ||
      pathname === "/admin/dashboard" ||
      pathname.startsWith("/admin/dashboard/") ||
      pathname === "/admin/select-school" ||
      pathname.startsWith("/admin/select-school/")
    ) {
      return NextResponse.next();
    }

    url.pathname = "/admin/dashboard";
    return NextResponse.redirect(url);
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
