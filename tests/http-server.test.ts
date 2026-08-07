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

// Parses an SSE-framed JSON-RPC reply, which is what the streamable HTTP
// transport returns for list requests.
async function rpcResult(res: Response) {
  const body = await res.text();
  const data = body.split("\n").find((l) => l.startsWith("data:"));
  return JSON.parse((data ?? body).replace(/^data:\s*/, "")).result;
}

describe("registration", () => {
  it("lists every tool, prompt and resource", async () => {
    const [tools, prompts, resources] = await Promise.all([
      postMcp(rpc(10, "tools/list", {})).then(rpcResult),
      postMcp(rpc(11, "prompts/list", {})).then(rpcResult),
      postMcp(rpc(12, "resources/list", {})).then(rpcResult),
    ]);

    expect(tools.tools).toHaveLength(48);
    expect(prompts.prompts).toHaveLength(2);
    expect(resources.resources).toHaveLength(4);
  });

  it("keeps descriptions and input schemas on the registered tools", async () => {
    const { tools } = await postMcp(rpc(13, "tools/list", {})).then(rpcResult);

    expect(tools.every((t: { description?: string }) => !!t.description)).toBe(true);

    const discover = tools.find((t: { name: string }) => t.name === "traders.discover");
    expect(discover.inputSchema.properties).toHaveProperty("pages");

    const noArgs = tools.find((t: { name: string }) => t.name === "watchlist.list");
    expect(noArgs.inputSchema.properties ?? {}).toEqual({});
  });
});
