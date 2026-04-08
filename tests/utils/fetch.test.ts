import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchWithRetry } from "../../src/utils/fetch.js";

describe("fetchWithRetry", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns response on first try success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ ok: true }));

    const res = await fetchWithRetry("https://example.com/api");
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it("retries on failure and succeeds", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockResolvedValueOnce(Response.json({ ok: true }));

    const res = await fetchWithRetry("https://example.com/api", { retries: 1, timeoutMs: 5000 });
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("throws after all retries exhausted", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("persistent failure"));

    await expect(
      fetchWithRetry("https://example.com/api", { retries: 1, timeoutMs: 5000 })
    ).rejects.toThrow("persistent failure");
  });

  it("respects custom retry count", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("fail"));

    await expect(
      fetchWithRetry("https://example.com/api", { retries: 0, timeoutMs: 5000 })
    ).rejects.toThrow();

    // retries=0 means 1 attempt total
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
