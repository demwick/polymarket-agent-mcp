import { describe, it, expect, afterAll, beforeAll, vi } from "vitest";
import type { Server } from "node:http";

process.env.DB_PATH = ":memory:";

// A tool handler that actually waits on I/O is what makes two HTTP requests
// overlap inside the server; without it each handler finishes in its own
// macrotask and never exercises concurrent transport connections.
vi.mock("../src/utils/fetch.js", () => ({
  fetchWithRetry: vi.fn(async () => {
    await new Promise((r) => setTimeout(r, 50));
    return Response.json([]);
  }),
}));

let startHttpServer: (port: number) => Promise<Server>;
let httpServer: Server;
let baseUrl: string;

function rpc(id: number, method: string, params: unknown) {
  return { jsonrpc: "2.0", id, method, params };
}

const INITIALIZE = rpc(1, "initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "test", version: "1.0" },
});

const SLOW_TOOL_CALL = rpc(2, "tools/call", {
  name: "markets.featured",
  arguments: { limit: 1 },
});

beforeAll(async () => {
  ({ startHttpServer } = await import("../src/index.js"));
  httpServer = await startHttpServer(0);
  const addr = httpServer.address();
  if (typeof addr === "string" || addr === null) throw new Error("no port");
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(() => {
  httpServer?.close();
});

function postMcp(body: unknown) {
  return fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify(body),
  });
}

describe("HTTP transport", () => {
  it("answers a single MCP request", async () => {
    const res = await postMcp(INITIALIZE);
    expect(res.status).toBe(200);
  });

  it("answers overlapping MCP requests without failing", async () => {
    const responses = await Promise.all([
      postMcp(SLOW_TOOL_CALL),
      postMcp(SLOW_TOOL_CALL),
      postMcp(SLOW_TOOL_CALL),
      postMcp(SLOW_TOOL_CALL),
    ]);

    expect(responses.map((r) => r.status)).toEqual([200, 200, 200, 200]);
  });

  it("serves the health endpoint", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok", db: "connected" });
  });
});
