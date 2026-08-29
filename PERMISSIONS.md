# Permissions & Capabilities

This document is the authoritative disclosure of everything `polymarket-agent-mcp` reads, writes, or sends over the network. There is no hidden behavior — if it is not listed here, it does not happen. The machine-readable equivalent of this manifest lives in [`.well-known/mcp/server-card.json`](./.well-known/mcp/server-card.json) under the `permissions` and `security` keys.

## Sensitivity Legend

| Label | Meaning |
|-------|---------|
| **Secret** | Credential material — wallet private key, API secret, license key. Never logged, never persisted, never sent anywhere except its designated endpoint. |
| **Sensitive** | Non-secret but identifies the user (e.g. funder address). Never logged, only sent to its designated endpoint. |
| **Public** | Configuration or state that could appear in a support bug report without risk. |

## Network Access — Outbound

| Endpoint | Protocol | Purpose | Sensitivity | Condition |
|----------|----------|---------|-------------|-----------|
| `data-api.polymarket.com` | HTTPS | Read-only trader activity, positions, and leaderboard | Read-only public data | Always available |
| `gamma-api.polymarket.com` | HTTPS | Read-only market metadata, prices, and resolution status | Read-only public data | Always available |
| `clob.polymarket.com` | HTTPS | Order book reads; signed order placement | **Write-capable** | Order placement only when `COPY_MODE=live` **and** a user-initiated trade tool is invoked |
| `ws-subscriptions-clob.polymarket.com` | WSS | Subscribe to real-time public price updates for explicitly watched markets | Inbound-only, unauthenticated | Only when the user calls `markets.watch_price` |
| `404.directory` | HTTPS | Optional prediction-market risk preflight and bounded execution outcome | Public market/action context + random non-personal Agent ID | Only when `COPY_MODE=live`, `DIRECTORY_404_RISK_MODE=shadow`, and an exact YES/NO outcome is known; fail-open and never places or blocks an order |

Polymarket HTTP requests go through `fetchWithRetry` (`src/utils/fetch.ts`) with a 10-second timeout and at most two retries with exponential backoff. The optional 404.directory preflight uses a separate 3-second timeout with no retry so it cannot indefinitely delay live execution. **No other outbound connections are made.** No crash reporting or update-check endpoints are contacted.

### WebSocket Disclosure

