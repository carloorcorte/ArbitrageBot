'use client'

import { Badge } from '@/components/ui/badge'
import { ArrowRight } from 'lucide-react'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import type { Trade } from '@/lib/types'

interface Props {
  trades:  Trade[]
  loading: boolean
}

interface TradeGroup {
  key:          string
  date:         string   // YYYY-MM-DD
  symbol:       string
  buyExchange:  string
  sellExchange: string
  mode:         'paper' | 'live'
  count:        number
  avgBuyPrice:  number
  avgSellPrice: number
  totalNetPnl:  number
  failedCount:  number
}

function groupTrades(trades: Trade[]): TradeGroup[] {
  const pairs = new Map<number, { buy?: Trade; sell?: Trade }>()

  for (const trade of trades) {
    if (trade.opportunityId == null) continue
    if (!pairs.has(trade.opportunityId)) pairs.set(trade.opportunityId, {})
    const p = pairs.get(trade.opportunityId)!
    if (trade.side === 'buy') p.buy = trade
    else                      p.sell = trade
  }

  const groups = new Map<string, TradeGroup>()

  for (const { buy, sell } of pairs.values()) {
    if (!buy || !sell) continue

    const date = buy.executedAt.slice(0, 10)
    const key  = `${date}|${buy.symbol}|${buy.exchange}|${sell.exchange}|${buy.mode}`

    const buyCost   = Number(buy.price)  * Number(buy.amount)  + Number(buy.feePaid)
    const sellRev   = Number(sell.price) * Number(sell.amount) - Number(sell.feePaid)
    const netPnl    = sellRev - buyCost
    const failed    = buy.status === 'failed' || sell.status === 'failed' ? 1 : 0

    if (!groups.has(key)) {
      groups.set(key, {
        key, date, symbol: buy.symbol,
        buyExchange: buy.exchange, sellExchange: sell.exchange,
        mode: buy.mode, count: 0,
        avgBuyPrice: 0, avgSellPrice: 0,
        totalNetPnl: 0, failedCount: 0,
      })
    }

    const g = groups.get(key)!
    // running average
    g.avgBuyPrice  = (g.avgBuyPrice  * g.count + Number(buy.price))  / (g.count + 1)
    g.avgSellPrice = (g.avgSellPrice * g.count + Number(sell.price)) / (g.count + 1)
    g.totalNetPnl += netPnl
    g.failedCount += failed
    g.count++
  }

  return [...groups.values()].sort((a, b) => b.date.localeCompare(a.date))
}

function PnlCell({ usd }: { usd: number }) {
  const color = usd > 0 ? 'text-green-600' : usd < 0 ? 'text-red-500' : 'text-muted-foreground'
  return (
    <span className={`font-mono text-xs font-semibold ${color}`}>
      {usd > 0 ? '+' : ''}{usd.toFixed(4)}$
    </span>
  )
}

export function TradeHistory({ trades, loading }: Props) {
  if (loading) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Loading...</p>
  }

  const groups = groupTrades(trades)

  if (groups.length === 0) {
    return (
      <div className="py-10 text-center space-y-2">
        <p className="text-sm font-medium text-muted-foreground">No trades yet</p>
        <p className="text-xs text-muted-foreground">
          Trades appear here once an opportunity is executed.
        </p>
      </div>
    )
  }

  const totalExecutions = groups.reduce((s, g) => s + g.count, 0)
  const totalPnl        = groups.reduce((s, g) => s + g.totalNetPnl, 0)
  const paperCount      = groups.filter((g) => g.mode === 'paper').reduce((s, g) => s + g.count, 0)
  const liveCount       = groups.filter((g) => g.mode === 'live').reduce((s, g) => s + g.count, 0)

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span>{totalExecutions} executions</span>
        {paperCount > 0 && <Badge variant="secondary">📋 {paperCount} paper</Badge>}
        {liveCount  > 0 && <Badge variant="default">⚡ {liveCount} live</Badge>}
        <span className="ml-auto font-medium">
          Total P&amp;L: <PnlCell usd={totalPnl} />
        </span>
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Symbol</TableHead>
            <TableHead>Route</TableHead>
            <TableHead className="text-right">Executions</TableHead>
            <TableHead className="text-right">Avg buy</TableHead>
            <TableHead className="text-right">Avg sell</TableHead>
            <TableHead className="text-right">Total P&amp;L</TableHead>
            <TableHead>Mode</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map((g) => (
            <TableRow key={g.key}>
              <TableCell className="text-xs text-muted-foreground tabular-nums">{g.date}</TableCell>
              <TableCell className="font-mono font-semibold text-xs">{g.symbol}</TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="capitalize">{g.buyExchange}</span>
                  <ArrowRight className="w-3 h-3 text-muted-foreground" />
                  <span className="capitalize">{g.sellExchange}</span>
                </div>
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1.5">
                  <span className="font-mono text-xs">{g.count}</span>
                  {g.failedCount > 0 && (
                    <span className="text-xs text-red-500">({g.failedCount} failed)</span>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-right font-mono text-xs text-red-500">
                {g.avgBuyPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
              </TableCell>
              <TableCell className="text-right font-mono text-xs text-green-600">
                {g.avgSellPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
              </TableCell>
              <TableCell className="text-right"><PnlCell usd={g.totalNetPnl} /></TableCell>
              <TableCell>
                <Badge variant={g.mode === 'live' ? 'default' : 'secondary'} className="text-xs">
                  {g.mode}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
