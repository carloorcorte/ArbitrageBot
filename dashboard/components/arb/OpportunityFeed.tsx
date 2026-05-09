'use client'

import { ExchangePill } from './atoms'
import { fmtPrice, fmtPct, fmtRelative, fmtTime } from '@/lib/fmt'
import { EXCHANGES } from '@/lib/exchanges'
import type { ArbitrageOpportunity } from '@/lib/types'

interface Props {
  opportunities: ArbitrageOpportunity[]
  now: number
}

export function OpportunityFeed({ opportunities, now }: Props) {
  if (!opportunities.length) {
    return (
      <div className="py-12 text-center" style={{ color: 'var(--muted)' }}>
        <p className="text-sm font-mono">Monitoring markets…</p>
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {opportunities.slice(0, 24).map((opp, i) => {
        const net = Number(opp.netProfitPct)
        const toneColor = net >= 0.4 ? 'var(--pos)' : net >= 0.15 ? 'var(--accent)' : 'var(--muted)'
        const isNew = i === 0 && now - opp.detectedAt < 4000

        return (
          <li
            key={i}
            className="grid items-center gap-3 px-3 py-2.5"
            style={{
              gridTemplateColumns: '52px 1fr auto',
              background: isNew ? 'var(--panel-2)' : 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 4,
              transition: 'background 1s linear',
            }}
          >
            <div className="flex flex-col">
              <span className="font-mono text-[10.5px] tabular-nums" style={{ color: 'var(--muted)' }}>
                {fmtRelative(opp.detectedAt, now)}
              </span>
              <span className="font-mono text-[9.5px] tabular-nums opacity-60" style={{ color: 'var(--muted)' }}>
                {fmtTime(opp.detectedAt)}
              </span>
            </div>

            <div className="flex flex-col gap-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-mono font-semibold text-[12.5px]" style={{ color: 'var(--fg)' }}>
                  {opp.symbol.replace('/USDT', '')}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] font-mono flex-wrap">
                <ExchangePill ex={opp.buyExchange}  exchanges={EXCHANGES} />
                <span style={{ color: 'var(--neg)' }}>{fmtPrice(opp.buyAsk, opp.symbol)}</span>
                <span style={{ color: 'var(--muted)' }}>→</span>
                <ExchangePill ex={opp.sellExchange} exchanges={EXCHANGES} />
                <span style={{ color: 'var(--pos)' }}>{fmtPrice(opp.sellBid, opp.symbol)}</span>
              </div>
            </div>

            <div className="flex flex-col items-end">
              <span className="font-mono font-semibold text-[14px] tabular-nums" style={{ color: toneColor }}>
                {fmtPct(net, 3)}
              </span>
              <span className="font-mono text-[10px]" style={{ color: 'var(--muted)' }}>
                gross {fmtPct(Number(opp.grossSpreadPct), 3)}
              </span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
