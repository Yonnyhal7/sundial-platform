"use client";

import SchoolLogoUploadField from "@/components/admin/SchoolLogoUploadField";
import { updateSchoolLogoAction, uploadSchoolLogoAction } from "./actions";

type LogoUploadFieldProps = {
  school: string;
  schoolName: string;
  initialLogoUrl: string | null;
};

export default function LogoUploadField({
  school,
  schoolName,
  initialLogoUrl,
}: LogoUploadFieldProps) {
  return (
    <SchoolLogoUploadField
      school={school}
      schoolName={schoolName}
      initialLogoUrl={initialLogoUrl}
      uploadAction={uploadSchoolLogoAction}
      updateAction={updateSchoolLogoAction}
      uploadButtonClassName="cursor-pointer rounded-xl bg-[var(--school-primary)] px-4 py-2.5 text-sm font-bold text-[var(--school-primary-text)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
    />
  );
}
