import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const drawer = read("src/components/mobile-app/OverlayDrawer.tsx");
const notifications = read("src/components/mobile-app/NotificationDrawer.tsx");
const header = read("src/components/mobile-app/AppHeader.tsx");
const inbox = read("src/components/mobile-app/NotificationInbox.tsx");
const detail = read("src/components/mobile-app/NotificationDetail.tsx");
const listRoute = read("src/app/[school]/app/notifications/page.tsx");
const detailRoute = read("src/app/[school]/app/notifications/[deliveryId]/page.tsx");

describe("installed PWA notification drawer", () => {
  it("opens from the bell without replacing the current app route", () => {
    expect(header).toContain("setNotificationsOpen(true)");
    expect(header).toContain("<NotificationDrawer");
    expect(header).not.toContain('href={`/${school}/app/notifications`}');
  });

  it("uses the shared overlay drawer for utilities and notifications", () => {
    expect(header).toContain("<OverlayDrawer");
    expect(notifications).toContain("<OverlayDrawer");
    expect(drawer).toContain("createPortal(");
    expect(drawer).toContain('data-drawer-side={side}');
  });

  it("is a constrained right-side overlay with backdrop and safe areas", () => {
    expect(drawer).toContain("w-3/4");
    expect(drawer).toContain("max-w-md");
    expect(notifications).toContain('side="right"');
    expect(drawer).toContain("bg-black/40");
    expect(notifications).toContain("env(safe-area-inset-top)");
    expect(notifications).toContain("env(safe-area-inset-bottom)");
  });

  it("supports accessible dismissal, focus, scroll lock, history, and reduced motion", () => {
    expect(drawer).toContain('event.key === "Escape"');
    expect(drawer).toContain('event.key !== "Tab"');
    expect(drawer).toContain('document.body.style.overflow = "hidden"');
    expect(drawer).toContain("returnFocusElement?.focus()");
    expect(drawer).toContain('window.addEventListener("popstate"');
    expect(drawer).toContain("motion-reduce:transition-none");
    expect(notifications).toContain('aria-label="Close notifications"');
  });

  it("keeps list, detail, deletion, and settings inside the drawer", () => {
    expect(inbox).toContain("onSelect?:");
    expect(inbox).toContain("onOpenSettings?:");
    expect(notifications).toContain('kind: "detail"');
    expect(notifications).toContain('kind: "settings"');
    expect(notifications).toContain("← Back to Notifications");
    expect(detail).toContain("onDeleted?:");
    expect(detail).toContain('action: "mark_read"');
    expect(detail).toContain('action: "delete"');
  });

  it("uses the drawer for direct list and push-click detail routes", () => {
    expect(listRoute).toContain("<NotificationDrawerRoute");
    expect(detailRoute).toContain("<NotificationDrawerRoute");
    expect(detailRoute).toContain("deliveryId={deliveryId}");
  });

  it("uses school branding instead of hard-coded blue drawer accents", () => {
    const audience = read(
      "src/components/mobile-app/NotificationAudienceSummary.tsx"
    );
    for (const source of [notifications, inbox, detail, audience]) {
      expect(source).not.toMatch(
        /(?:text|border|bg|ring)-(?:blue|sky|cyan|indigo)-/
      );
    }
    expect(inbox).toContain(
      "border-[var(--school-primary)]"
    );
    expect(inbox).toContain(
      "text-[var(--school-primary)]"
    );
    expect(inbox).toContain(
      "hover:bg-[color-mix(in_srgb,var(--school-primary)_10%,transparent)]"
    );
    expect(inbox).toContain(
      "focus-visible:ring-[var(--school-primary)]"
    );
  });
});
