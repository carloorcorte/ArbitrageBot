import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import Decimal from 'decimal.js'
import { RiskManager, RiskError } from './risk'
import type { ArbitrageOpportunity } from './detector'

function makeOpp(buyAsk: number, amount: number): ArbitrageOpportunity {
  return {
    symbol:         'BTC/USDT',
    buyExchange:    'binance',
    sellExchange:   'kraken',
    buyAsk:         new Decimal(buyAsk),
    sellBid:        new Decimal(buyAsk + 10),
    amount:         new Decimal(amount),
    grossSpreadPct: new Decimal('0.5'),
    netProfitPct:   new Decimal('0.2'),
    detectedAt:     Date.now(),
  }
}

describe('RiskManager', () => {
  let risk: RiskManager
  let realDateNow: () => number

  beforeEach(() => {
    process.env.MAX_POSITION_USD   = '100'
    process.env.MAX_DAILY_LOSS_USD = '50'
    risk = new RiskManager()
    realDateNow = Date.now.bind(Date)
  })

  afterEach(() => {
    Date.now = realDateNow
  })

  describe('check()', () => {
    it('passes when trade is within all limits', () => {
      // buyAsk=100, amount=0.5 → tradeValue=$50 < $100
      expect(() => risk.check(makeOpp(100, 0.5))).not.toThrow()
    })

    it('throws RiskError when position exceeds MAX_POSITION_USD', () => {
      // buyAsk=100, amount=2 → tradeValue=$200 > $100
      expect(() => risk.check(makeOpp(100, 2))).toThrow(RiskError)
    })

    it('throws RiskError when daily loss limit is exceeded', () => {
      risk.recordTrade(new Decimal('-55')) // -$55 < -$50 limit
      expect(() => risk.check(makeOpp(100, 0.5))).toThrow(RiskError)
    })

    it('does not throw when daily loss is exactly at the limit', () => {
      risk.recordTrade(new Decimal('-50'))
      // exactly -$50, not less than -$50 → should pass
      expect(() => risk.check(makeOpp(100, 0.5))).not.toThrow()
    })

    it('throws RiskError when circuit breaker is active', () => {
      const now = realDateNow()
      Date.now = () => now

      risk.recordTrade(new Decimal('-1'))
      risk.recordTrade(new Decimal('-1'))
      risk.recordTrade(new Decimal('-1'))

      expect(() => risk.check(makeOpp(100, 0.5))).toThrow(RiskError)
    })
  })

  describe('recordTrade()', () => {
    it('accumulates daily PnL across trades', () => {
      risk.recordTrade(new Decimal('10'))
      risk.recordTrade(new Decimal('-3'))
      expect(risk.getStats().dailyPnl).toBe('7.0000')
    })

    it('increments tradeCount for each trade', () => {
      risk.recordTrade(new Decimal('5'))
      risk.recordTrade(new Decimal('5'))
      expect(risk.getStats().tradeCount).toBe(2)
    })

    it('resets consecutive loss counter on a winning trade', () => {
      const now = realDateNow()
      Date.now = () => now

      risk.recordTrade(new Decimal('-1'))
      risk.recordTrade(new Decimal('-1'))
      risk.recordTrade(new Decimal('5'))  // win — resets counter
      risk.recordTrade(new Decimal('-1'))
      risk.recordTrade(new Decimal('-1'))

      // only 2 consecutive losses after the win → no circuit breaker
      expect(risk.getStats().circuitBreakerActive).toBe(false)
    })
  })

  describe('circuit breaker', () => {
    it('triggers after 3 consecutive losses within 5 minutes', () => {
      const now = realDateNow()
      Date.now = () => now

      risk.recordTrade(new Decimal('-1'))
      risk.recordTrade(new Decimal('-1'))
      risk.recordTrade(new Decimal('-1'))

      expect(risk.getStats().circuitBreakerActive).toBe(true)
    })

    it('does not trigger when losses are spread over more than 5 minutes', () => {
      const start = realDateNow()

      Date.now = () => start
      risk.recordTrade(new Decimal('-1'))

      Date.now = () => start + 6 * 60 * 1000   // +6 min → window resets
      risk.recordTrade(new Decimal('-1'))

      Date.now = () => start + 12 * 60 * 1000  // +6 min again → window resets
      risk.recordTrade(new Decimal('-1'))

      expect(risk.getStats().circuitBreakerActive).toBe(false)
    })

    it('clears automatically after 30 minutes', () => {
      const start = realDateNow()
      Date.now = () => start

      risk.recordTrade(new Decimal('-1'))
      risk.recordTrade(new Decimal('-1'))
      risk.recordTrade(new Decimal('-1'))
      expect(risk.getStats().circuitBreakerActive).toBe(true)

      Date.now = () => start + 31 * 60 * 1000
      expect(risk.getStats().circuitBreakerActive).toBe(false)
    })

    it('resets the loss count to zero after triggering', () => {
      const start = realDateNow()
      Date.now = () => start

      risk.recordTrade(new Decimal('-1'))
      risk.recordTrade(new Decimal('-1'))
      risk.recordTrade(new Decimal('-1')) // triggers, resets counter to 0

      // 2 more losses right after — should not re-trigger (counter was reset)
      risk.recordTrade(new Decimal('-1'))
      risk.recordTrade(new Decimal('-1'))

      // jump past pause window — should be inactive (needs 3 new losses)
      Date.now = () => start + 31 * 60 * 1000
      expect(risk.getStats().circuitBreakerActive).toBe(false)
    })
  })

  describe('getStats()', () => {
    it('returns correct initial state', () => {
      const stats = risk.getStats()
      expect(stats.dailyPnl).toBe('0.0000')
      expect(stats.tradeCount).toBe(0)
      expect(stats.circuitBreakerActive).toBe(false)
    })
  })
})
