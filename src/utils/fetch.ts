import { log } from "./logger.js";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRIES = 2;
const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;

export async function fetchWithRetry(
  url: string,
  options?: RequestInit & { retries?: number; timeoutMs?: number }
): Promise<Response> {
  const retries = options?.retries ?? DEFAULT_RETRIES;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timer);

      // Handle rate limiting — retry with backoff
      if (response.status === 429) {
        const retryAfter = parseRetryAfter(response.headers.get("retry-after"));
        const delay = retryAfter ?? Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);

        if (attempt < retries) {
          log("warn", `Rate limited (429) on ${url}, retrying in ${delay}ms...`);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
        log("error", `Rate limited (429) on ${url} after ${retries + 1} attempts`);
        return response;
      }

      return response;
    } catch (err: any) {
      const isLast = attempt === retries;
      const reason = err?.name === "AbortError" ? "timeout" : err?.message ?? "unknown";

      if (isLast) {
        log("error", `Fetch failed after ${retries + 1} attempts: ${url} (${reason})`);
        throw err;
      }

      log("warn", `Fetch attempt ${attempt + 1} failed: ${url} (${reason}), retrying...`);
      await new Promise((r) => setTimeout(r, BASE_DELAY_MS * (attempt + 1)));
    }
  }

  // Unreachable, but TypeScript needs it
  throw new Error("Fetch failed");
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = parseInt(header, 10);
  if (!isNaN(seconds)) return seconds * 1000;
  const date = Date.parse(header);
  if (!isNaN(date)) return Math.max(0, date - Date.now());
  return null;
}
