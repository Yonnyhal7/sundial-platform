"use client";

import type { ReactNode } from "react";
import OfflineStatusIndicator from "@/components/offline/OfflineStatusIndicator";
import OfflineStudentAppContent from "@/components/offline/OfflineStudentAppContent";
import {
  OfflineSchoolDataProvider,
  useOfflineSchoolData,
} from "@/lib/offline/useOfflineSchoolData";

function FirstLoadOfflineState() {
  return (
    <main className="grid min-h-[50vh] place-items-center">
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-[#3a3a3a] dark:bg-[#242424]">
        <p className="text-lg font-black text-slate-950 dark:text-white">
          Connect to the internet once to download this school&apos;s Sundial data.
        </p>
        <p className="mt-2 text-sm font-semibold text-slate-500 dark:text-[#a3a3a3]">
          After one successful sync, the app can reopen with cached read-only data.
        </p>
      </section>
    </main>
  );
}

function OfflineStudentAppBody({
  school,
  children,
}: {
  school: string;
  children: ReactNode;
}) {
  const { snapshot, syncState, isOnline, lastError } = useOfflineSchoolData();
  const shouldRenderSnapshot =
    Boolean(snapshot) && (!isOnline || syncState === "error");

  return (
    <>
      <OfflineStatusIndicator />
      {shouldRenderSnapshot && snapshot ? (
        <OfflineStudentAppContent school={school} snapshot={snapshot} />
      ) : !snapshot && (!isOnline || syncState === "offline-empty") ? (
        <FirstLoadOfflineState />
      ) : lastError && snapshot ? (
        <OfflineStudentAppContent school={school} snapshot={snapshot} />
      ) : (
        children
      )}
    </>
  );
}

export default function OfflineStudentAppRuntime({
  schoolId,
  school,
  children,
}: {
  schoolId: string;
  school: string;
  children: ReactNode;
}) {
  return (
    <OfflineSchoolDataProvider schoolId={schoolId} schoolSlug={school}>
      <OfflineStudentAppBody school={school}>{children}</OfflineStudentAppBody>
    </OfflineSchoolDataProvider>
  );
}
