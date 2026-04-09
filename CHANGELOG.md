# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.0] - 2026-04-09

### Added
- Streamable HTTP transport for Smithery/Railway deployment
- Bearer token authentication for HTTP endpoint (MCP_API_KEY)
- Safety limits enforcement on buy and batch orders
- MCP protocol logging (notifications/message)
- MCP Resources: watchlist, positions, budget, trades
- MCP Prompts: daily-trading-cycle, evaluate-trader
- Completion/autocomplete for prompt arguments
- Deep health check with DB probe
- DB_PATH env var for Docker volume persistence

### Fixed
- Wallet address regex validation
- Error message sanitization to prevent key leaks
- Server-card.json with complete tool descriptions and annotations

### Changed
- Dockerfile to multi-stage build with HTTP mode
- CI workflow with TypeScript type checking
