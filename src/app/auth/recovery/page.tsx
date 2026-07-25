import type { Metadata } from "next";
import PasswordRecoveryForm from "@/components/admin/PasswordRecoveryForm";
import { validatePasswordRecoveryReturnPath } from "@/lib/routing/canonicalUrls";
import { getSchoolForgotPasswordPath } from "@/lib/routing/paths";
import { getSundialFaviconMetadata } from "@/lib/tenantFavicon";

export const metadata: Metadata = getSundialFaviconMetadata();

export default async function RecoveryPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const returnTo = validatePasswordRecoveryReturnPath((await searchParams).returnTo);
  const match = returnTo.match(/^\/([^/]+)\/login$/);
  const requestHref = match ? getSchoolForgotPasswordPath(match[1]) : "/admin/forgot-password";
  return <PasswordRecoveryForm returnTo={returnTo} requestHref={requestHref} />;
}
