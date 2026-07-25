import { describe, expect, it } from "vitest";
import {
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
          { url: "/api/schools/deloro/tab-icon" },
          { url: SUNDIAL_FAVICON_PATH },
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
