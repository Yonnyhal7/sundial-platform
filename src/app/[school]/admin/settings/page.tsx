import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import SchoolLogo from "@/components/SchoolLogo";
import {
  getSchoolAdminPath,
  getSchoolSetupStepPath,
  requireAdminPortalAccess,
} from "@/lib/auth/adminPermissions";
import { getSchoolForSetup, isSchoolSetupComplete } from "@/lib/schools";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/serviceRole";
import { isSchoolAdminRole, isSuperAdminRole } from "@/lib/userAccess";
import ColorField from "./color-field";
import { saveSchoolSettingsAction } from "./actions";
import LogoUploadField from "./logo-upload-field";

type SettingsPageProps = {
  params: Promise<{ school: string }>;
  searchParams: Promise<{ saved?: string }>;
};

type SchoolSettings = {
  id: string;
  name: string;
  mascot: string | null;
  district_id: string | null;
  district_name: string | null;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  default_appearance: "light" | "dark" | "system" | null;
  setup_complete: boolean | null;
  main_office: string | null;
  attendance_office: string | null;
  counseling_office: string | null;
  athletics_office: string | null;
  address: string | null;
  phone_number: string | null;
  school_website: string | null;
};

function Field({
  label,
  name,
  defaultValue,
  type = "text",
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
        {label}
      </span>
      <input
        name={name}
        type={type}
        defaultValue={defaultValue || ""}
        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-[var(--school-primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--school-primary)_20%,transparent)] dark:border-[#3a3a3a] dark:bg-[#242424] dark:text-white"
      />
    </label>
  );
}

function TextAreaField({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
}) {
  return (
    <label className="block">
      <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
        {label}
      </span>
      <textarea
        name={name}
        defaultValue={defaultValue || ""}
        rows={3}
        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-[var(--school-primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--school-primary)_20%,transparent)] dark:border-[#3a3a3a] dark:bg-[#242424] dark:text-white"
      />
    </label>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]">
      <h2 className="text-xl font-bold text-slate-950 dark:text-white">{title}</h2>
      <div className="mt-5 grid gap-5 md:grid-cols-2">{children}</div>
    </section>
  );
}

export default async function SchoolSettingsPage({
  params,
  searchParams,
}: SettingsPageProps) {
  const { school } = await params;
  const { saved } = await searchParams;
  const setupSchool = await getSchoolForSetup(school);

  if (!setupSchool) {
    notFound();
  }

  const adminUser = await requireAdminPortalAccess(setupSchool.id, school);
  const canManageSettings =
    isSuperAdminRole(adminUser.profile.role) ||
    isSchoolAdminRole(adminUser.profile.role);

  if (!canManageSettings) {
    redirect(await getSchoolAdminPath(school));
  }

  if (
    !isSuperAdminRole(adminUser.profile.role) &&
    !(await isSchoolSetupComplete(adminUser.supabase, setupSchool.id))
  ) {
    redirect(await getSchoolSetupStepPath(school, setupSchool.setup_step || "welcome"));
  }

  const serviceSupabase = createSupabaseServiceRoleClient();
  const { data: schoolData } = await serviceSupabase
    .from("schools")
    .select(
      `
      id,
      name,
      mascot,
      district_id,
      district_name,
      logo_url,
      primary_color,
      secondary_color,
      default_appearance,
      setup_complete,
      main_office,
      attendance_office,
      counseling_office,
      athletics_office,
      address,
      phone_number,
      school_website
    `
    )
    .eq("id", setupSchool.id)
    .maybeSingle<SchoolSettings>();

  if (!schoolData) {
    notFound();
  }

  const { data: district } = schoolData.district_id
    ? await serviceSupabase
        .from("districts")
        .select("name")
        .eq("id", schoolData.district_id)
        .maybeSingle<{ name: string }>()
    : { data: null };
  const districtName = schoolData.district_name || district?.name || "";

  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-900 dark:bg-black dark:text-slate-100 lg:p-10">
      <div className="mx-auto w-full max-w-5xl">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <SchoolLogo
              schoolName={schoolData.name}
              logoUrl={schoolData.logo_url}
              size="lg"
            />
            <div>
              <h1 className="text-4xl font-bold tracking-tight">Settings</h1>
              <p className="mt-2 text-base text-slate-500 dark:text-slate-300">
                Manage your school profile, appearance, and contact details.
              </p>
            </div>
          </div>

          {saved === "1" && (
            <p className="rounded-full bg-[color-mix(in_srgb,var(--school-primary)_12%,white)] px-4 py-2 text-sm font-bold text-[var(--school-primary)] dark:bg-[color-mix(in_srgb,var(--school-primary)_22%,#242424)]">
              Settings saved
            </p>
          )}
        </div>

        <form action={saveSchoolSettingsAction} className="mt-8 space-y-6">
          <input type="hidden" name="school" value={school} />

          <Section title="School Profile">
            <Field label="School Name" name="schoolName" defaultValue={schoolData.name} />
            <Field label="District Name" name="districtName" defaultValue={districtName} />
            <Field label="Mascot" name="mascot" defaultValue={schoolData.mascot} />
            <LogoUploadField
              school={school}
              schoolName={schoolData.name}
              initialLogoUrl={schoolData.logo_url}
            />
          </Section>

          <Section title="Appearance">
            <ColorField
              label="School Color"
              name="primaryColor"
              initialValue={schoolData.primary_color || "#2563eb"}
            />
            <ColorField
              label="Accent Color"
              name="secondaryColor"
              initialValue={schoolData.secondary_color || "#64748b"}
            />
            <label className="block md:col-span-2">
              <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                Default Appearance
              </span>
              <select
                name="defaultAppearance"
                defaultValue={schoolData.default_appearance || "system"}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-950 outline-none transition focus:border-[var(--school-primary)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--school-primary)_20%,transparent)] dark:border-[#3a3a3a] dark:bg-[#242424] dark:text-white"
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="system">System</option>
              </select>
            </label>
          </Section>

          <Section title="Support/Contact">
            <Field label="Main Office" name="mainOffice" defaultValue={schoolData.main_office} />
            <Field label="Attendance Office" name="attendanceOffice" defaultValue={schoolData.attendance_office} />
            <Field label="Counseling Office" name="counselingOffice" defaultValue={schoolData.counseling_office} />
            <Field label="Athletics Office" name="athleticsOffice" defaultValue={schoolData.athletics_office} />
            <TextAreaField label="Address" name="address" defaultValue={schoolData.address} />
            <Field label="Phone Number" name="phoneNumber" defaultValue={schoolData.phone_number} />
            <Field label="School Website" name="schoolWebsite" defaultValue={schoolData.school_website} />
          </Section>

          <div className="flex justify-end">
            <button
              type="submit"
              className="cursor-pointer rounded-xl bg-[var(--school-primary)] px-6 py-3 text-sm font-bold text-[var(--school-primary-text)] shadow-sm transition hover:opacity-90"
            >
              Save Settings
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
