# System Architecture

## Project Structure

```
crypto-arbitrage/
├── src/
│   ├── engine.ts               # Entry point: starts FeedManager + OpportunityDetector
│   ├── core/
│   │   ├── detector.ts         # Arbitrage opportunity detection logic
│   │   ├── executor.ts         # Trade execution (paper + live)
│   │   ├── risk.ts             # Risk management (position limits, circuit breaker)
│   │   └── fees.ts             # Fee calculation per exchange/pair
│   ├── feeds/
│   │   └── feed-manager.ts     # Manages CCXT Pro WebSocket connections per exchange
│   ├── exchanges/
│   │   └── factory.ts          # Creates and configures CCXT Pro instances
│   ├── db/
│   │   ├── schema.ts           # Drizzle ORM table definitions
│   │   ├── client.ts           # PostgreSQL connection singleton
│   │   └── migrate.ts          # Programmatic migration runner
│   ├── cache/
│   │   └── client.ts           # Redis clients: redis, redisPub, redisSub
│   └── api/
│       ├── index.ts            # Hono app: REST routes + WebSocket broadcaster
│       └── routes/
│           ├── opportunities.ts
│           ├── trades.ts
│           └── status.ts
├── dashboard/                  # Next.js web dashboard
│   └── src/app/
│       ├── page.tsx            # Main dashboard (price table + opportunity feed)
│       └── components/
│           ├── PriceTable.tsx
│           ├── OpportunityFeed.tsx
│           └── PnlChart.tsx
├── drizzle/                    # Auto-generated SQL migration files
├── docs/
│   ├── architecture.md         # This file
│   └── domain.md               # Crypto arbitrage domain concepts
├── drizzle.config.ts
├── .env                        # Local env vars (not committed)
└── package.json
```

## Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         ENGINE PROCESS                          │
│                                                                 │
│  [Binance WS] ──┐                                               │
│  [Kraken WS]  ──┤─→ FeedManager ──→ Redis HSET (latest tick)   │
│  [Bybit WS]   ──┘       │                                       │
│                          └──────→ Redis PUBLISH (price channel) │
│                                         │                        │
│                          OpportunityDetector (redisSub)         │
│                                         │                        │
│                          fetches all exchange prices for symbol  │
│                                         │                        │
│                          FeeCalculator.netProfit()              │
│                                         │                        │
│                          RiskManager.check()                    │
│                                         │                        │
│                          Executor ──→ PostgreSQL (log)           │
│                           │  paper mode: simulate fill          │
│                           │  live mode: createOrder() x2        │
└───────────────────────────┼─────────────────────────────────────┘
                            │
                     Redis PUBLISH (opportunity channel)
                            │
┌───────────────────────────┼─────────────────────────────────────┐
│                       API PROCESS                               │
│                                                                 │
│  Hono /ws ←── redisSub (opportunity + price channels)          │
│  Hono REST ←── PostgreSQL (opportunity/trade history)           │
│                            │                                    │
└────────────────────────────┼────────────────────────────────────┘
                             │
                    Next.js Dashboard (browser)
                    WebSocket client ← /ws
                    fetch() ← REST API
```

## Component Details

### FeedManager (`src/feeds/feed-manager.ts`)

Creates one CCXT Pro exchange instance per exchange. For each (exchange, symbol) pair, runs a persistent `while(true)` loop calling `exchange.watchOrderBook()`. CCXT Pro handles reconnection automatically.

On each tick:
1. `redis.hset('tick:BTC/USDT:binance', { bid, ask, timestamp })` — stores latest price
2. `redisPub.publish('prices:BTC/USDT', JSON.stringify({ exchange, bid, ask }))` — notifies detector

```typescript
// Concurrent loops via Promise.all — never await sequentially
await Promise.all(exchanges.flatMap(ex =>
  symbols.map(sym => watchLoop(ex, sym))
))
```

### OpportunityDetector (`src/core/detector.ts`)

Subscribes to `prices:*` via Redis psubscribe. On each message:
1. Fetches latest price from all exchanges: `redis.hgetall('tick:BTC/USDT:*')`
2. Finds best buy (lowest ask) and best sell (highest bid) across exchanges
3. Calls `FeeCalculator.netProfit(buyExch, sellExch, symbol, amount, buyAsk, sellBid)`
4. If net profit > `MIN_NET_PROFIT_PCT`: creates opportunity and calls `RiskManager.check()`, then `Executor.execute()`

### FeeCalculator (`src/core/fees.ts`)

```typescript
function netProfit(params: {
  buyExchange: string, sellExchange: string,
  symbol: string, amount: Decimal,
  buyPrice: Decimal, sellPrice: Decimal
}): { grossPct: Decimal, feeCost: Decimal, netPct: Decimal }
```

Fee data is loaded from `exchange.markets[symbol].taker` (CCXT) at startup and refreshed every hour. Uses `decimal.js` throughout — no native floats.

### RiskManager (`src/core/risk.ts`)

Stateful checks before every trade:
- `maxPositionUsd` — single trade size cap
- `maxDailyLossUsd` — cumulative daily P&L floor (pauses trading if breached)
- `maxExchangeExposureUsd` — cap per exchange to limit counterparty risk
- Circuit breaker: if 3 consecutive losses within 5 minutes, pause for 30 minutes

### Executor (`src/core/executor.ts`)

```typescript
// Paper mode
async paperExecute(opp: Opportunity): Promise<Trade>
// Simulates fill at current mid price. Records to DB with mode='paper'.

