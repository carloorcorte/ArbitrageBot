import { pro as ccxtPro } from 'ccxt'
import type { Exchange } from 'ccxt'
import { redis, redisPub } from '../cache/client'

export interface PriceTick {
  exchange: string
  symbol: string
  bid: string
  ask: string
  timestamp: number
}

interface ExchangeConfig {
  id: string
  apiKey?: string
  secret?: string
}

export class FeedManager {
  private exchanges = new Map<string, Exchange>()
  private running = false

  constructor(
    private readonly exchangeConfigs: ExchangeConfig[],
    private readonly symbols: string[],
  ) {}

  async start(): Promise<void> {
    this.running = true

    for (const config of this.exchangeConfigs) {
      const ExchangeClass = (ccxtPro as unknown as Record<string, new (config: object) => Exchange>)[config.id]
      if (!ExchangeClass) throw new Error(`Exchange not supported: ${config.id}`)

      const exchange = new ExchangeClass({
        apiKey: config.apiKey,
        secret: config.secret,
        enableRateLimit: true,
      })

      await exchange.loadMarkets()
      this.exchanges.set(config.id, exchange)
      console.log(`[FeedManager] ${config.id} markets loaded`)
    }

    // Start all watch loops in parallel — never await sequentially
    const loops: Promise<void>[] = []
    for (const [exchangeId, exchange] of this.exchanges) {
      for (const symbol of this.symbols) {
        if (exchange.markets[symbol]) {
          loops.push(this.watchLoop(exchangeId, exchange, symbol))
        } else {
          console.warn(`[FeedManager] ${exchangeId} does not support ${symbol}, skipping`)
        }
      }
    }

    await Promise.all(loops)
  }

  async stop(): Promise<void> {
    this.running = false
    for (const exchange of this.exchanges.values()) {
      await exchange.close()
    }
    this.exchanges.clear()
  }

  private async watchLoop(exchangeId: string, exchange: Exchange, symbol: string): Promise<void> {
    console.log(`[FeedManager] starting feed: ${exchangeId} ${symbol}`)

    while (this.running) {
      try {
        const ob = await exchange.watchOrderBook(symbol, 10)

        const bid = ob.bids[0]?.[0]
        const ask = ob.asks[0]?.[0]

        if (bid == null || ask == null) continue

        const tick: PriceTick = {
          exchange: exchangeId,
          symbol,
          bid: bid.toString(),
          ask: ask.toString(),
          timestamp: Date.now(),
        }

        // Store latest tick (expires after 10s — stale protection)
        await redis.hset(`tick:${symbol}:${exchangeId}`, tick)
        await redis.expire(`tick:${symbol}:${exchangeId}`, 10)

        // Notify detector
        await redisPub.publish(`prices:${symbol}`, JSON.stringify(tick))

      } catch (err) {
        if (!this.running) break
        console.error(`[FeedManager] ${exchangeId} ${symbol} error:`, (err as Error).message)
        await Bun.sleep(1000) // brief pause before reconnect attempt
      }
    }
  }
}
