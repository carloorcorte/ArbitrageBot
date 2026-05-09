import { redis, redisPub } from '../cache/client'
import type { PriceTick } from './feed-manager'

// BloFin native WebSocket feed — perpetual futures tickers
// Docs: https://blofin.com/docs#get-tickers-channel
// Endpoint: wss://openapi.blofin.com/ws/public
// Channel: tickers — pushed on every change, full snapshot (no incremental merge)
// instId format: BTC-USDT (dash separator, perp futures)

const WS_URL  = 'wss://openapi.blofin.com/ws/public'
const PING_MS = 20_000

export class BlofInFeed {
  private ws:          WebSocket | null = null
  private pingTimer:   ReturnType<typeof setInterval> | null = null
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
    if (this.pingTimer) clearInterval(this.pingTimer)
    this.ws?.close()
    this.stopResolve?.()
  }

  // 'BTC/USDT' → 'BTC-USDT'
  private toInstId(canonical: string): string {
    return canonical.replace('/', '-')
  }

  // 'BTC-USDT' → 'BTC/USDT'
  private fromInstId(instId: string): string {
    return instId.replace('-', '/')
  }

  private connect(): Promise<void> {
    return new Promise<void>((resolve) => {
      let resolved = false
      const done = () => { if (!resolved) { resolved = true; resolve() } }

      const ws = new WebSocket(WS_URL)
      this.ws = ws

      ws.onopen = () => {
        console.log('[BlofInFeed] connected')
        const args = this.symbols.map((s) => ({
          channel: 'tickers',
          instId:  this.toInstId(s),
        }))
        ws.send(JSON.stringify({ op: 'subscribe', args }))

        this.pingTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send('ping')
          }
        }, PING_MS)

        done()
      }

      ws.onmessage = (event: MessageEvent) => {
        void this.handleMessage(event.data as string)
      }

      ws.onerror = () => {
        console.error('[BlofInFeed] WebSocket error')
        done()
        ws.close()
      }

      ws.onclose = () => {
        if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null }
        done()
        if (!this.running) return
        console.warn('[BlofInFeed] disconnected — reconnecting in 2s')
        setTimeout(() => { if (this.running) this.connect().catch(console.error) }, 2_000)
      }
    })
  }

  private async handleMessage(raw: string): Promise<void> {
    try {
      // BloFin sends plain 'pong' string response to our 'ping'
      if (raw === 'pong') return

      const msg = JSON.parse(raw)

      if (msg.event === 'subscribe') {
        console.log(`[BlofInFeed] subscribed: ${msg.arg?.instId}`)
        return
      }

      if (msg.arg?.channel !== 'tickers' || !Array.isArray(msg.data)) return

      for (const item of msg.data) {
        const instId = (item.instId ?? msg.arg?.instId) as string | undefined
        if (!instId) continue

        // BloFin perp field names: bidPx / askPx (OKX-style)
        const bid = item.bidPx ?? item.bidPrice
        const ask = item.askPx ?? item.askPrice
        if (bid == null || ask == null) continue

        const canonical = this.fromInstId(instId)

        const tick: PriceTick = {
          exchange:  'blofin',
          symbol:    canonical,
          bid:       bid.toString(),
          ask:       ask.toString(),
          timestamp: (item.ts as number | undefined) ?? Date.now(),
        }

        await redis.hset(`tick:${tick.symbol}:blofin`, tick)
        await redis.expire(`tick:${tick.symbol}:blofin`, 10)
        await redisPub.publish(`prices:${tick.symbol}`, JSON.stringify(tick))
      }
    } catch {
      // Malformed message — ignore
    }
  }
}
