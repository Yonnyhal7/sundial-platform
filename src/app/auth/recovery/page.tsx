import PasswordRecoveryForm from "@/components/admin/PasswordRecoveryForm";
import { validatePasswordRecoveryReturnPath } from "@/lib/routing/canonicalUrls";
import { getSchoolForgotPasswordPath } from "@/lib/routing/paths";

export default async function RecoveryPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const returnTo = validatePasswordRecoveryReturnPath((await searchParams).returnTo);
  const match = returnTo.match(/^\/([^/]+)\/login$/);
  const requestHref = match ? getSchoolForgotPasswordPath(match[1]) : "/admin/forgot-password";
  return <PasswordRecoveryForm returnTo={returnTo} requestHref={requestHref} />;
}
