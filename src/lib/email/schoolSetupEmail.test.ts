import { describe, expect, it } from "vitest";
import { resolveSchoolEmailConfig } from "./config";
import { renderSchoolSetupEmail } from "./schoolSetupEmail";
import { getCanonicalSchoolSetupInvitationUrl } from "@/lib/routing/canonicalUrls";

describe("school setup email", () => {
  it("escapes tenant-provided HTML and includes a plain-text fallback", () => {
    const setupUrl = "https://admin.sundialk12.com/invitations/token?school=a&next=b";
    const content = renderSchoolSetupEmail({
      schoolName: '<img src=x onerror="alert(1)"> & Academy',
      setupUrl,
      expiresAt: new Date("2026-07-20T20:00:00.000Z"),
    });
    expect(content.subject).toBe("Set up your school in Sundial");
    expect(content.html).not.toContain("<img src=x");
    expect(content.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; Academy");
    expect(content.html).toContain("school=a&amp;next=b");
    expect(content.text).toContain("Set Up School:");
    expect(content.text).toContain("If you were not expecting this invitation");
  });

  it("builds the tenant-specific URL on the canonical admin domain", () => {
    expect(
      getCanonicalSchoolSetupInvitationUrl({
        adminUrl: "https://admin.sundialk12.com/",
        token: "secret-token",
      })
    ).toBe("https://admin.sundialk12.com/invitations#token=secret-token");
    expect(
      getCanonicalSchoolSetupInvitationUrl({
        adminUrl: "https://sundial-preview.vercel.app/admin",
        token: "preview-token",
      })
    ).toBe(
      "https://sundial-preview.vercel.app/admin/invitations#token=preview-token"
    );
  });

  it("forbids live recipients outside production and requires an override in previews", () => {
    expect(() =>
      resolveSchoolEmailConfig({
        SUNDIAL_EMAIL_MODE: "live",
        SUNDIAL_ADMIN_URL: "https://admin.sundialk12.com",
        VERCEL_ENV: "preview",
      })
    ).toThrow(/Vercel production/);
    expect(() =>
      resolveSchoolEmailConfig({
        SUNDIAL_EMAIL_MODE: "override",
        SUNDIAL_ADMIN_URL: "https://admin.sundialk12.com",
        RESEND_API_KEY: "test-key",
        SUNDIAL_FROM_EMAIL: "Sundial <setup@sundialk12.com>",
        SUNDIAL_REPLY_TO_EMAIL: "support@sundialk12.com",
        VERCEL_ENV: "preview",
      })
    ).toThrow(/SUNDIAL_EMAIL_OVERRIDE_TO/);
  });
});
