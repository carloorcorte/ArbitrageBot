'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PriceTable } from '@/components/PriceTable'
import { OpportunityFeed } from '@/components/OpportunityFeed'
import { TradeHistory } from '@/components/TradeHistory'
import { StatsBar } from '@/components/StatsBar'
import { useArbitrageSocket } from '@/lib/useArbitrageSocket'
import { useTrades } from '@/lib/useTrades'

export default function Dashboard() {
  const { prices, opportunities, connected } = useArbitrageSocket()
  const { trades, loading } = useTrades()

  return (
    <div className="min-h-screen bg-background p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Crypto Arbitrage</h1>
        <StatsBar connected={connected} opportunityCount={opportunities.length} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Live Prices</CardTitle>
        </CardHeader>
        <CardContent>
          <PriceTable prices={prices} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Opportunity Feed</CardTitle>
        </CardHeader>
        <CardContent>
          <OpportunityFeed opportunities={opportunities} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Trade History</CardTitle>
        </CardHeader>
        <CardContent>
          <TradeHistory trades={trades} loading={loading} />
        </CardContent>
      </Card>
    </div>
  )
}
