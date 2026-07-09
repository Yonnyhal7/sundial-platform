import SetupLayout from "../setup-layout";
import { getSetupContext } from "../context";
import BrandingFormContent from "../branding/branding-form-content";

type AppearancePageProps = {
  params: Promise<{ school: string }>;
};

export default async function AppearanceSetupPage({ params }: AppearancePageProps) {
  const { school } = await params;
  const context = await getSetupContext(school);

  return (
    <SetupLayout
      school={school}
      schoolName={context.schoolData.name}
      currentStep="appearance"
      nextStep="administrators"
    >
      <BrandingFormContent
        schoolName={context.schoolData.name}
        mascot={context.schoolData.mascot}
        logoUrl={context.logoUrl}
        initialPrimaryColor={context.schoolData.primary_color || "#2563eb"}
        initialSecondaryColor={context.schoolData.secondary_color || "#64748b"}
        initialDefaultAppearance="system"
      />
    </SetupLayout>
  );
}
