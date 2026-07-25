import { describe, expect, it } from "vitest";
import {
  getSundialFaviconMetadata,
  getTenantFaviconMetadata,
  getTenantFaviconPath,
  SUNDIAL_FAVICON_PATH,
} from "./tenantFavicon";

describe("tenant favicon metadata", () => {
  it("uses the tenant favicon endpoint when the school has a logo", () => {
    expect(
      getTenantFaviconMetadata(
        "DelOro",
        "https://assets.example.com/deloro.png"
      )
    ).toEqual({
      icons: {
        icon: [
          {
            url: expect.stringMatching(
              /^\/api\/schools\/deloro\/tab-icon\?v=[a-f0-9]{8}$/
            ),
          },
        ],
      },
    });
  });

  it.each([null, undefined, "", "   "])(
    "uses only the Sundial favicon when the tenant logo is %s",
    (logoUrl) => {
      expect(getTenantFaviconMetadata("deloro", logoUrl)).toEqual({
        icons: { icon: [{ url: SUNDIAL_FAVICON_PATH }] },
      });
    }
  );

  it("produces a same-origin, encoded favicon URL for path and hostname routing", () => {
    expect(getTenantFaviconPath("north valley")).toBe(
      "/api/schools/north%20valley/tab-icon"
    );
  });

  it("uses a stable fingerprint that changes when the stored logo changes", () => {
    const first = getTenantFaviconPath(
      "deloro",
      "https://assets.example.com/logo-a.png"
    );
    const repeated = getTenantFaviconPath(
      "deloro",
      "https://assets.example.com/logo-a.png"
    );
    const updated = getTenantFaviconPath(
      "deloro",
      "https://assets.example.com/logo-b.png"
    );

    expect(first).toBe(repeated);
    expect(updated).not.toBe(first);
  });

  it("uses only the existing Sundial asset for admin metadata", () => {
    expect(getSundialFaviconMetadata()).toEqual({
      icons: {
        icon: [
          {
            url: SUNDIAL_FAVICON_PATH,
            type: "image/png",
          },
        ],
      },
    });
  });

  it("keeps the metadata contract scoped to icons so parent titles are preserved", () => {
    const metadata = getTenantFaviconMetadata(
      "deloro",
      "https://assets.example.com/deloro.webp"
    );

    expect(Object.keys(metadata)).toEqual(["icons"]);
    expect(metadata).not.toHaveProperty("title");
    expect(metadata).not.toHaveProperty("manifest");
    expect(metadata).not.toHaveProperty("appleWebApp");
  });
});
