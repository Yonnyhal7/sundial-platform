"use client";

import { useEffect, useState } from "react";
import { getCanonicalSchoolSetupInvitationUrl } from "@/lib/routing/canonicalUrls";

export default function CreatedSchoolNotice({
  created,
  subdomain,
  inviteDelivery,
  adminUrl,
}: {
  created: string;
  subdomain?: string;
  inviteDelivery?: string;
  adminUrl: string;
}) {
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const token = fragment.get("setupToken");
    if (!token) return;
    const currentFallbackUrl = getCanonicalSchoolSetupInvitationUrl({ adminUrl, token });
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    const update = window.setTimeout(() => setFallbackUrl(currentFallbackUrl), 0);
    return () => window.clearTimeout(update);
  }, [adminUrl]);

  return (
    <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-200">
      <p className="font-semibold">{created} was created and marked setup incomplete.</p>
      <p className="mt-1">
        {inviteDelivery === "sent"
          ? "The school administrator setup email was sent."
          : inviteDelivery === "record_failed"
            ? "The school was retained, but its setup invitation record could not be created."
            : "The school and invitation were retained, but the setup email was not delivered."}
      </p>
      {subdomain && (
        <div className="mt-2 space-y-1 font-mono text-xs">
          <p>{subdomain}.sundialk12.com</p>
          <p>admin.sundialk12.com/{subdomain}</p>
        </div>
      )}
      {fallbackUrl && (
        <div className="mt-3 rounded-md border border-emerald-200 bg-white/80 px-3 py-2 dark:border-emerald-800 dark:bg-emerald-950/70">
          <p className="text-xs font-semibold uppercase tracking-wide">
            Current password setup link
          </p>
          <p className="mt-1 break-all font-mono text-xs">{fallbackUrl}</p>
          <button
            type="button"
            className="mt-2 cursor-pointer text-xs font-bold text-blue-700 hover:text-blue-600 dark:text-blue-300"
            onClick={async () => {
              await navigator.clipboard.writeText(fallbackUrl);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? "Invitation link copied" : "Copy invitation link"}
          </button>
        </div>
      )}
    </div>
  );
}
