'use client'

import { useEffect, useMemo, useState } from 'react'
import { TopBar }          from '@/components/arb/TopBar'
import { KpiCard, Panel, Sparkline, StatusDot } from '@/components/arb/atoms'
import { PriceMatrix }     from '@/components/arb/PriceMatrix'
import { OpportunityFeed } from '@/components/arb/OpportunityFeed'
import { PnlChart }        from '@/components/arb/PnlChart'
import { TradeHistory, pairTrades } from '@/components/arb/TradeHistory'
import { useArbitrageSocket }  from '@/lib/useArbitrageSocket'
import { useTrades }           from '@/lib/useTrades'
import { EXCHANGES, SYMBOLS }  from '@/lib/exchanges'
import { fmtUsd, fmtPct }      from '@/lib/fmt'
import type { PriceTick }      from '@/lib/types'

function bestRouteForSymbol(row: Record<string, PriceTick | undefined>) {
  let best: { buyEx: string; sellEx: string; netPct: number } | null = null
  for (const buyer of EXCHANGES) {
    for (const seller of EXCHANGES) {
      if (buyer.id === seller.id) continue
      const buy  = row[buyer.id]
      const sell = row[seller.id]
      if (!buy || !sell) continue
      const netPct = (Number(sell.bid) - Number(buy.ask)) / Number(buy.ask) * 100 - 0.10
      if (!best || netPct > best.netPct) best = { buyEx: buyer.id, sellEx: seller.id, netPct }
    }
  }
  return best
}

