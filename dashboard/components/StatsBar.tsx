'use client'

import { Badge } from '@/components/ui/badge'
import { Wifi, WifiOff } from 'lucide-react'

interface Props {
  connected:        boolean
  opportunityCount: number
}

export function StatsBar({ connected, opportunityCount }: Props) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <div className={`flex items-center gap-1.5 ${connected ? 'text-green-600' : 'text-red-500'}`}>
        {connected
          ? <Wifi className="w-4 h-4" />
          : <WifiOff className="w-4 h-4" />
        }
        <span className="text-xs font-medium">{connected ? 'Live' : 'Reconnecting...'}</span>
      </div>

      <Badge variant="secondary" className="text-xs">Paper trading</Badge>

      {opportunityCount > 0 && (
        <span className="text-xs text-muted-foreground">
          {opportunityCount} opportunit{opportunityCount === 1 ? 'y' : 'ies'} detected
        </span>
      )}
    </div>
  )
}
