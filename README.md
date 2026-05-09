# ArbitrageBot

R&D project for a crypto cross-exchange arbitrage system. It monitors real-time order books on multiple CEX exchanges, detects price discrepancies for the same asset, calculates net profit after fees, and executes trades automatically.

**Status: paper trading (real prices, simulated fills). Live trading not yet enabled.**

---

## How it works

Two independent processes communicate via Redis Pub/Sub:

```
[Binance WS] ─┐
[Kraken WS]  ─┤─→ FeedManager → Redis Pub/Sub → OpportunityDetector → RiskManager → Executor
[BloFin WS]  ─┘                                                                          ↓
                                                                                 PostgreSQL log
                                                                                          ↓
                                                             Hono API / WebSocket → Next.js Dashboard
```

**Engine** (`src/engine.ts`): opens WebSocket connections to each exchange via CCXT Pro, writes price ticks to Redis, detects arbitrage opportunities, and executes or simulates trades.

**API** (`src/api/index.ts`): Hono REST endpoints + a WebSocket `/ws` that streams real-time updates to the dashboard.

**Dashboard** (`dashboard/`): Next.js app showing live prices across exchanges, spread opportunities, and trade history.

---

## Tech stack

| Layer | Technology |
|---|---|
| Runtime | Bun |
| Exchange API | CCXT Pro (WebSocket streams) |
| Backend API | Hono |
| Dashboard | Next.js + shadcn/ui |
| Database | PostgreSQL + Drizzle ORM |
| Cache / Pub-Sub | Redis + ioredis |

---

## Running locally

### Prerequisites

- [Bun](https://bun.sh) installed
- Docker (for Postgres + Redis)

### 1. Install dependencies

```bash
bun install
cd dashboard && bun install && cd ..
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` — for local development the defaults (`localhost` Postgres + Redis, `PAPER_TRADING=true`) work as-is. API keys are optional for paper trading.

### 3. Start infrastructure

```bash
bun run infra:up      # starts Postgres + Redis via Docker
bun run db:migrate    # applies DB migrations (run once, or after schema changes)
```

### 4. Start the backend (two terminals)

```bash
# Terminal 1 — engine (price feeds + detector + executor)
bun run engine

# Terminal 2 — API server + WebSocket
bun run api
```

### 5. Start the dashboard

```bash
cd dashboard
bun run dev
# → http://localhost:3000
```

The dashboard's `.env.local` already points to `localhost:3001`. To switch to the Hetzner server, comment/uncomment the relevant lines in `dashboard/.env.local`.

### Stop infrastructure

```bash
bun run infra:down
```

---

## Running on the server (Hetzner)

The production server runs everything in Docker. Deployment is automatic via GitHub Actions on merge to `main`.

```bash
# Manual deploy (if needed)
ssh root@49.13.172.7
cd /opt/arbitrage
git pull origin main
docker compose up -d --build
```

The `.env` on the server is managed manually — it is not in git. To update it:

```bash
scp .env root@49.13.172.7:/opt/arbitrage/.env
ssh root@49.13.172.7 "cd /opt/arbitrage && docker compose up -d"
```

---

## Git workflow

```
main        ← production, protected, auto-deploys to Hetzner on merge
develop     ← integration branch, protected
feature/*   ← short-lived, branch off develop
```

Rules:
- No direct push to `main` or `develop`
- PRs to `develop`: `feature/*` → `develop`
- PRs to `main`: `develop` → `main` (triggers deploy)
- CI (typecheck + tests) must pass before any merge

```bash
# Start a feature
git checkout develop
git checkout -b feature/my-feature

# Push and open PR → develop on GitHub
git push origin feature/my-feature
```

---

## Useful commands

```bash
bun run typecheck           # TypeScript check
bun test                    # run all tests
bun test src/core/fees.test.ts   # single test file

bunx drizzle-kit generate   # generate migration after schema change
bunx drizzle-kit migrate    # apply pending migrations
bunx drizzle-kit studio     # visual DB explorer (browser)
```

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://user:pass@localhost:5432/arbitrage` | Postgres connection |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection |
| `PAPER_TRADING` | `true` | Set to `false` to enable live order execution |
| `MIN_NET_PROFIT_PCT` | `0.10` | Minimum net profit % to act on an opportunity |
| `MAX_POSITION_USD` | `100` | Max trade size per opportunity |
| `MAX_DAILY_LOSS_USD` | `50` | Circuit breaker: daily loss limit |
| `BINANCE_API_KEY` / `SECRET` | — | Required for live trading |
| `KRAKEN_API_KEY` / `SECRET` | — | Required for live trading |
| `BLOFIN_API_KEY` / `SECRET` | — | Required for live trading |
| `TELEGRAM_BOT_TOKEN` | — | Optional: alerts on opportunities and circuit breaker |
| `TELEGRAM_CHAT_ID` | — | Optional: your Telegram chat ID |

---

## What's still to do

### Short term

- [ ] **Bitunix exchange** — not in CCXT, needs a custom WebSocket adapter. Need API docs from Bitunix to implement `watchOrderBook` + order placement
- [ ] **Fee discounts** — BloFin (−60%) and Bitunix (−80%) VIP discounts not yet applied in `FeeCalculator`. Add a per-exchange fee override mechanism once exact rates are confirmed
- [ ] **Live executor testing** — live order execution is implemented but untested. Needs real API keys and a small test run (`MAX_POSITION_USD=10`) to validate fill logic and auto-unwind
- [ ] **BloFin paper trading validation** — BloFin feeds were broken (wrong symbol format — now fixed). Need to verify opportunities are detected correctly across spot (Binance/Kraken) and perp (BloFin)

### Medium term

- [ ] **Slippage model** — current profit calculation assumes best bid/ask fills. Real fills depend on order book depth. Add order book depth check before firing
- [ ] **More symbols** — expand beyond the current 5 pairs based on observed opportunity frequency
- [ ] **P&L chart in dashboard** — visualize cumulative paper P&L over time
- [ ] **Opportunity analytics** — which pairs and which exchange routes generate the most opportunities

### Live trading prerequisites

Before switching `PAPER_TRADING=false`:
1. Real API keys on Binance, Kraken, BloFin
2. Funds pre-positioned on each exchange (≥ `MAX_POSITION_USD` per symbol per exchange)
3. At least a week of paper trading data to validate detection quality
4. Test live executor with `MAX_POSITION_USD=10` before raising limits

---

## Key invariants (read before touching financial logic)

- **No floating point for money.** All prices and amounts use `decimal.js` or are stored/passed as `string`. PostgreSQL columns are `numeric(18,8)`.
- **Both trade legs placed simultaneously.** The executor uses `Promise.all([buyOrder, sellOrder])` — never `await` them sequentially.
- **Auto-unwind on leg failure.** If one leg of a live trade fails, the executor immediately places a reverse order on the successful exchange to close the position and sends a Telegram alert.
- **Paper trading is the default.** `PAPER_TRADING` must be explicitly set to `false` to enable live execution.