export default function Dashboard() {
  const { prices, opportunities, connected } = useArbitrageSocket()
  const { trades: rawTrades, loading }       = useTrades()
  const [mode, setMode]     = useState<'paper' | 'live'>('paper')
  const [killed, setKilled] = useState(false)
  const [now, setNow]       = useState(Date.now())

  // Fetch server mode once on mount
  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'
    fetch(`${url}/api/status`)
      .then((r) => r.json())
      .then((d) => setMode(d.paperMode === false ? 'live' : 'paper'))
      .catch(() => {})
  }, [])

  // Tick clock for relative timestamps in opportunity feed
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const pairedTrades = useMemo(() => pairTrades(rawTrades), [rawTrades])

  // KPIs derived from live data
  const kpis = useMemo(() => {
    const totalPnl   = pairedTrades.reduce((s, t) => s + t.pnl, 0)
    const wins       = pairedTrades.filter((t) => t.pnl > 0).length
    const winRate    = (wins / Math.max(1, pairedTrades.length)) * 100
    const oppPerHour = Math.round(opportunities.length * 60 / 12)

    const activeSpreads = SYMBOLS.reduce((c, sym) => {
      const row = Object.fromEntries(EXCHANGES.map((ex) => [ex.id, prices[sym]?.[ex.id] as PriceTick | undefined]))
      const r = bestRouteForSymbol(row)
      return c + (r && r.netPct > 0.05 ? 1 : 0)
    }, 0)

    let bestNow: { netPct: number; buyEx: string; sellEx: string; sym: string } | null = null
    for (const sym of SYMBOLS) {
      const row = Object.fromEntries(EXCHANGES.map((ex) => [ex.id, prices[sym]?.[ex.id] as PriceTick | undefined]))
      const r = bestRouteForSymbol(row)
      if (r && (!bestNow || r.netPct > bestNow.netPct)) bestNow = { ...r, sym }
    }

    return { totalPnl, winRate, oppPerHour, activeSpreads, bestNow }
  }, [prices, opportunities, pairedTrades])

  // Cumulative P&L timeseries for chart
  const pnlData = useMemo(() => {
    const sorted = [...pairedTrades].sort((a, b) => a.ts - b.ts)
    let cum = 0
    return sorted.map((t) => { cum += t.pnl; return cum })
  }, [pairedTrades])

  // Opportunity frequency by symbol
  const symbolHist = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const s of SYMBOLS) counts[s] = 0
    for (const o of opportunities) counts[o.symbol] = (counts[o.symbol] ?? 0) + 1
    const max = Math.max(1, ...Object.values(counts))
    return SYMBOLS.map((s) => ({ id: s, count: counts[s], pct: counts[s] / max }))
  }, [opportunities])

  const displayPrices = killed ? {} : prices

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)', color: 'var(--fg)' }}>
      <TopBar
        connected={connected}
        mode={mode}
        pnl24h={kpis.totalPnl}
        killed={killed}
        onKill={() => setKilled((k) => !k)}
      />

      <main className="px-4 lg:px-6 py-5 space-y-5 mx-auto" style={{ maxWidth: 1480 }}>

        {/* ── KPI strip ── */}
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <KpiCard
            label="P&L · 24h paper"
            value={(kpis.totalPnl >= 0 ? '+' : '') + fmtUsd(kpis.totalPnl)}
            sub={`${pairedTrades.length} executions · ${kpis.winRate.toFixed(0)}% win-rate`}
            tone={kpis.totalPnl >= 0 ? 'pos' : 'neg'}
            spark={pnlData.slice(-32)}
          />
          <KpiCard
            label="Opportunities · last hour"
            value={kpis.oppPerHour.toString()}
            sub={`${opportunities.length} in feed`}
            tone="accent"
          />
          <KpiCard
            label="Active spreads"
            value={`${kpis.activeSpreads}/${SYMBOLS.length}`}
            sub={`net > 0.05% across ${EXCHANGES.length} venues`}
            tone="neutral"
            suffix={
              <span className="font-mono text-[10px]" style={{ color: 'var(--muted)' }}>
                {EXCHANGES.length} ex
              </span>
            }
          />
          <KpiCard
            label="Best route · now"
            value={kpis.bestNow ? fmtPct(kpis.bestNow.netPct, 3) : '—'}
            sub={
              kpis.bestNow
                ? `${kpis.bestNow.sym.replace('/USDT', '')} · ${EXCHANGES.find(e => e.id === kpis.bestNow!.buyEx)?.name} → ${EXCHANGES.find(e => e.id === kpis.bestNow!.sellEx)?.name}`
                : 'no spread'
            }
            tone={kpis.bestNow && kpis.bestNow.netPct > 0 ? 'pos' : 'neutral'}
          />
        </div>

        {/* ── Price matrix + opportunity feed ── */}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(320px,1fr)]">
          <Panel
            title="Live prices"
            sub={`${SYMBOLS.length} symbols · ${EXCHANGES.length} exchanges`}
            right={
              <div className="flex items-center gap-2 font-mono text-[10.5px]" style={{ color: 'var(--muted)' }}>
                <StatusDot ok={connected && !killed} size={6} />
                <span>{killed ? 'paused' : 'streaming'}</span>
              </div>
            }
          >
            <PriceMatrix prices={displayPrices} />
          </Panel>

          <Panel
            title="Opportunity feed"
            sub={`${opportunities.length} detected`}
            right={
              <span className="font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--muted)' }}>
                net &gt; 0.10% triggers
              </span>
            }
            className="max-h-[640px] overflow-hidden"
          >
            <div className="overflow-y-auto -mr-1 pr-1" style={{ maxHeight: 580 }}>
              <OpportunityFeed opportunities={opportunities} now={now} />
            </div>
          </Panel>
        </div>

        {/* ── P&L chart + symbol histogram ── */}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(320px,1fr)]">
          <Panel
            title="Cumulative P&L · paper"
            right={
              <span className="font-mono text-[12px] tabular-nums font-semibold"
                    style={{ color: kpis.totalPnl >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
                {kpis.totalPnl >= 0 ? '+' : ''}{fmtUsd(kpis.totalPnl)}
              </span>
            }
          >
            <PnlChart data={pnlData} />
            {pnlData.length > 0 && (
              <div className="mt-2 flex justify-between font-mono text-[10px]" style={{ color: 'var(--muted)' }}>
                <span>oldest</span><span>now</span>
              </div>
            )}
          </Panel>

          <Panel title="Frequency · by symbol" sub="all time">
            {symbolHist.every((s) => s.count === 0) ? (
              <p className="font-mono text-[12px] py-4 text-center" style={{ color: 'var(--muted)' }}>
                No opportunities detected yet
              </p>
            ) : (
              <>
                <ul className="flex flex-col gap-2">
                  {symbolHist.map((s) => (
                    <li key={s.id} className="flex items-center gap-3">
                      <span className="font-mono font-semibold text-[12px]"
                            style={{ width: 64, color: 'var(--fg)' }}>
                        {s.id.replace('/USDT', '')}
                      </span>
                      <div className="flex-1 h-2 rounded-sm overflow-hidden"
                           style={{ background: 'var(--panel-2)' }}>
                        <div className="h-full" style={{
                          width: `${s.pct * 100}%`,
                          background: 'var(--accent)',
                          boxShadow: '0 0 8px color-mix(in oklch, var(--accent) 60%, transparent)',
                          transition: 'width 0.4s ease',
                        }} />
                      </div>
                      <span className="font-mono tabular-nums text-[11px]"
                            style={{ width: 28, textAlign: 'right', color: 'var(--muted)' }}>
                        {s.count}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 pt-3 grid grid-cols-2 gap-3"
                     style={{ borderTop: '1px solid var(--border)' }}>
                  <Stat
                    label="avg net %"
                    value={fmtPct(
                      opportunities.reduce((s, o) => s + Number(o.netProfitPct), 0) / Math.max(1, opportunities.length),
                      3
                    )}
                  />
                  <Stat label="total opps"  value={opportunities.length.toString()} />
                  <Stat
                    label="best route"
                    value={kpis.bestNow ? fmtPct(kpis.bestNow.netPct, 3) : '—'}
                    tone={kpis.bestNow && kpis.bestNow.netPct > 0.2 ? 'pos' : 'neutral'}
                  />
                  <Stat
                    label="loss budget"
                    value={`${Math.max(0, 50 + kpis.totalPnl).toFixed(0)} / 50`}
                    sub="$USD remaining"
                  />
                </div>
              </>
            )}
          </Panel>
        </div>

        {/* ── Trade history ── */}
        <Panel
          title="Recent executions"
          sub={`${pairedTrades.length} trades`}
          right={
            <div className="flex items-center gap-3 font-mono text-[10px]" style={{ color: 'var(--muted)' }}>
              <span className="uppercase tracking-[0.14em]">{mode}</span>
              <span>{pairedTrades.filter((t) => t.status === 'filled').length} filled</span>
              <span style={{ color: 'var(--neg)' }}>
                {pairedTrades.filter((t) => t.status === 'failed').length} failed
              </span>
            </div>
          }
        >
          <TradeHistory trades={pairedTrades} loading={loading} limit={10} />
        </Panel>

        <footer className="pb-4 pt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 font-mono text-[10.5px]"
                style={{ color: 'var(--muted)' }}>
          <span>{process.env.NEXT_PUBLIC_API_WS_URL ?? 'ws://localhost:3001/ws'}</span>
          <span>·</span>
          <span>min net profit 0.10%</span>
          <span>·</span>
          <span>max position $100</span>
          <span>·</span>
          <span>circuit −$50 / 24h</span>
          <span className="ml-auto">{new Date().toISOString().slice(0, 10)}</span>
        </footer>
      </main>
    </div>
  )
}

function Stat({
  label, value, sub, tone,
}: {
  label: string; value: string; sub?: string; tone?: 'pos' | 'neg' | 'neutral'
}) {
  const color = tone === 'pos' ? 'var(--pos)' : tone === 'neg' ? 'var(--neg)' : 'var(--fg)'
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono uppercase tracking-[0.12em] text-[9.5px]" style={{ color: 'var(--muted)' }}>{label}</span>
      <span className="font-mono font-semibold tabular-nums text-[14px]" style={{ color }}>{value}</span>
      {sub && <span className="font-mono text-[9.5px]" style={{ color: 'var(--muted)' }}>{sub}</span>}
    </div>
  )
}
