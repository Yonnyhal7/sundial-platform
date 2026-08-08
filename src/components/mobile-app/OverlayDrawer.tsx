"use client";

import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

type Props = {
  open: boolean;
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  side?: "left" | "right";
  label: string;
  children: ReactNode;
  historyDismiss?: boolean;
};

export default function OverlayDrawer({
  open,
  onClose,
  returnFocusRef,
  side = "left",
  label,
  children,
  historyDismiss = false,
}: Props) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const historyEntryRef = useRef(false);
  const closeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      const frame = window.requestAnimationFrame(() => {
        setMounted(true);
        window.requestAnimationFrame(() => setVisible(true));
      });
      return () => window.cancelAnimationFrame(frame);
    }
    const frame = window.requestAnimationFrame(() => setVisible(false));
    closeTimerRef.current = window.setTimeout(() => setMounted(false), 260);
    return () => {
      window.cancelAnimationFrame(frame);
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const returnFocusElement = returnFocusRef?.current;
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;

    const focusFrame = window.requestAnimationFrame(() => {
      const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      (first || panelRef.current)?.focus();
    });

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (historyDismiss && historyEntryRef.current) {
          historyEntryRef.current = false;
          window.history.back();
        } else {
          onClose();
        }
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) || []
      ).filter((element) => !element.hidden);
      if (!focusable.length) {
        event.preventDefault();
        panelRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      window.setTimeout(() => returnFocusElement?.focus(), 0);
    };
  }, [historyDismiss, onClose, open, returnFocusRef]);

  useEffect(() => {
    if (!open || !historyDismiss) return;
    const marker = `sundial-drawer-${Date.now()}`;
    window.history.pushState(
      { ...window.history.state, sundialDrawer: marker },
      "",
      window.location.href
    );
    historyEntryRef.current = true;
    function handlePopState() {
      historyEntryRef.current = false;
      onClose();
    }
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [historyDismiss, onClose, open]);

  function requestClose() {
    if (historyDismiss && historyEntryRef.current) {
      historyEntryRef.current = false;
      window.history.back();
    } else {
      onClose();
    }
  }

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={`fixed inset-0 z-[80] transition-colors duration-[250ms] ease-out motion-reduce:transition-none ${
        visible ? "bg-black/40" : "bg-black/0"
      }`}
      data-overlay-drawer=""
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        data-drawer-side={side}
        className={`absolute inset-y-0 box-border flex h-full w-3/4 min-w-0 max-w-md flex-col overflow-hidden bg-slate-50 text-slate-950 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] shadow-2xl transition-transform duration-[250ms] ease-out focus:outline-none motion-reduce:transition-none dark:bg-black dark:text-white ${
          side === "right"
            ? `right-0 rounded-l-[1.75rem] shadow-[-18px_0_36px_rgb(0_0_0/0.24)] ${
                visible ? "translate-x-0" : "translate-x-full"
              }`
            : `left-0 rounded-r-[1.75rem] shadow-[18px_0_36px_rgb(0_0_0/0.24)] ${
                visible ? "translate-x-0" : "-translate-x-full"
              }`
        }`}
      >
        {children}
      </aside>
    </div>,
    document.body
  );
}
