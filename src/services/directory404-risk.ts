import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import { getConfig as getStoredConfig, setConfig as setStoredConfig } from "../db/queries.js";
import { getConfig } from "../utils/config.js";
import { log } from "../utils/logger.js";

const BASE_URL = "https://404.directory";
const SOURCE = "polymarket-agent-mcp";
const AGENT_ID_KEY = "directory_404_agent_id";
const AGENT_ID_PATTERN =
  /^agent:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REQUEST_TIMEOUT_MS = 3_000;

export interface Directory404OrderContext {
  marketSlug: string | null;
  outcome?: "YES" | "NO";
  side: "BUY" | "SELL";
  estimatedNotionalUsd: number;
}

export interface Directory404Receipt {
  receiptId: string;
  outcomeToken: string;
  decision: "allow" | "review" | "block";
  reasonCodes: string[];
}

function getOrCreateAgentId(db: Database.Database): string {
  const existing = getStoredConfig(db, AGENT_ID_KEY);
  if (existing && AGENT_ID_PATTERN.test(existing)) return existing;

  const agentId = `agent:${randomUUID()}`;
  setStoredConfig(db, AGENT_ID_KEY, agentId);
  return agentId;
}

function requestHeaders(agentId: string): Record<string, string> {
  return {
    accept: "application/json",
    "content-type": "application/json",
    "x-404-agent-id": agentId,
    "x-404-source": SOURCE,
    "x-404-client-name": SOURCE,
  };
}

function validReceipt(value: unknown): value is {
  receipt_id: string;
  outcome_token: string;
  decision: "allow" | "review" | "block";
  reason_codes: string[];
} {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.receipt_id === "string" &&
    typeof record.outcome_token === "string" &&
    record.outcome_token.length >= 32 &&
    (record.decision === "allow" || record.decision === "review" || record.decision === "block") &&
    Array.isArray(record.reason_codes) &&
    record.reason_codes.every((code) => typeof code === "string")
  );
}

/**
 * Optional fail-open shadow preflight for an exact binary Polymarket order.
 * No wallet, credential, token ID, prompt, strategy, or signed order is sent.
 */
export async function evaluateDirectory404Risk(
  db: Database.Database,
  order: Directory404OrderContext
): Promise<Directory404Receipt | null> {
  const config = getConfig();
  if (config.DIRECTORY_404_RISK_MODE !== "shadow") return null;

  if (!order.marketSlug || !order.outcome) {
    log("warn", "404.directory shadow preflight skipped: exact binary market outcome unavailable");
    return null;
  }

  const agentId = getOrCreateAgentId(db);
  const intendedAction = `${order.side.toLowerCase()}_${order.outcome.toLowerCase()}`;

  try {
    const response = await fetch(`${BASE_URL}/v1/prediction-markets/evaluations`, {
      method: "POST",
      headers: requestHeaders(agentId),
      body: JSON.stringify({
        market: order.marketSlug,
        intended_action: intendedAction,
        estimated_notional_usd: order.estimatedNotionalUsd,
        execution_mode: config.DIRECTORY_404_EXECUTION_MODE,
        geographic_eligibility: config.DIRECTORY_404_GEOGRAPHIC_ELIGIBILITY,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const payload: unknown = await response.json();
    if (!response.ok || !validReceipt(payload)) {
      log("warn", `404.directory shadow preflight unavailable (HTTP ${response.status}); order continues`);
      return null;
    }

    const receipt: Directory404Receipt = {
      receiptId: payload.receipt_id,
      outcomeToken: payload.outcome_token,
      decision: payload.decision,
      reasonCodes: payload.reason_codes,
    };
    log("info", `404.directory shadow decision: ${receipt.decision}; order continues`, {
      reasonCodes: receipt.reasonCodes,
      receiptId: receipt.receiptId,
    });
    return receipt;
  } catch {
    log("warn", "404.directory shadow preflight timed out or failed; order continues");
    return null;
  }
}

/** Report only a bounded execution result. Reporting failures never affect the order result. */
export async function reportDirectory404Outcome(
  db: Database.Database,
  receipt: Directory404Receipt | null,
  executionResult: "executed" | "failed"
): Promise<void> {
  if (!receipt) return;

  try {
    const response = await fetch(
      `${BASE_URL}/v1/prediction-markets/evaluations/${encodeURIComponent(receipt.receiptId)}/outcome`,
      {
        method: "POST",
        headers: requestHeaders(getOrCreateAgentId(db)),
        body: JSON.stringify({
          outcome_token: receipt.outcomeToken,
          action_taken: "proceeded",
          execution_result: executionResult,
          ...(executionResult === "failed" ? { failure_type: "execution" } : {}),
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }
    );
    if (!response.ok) {
      log("warn", `404.directory outcome report failed (HTTP ${response.status})`);
    }
  } catch {
    log("warn", "404.directory outcome report timed out or failed");
  }
}
