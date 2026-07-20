import { notFound } from "next/navigation";
import ForgotPasswordForm from "@/components/admin/ForgotPasswordForm";
import { getSchoolForSetup } from "@/lib/schools";
import { getPasswordRecoveryRedirectUrl } from "@/lib/auth/passwordRecovery.server";
import { getSchoolLoginPath } from "@/lib/routing/paths";

export default async function SchoolForgotPasswordPage({ params }: { params: Promise<{ school: string }> }) {
  const { school } = await params;
  if (!await getSchoolForSetup(school)) notFound();
  const signInHref = getSchoolLoginPath(school);
  return <ForgotPasswordForm signInHref={signInHref} redirectTo={getPasswordRecoveryRedirectUrl(signInHref)} />;
}
