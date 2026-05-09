'use client'

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'
import { Info, TrendingDown, TrendingUp } from 'lucide-react'
import type { PriceTick } from '@/lib/types'

const EXCHANGES = ['binance', 'kraken', 'blofin']
const SYMBOLS   = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT', 'DOGE/USDT']

interface Props {
  prices: Record<string, Record<string, PriceTick>>
}

function fmt(value: string) {
  const n = Number(value)
  return n >= 1000
    ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : n.toFixed(4)
}

function isStale(timestamp: number) {
  return Date.now() - timestamp > 5000
}

function BestSpreadBadge({ ticks }: { ticks: (PriceTick | undefined)[] }) {
  const valid = ticks.filter((t): t is PriceTick => !!t && !isStale(t.timestamp))

  let best = 0
  for (const buyer of valid) {
    for (const seller of valid) {
      if (buyer.exchange === seller.exchange) continue
      const spread = (Number(seller.bid) - Number(buyer.ask)) / Number(buyer.ask) * 100
      if (spread > best) best = spread
    }
  }

  if (best <= 0) return <span className="text-xs text-muted-foreground">no spread</span>

  return (
    <Badge variant={best > 0.1 ? 'default' : 'secondary'} className="text-xs font-mono">
      +{best.toFixed(3)}%
    </Badge>
  )
}

function PriceCell({ tick }: { tick: PriceTick | undefined }) {
  if (!tick || isStale(tick.timestamp)) {
    return (
      <div className="rounded-lg border bg-card p-4 flex items-center justify-center text-sm text-muted-foreground">
        Waiting...
      </div>
    )
  }

  return (
    <div className="rounded-lg border bg-card p-4 grid grid-cols-2 gap-3">
      <div className="space-y-1">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <TrendingUp className="w-3 h-3" />
          <span>Buy price</span>
          <Tooltip>
            <TooltipTrigger className="cursor-help inline-flex">
              <Info className="w-3 h-3" />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-44 text-xs">
              <strong>Ask</strong> — il prezzo minimo a cui qualcuno vende.
              Questo è quanto paghi per comprare.
            </TooltipContent>
          </Tooltip>
        </div>
        <p className="text-base font-mono font-bold text-red-500">{fmt(tick.ask)}</p>
      </div>

      <div className="space-y-1">
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <TrendingDown className="w-3 h-3" />
          <span>Sell price</span>
          <Tooltip>
            <TooltipTrigger className="cursor-help inline-flex">
              <Info className="w-3 h-3" />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-44 text-xs">
              <strong>Bid</strong> — il prezzo massimo a cui qualcuno compra.
              Questo è quanto ricevi quando vendi.
            </TooltipContent>
          </Tooltip>
        </div>
        <p className="text-base font-mono font-bold text-green-600">{fmt(tick.bid)}</p>
      </div>
    </div>
  )
}

const GRID = `grid-cols-[120px_repeat(${EXCHANGES.length},minmax(0,1fr))]`

export function PriceTable({ prices }: Props) {
  return (
    <div className="space-y-3 overflow-x-auto">
      {/* Column headers */}
      <div className={`grid ${GRID} gap-3 items-center min-w-[600px]`}>
        <div />
        {EXCHANGES.map((ex) => (
          <div key={ex} className="text-sm font-semibold capitalize text-center">{ex}</div>
        ))}
      </div>

      {/* Rows: one per symbol */}
      {SYMBOLS.map((symbol) => {
        const row   = prices[symbol] ?? {}
        const ticks = EXCHANGES.map((ex) => row[ex])

        return (
          <div key={symbol} className={`grid ${GRID} gap-3 items-center min-w-[600px]`}>
            <div className="space-y-1">
              <p className="font-mono font-semibold text-sm">{symbol}</p>
              <BestSpreadBadge ticks={ticks} />
            </div>

            {EXCHANGES.map((ex) => (
              <PriceCell key={ex} tick={row[ex]} />
            ))}
          </div>
        )
      })}
    </div>
  )
}
