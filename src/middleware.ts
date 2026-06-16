import { NextRequest, NextResponse } from "next/server";

const ROOT_DOMAIN =
  process.env.NEXT_PUBLIC_ROOT_DOMAIN || "localhost:3000";

export function middleware(req: NextRequest) {
  const host = req.headers.get("host") || "";
  const pathname = req.nextUrl.pathname;

  let subdomain: string | null = null;

  // localhost support
  if (host.includes("localhost")) {
    const parts = host.split(".");
    if (parts.length > 1) {
      subdomain = parts[0];
    }
  } else {
    if (host.endsWith(ROOT_DOMAIN)) {
      const sub = host.replace(`.${ROOT_DOMAIN}`, "");
      if (sub !== ROOT_DOMAIN) {
        subdomain = sub;
      }
    }
  }

  // Ignore system routes
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Root domain → marketing site
  if (!subdomain || subdomain === "www") {
    return NextResponse.next();
  }

  // Rewrite tenant route
  const url = req.nextUrl.clone();
  url.pathname = `/${subdomain}${pathname}`;

  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};