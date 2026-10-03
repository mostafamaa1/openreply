// Value: protects=sign-in only redirects to same-site paths; fails_when=a backslash, protocol-relative or absolute URL slips through (QA reproduced Location: /\evil.com); why_new=login redirect untested; seam=none
import { describe, expect, it } from "vitest";
import { safeCallback } from "@/lib/safe-callback";

describe("safeCallback", () => {
  it.each([
    "/\\evil.com",
    "/\\/evil.com",
    "/\t/evil.com",
    "//evil.com",
    "///evil.com",
    "/..//evil.com",
    "/.//evil.com",
    "/a/..//evil.com",
    "/%2e%2e//evil.com",
    "https://evil.com",
    "javascript:alert(1)",
    "evil.com",
    "",
    ["/a", "/b"], // a repeated query key arrives as an array at runtime
  ])("rejects %j", (value) => {
    expect(safeCallback(value, "/dashboard")).toBe("/dashboard");
  });

  it("keeps same-site paths with query and hash", () => {
    expect(safeCallback("/campaigns/new?template=fitness-plan#top", "/d")).toBe(
      "/campaigns/new?template=fitness-plan#top"
    );
  });

  it("falls back when there is no value", () => {
    expect(safeCallback(undefined, "/dashboard")).toBe("/dashboard");
    expect(safeCallback(null, "/dashboard")).toBe("/dashboard");
  });
});
