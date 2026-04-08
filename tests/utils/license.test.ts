import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { checkLicense, requirePro, resetLicenseCache } from "../../src/utils/license.js";

describe("license", () => {
  beforeEach(() => {
    resetLicenseCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.MCP_LICENSE_KEY;
  });

  it("returns false when no license key", async () => {
    delete process.env.MCP_LICENSE_KEY;
    const result = await checkLicense();
    expect(result).toBe(false);
  });

  it("validates license via API", async () => {
    process.env.MCP_LICENSE_KEY = "test_key_123";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ valid: true })
    );

    const result = await checkLicense();
    expect(result).toBe(true);
  });

  it("rejects invalid license via API", async () => {
    process.env.MCP_LICENSE_KEY = "bad_key";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ valid: false })
    );

    const result = await checkLicense();
    expect(result).toBe(false);
  });

  it("denies license when API unreachable (no offline override)", async () => {
    process.env.MCP_LICENSE_KEY = "mcp_live_test123";
    delete process.env.MCP_LICENSE_OFFLINE;
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));

    const result = await checkLicense();
    expect(result).toBe(false);
  });

  it("allows license when API unreachable with offline override", async () => {
    process.env.MCP_LICENSE_KEY = "mcp_live_test123";
    process.env.MCP_LICENSE_OFFLINE = "true";
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network error"));

    const result = await checkLicense();
    expect(result).toBe(true);
    delete process.env.MCP_LICENSE_OFFLINE;
  });

  it("caches license result", async () => {
    process.env.MCP_LICENSE_KEY = "cached_key";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ valid: true })
    );

    await checkLicense();
    await checkLicense();
    await checkLicense();

    // Only one fetch call — subsequent calls use cache
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("resetLicenseCache clears cache", async () => {
    process.env.MCP_LICENSE_KEY = "reset_test";
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ valid: true })
    );

    await checkLicense();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    resetLicenseCache();
    await checkLicense();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("requirePro returns informative message", () => {
    const msg = requirePro("test_tool");
    expect(msg).toContain("test_tool");
    expect(msg).toContain("Pro");
    expect(msg).toContain("MCP_LICENSE_KEY");
  });
});
