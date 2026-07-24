import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PWA_RESUME_DIAGNOSTICS_KEY,
  PWA_RESUME_DIAGNOSTICS_LIMIT,
  recordPwaResumeDiagnostic,
  type PwaResumeDiagnostic,
} from "@/lib/pwa/resumeDiagnostics";

describe("PWA resume diagnostics", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps an ordered, bounded, non-identifying event buffer", () => {
    const stored = new Map<string, string>();
    const windowObject = {
      sessionStorage: {
        setItem: (key: string, value: string) => stored.set(key, value),
      },
    };
    vi.stubGlobal("window", windowObject);
    vi.stubGlobal("document", { visibilityState: "visible" });

    for (let index = 0; index < PWA_RESUME_DIAGNOSTICS_LIMIT + 4; index += 1) {
      recordPwaResumeDiagnostic(
        index % 2 === 0 ? "focus" : "controller_comparison",
        index % 2 === 0 ? "visible" : "unchanged"
      );
    }

    const events = JSON.parse(
      stored.get(PWA_RESUME_DIAGNOSTICS_KEY) || "[]"
    ) as PwaResumeDiagnostic[];
    expect(events).toHaveLength(PWA_RESUME_DIAGNOSTICS_LIMIT);
    expect(events.at(-1)?.type).toBe("controller_comparison");
    expect(events.every((event) => event.visibility === "visible")).toBe(true);
    expect(JSON.stringify(events)).not.toMatch(
      /schoolId|schoolSlug|email|token|notification/i
    );
  });
});
