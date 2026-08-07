import { describe, it, expect, vi, afterEach } from "vitest";
import { safe } from "../../src/utils/tool-wrapper.js";
import { getRecentLogs } from "../../src/utils/logger.js";

describe("safe", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes through the handler result and its arguments", async () => {
    const handler = vi.fn(async (a: number, b: number) => ({
      content: [{ type: "text" as const, text: `sum ${a + b}` }],
    }));

    const result = await safe("math.add", handler)(2, 3);

    expect(handler).toHaveBeenCalledWith(2, 3);
    expect(result).toEqual({ content: [{ type: "text", text: "sum 5" }] });
  });

  it("accepts a synchronous handler", async () => {
    const result = await safe("sync.tool", () => ({
      content: [{ type: "text" as const, text: "done" }],
    }))();

    expect(result.content[0].text).toBe("done");
  });

  it("turns a thrown error into a user-facing message instead of rejecting", async () => {
    const result = await safe("markets.featured", async () => {
      throw new Error("upstream exploded");
    })();

    expect(result.content[0].text).toContain("markets.featured");
    expect(result.content[0].text).not.toContain("upstream exploded");
  });

  it("logs the underlying error message", async () => {
    await safe("traders.discover", async () => {
      throw new Error("upstream exploded");
    })();

    const logged = getRecentLogs(5).find((l) => l.message.includes("traders.discover"));
    expect(logged?.level).toBe("error");
    expect(logged?.message).toContain("upstream exploded");
  });

  it("handles a thrown non-Error value", async () => {
    const result = await safe("odd.tool", async () => {
      throw "just a string";
    })();

    expect(result.content[0].text).toContain("odd.tool");
    const logged = getRecentLogs(5).find((l) => l.message.includes("odd.tool"));
    expect(logged?.message).toContain("just a string");
  });
});
