import Decimal from 'decimal.js'
import ccxt from 'ccxt'
import type { Exchange } from 'ccxt'
import { db } from '../db/client'
import { opportunities, trades } from '../db/schema'
import { RiskManager, RiskError } from './risk'
import type { ArbitrageOpportunity } from './detector'

export interface ExchangeConfig {
  id:      string
  apiKey?: string
  secret?: string
}

export class Executor {
  private readonly paperMode: boolean
  private readonly liveExchanges = new Map<string, Exchange>()

  constructor(
    private readonly riskManager:      RiskManager,
    private readonly exchangeConfigs:  ExchangeConfig[] = [],
    private readonly onLegRisk?:       (message: string) => void,
  ) {
    this.paperMode = process.env.PAPER_TRADING !== 'false'
    console.log(`[Executor] mode: ${this.paperMode ? 'PAPER' : 'LIVE'}`)
  }

  private getLiveExchange(id: string): Exchange {
    if (!this.liveExchanges.has(id)) {
      const config = this.exchangeConfigs.find((c) => c.id === id)
      if (!config) throw new Error(`No config for exchange: ${id}`)
      const ExchangeClass = (ccxt as unknown as Record<string, new (cfg: object) => Exchange>)[id]
      if (!ExchangeClass) throw new Error(`Unsupported exchange: ${id}`)
      this.liveExchanges.set(id, new ExchangeClass({
        apiKey: config.apiKey,
        secret: config.secret,
        enableRateLimit: true,
      }))
    }
    return this.liveExchanges.get(id)!
  }

  async execute(opp: ArbitrageOpportunity): Promise<void> {
    try {
      this.riskManager.check(opp)
    } catch (err) {
      if (err instanceof RiskError) {
        console.warn(`[Executor] skipped (risk): ${err.message}`)
        await this.logOpportunity(opp, 'skipped_risk')
        return
      }
      throw err
    }

    if (this.paperMode) {
      await this.paperExecute(opp)
    } else {
      await this.liveExecute(opp)
    }
  }

  private async paperExecute(opp: ArbitrageOpportunity): Promise<void> {
    const [savedOpp] = await db.insert(opportunities).values({
      symbol:          opp.symbol,
      buyExchange:     opp.buyExchange,
      sellExchange:    opp.sellExchange,
      buyPrice:        opp.buyAsk.toString(),
      sellPrice:       opp.sellBid.toString(),
      grossSpreadPct:  opp.grossSpreadPct.toString(),
      netProfitPct:    opp.netProfitPct.toString(),
      estimatedAmount: opp.amount.toString(),
      status:          'executed',
    }).returning()

    if (!savedOpp) throw new Error('Failed to insert opportunity')

    const buyFeeRate  = new Decimal('0.001') // simplified for paper mode
    const sellFeeRate = new Decimal('0.001')

    await db.insert(trades).values([
      {
        opportunityId: savedOpp.id,
        exchange:      opp.buyExchange,
        side:          'buy',
        symbol:        opp.symbol,
        amount:        opp.amount.toString(),
        price:         opp.buyAsk.toString(),
        feePaid:       opp.buyAsk.times(opp.amount).times(buyFeeRate).toString(),
        feeCurrency:   'USDT',
        mode:          'paper',
        status:        'filled',
      },
      {
        opportunityId: savedOpp.id,
        exchange:      opp.sellExchange,
        side:          'sell',
        symbol:        opp.symbol,
        amount:        opp.amount.toString(),
        price:         opp.sellBid.toString(),
        feePaid:       opp.sellBid.times(opp.amount).times(sellFeeRate).toString(),
        feeCurrency:   'USDT',
        mode:          'paper',
        status:        'filled',
      },
    ])

    const netPnlUsd = opp.netProfitPct.div(100).times(opp.buyAsk).times(opp.amount)
    this.riskManager.recordTrade(netPnlUsd)

    console.log(
      `[Executor] paper trade executed: ${opp.symbol}` +
      ` buy@${opp.buyExchange} sell@${opp.sellExchange}` +
      ` net=$${netPnlUsd.toFixed(4)}`,
    )
  }

