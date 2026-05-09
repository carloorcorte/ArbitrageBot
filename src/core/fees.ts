import Decimal from 'decimal.js'
import * as ccxt from 'ccxt'

// All financial values use Decimal — never native JS floats

export interface FeeSchedule {
  maker: Decimal
  taker: Decimal
}

export interface NetProfitResult {
  grossProfit: Decimal
  buyFee:      Decimal
  sellFee:     Decimal
  netProfit:   Decimal
  netPct:      Decimal        // net profit as % of trade cost
}

export class FeeCalculator {
  // exchangeId → symbol → { maker, taker }
  private cache = new Map<string, Map<string, FeeSchedule>>()
  private lastRefresh = 0
  private readonly refreshIntervalMs = 60 * 60 * 1000 // 1 hour

  async loadFees(exchanges: Map<string, ccxt.Exchange>): Promise<void> {
    for (const [exchangeId, exchange] of exchanges) {
      const symbolFees = new Map<string, FeeSchedule>()

      for (const [symbol, market] of Object.entries(exchange.markets)) {
        const maker = market.maker ?? 0.001
        const taker = market.taker ?? 0.001
        symbolFees.set(symbol, {
          maker: new Decimal(maker),
          taker: new Decimal(taker),
        })
      }

      this.cache.set(exchangeId, symbolFees)
    }

    this.lastRefresh = Date.now()
    console.log('[FeeCalculator] fee schedules loaded')
  }

  isStale(): boolean {
    return Date.now() - this.lastRefresh > this.refreshIntervalMs
  }

  netProfit(params: {
    buyExchange:  string
    sellExchange: string
    symbol:       string
    amount:       Decimal
    buyAsk:       Decimal   // price we pay to buy
    sellBid:      Decimal   // price we receive when selling
  }): NetProfitResult {
    const { buyExchange, sellExchange, symbol, amount, buyAsk, sellBid } = params

    const buyFeeRate  = this.getTakerFee(buyExchange, symbol)
    const sellFeeRate = this.getTakerFee(sellExchange, symbol)

    const buyCost    = buyAsk.times(amount)
    const sellRevenue = sellBid.times(amount)

    const buyFee     = buyCost.times(buyFeeRate)
    const sellFee    = sellRevenue.times(sellFeeRate)

    const grossProfit = sellRevenue.minus(buyCost)
    const netProfit   = grossProfit.minus(buyFee).minus(sellFee)
    const netPct      = netProfit.div(buyCost).times(100)

    return { grossProfit, buyFee, sellFee, netProfit, netPct }
  }

  private getTakerFee(exchangeId: string, symbol: string): Decimal {
    const fee = this.cache.get(exchangeId)?.get(symbol)?.taker
    if (!fee) {
      console.warn(`[FeeCalculator] no fee for ${exchangeId}/${symbol}, using default 0.1%`)
      return new Decimal('0.001')
    }
    return fee
  }
}
