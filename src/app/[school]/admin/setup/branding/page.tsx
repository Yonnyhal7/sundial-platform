import SetupLayout from "../setup-layout";
import { getSetupContext } from "../context";

type BrandingPageProps = {
  params: Promise<{ school: string }>;
};

export default async function BrandingSetupPage({ params }: BrandingPageProps) {
  const { school } = await params;
  const context = await getSetupContext(school);

  return (
    <SetupLayout
      school={school}
      schoolName={context.schoolData.name}
      currentStep="branding"
      nextStep="administrators"
    >
      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-[#242424]">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
          Step 3
        </p>
        <h2 className="mt-2 text-2xl font-bold">Branding</h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Choose the colors and default appearance for your school experience.
        </p>
        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <label className="text-sm font-semibold">
            Primary Color
            <input
              name="primaryColor"
              type="color"
              defaultValue={context.schoolData.primary_color || "#2563eb"}
              className="mt-2 h-12 w-full rounded-lg border border-slate-300 bg-white p-1 dark:border-slate-700 dark:bg-black"
            />
          </label>
          <label className="text-sm font-semibold">
            Secondary Color
            <input
              name="secondaryColor"
              type="color"
              defaultValue={context.schoolData.secondary_color || "#64748b"}
              className="mt-2 h-12 w-full rounded-lg border border-slate-300 bg-white p-1 dark:border-slate-700 dark:bg-black"
            />
          </label>
          <label className="text-sm font-semibold">
            Website Theme
            <select
              name="websiteTheme"
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 font-normal text-slate-950 dark:border-slate-700 dark:bg-black dark:text-white"
            >
              <option value="standard">Standard</option>
              <option value="bold">Bold</option>
              <option value="minimal">Minimal</option>
            </select>
          </label>
          <label className="text-sm font-semibold">
            Default Appearance
            <select
              name="defaultAppearance"
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 font-normal text-slate-950 dark:border-slate-700 dark:bg-black dark:text-white"
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
        </div>
      </section>
    </SetupLayout>
  );
}
