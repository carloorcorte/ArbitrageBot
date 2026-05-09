import { Hono } from 'hono'
import { redis } from '../../cache/client'

const app = new Hono()

// Returns current prices from Redis for all tracked symbols/exchanges
app.get('/', async (c) => {
  const symbols   = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT', 'DOGE/USDT']
  const exchanges = ['binance', 'kraken', 'blofin']

  const prices: Record<string, Record<string, { bid: string; ask: string; timestamp: number } | null>> = {}

  for (const symbol of symbols) {
    prices[symbol] = {}
    for (const exchange of exchanges) {
      const tick = await redis.hgetall(`tick:${symbol}:${exchange}`)
      prices[symbol][exchange] = tick?.bid && tick?.ask
        ? { bid: tick.bid, ask: tick.ask, timestamp: Number(tick.timestamp) }
        : null
    }
  }

  return c.json({
    paperMode: process.env.PAPER_TRADING !== 'false',
    prices,
    uptime: process.uptime(),
  })
})

export default app
