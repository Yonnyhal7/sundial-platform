import "server-only";
import { getCanonicalPasswordRecoveryUrl } from "@/lib/routing/canonicalUrls";

export function getPasswordRecoveryRedirectUrl(returnPath: string) {
  const adminUrl = process.env.SUNDIAL_ADMIN_URL || (process.env.NODE_ENV === "development" ? "http://localhost:3000" : "");
  if (!adminUrl) throw new Error("SUNDIAL_ADMIN_URL is required for password recovery.");
  return getCanonicalPasswordRecoveryUrl({ adminUrl, returnPath });
}
