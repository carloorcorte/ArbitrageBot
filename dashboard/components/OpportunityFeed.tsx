'use client'

import { Badge } from '@/components/ui/badge'
import { ArrowRight } from 'lucide-react'
import type { ArbitrageOpportunity } from '@/lib/types'

interface Props {
  opportunities: ArbitrageOpportunity[]
}

function NetProfitBadge({ pct }: { pct: string }) {
  const n = Number(pct)
  const color = n >= 0.5
    ? 'bg-green-100 text-green-800 border-green-200'
    : n >= 0.2
    ? 'bg-yellow-100 text-yellow-800 border-yellow-200'
    : 'bg-zinc-100 text-zinc-700 border-zinc-200'

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold font-mono ${color}`}>
      +{n.toFixed(4)}%
    </span>
  )
}

function fmt(value: string) {
  const n = Number(value)
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function OpportunityFeed({ opportunities }: Props) {
  if (opportunities.length === 0) {
    return (
      <div className="py-10 text-center space-y-2">
        <p className="text-sm font-medium text-muted-foreground">Monitoring markets...</p>
        <p className="text-xs text-muted-foreground">
          An opportunity appears when buying on one exchange and selling on another yields a net profit after fees.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {opportunities.map((opp, i) => (
        <div
          key={i}
          className="flex items-center justify-between rounded-lg border bg-card px-4 py-3 gap-4"
        >
          {/* Left: time + symbol */}
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-xs text-muted-foreground tabular-nums shrink-0">
              {new Date(opp.detectedAt).toLocaleTimeString()}
            </span>
            <span className="font-mono font-semibold text-sm shrink-0">{opp.symbol}</span>
          </div>

          {/* Center: trade direction */}
          <div className="flex items-center gap-2 text-sm flex-1 justify-center">
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-0.5">Buy at</p>
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className="capitalize font-medium">{opp.buyExchange}</Badge>
                <span className="font-mono text-red-500 text-xs">{fmt(opp.buyAsk)}</span>
              </div>
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-0.5">Sell at</p>
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className="capitalize font-medium">{opp.sellExchange}</Badge>
                <span className="font-mono text-green-600 text-xs">{fmt(opp.sellBid)}</span>
              </div>
            </div>
          </div>

          {/* Right: net profit */}
          <div className="text-right shrink-0">
            <p className="text-xs text-muted-foreground mb-0.5">Net profit</p>
            <NetProfitBadge pct={opp.netProfitPct} />
          </div>
        </div>
      ))}
    </div>
  )
}
