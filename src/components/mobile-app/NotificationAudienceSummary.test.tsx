import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import NotificationAudienceSummary from "./NotificationAudienceSummary";

describe("NotificationAudienceSummary", () => {
  it.each([
    ["student", "Student"],
    ["staff", "Staff"],
    ["parent", "Parent"],
  ] as const)("displays the %s device audience as %s", (audience, label) => {
    const markup = renderToStaticMarkup(
      <NotificationAudienceSummary audience={audience} />
    );

    expect(markup).toContain(`Notifications (${label})`);
    expect(markup).toContain(`Notifications, ${label} device`);
    expect(markup).toContain(
      `This device is configured for ${label} notifications.`
    );
    expect(markup).toContain(
      "To change the notification audience, remove Sundial from your Home Screen and install it again."
    );
    expect(markup).not.toContain(`>${audience}<`);
    expect(markup).not.toContain("<select");
    expect(markup).not.toContain("<button");
    expect(markup).not.toContain("<input");
  });

  it("uses the existing neutral heading while device setup is incomplete", () => {
    const markup = renderToStaticMarkup(
      <NotificationAudienceSummary audience={null} />
    );

    expect(markup).toContain(">Notifications<");
    expect(markup).toContain("School communication");
    expect(markup).not.toContain("Unknown");
    expect(markup).not.toContain("configured for");
  });
});
