"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getAppTabs } from "@/lib/appTabs";

export default function AppRoutePrefetch({ school }: { school: string }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    for (const tab of getAppTabs(school, pathname)) {
      router.prefetch(tab.href);
    }
  }, [pathname, router, school]);

  return null;
}
