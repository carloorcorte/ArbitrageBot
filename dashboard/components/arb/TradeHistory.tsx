'use client'

import { ExchangePill } from './atoms'
import { fmtPrice, fmtTime } from '@/lib/fmt'
import { EXCHANGES } from '@/lib/exchanges'
import type { Trade } from '@/lib/types'

export interface PairedTrade {
  id:         number
  ts:         number
  symbol:     string
  buyEx:      string
  sellEx:     string
  buyPrice:   number
  sellPrice:  number
  amount:     number
  pnl:        number
  mode:       'paper' | 'live'
  status:     'filled' | 'failed'
}

export function pairTrades(trades: Trade[]): PairedTrade[] {
  const byOpp = new Map<number, Trade[]>()
  for (const t of trades) {
    if (!t.opportunityId) continue
    const arr = byOpp.get(t.opportunityId) ?? []
    arr.push(t)
    byOpp.set(t.opportunityId, arr)
  }

  const result: PairedTrade[] = []
  for (const [id, legs] of byOpp) {
    const buy  = legs.find((l) => l.side === 'buy')
    const sell = legs.find((l) => l.side === 'sell')
    if (!buy || !sell) continue

    const buyPrice  = Number(buy.price)
    const sellPrice = Number(sell.price)
    const amount    = Number(buy.amount)
    const buyFee    = Number(buy.feePaid)
    const sellFee   = Number(sell.feePaid)
    const pnl = sellPrice * amount - buyPrice * amount - buyFee - sellFee

    result.push({
      id,
      ts:        new Date(buy.executedAt).getTime(),
      symbol:    buy.symbol,
      buyEx:     buy.exchange,
      sellEx:    sell.exchange,
      buyPrice,
      sellPrice,
      amount,
      pnl,
      mode:   buy.mode,
      status: buy.status === 'filled' && sell.status === 'filled' ? 'filled' : 'failed',
    })
  }

  return result.sort((a, b) => b.ts - a.ts)
}

interface Props {
  trades:  PairedTrade[]
  loading: boolean
  limit?:  number
}

export function TradeHistory({ trades, loading, limit = 10 }: Props) {
  if (loading) {
    return (
      <div className="py-8 text-center font-mono text-[12px]" style={{ color: 'var(--muted)' }}>
        Loading…
      </div>
    )
  }

  if (!trades.length) {
    return (
      <div className="py-8 text-center font-mono text-[12px]" style={{ color: 'var(--muted)' }}>
        No executions yet
      </div>
    )
  }

  const rows = trades.slice(0, limit)

  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-full" style={{ borderCollapse: 'separate', borderSpacing: 0, minWidth: 640 }}>
        <thead>
          <tr style={{ color: 'var(--muted)' }}>
            {['Time', 'Symbol', 'Route', 'Buy', 'Sell', 'Size', 'P&L', 'Status'].map((h) => (
              <th key={h} className="text-left px-3 py-2 font-mono uppercase tracking-[0.14em]"
                  style={{ fontSize: 10 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((t) => {
            const pnlColor = t.pnl > 0 ? 'var(--pos)' : t.pnl < 0 ? 'var(--neg)' : 'var(--muted)'
            return (
              <tr key={t.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td className="px-3 py-2.5 font-mono text-[11px] tabular-nums whitespace-nowrap"
                    style={{ color: 'var(--muted)' }}>
                  {fmtTime(t.ts)}
                </td>
                <td className="px-3 py-2.5 font-mono font-semibold text-[12px]" style={{ color: 'var(--fg)' }}>
                  {t.symbol.replace('/USDT', '')}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5 flex-nowrap">
                    <ExchangePill ex={t.buyEx}  exchanges={EXCHANGES} />
                    <span style={{ color: 'var(--muted)' }}>→</span>
                    <ExchangePill ex={t.sellEx} exchanges={EXCHANGES} />
                  </div>
                </td>
                <td className="px-3 py-2.5 font-mono text-[12px] tabular-nums" style={{ color: 'var(--neg)' }}>
                  {fmtPrice(t.buyPrice, t.symbol)}
                </td>
                <td className="px-3 py-2.5 font-mono text-[12px] tabular-nums" style={{ color: 'var(--pos)' }}>
                  {fmtPrice(t.sellPrice, t.symbol)}
                </td>
                <td className="px-3 py-2.5 font-mono text-[11.5px] tabular-nums" style={{ color: 'var(--fg)' }}>
                  {t.amount.toFixed(4)}
                </td>
                <td className="px-3 py-2.5 font-mono font-semibold text-[12px] tabular-nums" style={{ color: pnlColor }}>
                  {t.pnl > 0 ? '+' : ''}{t.pnl.toFixed(4)}$
                </td>
                <td className="px-3 py-2.5">
                  {t.status === 'filled' ? (
                    <span className="font-mono uppercase tracking-[0.1em] text-[9.5px]"
                          style={{ color: 'var(--pos)', padding: '1px 5px', borderRadius: 2, background: 'rgba(120,210,145,0.10)' }}>
                      filled
                    </span>
                  ) : (
                    <span className="font-mono uppercase tracking-[0.1em] text-[9.5px]"
                          style={{ color: 'var(--neg)', padding: '1px 5px', borderRadius: 2, background: 'rgba(220,110,110,0.10)' }}>
                      failed
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
