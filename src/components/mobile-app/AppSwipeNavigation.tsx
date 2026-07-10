"use client";

import type { PointerEvent, ReactNode } from "react";
import { useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  APP_TAB_PENDING_EVENT,
  getActiveAppTabIndex,
  getAppTabs,
} from "@/lib/appTabs";

type AppSwipeNavigationProps = {
  school: string;
  children: ReactNode;
};

type SwipeGesture = {
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  startTime: number;
  horizontal: boolean | null;
};

type DragState = {
  pathname: string;
  x: number;
  dragging: boolean;
};

const SWIPE_DISTANCE_THRESHOLD = 72;
const SWIPE_VELOCITY_THRESHOLD = 0.42;
const HORIZONTAL_LOCK_DISTANCE = 10;
const MAX_DRAG_OFFSET = 46;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export default function AppSwipeNavigation({
  school,
  children,
}: AppSwipeNavigationProps) {
  const pathname = usePathname();
  const router = useRouter();
  const gestureRef = useRef<SwipeGesture | null>(null);
  const [dragState, setDragState] = useState<DragState>({
    pathname,
    x: 0,
    dragging: false,
  });

  const tabs = getAppTabs(school, pathname);
  const activeIndex = getActiveAppTabIndex(pathname, school);
  const visibleDragX = dragState.pathname === pathname ? dragState.x : 0;
  const isDragging = dragState.pathname === pathname && dragState.dragging;

  function resetDrag() {
    setDragState({ pathname, x: 0, dragging: false });
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" || activeIndex === -1) {
      return;
    }

    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      startTime: performance.now(),
      horizontal: null,
    };

    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;

    if (!gesture || gesture.pointerId !== event.pointerId) {
      return;
    }

    gesture.lastX = event.clientX;
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;

    if (gesture.horizontal === null) {
      if (
        Math.abs(deltaX) < HORIZONTAL_LOCK_DISTANCE &&
        Math.abs(deltaY) < HORIZONTAL_LOCK_DISTANCE
      ) {
        return;
      }

      gesture.horizontal = Math.abs(deltaX) > Math.abs(deltaY) * 1.15;
    }

    if (!gesture.horizontal) {
      return;
    }

    const isAtFirstTab = activeIndex <= 0;
    const isAtLastTab = activeIndex >= tabs.length - 1;
    const swipingPastStart = isAtFirstTab && deltaX > 0;
    const swipingPastEnd = isAtLastTab && deltaX < 0;
    const resistance = swipingPastStart || swipingPastEnd ? 0.18 : 0.55;

    setDragState({
      pathname,
      x: clamp(deltaX * resistance, -MAX_DRAG_OFFSET, MAX_DRAG_OFFSET),
      dragging: true,
    });
  }

  function handlePointerEnd(event: PointerEvent<HTMLDivElement>) {
    const gesture = gestureRef.current;

    if (!gesture || gesture.pointerId !== event.pointerId) {
      return;
    }

    gestureRef.current = null;

    if (!gesture.horizontal) {
      resetDrag();
      return;
    }

    const deltaX = gesture.lastX - gesture.startX;
    const elapsed = Math.max(performance.now() - gesture.startTime, 1);
    const velocity = Math.abs(deltaX) / elapsed;
    const shouldNavigateLeft =
      deltaX <= -SWIPE_DISTANCE_THRESHOLD ||
      (deltaX <= -36 && velocity >= SWIPE_VELOCITY_THRESHOLD);
    const shouldNavigateRight =
      deltaX >= SWIPE_DISTANCE_THRESHOLD ||
      (deltaX >= 36 && velocity >= SWIPE_VELOCITY_THRESHOLD);
    const nextIndex = shouldNavigateLeft
      ? activeIndex + 1
      : shouldNavigateRight
        ? activeIndex - 1
        : activeIndex;
    const nextTab = tabs[nextIndex];

    if (nextTab && nextIndex !== activeIndex) {
      setDragState({
        pathname,
        x: shouldNavigateLeft ? -MAX_DRAG_OFFSET : MAX_DRAG_OFFSET,
        dragging: false,
      });
      window.dispatchEvent(
        new CustomEvent(APP_TAB_PENDING_EVENT, {
          detail: { href: nextTab.href, from: pathname },
        }),
      );
      router.push(nextTab.href);
      return;
    }

    resetDrag();
  }

  return (
    <div
      onPointerCancel={handlePointerEnd}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      style={{ touchAction: "pan-y" }}
    >
      <div
        className="will-change-transform"
        style={{
          transform: visibleDragX
            ? `translate3d(${visibleDragX}px, 0, 0)`
            : undefined,
          transition: isDragging ? "none" : "transform 180ms ease-out",
        }}
      >
        {children}
      </div>
    </div>
  );
}
