function canonicalBaseUrl(rawUrl: string) {
  const value = rawUrl.trim();
  if (!value) throw new Error("SUNDIAL_ADMIN_URL is required.");

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("SUNDIAL_ADMIN_URL must be a valid absolute URL.");
  }

  if (!new Set(["http:", "https:"]).has(url.protocol)) {
    throw new Error("SUNDIAL_ADMIN_URL must use http or https.");
  }

  url.pathname = url.pathname.replace(/\/$/, "");
  url.search = "";
  url.hash = "";
  return url;
}

export function getCanonicalSchoolSetupInvitationUrl({
  adminUrl,
  token,
}: {
  adminUrl: string;
  token: string;
}) {
  const base = canonicalBaseUrl(adminUrl);
  const prefix = base.pathname === "/" ? "" : base.pathname.replace(/\/$/, "");
  base.pathname = `${prefix}/invitations`;
  base.hash = `token=${encodeURIComponent(token)}`;
  return base.toString();
}

export function getCanonicalSchoolLoginUrl({
  adminUrl,
  schoolSubdomain,
}: {
  adminUrl: string;
  schoolSubdomain: string;
}) {
  const base = canonicalBaseUrl(adminUrl);
  const prefix = base.pathname === "/" ? "" : base.pathname.replace(/\/$/, "");
  base.pathname = `${prefix}/${encodeURIComponent(schoolSubdomain)}/login`;
  return base.toString();
}

export function getCanonicalPasswordRecoveryUrl({
  adminUrl,
  returnPath,
}: {
  adminUrl: string;
  returnPath: string;
}) {
  const base = canonicalBaseUrl(adminUrl);
  const safeReturnPath = validatePasswordRecoveryReturnPath(returnPath);
  const prefix = base.pathname === "/" ? "" : base.pathname.replace(/\/$/, "");
  base.pathname = `${prefix}/auth/recovery`;
  base.searchParams.set("returnTo", safeReturnPath);
  return base.toString();
}

export function validatePasswordRecoveryReturnPath(value: string | null | undefined) {
  if (!value) return "/admin";
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return "/admin";
  }
  if (decoded === "/admin") return decoded;
  if (/^\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\/login$/.test(decoded)) {
    return decoded;
  }
  return "/admin";
}
