import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("notification UX integration contracts", () => {
  it.each(["new/page.tsx", "[campaignId]/page.tsx", "settings/page.tsx"])(
    "adds tenant-safe back navigation to %s",
    (page) => {
      const source = read(`src/app/[school]/admin/notifications/${page}`);
      expect(source).toContain("<NotificationBackButton");
      expect(source).toContain("notificationsHref");
      expect(source).toContain("getSchoolAdminPath(school)");
    }
  );

  it("protects unsaved create-notification work", () => {
    const composer = read("src/components/admin/NotificationComposer.tsx");
    const back = read("src/components/admin/NotificationBackButton.tsx");
    expect(composer).toContain('window.addEventListener("beforeunload"');
    expect(back).toContain("notificationComposerDirty");
    expect(back).toContain("Discard this unsaved notification?");
  });

  it("keeps audience immutable outside first-launch onboarding", () => {
    const settings = read(
      "src/app/[school]/admin/notifications/settings/page.tsx"
    );
    const header = read("src/components/mobile-app/AppHeader.tsx");
    const startup = read("src/components/pwa/PwaStartupBoundary.tsx");
    expect(settings).not.toContain("notificationAudience");
    expect(settings).not.toContain("Who is using this device?");
    expect(header).not.toContain("<select value={notificationAudience}");
    expect(startup).toContain("display-mode: standalone");
    expect(startup).toContain('status: "transport_error"');
    expect(startup).toContain('status: "unassigned"');
    expect(startup).toContain("<NotificationAudienceOnboarding");
    expect(header).not.toContain("<NotificationAudienceOnboarding");
    expect(header).not.toContain(
      'currentNotificationDeviceState.status === "registered" && ('
    );
  });

  it("leaves push click routing, service-worker caching, and manifests untouched", () => {
    const worker = read("public/sw.js");
    expect(worker).toContain('event.notification.data?.destinationPath');
    expect(worker).toContain(
      "requestedPath.startsWith(`/${schoolSlug}/`)"
    );
    expect(worker).toContain('!requestedPath.includes("..")');
    expect(read("src/app/[school]/app/layout.tsx")).toContain(
      "getSchoolAppManifestPath"
    );
  });

  it("short-circuits zero-recipient delivery before push processing", () => {
    const service = read("src/lib/notifications/service.server.ts");
    expect(service.indexOf("if (eligible.length === 0)")).toBeLessThan(
      service.indexOf("webpush.sendNotification")
    );
    expect(service).toContain("continue;");
  });

  it("uses aggregate-derived status and delivery copy on every campaign surface", () => {
    for (const page of [
      "src/components/admin/NotificationCampaignList.tsx",
      "src/app/[school]/admin/notifications/[campaignId]/page.tsx",
    ]) {
      const source = read(page);
      expect(source).toContain("getCampaignDisplayStatus(campaign)");
      expect(source).toContain("getCampaignStatusLabel(displayStatus)");
      expect(source).toContain("getCampaignDeliverySummary(campaign)");
      expect(source).not.toContain('campaign.status.replace("_"," ")');
      expect(source).not.toContain("successful_count} sent");
    }
  });
});
