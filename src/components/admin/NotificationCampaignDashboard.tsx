"use client";

import Link from "next/link";
import { useCallback, useState, type ReactNode } from "react";
import NotificationCampaignList from "./NotificationCampaignList";

type Campaign = {
  id: string;
  title: string;
  body: string;
  status: string;
  scheduled_for: string | null;
  created_at: string;
  eligible_count: number;
  successful_count: number;
  failed_count: number;
  pending_count: number;
  cancelled_count: number;
  claim_token: string | null;
  claimed_at: string | null;
  delivery_resolution_required: boolean;
  archived_at: string | null;
  version: number;
};

export default function NotificationCampaignDashboard({
  campaigns,
  school,
  base,
  timeZone,
  view,
  devices,
  subscriptions,
  recentCampaigns,
  periodReminderCard,
}: {
  campaigns: Campaign[];
  school: string;
  base: string;
  timeZone: string;
  view: string;
  devices: number;
  subscriptions: number;
  recentCampaigns: number;
  periodReminderCard: ReactNode;
}) {
  const [activeCampaignCount, setActiveCampaignCount] = useState(recentCampaigns);
  const updateActiveCampaignCount = useCallback((delta: number) => {
    setActiveCampaignCount((count) => Math.max(0, count + delta));
  }, []);

  return (
    <>
      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border bg-white p-5 dark:border-[#3a3a3a] dark:bg-[#242424]">
          <p className="text-sm text-slate-500">Registered devices</p>
          <p className="mt-1 text-3xl font-black">{devices}</p>
        </div>
        <div className="rounded-2xl border bg-white p-5 dark:border-[#3a3a3a] dark:bg-[#242424]">
          <p className="text-sm text-slate-500">Active push subscriptions</p>
          <p className="mt-1 text-3xl font-black">{subscriptions}</p>
        </div>
        <div className="rounded-2xl border bg-white p-5 dark:border-[#3a3a3a] dark:bg-[#242424]">
          <p className="text-sm text-slate-500">Recent campaigns</p>
          <p className="mt-1 text-3xl font-black">{activeCampaignCount}</p>
        </div>
      </section>
      {periodReminderCard}
      <nav className="mt-6 flex flex-wrap gap-2">
        {["overview", "action-required", "scheduled", "sent", "drafts", "archived"].map((item) => (
          <Link
            key={item}
            href={item === "overview" ? base : `${base}?view=${item}`}
            className={`rounded-full px-4 py-2 text-sm font-bold capitalize ${
              view === item
                ? "bg-slate-950 text-white dark:bg-white dark:text-black"
                : "border"
            }`}
          >
            {item === "action-required" ? "Action Required" : item}
          </Link>
        ))}
      </nav>
      <NotificationCampaignList
        campaigns={campaigns}
        school={school}
        base={base}
        timeZone={timeZone}
        onActiveCountChange={updateActiveCampaignCount}
      />
    </>
  );
}
