import Decimal from 'decimal.js'
import type { ArbitrageOpportunity } from './detector'

export class RiskError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RiskError'
  }
}

interface CircuitBreakerState {
  consecutiveLosses: number
  firstLossAt:       number
  pausedUntil:       number
}

export class RiskManager {
  private dailyPnl     = new Decimal(0)
  private tradeCount   = 0
  private dailyResetAt = this.startOfDay()

  private readonly maxPositionUsd:  Decimal
  private readonly maxDailyLossUsd: Decimal

  // Circuit breaker: 3 consecutive losses within 5 minutes → pause 30 minutes
  private readonly cb: CircuitBreakerState = {
    consecutiveLosses: 0,
    firstLossAt: 0,
    pausedUntil: 0,
  }

  constructor(private readonly onCircuitBreaker?: (message: string) => void) {
    this.maxPositionUsd  = new Decimal(process.env.MAX_POSITION_USD   ?? '100')
    this.maxDailyLossUsd = new Decimal(process.env.MAX_DAILY_LOSS_USD ?? '50')
  }

  check(opp: ArbitrageOpportunity): void {
    this.resetDailyIfNeeded()

    const tradeValueUsd = opp.buyAsk.times(opp.amount)

    if (tradeValueUsd.gt(this.maxPositionUsd))
      throw new RiskError(`Position too large: $${tradeValueUsd.toFixed(2)} > $${this.maxPositionUsd}`)

    if (this.dailyPnl.lt(this.maxDailyLossUsd.neg()))
      throw new RiskError(`Daily loss limit reached: $${this.dailyPnl.toFixed(2)}`)

    if (Date.now() < this.cb.pausedUntil) {
      const resumesIn = Math.ceil((this.cb.pausedUntil - Date.now()) / 1000 / 60)
      throw new RiskError(`Circuit breaker active, resumes in ${resumesIn}m`)
    }
  }

  recordTrade(pnlUsd: Decimal): void {
    this.resetDailyIfNeeded()
    this.dailyPnl = this.dailyPnl.plus(pnlUsd)
    this.tradeCount++

    if (pnlUsd.lt(0)) {
      const now = Date.now()
      // Reset window if first loss was more than 5 minutes ago
      if (now - this.cb.firstLossAt > 5 * 60 * 1000) {
        this.cb.consecutiveLosses = 0
        this.cb.firstLossAt = now
      }
      this.cb.consecutiveLosses++

      if (this.cb.consecutiveLosses >= 3) {
        this.cb.pausedUntil = now + 30 * 60 * 1000
        const msg = '3 consecutive losses in 5 minutes — pausing for 30 minutes'
        console.warn('[RiskManager] circuit breaker triggered —', msg)
        this.onCircuitBreaker?.(msg)
        this.cb.consecutiveLosses = 0
      }
    } else {
      this.cb.consecutiveLosses = 0
    }
  }

  getStats(): { dailyPnl: string; tradeCount: number; circuitBreakerActive: boolean } {
    return {
      dailyPnl:             this.dailyPnl.toFixed(4),
      tradeCount:           this.tradeCount,
      circuitBreakerActive: Date.now() < this.cb.pausedUntil,
    }
  }

  private resetDailyIfNeeded(): void {
    if (Date.now() >= this.dailyResetAt + 86_400_000) {
      this.dailyPnl     = new Decimal(0)
      this.tradeCount   = 0
      this.dailyResetAt = this.startOfDay()
      console.log('[RiskManager] daily stats reset')
    }
  }

  private startOfDay(): number {
    const d = new Date()
    d.setHours(0, 0, 0, 0)
    return d.getTime()
  }
}
