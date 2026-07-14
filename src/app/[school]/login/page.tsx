import { notFound } from "next/navigation";
import LoginForm from "./login-form";
import { getSchoolForSetup, getSchoolSetupStatus } from "@/lib/schools";

export default async function LoginPage({
  params,
}: {
  params: Promise<{ school: string }>;
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
    />
  );
}
