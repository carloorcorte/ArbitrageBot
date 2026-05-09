'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { PriceTick, ArbitrageOpportunity, WsMessage } from './types'

const WS_URL = process.env.NEXT_PUBLIC_API_WS_URL ?? 'ws://localhost:3001/ws'
const RECONNECT_DELAY_MS = 2000
const MAX_OPPORTUNITIES = 50

export function useArbitrageSocket() {
  const [prices, setPrices]            = useState<Record<string, Record<string, PriceTick>>>({})
  const [opportunities, setOpportunities] = useState<ArbitrageOpportunity[]>([])
  const [connected, setConnected]      = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen  = () => setConnected(true)
    ws.onclose = () => {
      setConnected(false)
      retryRef.current = setTimeout(connect, RECONNECT_DELAY_MS)
    }
    ws.onerror = () => ws.close()

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data as string) as WsMessage

        if (msg.channel.startsWith('prices:')) {
          const tick = msg.data as PriceTick
          setPrices((prev) => ({
            ...prev,
            [tick.symbol]: { ...(prev[tick.symbol] ?? {}), [tick.exchange]: tick },
          }))
        } else if (msg.channel === 'opportunities') {
          const opp = msg.data as ArbitrageOpportunity
          setOpportunities((prev) => [opp, ...prev].slice(0, MAX_OPPORTUNITIES))
        }
      } catch {
        // malformed message — ignore
      }
    }
  }, [])

  useEffect(() => {
    connect()
    return () => {
      if (retryRef.current) clearTimeout(retryRef.current)
      wsRef.current?.close()
    }
  }, [connect])

  return { prices, opportunities, connected }
}
