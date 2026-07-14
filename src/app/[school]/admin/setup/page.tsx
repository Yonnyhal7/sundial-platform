import { redirect } from "next/navigation";
import { getSchoolSetupPath } from "@/lib/auth/adminPermissions";
import { getSetupContext } from "./context";

type SetupRootPageProps = {
  params: Promise<{ school: string }>;
};

export default async function SchoolSetupRootPage({ params }: SetupRootPageProps) {
  const { school } = await params;

  // Keep archive, authentication, tenant, role, and completion guards ahead of
  // the landing redirect. Explicit setup-step routes render independently.
  await getSetupContext(school);
  redirect(await getSchoolSetupPath(school));
}