  private async liveExecute(opp: ArbitrageOpportunity): Promise<void> {
    const buyEx  = this.getLiveExchange(opp.buyExchange)
    const sellEx = this.getLiveExchange(opp.sellExchange)
    const amount = opp.amount.toNumber()

    // Record opportunity before touching the exchanges
    const [savedOpp] = await db.insert(opportunities).values({
      symbol:          opp.symbol,
      buyExchange:     opp.buyExchange,
      sellExchange:    opp.sellExchange,
      buyPrice:        opp.buyAsk.toString(),
      sellPrice:       opp.sellBid.toString(),
      grossSpreadPct:  opp.grossSpreadPct.toString(),
      netProfitPct:    opp.netProfitPct.toString(),
      estimatedAmount: opp.amount.toString(),
      status:          'executed',
    }).returning()

    if (!savedOpp) throw new Error('Failed to insert opportunity')

    // Place both legs simultaneously — never await sequentially
    const [buyResult, sellResult] = await Promise.allSettled([
      buyEx.createOrder(opp.symbol,  'market', 'buy',  amount),
      sellEx.createOrder(opp.symbol, 'market', 'sell', amount),
    ])

    const buyOk  = buyResult.status  === 'fulfilled'
    const sellOk = sellResult.status === 'fulfilled'

    const buyOrder  = buyOk  ? (buyResult  as PromiseFulfilledResult<Awaited<ReturnType<Exchange['createOrder']>>>).value : null
    const sellOrder = sellOk ? (sellResult as PromiseFulfilledResult<Awaited<ReturnType<Exchange['createOrder']>>>).value : null

    // Leg risk: one side executed, the other didn't → unwind immediately
    if (buyOk && !sellOk) {
      // Bought but couldn't sell → sell back on the buy exchange to go flat
      await this.unwind(buyEx, opp.symbol, 'sell', buyOrder!.filled ?? amount, opp.buyExchange, savedOpp.id, opp.buyAsk)
    } else if (!buyOk && sellOk) {
      // Sold but couldn't buy → buy back on the sell exchange to go flat
      await this.unwind(sellEx, opp.symbol, 'buy', sellOrder!.filled ?? amount, opp.sellExchange, savedOpp.id, opp.sellBid)
    }

    await db.insert(trades).values([
      {
        opportunityId: savedOpp.id,
        exchange:      opp.buyExchange,
        side:          'buy',
        symbol:        opp.symbol,
        amount:        (buyOrder?.filled ?? amount).toString(),
        price:         (buyOrder?.average ?? buyOrder?.price ?? opp.buyAsk.toNumber()).toString(),
        feePaid:       (buyOrder?.fee?.cost ?? 0).toString(),
        feeCurrency:   buyOrder?.fee?.currency ?? 'USDT',
        orderId:       buyOrder?.id ?? null,
        mode:          'live',
        status:        buyOk ? 'filled' : 'failed',
      },
      {
        opportunityId: savedOpp.id,
        exchange:      opp.sellExchange,
        side:          'sell',
        symbol:        opp.symbol,
        amount:        (sellOrder?.filled ?? amount).toString(),
        price:         (sellOrder?.average ?? sellOrder?.price ?? opp.sellBid.toNumber()).toString(),
        feePaid:       (sellOrder?.fee?.cost ?? 0).toString(),
        feeCurrency:   sellOrder?.fee?.currency ?? 'USDT',
        orderId:       sellOrder?.id ?? null,
        mode:          'live',
        status:        sellOk ? 'filled' : 'failed',
      },
    ])

    if (buyOk && sellOk) {
      const fillBuy  = new Decimal(buyOrder!.average  ?? buyOrder!.price  ?? opp.buyAsk)
      const fillSell = new Decimal(sellOrder!.average ?? sellOrder!.price ?? opp.sellBid)
      const fillAmt  = new Decimal(buyOrder!.filled   ?? amount)
      const buyCost  = fillBuy.times(fillAmt)
      const sellRev  = fillSell.times(fillAmt)
      const buyFee   = new Decimal(buyOrder!.fee?.cost  ?? 0)
      const sellFee  = new Decimal(sellOrder!.fee?.cost ?? 0)
      const netPnl   = sellRev.minus(buyCost).minus(buyFee).minus(sellFee)

      this.riskManager.recordTrade(netPnl)
      console.log(
        `[Executor] live trade executed: ${opp.symbol}` +
        ` buy@${opp.buyExchange}(${fillBuy.toFixed(4)}) sell@${opp.sellExchange}(${fillSell.toFixed(4)})` +
        ` net=$${netPnl.toFixed(4)}`,
      )
    } else if (!buyOk) {
      console.error('[Executor] buy order failed:', (buyResult as PromiseRejectedResult).reason)
    } else {
      console.error('[Executor] sell order failed:', (sellResult as PromiseRejectedResult).reason)
    }
  }

