"use client";

import SchoolLogoUploadField from "@/components/admin/SchoolLogoUploadField";
import { setupPrimaryButtonClass } from "@/lib/ui/setupStyles";
import { updateSetupLogoAction, uploadSetupLogoAction } from "../actions";

type SetupLogoUploadFieldProps = {
  school: string;
  schoolName: string;
  initialLogoUrl: string | null;
};

export default function SetupLogoUploadField({
  school,
  schoolName,
  initialLogoUrl,
}: SetupLogoUploadFieldProps) {
  return (
    <SchoolLogoUploadField
      school={school}
      schoolName={schoolName}
      initialLogoUrl={initialLogoUrl}
      uploadAction={uploadSetupLogoAction}
      updateAction={updateSetupLogoAction}
      uploadButtonClassName={setupPrimaryButtonClass("cursor-pointer rounded-xl px-4 py-2.5")}
      compact
    />
  );
}
