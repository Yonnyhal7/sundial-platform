import {
  getOrSeedAdminPermissions,
  type PermissionRow,
} from "@/lib/adminDefaultPermissions";
import { getSchoolSetupStepPath } from "@/lib/auth/adminPermissions";
import { updateSchoolSetupStep } from "@/lib/schools";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/serviceRole";
import { getSetupStepIndex } from "@/lib/setupSteps";
import { getPermissionLabel, PRIORITY_PERMISSION_LABELS } from "@/lib/userAccess";
import { redirect } from "next/navigation";
import SetupLayout from "../setup-layout";
import { getSetupContext } from "../context";
import UsersFormContent from "./users-form-content";

type AdministratorsPageProps = {
  params: Promise<{ school: string }>;
};

function sortPermissions(permissions: PermissionRow[]) {
  return [...permissions].sort((a, b) => {
    const aLabel = getPermissionLabel(a);
    const bLabel = getPermissionLabel(b);
    const aPriority = PRIORITY_PERMISSION_LABELS.indexOf(aLabel);
    const bPriority = PRIORITY_PERMISSION_LABELS.indexOf(bLabel);

    if (aPriority !== -1 || bPriority !== -1) {
      return (aPriority === -1 ? 999 : aPriority) - (bPriority === -1 ? 999 : bPriority);
    }

    return aLabel.localeCompare(bLabel);
  });
}

export default async function AdministratorsSetupPage({
  params,
}: AdministratorsPageProps) {
  const { school } = await params;
  const context = await getSetupContext(school);
  const savedStepIndex = getSetupStepIndex(context.savedStep);
  const usersStepIndex = getSetupStepIndex("administrators");

  if (savedStepIndex < usersStepIndex) {
    const serviceSupabase = createSupabaseServiceRoleClient();
    await updateSchoolSetupStep(
      serviceSupabase,
      context.schoolData.id,
      "administrators"
    );
    redirect(await getSchoolSetupStepPath(school, "administrators"));
  }

  const permissions = sortPermissions(await getOrSeedAdminPermissions());

  return (
    <SetupLayout
      school={school}
      schoolName={context.schoolData.name}
      currentStep="administrators"
      nextStep="schedule"
    >
      <UsersFormContent
        permissions={permissions}
        initialUsers={context.pendingSetupUsers}
      />
    </SetupLayout>
  );
}
