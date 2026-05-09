import { redis, redisPub } from '../cache/client'
import type { PriceTick } from './feed-manager'

// Bitunix native WebSocket feed — no CCXT.
// Docs: https://www.bitunix.com/api-docs/futures/websocket/prepare/WebSocket.html
// Endpoint: wss://fapi.bitunix.com/public/
// Channel:  depth_book1 — always pushes current top-of-book (no incremental merge needed)

const WS_URL  = 'wss://fapi.bitunix.com/public/'
const PING_MS = 20_000 // server expects a ping at least every 30s

export class BitunixFeed {
  private ws:          WebSocket | null = null
  private pingTimer:   ReturnType<typeof setInterval> | null = null
  private stopResolve: (() => void) | null = null
  private running = false

  constructor(private readonly symbols: string[]) {}

  async start(): Promise<void> {
    this.running = true
    await this.connect()
    // Hold until stop() resolves
    return new Promise<void>((resolve) => { this.stopResolve = resolve })
  }

  async stop(): Promise<void> {
    this.running = false
    if (this.pingTimer) clearInterval(this.pingTimer)
    this.ws?.close()
    this.stopResolve?.()
  }

  // Bitunix uses BTCUSDT format (no slash)
  private toExSym(canonical: string): string {
    return canonical.replace('/', '')
  }

  // BTCUSDT → BTC/USDT
  private fromExSym(exSym: string): string {
    const quote = ['USDT', 'USDC', 'BTC', 'ETH'].find((q) => exSym.endsWith(q))
    return quote ? `${exSym.slice(0, -quote.length)}/${quote}` : exSym
  }

  private connect(): Promise<void> {
    return new Promise<void>((resolve) => {
      let resolved = false
      const done = () => { if (!resolved) { resolved = true; resolve() } }

      const ws = new WebSocket(WS_URL)
      this.ws = ws

      ws.onopen = () => {
        console.log('[BitunixFeed] connected')
        for (const sym of this.symbols) {
          ws.send(JSON.stringify({ op: 'subscribe', args: [{ symbol: this.toExSym(sym), ch: 'depth_book1' }] }))
        }
        this.pingTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ op: 'ping', ping: Date.now() }))
          }
        }, PING_MS)
        done()
      }

      ws.onmessage = (event: MessageEvent) => {
        void this.handleMessage(event.data as string)
      }

      ws.onerror = () => {
        console.error('[BitunixFeed] WebSocket error')
        done() // resolve so start() doesn't hang; reconnect handles recovery
        ws.close()
      }

      ws.onclose = () => {
        if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null }
        done()
        if (!this.running) return
        console.warn('[BitunixFeed] disconnected — reconnecting in 2s')
        setTimeout(() => { if (this.running) this.connect().catch(console.error) }, 2_000)
      }
    })
  }

  private async handleMessage(raw: string): Promise<void> {
    try {
      const msg = JSON.parse(raw)

      // Ignore pong heartbeats
      if (msg.op === 'ping') return

      // Subscription acknowledgement
      if (msg.event === 'subscribe') {
        console.log(`[BitunixFeed] subscribed: ${msg.arg?.symbol} ${msg.arg?.ch}`)
        return
      }

      const bid = msg.data?.b?.[0]?.[0]
      const ask = msg.data?.a?.[0]?.[0]
      if (!bid || !ask || !msg.symbol) return

      const tick: PriceTick = {
        exchange:  'bitunix',
        symbol:    this.fromExSym(msg.symbol as string),
        bid:       bid.toString(),
        ask:       ask.toString(),
        timestamp: (msg.ts as number | undefined) ?? Date.now(),
      }

      await redis.hset(`tick:${tick.symbol}:bitunix`, tick)
      await redis.expire(`tick:${tick.symbol}:bitunix`, 10)
      await redisPub.publish(`prices:${tick.symbol}`, JSON.stringify(tick))
    } catch {
      // Malformed message — ignore
    }
  }
}
