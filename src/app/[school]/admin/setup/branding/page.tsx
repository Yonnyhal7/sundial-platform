import { redirect } from "next/navigation";
import { getSchoolSetupStepPath } from "@/lib/auth/adminPermissions";

type BrandingRedirectPageProps = {
  params: Promise<{ school: string }>;
};

export default async function BrandingRedirectPage({
  params,
}: BrandingRedirectPageProps) {
  const { school } = await params;
  redirect(await getSchoolSetupStepPath(school, "appearance"));
}
