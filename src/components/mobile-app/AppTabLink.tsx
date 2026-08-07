"use client";

import type { ComponentProps, MouseEvent } from "react";
import Link from "next/link";
import { flushSync } from "react-dom";
import { APP_TAB_DIRECT_NAVIGATION_EVENT } from "@/lib/appTabs";

type AppTabLinkProps = ComponentProps<typeof Link>;

export default function AppTabLink({ onClick, ...props }: AppTabLinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    const isClientNavigation =
      !event.defaultPrevented &&
      event.button === 0 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey &&
      (!props.target || props.target === "_self");

    if (isClientNavigation) {
      flushSync(() => {
        window.dispatchEvent(new Event(APP_TAB_DIRECT_NAVIGATION_EVENT));
      });
    }

    onClick?.(event);
  }

  return <Link {...props} onClick={handleClick} />;
}
