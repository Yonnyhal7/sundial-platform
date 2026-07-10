export type RequestRouteKind = "marketing" | "admin" | "school" | "dev";

export type ParsedHost =
  | {
      kind: "marketing";
      hostname: string;
    }
  | {
      kind: "admin";
      hostname: string;
    }
  | {
      kind: "school";
      hostname: string;
      school: string;
    }
  | {
      kind: "dev";
      hostname: string;
      school: string | null;
    };

const LOCALHOST_NAMES = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const RESERVED_SUBDOMAINS = new Set([
  "admin",
  "api",
  "app",
  "dashboard",
  "select-school",
  "status",
  "support",
  "www",
]);

function normalizeHostname(host: string) {
  const forwardedHost = host.split(",")[0]?.trim() || "";

  if (forwardedHost.startsWith("[")) {
    const closingBracketIndex = forwardedHost.indexOf("]");
    return closingBracketIndex === -1
      ? forwardedHost.toLowerCase()
      : forwardedHost.slice(0, closingBracketIndex + 1).toLowerCase();
  }

  return forwardedHost.split(":")[0]?.toLowerCase() || "";
}

function normalizeRootDomain(rootDomain: string) {
  return normalizeHostname(rootDomain).replace(/^\./, "");
}

export function getForwardedHost(headers: Pick<Headers, "get">) {
  return (
    headers.get("x-sundial-forwarded-host") ??
    headers.get("x-forwarded-host") ??
    headers.get("host") ??
    ""
  );
}

function parseLocalDevelopmentHost(hostname: string): ParsedHost | null {
  if (LOCALHOST_NAMES.has(hostname)) {
    return { kind: "dev", hostname, school: null };
  }

  for (const localName of LOCALHOST_NAMES) {
    const suffix = `.${localName}`;

    if (hostname.endsWith(suffix)) {
      return {
        kind: "dev",
        hostname,
        school: hostname.slice(0, -suffix.length) || null,
      };
    }
  }

  return null;
}

export function parseSundialHost(
  host: string,
  rootDomain = process.env.NEXT_PUBLIC_ROOT_DOMAIN || "sundialk12.com"
): ParsedHost {
  const hostname = normalizeHostname(host);
  const devHost = parseLocalDevelopmentHost(hostname);

  if (devHost) {
    return devHost;
  }

  const normalizedRootDomain = normalizeRootDomain(rootDomain);

  if (hostname === normalizedRootDomain || hostname === `www.${normalizedRootDomain}`) {
    return { kind: "marketing", hostname };
  }

  if (hostname === `admin.${normalizedRootDomain}`) {
    return { kind: "admin", hostname };
  }

  const suffix = `.${normalizedRootDomain}`;

  if (hostname.endsWith(suffix)) {
    const school = hostname.slice(0, -suffix.length);

    if (school && !RESERVED_SUBDOMAINS.has(school)) {
      return { kind: "school", hostname, school };
    }
  }

  return { kind: "marketing", hostname };
}

export function isSystemPath(pathname: string) {
  return (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/favicon.ico" ||
    pathname.includes(".")
  );
}
