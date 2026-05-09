'use client'

import { useState, useEffect } from 'react'
import type { Trade } from './types'

export function useTrades() {
  const [trades,  setTrades]  = useState<Trade[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchTrades = async () => {
      try {
        const res  = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/trades?limit=100`)
        const data = await res.json() as Trade[]
        setTrades(data)
      } catch (err) {
        console.error('[useTrades] fetch error:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchTrades()
    const interval = setInterval(fetchTrades, 30_000)
    return () => clearInterval(interval)
  }, [])

  return { trades, loading }
}
