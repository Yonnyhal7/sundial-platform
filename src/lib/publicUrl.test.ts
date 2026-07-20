import { describe, expect, it } from "vitest";
import { safePublicUrl } from "./publicUrl";

describe("safePublicUrl", () => {
  it("allows public HTTP links", () => {
    expect(safePublicUrl("https://example.edu/portal")).toBe("https://example.edu/portal");
    expect(safePublicUrl("http://example.edu/")).toBe("http://example.edu/");
  });

  it("rejects malformed and executable links", () => {
    expect(safePublicUrl("javascript:alert(1)")).toBeNull();
    expect(safePublicUrl("data:text/html,bad")).toBeNull();
    expect(safePublicUrl("not a url")).toBeNull();
    expect(safePublicUrl(null)).toBeNull();
  });
});
