import { log } from "./logger.js";

type McpResult = { content: { type: "text"; text: string }[] };

/** Wraps an MCP tool callback with try-catch, returning a user-friendly error on failure */
export function safe(
  toolName: string,
  handler: (...args: any[]) => McpResult | Promise<McpResult>
): (...args: any[]) => Promise<McpResult> {
  return async (...args: any[]) => {
    try {
      return await handler(...args);
    } catch (err: any) {
      const message = err?.message ?? String(err);
      log("error", `Tool "${toolName}" failed: ${message}`);
      return { content: [{ type: "text" as const, text: `An error occurred while running "${toolName}". Please try again or check the event log for details.` }] };
    }
  };
}
