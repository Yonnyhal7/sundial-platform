import { redirect } from "next/navigation";
import { getSchoolSetupStepPath } from "@/lib/auth/adminPermissions";
import { normalizeSetupStep } from "@/lib/setupSteps";
import { getSetupContext } from "./context";

type SetupRootPageProps = {
  params: Promise<{ school: string }>;
};

export default async function SchoolSetupRootPage({ params }: SetupRootPageProps) {
  const { school } = await params;
  const context = await getSetupContext(school);

  redirect(
    await getSchoolSetupStepPath(
      school,
      normalizeSetupStep(context.schoolData.setup_step)
    )
  );
}