  private async unwind(
    exchange:    Exchange,
    symbol:      string,
    side:        'buy' | 'sell',
    amount:      number,
    exchangeId:  string,
    oppId:       number,
    originalPrice: Decimal,
  ): Promise<void> {
    console.warn(`[Executor] leg risk — unwinding: ${side} ${amount} ${symbol} on ${exchangeId}`)
    try {
      const order = await exchange.createOrder(symbol, 'market', side, amount)

      await db.insert(trades).values({
        opportunityId: oppId,
        exchange:      exchangeId,
        side,
        symbol,
        amount:      (order.filled   ?? amount).toString(),
        price:       (order.average  ?? order.price ?? 0).toString(),
        feePaid:     (order.fee?.cost ?? 0).toString(),
        feeCurrency: order.fee?.currency ?? 'USDT',
        orderId:     order.id ?? null,
        mode:        'live',
        status:      'filled',
      })

      const fillPrice = new Decimal(order.average ?? order.price ?? originalPrice)
      const fillAmt   = new Decimal(order.filled ?? amount)
      const fee       = new Decimal(order.fee?.cost ?? 0)

      // PnL of the unwind: for a sell-unwind we sold below what we paid; for buy-unwind we bought above what we received
      const pnl = side === 'sell'
        ? fillPrice.minus(originalPrice).times(fillAmt).minus(fee)  // selling back below buy price
        : originalPrice.minus(fillPrice).times(fillAmt).minus(fee)  // buying back above sell price

      this.riskManager.recordTrade(pnl)

      const msg = `⚠️ Leg risk on ${symbol} — auto-unwind ${side} on ${exchangeId}: ✅ resolved (loss ~$${pnl.abs().toFixed(2)})`
      console.warn('[Executor]', msg)
      this.onLegRisk?.(msg)
    } catch (err) {
      const msg =
        `🚨 Leg risk on ${symbol} — auto-unwind FAILED on ${exchangeId}!\n` +
        `Error: ${(err as Error).message}\n` +
        `Close the ${side === 'sell' ? 'long' : 'short'} position MANUALLY on ${exchangeId}.`
      console.error('[Executor]', msg)
      this.onLegRisk?.(msg)
    }
  }

  private async logOpportunity(
    opp: ArbitrageOpportunity,
    status: 'detected' | 'expired' | 'skipped_risk' | 'skipped_fees',
  ): Promise<void> {
    await db.insert(opportunities).values({
      symbol:          opp.symbol,
      buyExchange:     opp.buyExchange,
      sellExchange:    opp.sellExchange,
      buyPrice:        opp.buyAsk.toString(),
      sellPrice:       opp.sellBid.toString(),
      grossSpreadPct:  opp.grossSpreadPct.toString(),
      netProfitPct:    opp.netProfitPct.toString(),
      estimatedAmount: opp.amount.toString(),
      status,
    })
  }
}