The WebSocket connection to `ws-subscriptions-clob.polymarket.com` is **inbound-only** (the server subscribes to Polymarket's public price stream and receives updates). No wallet, user identity, or credential is transmitted over this connection — it is the same public feed any browser client uses. The connection exists only while the user actively has a `watch_price` subscription; it is closed on shutdown.

## Network Access — Inbound (Optional HTTP Transport)

`polymarket-agent-mcp` ships as a stdio MCP server by default. When run in StreamableHTTP mode it additionally binds to a local port:

| Setting | Default | Purpose |
|---------|---------|---------|
| `PORT` | `3000` | Listen port for the StreamableHTTP transport |
| HTTP bearer token env var | unset | Required bearer token on incoming requests; if unset, HTTP transport authentication is disabled (see the environment variables table below for the exact name) |

This package is designed for **single-tenant** local or private deployments. See the README for the explicit warning against multi-user hosting.

## Environment Variables

| Variable | Sensitivity | Required | Purpose | Scope |
|----------|-------------|----------|---------|-------|
| `POLY_PRIVATE_KEY` | **Secret** | Live mode only | Wallet private key used solely for locally signing EIP-712 Polymarket CLOB order payloads | Held in process memory only; never logged, never written to DB, never transmitted except inside signed order payloads to `clob.polymarket.com` |
| `POLY_API_KEY` | **Secret** | Live mode only | CLOB API key | Sent only to `clob.polymarket.com` |
| `POLY_API_SECRET` | **Secret** | Live mode only | CLOB API secret used for HMAC signing | Sent only to `clob.polymarket.com` |
| `POLY_API_PASSPHRASE` | **Secret** | Live mode only | CLOB API passphrase | Sent only to `clob.polymarket.com` |
| `POLY_FUNDER_ADDRESS` | Sensitive | Live mode only | Funder wallet address in CLOB order payloads | Sent only to `clob.polymarket.com` |
| `MCP_API_KEY` | **Secret** | No | Bearer token gating the optional HTTP transport | Compared in-process against incoming `Authorization` headers; never transmitted outbound |
| `DB_PATH` | Public | No (default `./copytrader.db`) | Override SQLite database file location | Read at startup |
| `PORT` | Public | No (default `3000`) | HTTP transport listen port | Read at startup |
| `COPY_MODE` | Public | No (default `preview`) | `preview` = simulated trades in local DB; `live` = real orders | Gates live trading; requires all four `POLY_*` secrets to be present |
| `DAILY_BUDGET` | Public | No (default `20`) | Hard daily spending cap in USDC | Enforced by `BudgetManager` |
| `MIN_CONVICTION` | Public | No (default `3`) | Minimum USDC trade size considered for copy-trading | Filter only |
| `CHAIN_ID` | Public | No (default `137`) | Polygon chain id | Used in signed orders |
| `DIRECTORY_404_RISK_MODE` | Public | No (default `off`) | Enables the optional fail-open risk preflight with `shadow`; `off` makes no 404.directory requests | Read before an exact binary live order |
| `DIRECTORY_404_EXECUTION_MODE` | Public | No (default `unattended`) | Declares `supervised` or `unattended` execution context to the risk service | Sent only when the optional preflight is enabled |
| `DIRECTORY_404_GEOGRAPHIC_ELIGIBILITY` | Public | No (default `unknown`) | Caller-observed `eligible`, `blocked`, or `unknown` Polymarket geoblock result | Sent only when the optional preflight is enabled |

All environment variables are validated at startup through a Zod schema (`src/utils/config.ts`). If validation fails, the process exits before any service starts.

### Secrets Policy

Every variable marked **Secret** obeys the same five rules, enforced by code review:

1. **In memory only.** Held in the validated config singleton for the lifetime of the process. Never persisted to disk, database, or any file the user did not write themselves.
2. **Never logged.** The logger (`src/utils/logger.ts`) writes to stderr and has no code path that serializes the config object.
3. **Never mirrored into the database.** None of the tables (`watchlist`, `trades`, `daily_budget`, `config`, `agent_cycles`, `market_watchlist`) have columns for credentials.
4. **Single destination.** Each secret is sent to exactly one host (see the "Scope" column above) and nowhere else.
5. **Not in error messages.** Errors bubbling up from the CLOB client are sanitized before reaching the user-facing tool response.

## Filesystem Access

| Path | Access | Purpose |
|------|--------|---------|
| `./copytrader.db` (or `DB_PATH`) | Read/Write | SQLite database for watchlist, trades, daily budget, config, agent cycles, and market watchlist |
| `./.env` | Read | dotenv environment loading at startup only |

**Nothing else is read or written.** No files in the home directory, no temp files, no cache files, no log files. The SQLite database contains no credentials, no PII, and no data that is not already public on-chain (trade records and market metadata).

## Process Execution

This package does **not** spawn child processes and does **not** execute shell commands. The `exec()` calls present in the source code refer to `better-sqlite3`'s `Database.exec()` method for running SQL statements — not `child_process.exec()`. There is no use of `eval()`, `Function()`, or any other dynamic code execution primitive.

## Data Storage

All runtime state lives in a single local SQLite file:

| Table | Contains | Contains Secrets? |
|-------|----------|-------------------|
| `watchlist` | Tracked wallet addresses (public) and alias strings | No |
| `trades` | Trade history — simulated in preview, real in live | No |
| `daily_budget` | Daily spending records | No |
| `config` | User-set configuration key/value pairs plus one random `agent:<uuid>` for optional 404.directory attribution | No |
| `agent_cycles` | Agent automation logs | No |
| `market_watchlist` | Price alert watchlist | No |

No data is sent to external analytics, telemetry, error reporting, or any third-party service of any kind.

## What This Package Does NOT Do

- Does not spawn child processes or execute shell commands
- Does not access the filesystem beyond the SQLite database and `.env`
- Does not send analytics, crash reports, or update checks; the optional 404.directory shadow mode sends only the disclosed bounded risk and outcome fields
- Does not modify system configuration
- Does not install additional packages at runtime
- Does not use `eval()`, `Function()`, or dynamic code execution
- Does not access the clipboard, camera, microphone, or any other system resource
- Does not store, log, or persist any secret environment variable
- Does not operate as a multi-tenant service — it is designed for single-user local use

## Reporting

If you find a capability in the source code that contradicts this document, that is a bug — please report it via [SECURITY.md](./SECURITY.md).
