import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { log, getRecentLogs } from "../../src/utils/logger.js";

describe("logger", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stores log entries that can be retrieved", () => {
    log("info", "test message");
    const logs = getRecentLogs(10);
    const last = logs[logs.length - 1];
    expect(last.level).toBe("info");
    expect(last.message).toBe("test message");
    expect(last.timestamp).toBeTruthy();
  });

  it("writes to stderr, not stdout", () => {
    log("warn", "warning message");
    expect(stderrSpy).toHaveBeenCalled();
    const output = stderrSpy.mock.calls[stderrSpy.mock.calls.length - 1][0] as string;
    expect(output).toContain("[WARN]");
    expect(output).toContain("warning message");
  });

  it("includes data in log output", () => {
    log("error", "error occurred", { code: 500 });
    const logs = getRecentLogs(10);
    const last = logs[logs.length - 1];
    expect(last.data).toEqual({ code: 500 });

    const output = stderrSpy.mock.calls[stderrSpy.mock.calls.length - 1][0] as string;
    expect(output).toContain('"code":500');
  });

  it("respects count limit in getRecentLogs", () => {
    for (let i = 0; i < 10; i++) {
      log("info", `msg ${i}`);
    }
    const logs = getRecentLogs(3);
    expect(logs.length).toBeLessThanOrEqual(3);
  });

  it("handles all log levels", () => {
    const levels = ["info", "warn", "error", "trade", "monitor"] as const;
    for (const level of levels) {
      log(level, `${level} message`);
    }
    const logs = getRecentLogs(10);
    const recentLevels = logs.slice(-5).map((l) => l.level);
    for (const level of levels) {
      expect(recentLevels).toContain(level);
    }
  });
});
