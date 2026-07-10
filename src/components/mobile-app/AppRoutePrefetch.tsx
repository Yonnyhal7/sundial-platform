"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function AppRoutePrefetch({ school }: { school: string }) {
  const router = useRouter();

  useEffect(() => {
    router.prefetch(`/${school}/app`);
    router.prefetch(`/${school}/app/schedule`);
    router.prefetch(`/${school}/app/events`);
    router.prefetch(`/${school}/app/athletics`);
  }, [router, school]);

  return null;
}
