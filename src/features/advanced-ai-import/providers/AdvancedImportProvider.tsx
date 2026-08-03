"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ADVANCED_IMPORT_EVENTS, trackAdvancedImportEvent } from "../analytics/events";

type LifecycleEvent = "started" | "upload_completed" | "completed" | "failed";
type AdvancedImportContextValue = {
  lifecycle: "idle" | LifecycleEvent;
  recordEvent: (event: LifecycleEvent, metadata?: Record<string, unknown>) => void;
};

const AdvancedImportContext = createContext<AdvancedImportContextValue | null>(null);

export function AdvancedImportProvider({ children }: { children: ReactNode }) {
  const [lifecycle, setLifecycle] = useState<AdvancedImportContextValue["lifecycle"]>("idle");
  useEffect(() => trackAdvancedImportEvent(ADVANCED_IMPORT_EVENTS.opened), []);
  const recordEvent = useCallback((event: LifecycleEvent, metadata: Record<string, unknown> = {}) => {
    setLifecycle(event);
    const analyticsEvent = event === "upload_completed"
      ? ADVANCED_IMPORT_EVENTS.uploadCompleted
      : ADVANCED_IMPORT_EVENTS[event];
    trackAdvancedImportEvent(analyticsEvent, metadata);
  }, []);
  const value = useMemo(() => ({ lifecycle, recordEvent }), [lifecycle, recordEvent]);
  return <AdvancedImportContext.Provider value={value}>{children}</AdvancedImportContext.Provider>;
}

export function useAdvancedImport() {
  const value = useContext(AdvancedImportContext);
  if (!value) throw new Error("useAdvancedImport must be used inside AdvancedImportProvider");
  return value;
}
