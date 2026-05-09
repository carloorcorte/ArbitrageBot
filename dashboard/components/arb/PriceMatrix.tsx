'use client'

import { FlashCell } from './atoms'
import { fmtPrice, fmtPct } from '@/lib/fmt'
import { EXCHANGES, SYMBOLS } from '@/lib/exchanges'
import type { PriceTick } from '@/lib/types'

interface Props {
  prices: Record<string, Record<string, PriceTick>>
}

function bestRoute(row: Record<string, PriceTick | undefined>) {
  let best: { buyEx: string; sellEx: string; buyAsk: number; sellBid: number; grossPct: number; netPct: number } | null = null
  for (const buyer of EXCHANGES) {
    for (const seller of EXCHANGES) {
      if (buyer.id === seller.id) continue
      const buy  = row[buyer.id]
      const sell = row[seller.id]
      if (!buy || !sell) continue
      const grossPct = (Number(sell.bid) - Number(buy.ask)) / Number(buy.ask) * 100
      const netPct = grossPct - 0.10
      if (!best || netPct > best.netPct) {
        best = { buyEx: buyer.id, sellEx: seller.id, buyAsk: Number(buy.ask), sellBid: Number(sell.bid), grossPct, netPct }
      }
    }
  }
  return best
}

function isStale(ts: number) { return Date.now() - ts > 2_000 }

export function PriceMatrix({ prices }: Props) {
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="w-full" style={{ borderCollapse: 'separate', borderSpacing: 0, minWidth: 760 }}>
        <thead>
          <tr>
            <th className="text-left px-3 py-2 font-mono uppercase tracking-[0.14em]"
                style={{ fontSize: 10, color: 'var(--muted)' }}>Symbol</th>
            {EXCHANGES.map((ex) => (
              <th key={ex.id} className="text-right px-3 py-2" style={{ fontSize: 10, color: 'var(--muted)' }}>
                <div className="inline-flex items-center gap-1.5 font-mono uppercase tracking-[0.14em]">
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: ex.tone, display: 'inline-block' }} />
                  {ex.name}
                </div>
              </th>
            ))}
            <th className="text-right pr-3 pl-4 py-2 font-mono uppercase tracking-[0.14em]"
                style={{ fontSize: 10, color: 'var(--muted)', width: 140 }}>Best route</th>
          </tr>
        </thead>
        <tbody>
          {SYMBOLS.map((symbol) => {
            const row = prices[symbol] ?? {}
            let bestAsk: { ex: string; ask: number } | null = null
            let bestBid: { ex: string; bid: number } | null = null
            for (const ex of EXCHANGES) {
              const p = row[ex.id]
              if (!p || isStale(p.timestamp)) continue
              if (!bestAsk || Number(p.ask) < bestAsk.ask) bestAsk = { ex: ex.id, ask: Number(p.ask) }
              if (!bestBid || Number(p.bid) > bestBid.bid) bestBid = { ex: ex.id, bid: Number(p.bid) }
            }
            const route = bestRoute(
              Object.fromEntries(
                EXCHANGES.map((ex) => [ex.id, row[ex.id] && !isStale(row[ex.id]!.timestamp) ? row[ex.id] : undefined])
              )
            )

            return (
              <tr key={symbol} style={{ borderTop: '1px solid var(--border)' }}>
                <td className="px-3 py-3 align-middle">
                  <div className="font-mono font-semibold" style={{ fontSize: 13, color: 'var(--fg)' }}>
                    {symbol.replace('/USDT', '')}
                    <span style={{ color: 'var(--muted)' }}>/USDT</span>
                  </div>
                </td>
                {EXCHANGES.map((ex) => {
                  const p = row[ex.id]
                  const stale = !p || isStale(p.timestamp)
                  const isBestAsk = bestAsk?.ex === ex.id
                  const isBestBid = bestBid?.ex === ex.id
                  if (stale) {
                    return (
                      <td key={ex.id} className="px-3 py-2 text-right font-mono text-[12px]"
                          style={{ color: 'var(--muted)' }}>—</td>
                    )
                  }
                  return (
                    <td key={ex.id} className="px-3 py-2 text-right align-middle"
                        style={{ background: isBestAsk || isBestBid ? 'var(--panel-2)' : 'transparent' }}>
                      <div className="flex flex-col items-end gap-0.5">
                        <FlashCell
                          value={Number(p.ask)}
                          formatter={(v) => fmtPrice(v, symbol)}
                          className="font-mono text-[13px]"
                        />
                        <FlashCell
                          value={Number(p.bid)}
                          formatter={(v) => fmtPrice(v, symbol)}
                          className="font-mono text-[12px] opacity-70"
                        />
                        <div className="flex gap-1 mt-0.5">
                          {isBestAsk && (
                            <span className="font-mono uppercase" style={{
                              fontSize: 8.5, padding: '1px 4px', borderRadius: 2,
                              background: 'rgba(220,110,110,0.16)', color: 'var(--neg)', letterSpacing: '0.1em',
                            }}>buy</span>
                          )}
                          {isBestBid && (
                            <span className="font-mono uppercase" style={{
                              fontSize: 8.5, padding: '1px 4px', borderRadius: 2,
                              background: 'rgba(120,210,145,0.16)', color: 'var(--pos)', letterSpacing: '0.1em',
                            }}>sell</span>
                          )}
                        </div>
                      </div>
                    </td>
                  )
                })}
                <td className="pr-3 pl-4 py-2 text-right align-middle">
                  {route ? (
                    <div className="flex flex-col items-end gap-1">
                      <span className="font-mono font-semibold" style={{
                        fontSize: 13,
                        color: route.netPct > 0.1 ? 'var(--pos)' : route.netPct > 0 ? 'var(--accent)' : 'var(--muted)',
                      }}>
                        {fmtPct(route.netPct, 3)}
                      </span>
                      <div className="flex items-center gap-1 text-[10px] font-mono" style={{ color: 'var(--muted)' }}>
                        <span>{EXCHANGES.find(e => e.id === route.buyEx)?.name.slice(0, 3).toUpperCase()}</span>
                        <span>→</span>
                        <span>{EXCHANGES.find(e => e.id === route.sellEx)?.name.slice(0, 3).toUpperCase()}</span>
                      </div>
                    </div>
                  ) : <span style={{ color: 'var(--muted)' }}>—</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <div className="px-3 py-2 mt-1 flex items-center gap-4 text-[10.5px] font-mono"
           style={{ color: 'var(--muted)', borderTop: '1px solid var(--border)' }}>
        <span><span style={{ color: 'var(--neg)' }}>●</span> ASK · what you pay</span>
        <span><span style={{ color: 'var(--pos)' }}>●</span> BID · what you receive</span>
        <span className="ml-auto">net % includes 0.10% fee per leg</span>
      </div>
    </div>
  )
}
