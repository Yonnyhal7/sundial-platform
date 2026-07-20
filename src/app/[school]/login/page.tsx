import { notFound } from "next/navigation";
import LoginForm from "./login-form";
import { getSchoolForSetup, getSchoolSetupStatus } from "@/lib/schools";

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ school: string }>;
  searchParams: Promise<{ passwordUpdated?: string }>;
}) {
  const { school } = await params;
  const schoolData = await getSchoolForSetup(school);

  if (!schoolData) {
    notFound();
  }

  return (
    <LoginForm
      school={school}
      setupComplete={getSchoolSetupStatus(schoolData) === "active"}
      passwordUpdated={(await searchParams).passwordUpdated === "1"}
    />
  );
}
