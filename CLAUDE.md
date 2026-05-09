# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

R&D project for a **crypto cross-exchange arbitrage system**. It monitors real-time prices on multiple CEX exchanges (Binance, Kraken), detects price discrepancies for the same asset, calculates net profit after fees, and executes trades automatically. Starts in paper trading mode (real prices, simulated fills).

For domain concepts (arbitrage, slippage, spread), see [`docs/domain.md`](./docs/domain.md).  
For full system architecture and data flow, see [`docs/architecture.md`](./docs/architecture.md).

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Runtime | **Bun** | ~3x faster than Node.js, native WebSocket server |
| Exchange API | **CCXT Pro** | Unified SDK for 100+ exchanges with WebSocket streams |
| Backend API | **Hono** | Lightweight, fast, TypeScript-native |
| Dashboard | **Next.js + shadcn/ui** | Web dashboard accessible to other devs |
| DB | **PostgreSQL + Drizzle ORM** | Opportunity/trade history, typed queries |
| Cache | **Redis + ioredis** | Real-time price sharing between processes via Pub/Sub |

## Commands

```bash
# Install dependencies
bun install

# Run the arbitrage engine (price feeds + detector + executor)
bun run src/engine.ts

# Run the API + WebSocket server
bun run src/api/index.ts

# Run both together (dev)
bun run dev

# Database migrations
bunx drizzle-kit generate   # generate migration from schema changes
bunx drizzle-kit migrate    # apply pending migrations
bunx drizzle-kit studio     # open visual DB explorer

# Type check
bun run typecheck

# Tests
bun test
bun test src/core/fees.test.ts   # single test file
```

## Architecture Overview

The system has two independent processes that communicate via Redis Pub/Sub:

**Engine process** (`src/engine.ts`):
- `FeedManager` opens WebSocket connections to each exchange via CCXT Pro
- On each price tick: writes latest price to Redis hash + publishes to Redis channel
- `OpportunityDetector` subscribes to price channels, compares prices across exchanges
- On profitable spread found: calculates net profit via `FeeCalculator`, applies `RiskManager` checks, sends to `Executor`
- `Executor` in paper mode simulates the fill and logs to PostgreSQL; in live mode calls `exchange.createOrder()` on both sides simultaneously

**API process** (`src/api/index.ts`):
- Hono REST endpoints serve opportunity history and trade log from PostgreSQL
- Hono WebSocket endpoint (`/ws`) subscribes to Redis and broadcasts real-time updates to the dashboard

```
[Binance WS] ─┐
[Kraken WS]  ─┤ FeedManager → Redis Pub/Sub → OpportunityDetector → RiskManager → Executor
[Bybit WS]   ─┘                                                                      ↓
                                                                              PostgreSQL log
                                                                                      ↓
                                                              Hono API / WS → Next.js Dashboard
```

## Key Invariants

- **Never use floating-point arithmetic for financial values.** All prices, amounts, fees, and profits must be stored and computed as `string` or with a decimal library (`decimal.js`). PostgreSQL columns use `numeric(18,8)`.
- **Paper trading is the default.** The `PAPER_TRADING=true` env variable must be explicitly set to `false` to enable live order execution. The executor checks this at startup, not per-trade.
- **Both legs of a trade must be placed as near-simultaneously as possible.** Use `Promise.all([buyOrder, sellOrder])` — never `await` them sequentially, as price can move between the two calls.
- **CCXT Pro exchange instances are stateful.** One instance per exchange for the engine, a separate instance for the executor. Do not share instances across concurrent WebSocket loops and REST calls.
- **Redis Pub/Sub requires separate connections.** The subscribing client (`redisSub`) cannot make regular commands once subscribed. Always maintain three Redis clients: `redis` (commands), `redisPub` (publish), `redisSub` (subscribe).

## Environment Variables

```
DATABASE_URL=postgresql://user:pass@localhost:5432/arbitrage
REDIS_URL=redis://localhost:6379
PAPER_TRADING=true
MIN_NET_PROFIT_PCT=0.10       # minimum net profit % to act on an opportunity
MAX_POSITION_USD=100          # maximum trade size in USD per opportunity
BINANCE_API_KEY=
BINANCE_SECRET=
KRAKEN_API_KEY=
KRAKEN_SECRET=
```

## Available Tooling

Full documentation of configured agents, slash commands, and MCP servers is in [`CLAUDE-TOOLS.md`](./CLAUDE-TOOLS.md).

**Most relevant agents for this project:**
- `system-architect` — architectural decisions and trade-offs
- `backend-architect` — API design, DB schema, latency-sensitive systems
- `security-engineer` — API key management, exchange auth, fund safety
- `performance-engineer` — latency optimization (critical for arbitrage timing)
- `tech-stack-researcher` — library comparisons before adding dependencies

**MCP Servers:**
- `context7` — up-to-date docs for CCXT, Hono, Drizzle, Next.js (use explicitly: *"using context7, how does X work?"*)
- `playwright` — UI testing for the dashboard
