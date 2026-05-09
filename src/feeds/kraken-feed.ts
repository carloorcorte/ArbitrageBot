import { redis, redisPub } from '../cache/client'
import type { PriceTick } from './feed-manager'

// Kraken v2 WebSocket — ticker channel
// Docs: https://docs.kraken.com/api/docs/websocket-v2/ticker
// Kraken only has USD pairs (not USDT) — we publish under the canonical USDT key
// so the detector can compare with other exchanges. USD ≈ USDT for spread detection.

const WS_URL  = 'wss://ws.kraken.com/v2'
const PING_MS = 20_000

// Map canonical BTC/USDT → Kraken BTC/USD
const KRAKEN_SYMBOL: Record<string, string> = {
  'BTC/USDT':  'BTC/USD',
  'ETH/USDT':  'ETH/USD',
  'SOL/USDT':  'SOL/USD',
  'XRP/USDT':  'XRP/USD',
  'DOGE/USDT': 'DOGE/USD',
}

export class KrakenFeed {
  private ws:          WebSocket | null = null
  private pingTimer:   ReturnType<typeof setInterval> | null = null
  private stopResolve: (() => void) | null = null
  private running = false

  // Reverse map: Kraken symbol → canonical symbol
  private readonly canonicalMap: Record<string, string>

  constructor(private readonly symbols: string[]) {
    this.canonicalMap = Object.fromEntries(
      symbols
        .filter((s) => KRAKEN_SYMBOL[s])
        .map((s) => [KRAKEN_SYMBOL[s], s]),
    )
  }

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

  private connect(): Promise<void> {
    return new Promise<void>((resolve) => {
      let resolved = false
      const done = () => { if (!resolved) { resolved = true; resolve() } }

      const ws = new WebSocket(WS_URL)
      this.ws = ws

      ws.onopen = () => {
        console.log('[KrakenFeed] connected')
        const krakenSymbols = this.symbols
          .map((s) => KRAKEN_SYMBOL[s])
          .filter(Boolean)

        ws.send(JSON.stringify({
          method: 'subscribe',
          params: { channel: 'ticker', symbol: krakenSymbols },
        }))

        this.pingTimer = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ method: 'ping' }))
          }
        }, PING_MS)

        done()
      }

      ws.onmessage = (event: MessageEvent) => {
        void this.handleMessage(event.data as string)
      }

      ws.onerror = () => {
        console.error('[KrakenFeed] WebSocket error')
        done()
        ws.close()
      }

      ws.onclose = () => {
        if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null }
        done()
        if (!this.running) return
        console.warn('[KrakenFeed] disconnected — reconnecting in 2s')
        setTimeout(() => { if (this.running) this.connect().catch(console.error) }, 2_000)
      }
    })
  }

  private async handleMessage(raw: string): Promise<void> {
    try {
      const msg = JSON.parse(raw)

      if (msg.channel === 'heartbeat' || msg.method === 'pong') return
      if (msg.channel !== 'ticker' || msg.type !== 'update') return

      for (const item of msg.data ?? []) {
        const krakenSym  = item.symbol as string
        const canonical  = this.canonicalMap[krakenSym]
        if (!canonical) continue

        const bid = item.bid
        const ask = item.ask
        if (bid == null || ask == null) continue

        const tick: PriceTick = {
          exchange:  'kraken',
          symbol:    canonical,
          bid:       bid.toString(),
          ask:       ask.toString(),
          timestamp: Date.now(),
        }

        await redis.hset(`tick:${tick.symbol}:kraken`, tick)
        await redis.expire(`tick:${tick.symbol}:kraken`, 10)
        await redisPub.publish(`prices:${tick.symbol}`, JSON.stringify(tick))
      }
    } catch {
      // Malformed message — ignore
    }
  }
}
