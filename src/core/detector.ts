import Decimal from 'decimal.js'
import { redis, redisSub, redisPub } from '../cache/client'
import { FeeCalculator } from './fees'
import type { PriceTick } from '../feeds/feed-manager'

export interface ArbitrageOpportunity {
  symbol:       string
  buyExchange:  string
  sellExchange: string
  buyAsk:       Decimal
  sellBid:      Decimal
  amount:       Decimal
  grossSpreadPct: Decimal
  netProfitPct:   Decimal
  detectedAt:   number
}

const COOLDOWN_MS       = 30_000 // minimum gap between two fires for the same symbol
const IMPROVEMENT_RATIO = 1.20   // re-fire immediately if new spread is ≥20% relatively better

interface LastFired {
  at:         number
  netProfitPct: Decimal
}

export class OpportunityDetector {
  private running = false
  private readonly minNetProfitPct: Decimal
  private readonly tradeAmountUsd: Decimal
  private readonly lastFired = new Map<string, LastFired>()

  constructor(
    private readonly exchangeIds: string[],
    private readonly feeCalc: FeeCalculator,
    private readonly onOpportunity: (opp: ArbitrageOpportunity) => Promise<void>,
  ) {
    this.minNetProfitPct = new Decimal(process.env.MIN_NET_PROFIT_PCT ?? '0.10')
    this.tradeAmountUsd  = new Decimal(process.env.MAX_POSITION_USD   ?? '100')
  }

  async start(): Promise<void> {
    this.running = true
    await redisSub.psubscribe('prices:*')

    redisSub.on('pmessage', async (_pattern: string, channel: string, message: string) => {
      if (!this.running) return

      const symbol = channel.replace('prices:', '')

      try {
        await this.evaluate(symbol)
      } catch (err) {
        console.error('[Detector] evaluation error:', (err as Error).message)
      }
    })

    console.log('[Detector] subscribed to price channels')
  }

  stop(): void {
    this.running = false
    redisSub.punsubscribe('prices:*')
  }

  private async evaluate(symbol: string): Promise<void> {
    // Fetch latest tick from all exchanges in parallel
    const ticks = await Promise.all(
      this.exchangeIds.map(async (id) => {
        const raw = await redis.hgetall(`tick:${symbol}:${id}`)
        if (!raw?.bid || !raw?.ask) return null
        return { exchange: id, bid: new Decimal(raw.bid), ask: new Decimal(raw.ask) }
      }),
    )

    const valid = ticks.filter((t): t is NonNullable<typeof ticks[0]> => t !== null)
    if (valid.length < 2) return

    // Find best buy (lowest ask) and best sell (highest bid) across exchanges
    let bestBuy  = valid.reduce((a, b) => a.ask.lt(b.ask) ? a : b)
    let bestSell = valid.reduce((a, b) => a.bid.gt(b.bid) ? a : b)

    // Can't buy and sell on same exchange in cross-exchange arbitrage
    if (bestBuy.exchange === bestSell.exchange) return

    // Estimate amount in base currency from USD budget
    const amount = this.tradeAmountUsd.div(bestBuy.ask)

    const result = this.feeCalc.netProfit({
      buyExchange:  bestBuy.exchange,
      sellExchange: bestSell.exchange,
      symbol,
      amount,
      buyAsk:  bestBuy.ask,
      sellBid: bestSell.bid,
    })

    if (result.netPct.lt(this.minNetProfitPct)) return

    const now  = Date.now()
    const last = this.lastFired.get(symbol)
    if (last) {
      const cooldownOk    = now - last.at >= COOLDOWN_MS
      const significantlyBetter = result.netPct.gte(last.netProfitPct.times(IMPROVEMENT_RATIO))
      if (!cooldownOk && !significantlyBetter) return
    }
    this.lastFired.set(symbol, { at: now, netProfitPct: result.netPct })

    const grossSpreadPct = bestSell.bid.minus(bestBuy.ask).div(bestBuy.ask).times(100)

    const opp: ArbitrageOpportunity = {
      symbol,
      buyExchange:  bestBuy.exchange,
      sellExchange: bestSell.exchange,
      buyAsk:       bestBuy.ask,
      sellBid:      bestSell.bid,
      amount,
      grossSpreadPct,
      netProfitPct: result.netPct,
      detectedAt:   Date.now(),
    }

    console.log(
      `[Detector] opportunity: ${symbol} buy@${bestBuy.exchange} sell@${bestSell.exchange}` +
      ` net=${result.netPct.toFixed(4)}%`,
    )

    // Publish to API process for dashboard
    await redisPub.publish('opportunities', JSON.stringify({
      ...opp,
      buyAsk:  opp.buyAsk.toString(),
      sellBid: opp.sellBid.toString(),
      amount:  opp.amount.toString(),
      grossSpreadPct: opp.grossSpreadPct.toString(),
      netProfitPct:   opp.netProfitPct.toString(),
    }))

    await this.onOpportunity(opp)
  }
}
