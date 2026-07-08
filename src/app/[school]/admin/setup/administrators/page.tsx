import { DEFAULT_ADMIN_PERMISSIONS } from "@/lib/adminDefaultPermissions";
import SetupLayout from "../setup-layout";
import { getSetupContext } from "../context";

type AdministratorsPageProps = {
  params: Promise<{ school: string }>;
};

export default async function AdministratorsSetupPage({
  params,
}: AdministratorsPageProps) {
  const { school } = await params;
  const context = await getSetupContext(school);

  return (
    <SetupLayout
      school={school}
      schoolName={context.schoolData.name}
      currentStep="administrators"
      nextStep="schedule"
    >
      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-[#242424]">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
          Step 4
        </p>
        <h2 className="mt-2 text-2xl font-bold">Admin Users</h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Invite administrators and editors. Invite delivery will be wired later.
        </p>
        <div className="mt-5 grid gap-5 md:grid-cols-[1fr_14rem]">
          <label className="text-sm font-semibold">
            Admin or Editor Emails
            <textarea
              name="adminEmails"
              rows={4}
              placeholder="assistant-principal@school.edu"
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 font-normal text-slate-950 dark:border-slate-700 dark:bg-black dark:text-white"
            />
          </label>
          <label className="text-sm font-semibold">
            Role
            <select
              name="adminRole"
              className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 font-normal text-slate-950 dark:border-slate-700 dark:bg-black dark:text-white"
            >
              <option value="school_admin">Administrator</option>
              <option value="editor">Editor</option>
            </select>
          </label>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {DEFAULT_ADMIN_PERMISSIONS.map((permission) => (
            <label
              key={permission.key}
              className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"
            >
              <input
                type="checkbox"
                name="permissions"
                value={permission.key}
                defaultChecked
              />
              {permission.label}
            </label>
          ))}
        </div>
      </section>
    </SetupLayout>
  );
}
