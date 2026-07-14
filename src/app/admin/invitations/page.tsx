import { cookies } from "next/headers";
import { getSchoolSetupInvitationViewFromSession } from "@/lib/invitations/acceptance.server";
import InvitationExperience from "./InvitationExperience";
import { SCHOOL_SETUP_ACCEPTANCE_COOKIE } from "@/lib/invitations/constants";

export default async function SchoolSetupInvitationPage() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SCHOOL_SETUP_ACCEPTANCE_COOKIE)?.value;
  const initialView = sessionToken
    ? await getSchoolSetupInvitationViewFromSession(sessionToken)
    : { status: "invalid" as const };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 px-6 py-12 text-slate-950">
      <section className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-8 shadow-xl">
        <p className="text-sm font-bold uppercase tracking-[0.24em] text-blue-600">Sundial</p>
        <InvitationExperience initialView={initialView} />
      </section>
    </main>
  );
}
