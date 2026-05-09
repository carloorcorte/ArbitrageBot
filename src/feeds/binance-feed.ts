import { redis, redisPub } from '../cache/client'
import type { PriceTick } from './feed-manager'

// Binance combined bookTicker stream — top-of-book only, lowest latency
// Docs: https://binance-docs.github.io/apidocs/spot/en/#individual-symbol-book-ticker-streams
// Combined stream wraps each message: { stream: "btcusdt@bookTicker", data: { s, b, a, ... } }

const WS_BASE = 'wss://stream.binance.com:9443/stream?streams='

export class BinanceFeed {
  private ws:          WebSocket | null = null
  private stopResolve: (() => void) | null = null
  private running = false

  constructor(private readonly symbols: string[]) {}

  async start(): Promise<void> {
    this.running = true
    await this.connect()
    return new Promise<void>((resolve) => { this.stopResolve = resolve })
  }

  async stop(): Promise<void> {
    this.running = false
    this.ws?.close()
    this.stopResolve?.()
  }

  // 'BTC/USDT' → 'btcusdt'
  private toStream(canonical: string): string {
    return canonical.replace('/', '').toLowerCase()
  }

  // 'BTCUSDT' → 'BTC/USDT'
  private fromExSym(s: string): string {
    const quote = ['USDT', 'USDC', 'BTC', 'ETH'].find((q) => s.endsWith(q))
    return quote ? `${s.slice(0, -quote.length)}/${quote}` : s
  }

  private connect(): Promise<void> {
    return new Promise<void>((resolve) => {
      let resolved = false
      const done = () => { if (!resolved) { resolved = true; resolve() } }

      const streams = this.symbols.map((s) => `${this.toStream(s)}@bookTicker`).join('/')
      const ws = new WebSocket(`${WS_BASE}${streams}`)
      this.ws = ws

      ws.onopen = () => {
        console.log('[BinanceFeed] connected')
        done()
      }

      ws.onmessage = (event: MessageEvent) => {
        void this.handleMessage(event.data as string)
      }

      ws.onerror = () => {
        console.error('[BinanceFeed] WebSocket error')
        done()
        ws.close()
      }

      ws.onclose = () => {
        done()
        if (!this.running) return
        console.warn('[BinanceFeed] disconnected — reconnecting in 2s')
        setTimeout(() => { if (this.running) this.connect().catch(console.error) }, 2_000)
      }
    })
  }

  private async handleMessage(raw: string): Promise<void> {
    try {
      const msg = JSON.parse(raw)
      const data = msg.data ?? msg   // combined stream wraps in { stream, data }

      const bid = data.b
      const ask = data.a
      const sym = data.s
      if (!bid || !ask || !sym) return

      const tick: PriceTick = {
        exchange:  'binance',
        symbol:    this.fromExSym(sym as string),
        bid:       bid.toString(),
        ask:       ask.toString(),
        timestamp: Date.now(),
      }

      await redis.hset(`tick:${tick.symbol}:binance`, tick)
      await redis.expire(`tick:${tick.symbol}:binance`, 10)
      await redisPub.publish(`prices:${tick.symbol}`, JSON.stringify(tick))
    } catch {
      // Malformed message — ignore
    }
  }
}
