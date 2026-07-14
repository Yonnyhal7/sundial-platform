"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AdminLogoutButton({
  school,
  compact = false,
}: {
  school: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    await supabase.auth.signOut();
    router.push(`/${school}/login`);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={pending}
      className={[
        "cursor-pointer rounded-lg border border-white/15 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-wait disabled:opacity-60",
        compact ? "px-3 py-2" : "w-full px-4 py-3",
      ].join(" ")}
    >
      {pending ? "Signing out…" : "Sign Out"}
    </button>
  );
}
