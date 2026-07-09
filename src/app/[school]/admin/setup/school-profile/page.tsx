import SetupLayout from "../setup-layout";
import { getSetupContext } from "../context";
import SetupLogoUploadField from "./setup-logo-upload-field";
import { setupAccent } from "@/lib/ui/setupStyles";

type SchoolProfilePageProps = {
  params: Promise<{ school: string }>;
};

function Field({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
}) {
  return (
    <label className="block text-sm">
      <span className="font-bold text-slate-700 dark:text-slate-200">
        {label}
      </span>
      <input
        name={name}
        defaultValue={defaultValue || ""}
        className={[
          "mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none transition dark:border-[#3a3a3a] dark:bg-[#242424] dark:text-white",
          setupAccent.focus,
        ].join(" ")}
      />
    </label>
  );
}

export default async function SchoolProfileSetupPage({
  params,
}: SchoolProfilePageProps) {
  const { school } = await params;
  const context = await getSetupContext(school);

  return (
    <SetupLayout
      school={school}
      schoolName={context.schoolData.name}
      currentStep="school-profile"
      nextStep="appearance"
    >
      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424] lg:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
          Step 2
        </p>
        <h2 className="mt-2 text-2xl font-bold">School Profile</h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Let&apos;s start with your school&apos;s basic information.
        </p>

        <div className="mt-6 grid gap-6 lg:grid-cols-3 lg:items-start">
          <div className="space-y-5 lg:col-span-2">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                label="School Name"
                name="schoolName"
                defaultValue={context.schoolData.name}
              />
              <Field
                label="District Name"
                name="districtName"
                defaultValue={context.district?.name}
              />
            </div>
            <Field
              label="Mascot"
              name="mascot"
              defaultValue={context.schoolData.mascot}
            />
          </div>

          <SetupLogoUploadField
            school={school}
            schoolName={context.schoolData.name}
            initialLogoUrl={context.logoUrl}
          />
        </div>
      </section>
    </SetupLayout>
  );
}
