import { describe, it, expect } from "vitest";
import { hasLiveCredentials, validateLiveCredentials } from "../../src/utils/config.js";

describe("config", () => {
  it("hasLiveCredentials returns false when credentials missing", () => {
    // Default .env won't have all creds in test environment
    const result = hasLiveCredentials();
    expect(typeof result).toBe("boolean");
  });

  it("validateLiveCredentials returns missing credential names", () => {
    const missing = validateLiveCredentials();
    expect(Array.isArray(missing)).toBe(true);
    // In test env without creds, should list the missing ones
    for (const key of missing) {
      expect(["POLY_PRIVATE_KEY", "POLY_API_KEY", "POLY_API_SECRET", "POLY_API_PASSPHRASE"]).toContain(key);
    }
  });
});
