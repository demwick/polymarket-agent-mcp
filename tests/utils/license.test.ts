import { describe, it, expect } from "vitest";
import { checkLicense, requirePro } from "../../src/utils/license.js";

describe("license", () => {
  it("returns true (all features free during launch)", async () => {
    const result = await checkLicense();
    expect(result).toBe(true);
  });

  it("requirePro returns informative message", () => {
    const msg = requirePro("test_tool");
    expect(msg).toContain("test_tool");
    expect(msg).toContain("Pro");
  });
});