// Live mode (requires PAPER_TRADING=false)
async liveExecute(opp: Opportunity): Promise<Trade>
// Places both orders simultaneously:
const [buyOrder, sellOrder] = await Promise.all([
  buyExchange.createOrder(symbol, 'market', 'buy', amount),
  sellExchange.createOrder(symbol, 'market', 'sell', amount),
])
```

### Hono API (`src/api/index.ts`)

REST endpoints:
- `GET /api/status` — engine running state, paper/live mode, risk stats
- `GET /api/opportunities?limit=50` — recent detected opportunities from PostgreSQL
- `GET /api/trades?limit=50` — executed trades with P&L
- `POST /api/engine/start|stop` — start/stop the engine

WebSocket:
- `GET /ws` — streams real-time price updates and new opportunities to dashboard clients

## Database Schema

```sql
-- Detected arbitrage opportunities
CREATE TABLE opportunities (
  id              SERIAL PRIMARY KEY,
  symbol          VARCHAR(20)  NOT NULL,
  buy_exchange    VARCHAR(50)  NOT NULL,
  sell_exchange   VARCHAR(50)  NOT NULL,
  buy_price       NUMERIC(18,8) NOT NULL,
  sell_price      NUMERIC(18,8) NOT NULL,
  gross_spread_pct NUMERIC(10,6) NOT NULL,
  net_profit_pct  NUMERIC(10,6) NOT NULL,
  estimated_amount NUMERIC(18,8) NOT NULL,
  status          VARCHAR(20)  NOT NULL DEFAULT 'detected',
  -- status: detected | executed | expired | skipped_risk | skipped_fees
  detected_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Executed trades (one opportunity = two trades: buy + sell)
CREATE TABLE trades (
  id              SERIAL PRIMARY KEY,
  opportunity_id  INTEGER REFERENCES opportunities(id),
  exchange        VARCHAR(50)  NOT NULL,
  side            VARCHAR(4)   NOT NULL, -- buy | sell
  symbol          VARCHAR(20)  NOT NULL,
  amount          NUMERIC(18,8) NOT NULL,
  price           NUMERIC(18,8) NOT NULL,
  fee_paid        NUMERIC(18,8) NOT NULL,
  fee_currency    VARCHAR(10)  NOT NULL,
  order_id        VARCHAR(100),           -- exchange order ID (null in paper mode)
  mode            VARCHAR(5)   NOT NULL,  -- paper | live
  status          VARCHAR(10)  NOT NULL,  -- pending | filled | partial | failed
  executed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fee schedule cache (refreshed hourly from CCXT)
CREATE TABLE fee_cache (
  exchange        VARCHAR(50)  NOT NULL,
  symbol          VARCHAR(20)  NOT NULL,
  maker_fee       NUMERIC(10,6) NOT NULL,
  taker_fee       NUMERIC(10,6) NOT NULL,
  cached_at       TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (exchange, symbol)
);
```

## Redis Key Schema

```
tick:{symbol}:{exchange}      HASH    { bid, ask, bidVol, askVol, timestamp }
                              TTL: 10s (stale protection)

prices:{symbol}               CHANNEL  Pub/Sub — price update events
opportunities                 CHANNEL  Pub/Sub — new opportunity events
```

## Key Library APIs

### CCXT Pro — WebSocket

```typescript
// Initialize
const exchange = new ccxt.pro.binance({ apiKey, secret, enableRateLimit: true })
await exchange.loadMarkets()

// Stream order book
const ob = await exchange.watchOrderBook('BTC/USDT', 5)
// ob.bids[0][0] = best bid price, ob.asks[0][0] = best ask price

// Fees from markets (no extra request)
const takerFee = exchange.markets['BTC/USDT'].taker // e.g. 0.001

// Execute order
const order = await exchange.createOrder('BTC/USDT', 'market', 'buy', amount)

// Always close on shutdown
await exchange.close()
```

### Hono — WebSocket (Bun adapter)

```typescript
import { upgradeWebSocket } from 'hono/bun'

app.get('/ws', upgradeWebSocket((c) => ({
  onOpen(event, ws) { /* subscribe to Redis, send to ws */ },
  onClose()        { /* cleanup Redis subscription */ },
})))
```

### Drizzle ORM

```typescript
// Schema
export const opportunities = pgTable('opportunities', {
  id:           serial('id').primaryKey(),
  symbol:       varchar('symbol', { length: 20 }).notNull(),
  netProfitPct: numeric('net_profit_pct', { precision: 10, scale: 6 }).notNull(),
  detectedAt:   timestamp('detected_at').defaultNow().notNull(),
})

// Query
const recent = await db.select().from(opportunities)
  .where(gte(opportunities.detectedAt, subHours(new Date(), 1)))
  .orderBy(desc(opportunities.detectedAt))
  .limit(50)
```

### Redis Pub/Sub (ioredis)

```typescript
// Three separate clients required
export const redis    = new Redis(process.env.REDIS_URL)  // commands
export const redisPub = new Redis(process.env.REDIS_URL)  // publish only
export const redisSub = new Redis(process.env.REDIS_URL)  // subscribe only

// Publisher
await redisPub.publish('prices:BTC/USDT', JSON.stringify(tick))

// Subscriber (pattern — matches all symbols)
await redisSub.psubscribe('prices:*')
redisSub.on('pmessage', (pattern, channel, message) => { ... })
```
