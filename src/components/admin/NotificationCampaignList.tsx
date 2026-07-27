"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  archiveNotificationCampaignAction,
  duplicateNotificationCampaignAction,
  permanentlyDeleteNotificationCampaignAction,
  restoreNotificationCampaignAction,
} from "@/app/[school]/admin/notifications/actions";
import {
  getCampaignDeliverySummary,
  getCampaignDisplayStatus,
  getCampaignStatusLabel,
} from "@/lib/notifications/campaignStatus";
import { formatTimestampInTimeZone } from "@/lib/timezones";
import {
  getCampaignMenuPosition,
  getNextCampaignMenuItemIndex,
} from "@/lib/notifications/campaignMenu";

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
  archived_at: string | null;
  version: number;
};

type MutationResult =
  | { ok: true }
  | { ok: false; error: string }
  | undefined;

const VIEWPORT_MARGIN = 10;
const MENU_GAP = 6;
const MENU_WIDTH = 192;

export default function NotificationCampaignList({
  campaigns,
  school,
  base,
  timeZone,
}: {
  campaigns: Campaign[];
  school: string;
  base: string;
  timeZone: string;
}) {
  const [openCampaignMenuId, setOpenCampaignMenuId] = useState<string | null>(null);
  const [confirmDeleteCampaignId, setConfirmDeleteCampaignId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState({ left: VIEWPORT_MARGIN, top: VIEWPORT_MARGIN });
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const triggerRefs = useRef(new Map<string, HTMLButtonElement>());
  const menuRef = useRef<HTMLDivElement>(null);
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  const openCampaign = campaigns.find(
    (campaign) => campaign.id === openCampaignMenuId
  ) || null;
  const deleteCampaign = campaigns.find(
    (campaign) => campaign.id === confirmDeleteCampaignId
  ) || null;

  const closeMenu = useCallback((restoreFocus: boolean) => {
    const campaignId = openCampaignMenuId;
    setOpenCampaignMenuId(null);
    if (restoreFocus && campaignId) {
      window.requestAnimationFrame(() => triggerRefs.current.get(campaignId)?.focus());
    }
  }, [openCampaignMenuId]);

  const positionMenu = useCallback(() => {
    if (!openCampaignMenuId) return;
    const trigger = triggerRefs.current.get(openCampaignMenuId);
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const height = menuRef.current?.offsetHeight || 136;
    const { left, top } = getCampaignMenuPosition({
      triggerLeft: rect.left,
      triggerRight: rect.right,
      triggerTop: rect.top,
      triggerBottom: rect.bottom,
      menuWidth: MENU_WIDTH,
      menuHeight: height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      margin: VIEWPORT_MARGIN,
      gap: MENU_GAP,
    });
    setMenuPosition({ left, top });
  }, [openCampaignMenuId]);

  useLayoutEffect(() => {
    if (!openCampaignMenuId) return;
    positionMenu();
    window.requestAnimationFrame(() => {
      const firstItem = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
      firstItem?.focus();
    });
  }, [openCampaignMenuId, positionMenu]);

  useEffect(() => {
    if (!openCampaignMenuId) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      const trigger = triggerRefs.current.get(openCampaignMenuId);
      if (menuRef.current?.contains(target) || trigger?.contains(target)) return;
      if (Array.from(triggerRefs.current.values()).some((item) => item.contains(target))) {
        return;
      }
      closeMenu(true);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeMenu(true);
    };
    const onScroll = () => closeMenu(true);
    const onResize = () => positionMenu();
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [closeMenu, openCampaignMenuId, positionMenu]);

  useEffect(() => {
    if (confirmDeleteCampaignId) cancelButtonRef.current?.focus();
  }, [confirmDeleteCampaignId]);

  function toggleMenu(campaignId: string) {
    setError("");
    setOpenCampaignMenuId((current) => current === campaignId ? null : campaignId);
  }

  function menuKeyboardNavigation(event: KeyboardEvent<HTMLDivElement>) {
    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>(
        '[role="menuitem"]:not([aria-disabled="true"])'
      ) || []
    );
    if (!items.length) return;
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    const nextIndex = getNextCampaignMenuItemIndex(
      event.key,
      currentIndex,
      items.length
    );
    if (nextIndex !== null) {
      event.preventDefault();
      items[nextIndex]?.focus();
      return;
    }
    if (event.key === " " && document.activeElement instanceof HTMLElement) {
      event.preventDefault();
      document.activeElement.click();
    }
  }

  function runMutation(action: () => Promise<MutationResult>) {
    setError("");
    startTransition(async () => {
      try {
        const result = await action();
        if (result && !result.ok) setError(result.error);
      } catch {
        setError("The notification campaign could not be updated. Try again.");
      }
    });
  }

  function selectMutation(action: () => Promise<MutationResult>) {
    closeMenu(false);
    runMutation(action);
  }

  function selectDuplicate(campaignId: string) {
    closeMenu(false);
    setError("");
    startTransition(async () => {
      try {
        await duplicateNotificationCampaignAction(school, campaignId);
      } catch {
        setError("The notification campaign could not be duplicated. Try again.");
      }
    });
  }

  function openDeleteConfirmation(campaignId: string) {
    closeMenu(false);
    setError("");
    setConfirmDeleteCampaignId(campaignId);
  }

  const menuStyle: CSSProperties = {
    left: menuPosition.left,
    top: menuPosition.top,
    width: MENU_WIDTH,
  };

  return (
    <>
      {error && !confirmDeleteCampaignId && (
        <p role="alert" className="border-b bg-red-50 px-5 py-3 text-sm font-semibold text-red-700 dark:border-[#3a3a3a] dark:bg-red-950/30 dark:text-red-200">
          {error}
        </p>
      )}
      {campaigns.map((campaign) => {
        const displayStatus = getCampaignDisplayStatus(campaign);
        const summary = getCampaignDeliverySummary(campaign);
        const detailsHref = `${base}/${campaign.id}`;
        const expanded = openCampaignMenuId === campaign.id;
        return (
          <article key={campaign.id} className="flex items-center gap-3 border-b p-5 last:border-0 dark:border-[#3a3a3a]">
            <Link href={detailsHref} className="min-w-0 flex-1 rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--school-primary)]">
              <h2 className="font-bold">{campaign.title}</h2>
              <p className="mt-1 line-clamp-1 text-sm text-slate-500">{campaign.body}</p>
              <p className="mt-2 text-xs text-slate-500">{formatTimestampInTimeZone(campaign.created_at, timeZone)}</p>
            </Link>
            <div className="shrink-0 text-right">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold dark:bg-[#333]">{getCampaignStatusLabel(displayStatus)}</span>
              {summary && <p className="mt-2 whitespace-pre-line text-xs text-slate-500">{summary}</p>}
            </div>
            <button
              ref={(node) => {
                if (node) triggerRefs.current.set(campaign.id, node);
                else triggerRefs.current.delete(campaign.id);
              }}
              type="button"
              aria-label="Notification campaign actions"
              aria-haspopup="menu"
              aria-expanded={expanded}
              onClick={() => toggleMenu(campaign.id)}
              className="grid min-h-11 min-w-11 shrink-0 place-items-center rounded-full text-xl font-black hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-[var(--school-primary)] dark:hover:bg-[#333]"
            >
              ⋮
            </button>
          </article>
        );
      })}
      {openCampaign && typeof document !== "undefined" && createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label={`Actions for ${openCampaign.title}`}
          onKeyDown={menuKeyboardNavigation}
          style={menuStyle}
          className="fixed z-[120] overflow-hidden rounded-xl border bg-white p-1 shadow-xl dark:border-[#444] dark:bg-[#2b2b2b]"
        >
          <Link
            role="menuitem"
            href={`${base}/${openCampaign.id}`}
            onClick={() => closeMenu(false)}
            className="block min-h-11 rounded-lg px-3 py-3 text-sm font-bold hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-[var(--school-primary)] dark:hover:bg-[#3a3a3a]"
          >
            View Details
          </Link>
          {openCampaign.archived_at ? (
            <>
              <button
                role="menuitem"
                aria-disabled={pending}
                disabled={pending}
                type="button"
                onClick={() => selectMutation(
                  () => restoreNotificationCampaignAction(
                    school,
                    openCampaign.id,
                    openCampaign.version
                  )
                )}
                className="block min-h-11 w-full rounded-lg px-3 py-3 text-left text-sm font-bold hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-[var(--school-primary)] disabled:opacity-60 dark:hover:bg-[#3a3a3a]"
              >
                Restore
              </button>
              <button
                role="menuitem"
                aria-disabled={pending}
                disabled={pending}
                type="button"
                onClick={() => openDeleteConfirmation(openCampaign.id)}
                className="block min-h-11 w-full rounded-lg px-3 py-3 text-left text-sm font-bold text-red-700 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-[var(--school-primary)] disabled:opacity-60 dark:text-red-300 dark:hover:bg-red-950/30"
              >
                Permanently Delete
              </button>
            </>
          ) : (
            <>
              <button
                role="menuitem"
                aria-disabled={pending}
                disabled={pending}
                type="button"
                onClick={() => selectDuplicate(openCampaign.id)}
                className="block min-h-11 w-full rounded-lg px-3 py-3 text-left text-sm font-bold hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-[var(--school-primary)] disabled:opacity-60 dark:hover:bg-[#3a3a3a]"
              >
                Duplicate
              </button>
              <button
                role="menuitem"
                aria-disabled={pending}
                disabled={pending}
                type="button"
                onClick={() => selectMutation(
                  () => archiveNotificationCampaignAction(
                    school,
                    openCampaign.id,
                    openCampaign.version
                  )
                )}
                className="block min-h-11 w-full rounded-lg px-3 py-3 text-left text-sm font-bold hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-[var(--school-primary)] disabled:opacity-60 dark:hover:bg-[#3a3a3a]"
              >
                Archive
              </button>
            </>
          )}
        </div>,
        document.body
      )}
      {deleteCampaign && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[130] grid place-items-center bg-black/50 p-5" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="delete-campaign-title" aria-describedby="delete-campaign-body" className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl dark:bg-[#242424]">
            <h2 id="delete-campaign-title" className="text-xl font-black">Delete notification campaign permanently?</h2>
            <p id="delete-campaign-body" className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
              This removes the campaign from the admin history.
              <br /><br />
              Notifications already delivered to users will remain on their devices.
            </p>
            {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-200">{error}</p>}
            <div className="mt-6 grid grid-cols-2 gap-3">
              <button
                ref={cancelButtonRef}
                disabled={pending}
                type="button"
                onClick={() => {
                  const campaignId = confirmDeleteCampaignId;
                  setConfirmDeleteCampaignId(null);
                  setError("");
                  window.requestAnimationFrame(() => {
                    if (campaignId) triggerRefs.current.get(campaignId)?.focus();
                  });
                }}
                className="min-h-11 rounded-xl border px-4 font-bold focus:outline-none focus:ring-2 focus:ring-[var(--school-primary)] disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                disabled={pending}
                type="button"
                onClick={() => {
                  runMutation(async () => {
                    const result = await permanentlyDeleteNotificationCampaignAction(
                      school,
                      deleteCampaign.id,
                      deleteCampaign.version
                    );
                    if (!result || result.ok) setConfirmDeleteCampaignId(null);
                    return result;
                  });
                }}
                className="min-h-11 rounded-xl bg-red-600 px-4 font-bold text-white focus:outline-none focus:ring-2 focus:ring-[var(--school-primary)] disabled:opacity-60"
              >
                {pending ? "Deleting…" : "Delete Permanently"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
