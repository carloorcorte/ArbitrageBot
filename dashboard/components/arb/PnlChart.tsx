'use client'

import { useEffect, useRef, useState } from 'react'
import { fmtUsd } from '@/lib/fmt'

interface Props {
  data:   number[]
  height?: number
}

export function PnlChart({ data, height = 160 }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [w, setW] = useState(800)

  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver((entries) => setW(entries[0].contentRect.width))
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [])

  if (!data.length) {
    return (
      <div className="flex items-center justify-center font-mono text-[12px]"
           style={{ height, color: 'var(--muted)' }}>
        No data yet
      </div>
    )
  }

  const min   = Math.min(0, ...data)
  const max   = Math.max(...data)
  const range = (max - min) || 1
  const padX  = 8, padY = 16
  const innerW = Math.max(50, w - padX * 2)
  const innerH = height - padY * 2
  const step   = innerW / Math.max(data.length - 1, 1)
  const pts    = data.map((v, i) => [padX + i * step, padY + innerH - ((v - min) / range) * innerH] as [number, number])
  const d      = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area   = `${d} L${pts[pts.length - 1][0]},${padY + innerH} L${pts[0][0]},${padY + innerH} Z`
  const last   = data[data.length - 1]
  const lineColor = last >= 0 ? 'var(--pos)' : 'var(--neg)'
  const zeroY  = padY + innerH - ((0 - min) / range) * innerH

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      <svg width={w} height={height} style={{ display: 'block' }}>
        <defs>
          <linearGradient id="pnl-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={lineColor} stopOpacity="0.28" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <line key={f} x1={padX} x2={w - padX} y1={padY + innerH * f} y2={padY + innerH * f}
                stroke="var(--border)" strokeWidth="1" strokeDasharray={f === 0 || f === 1 ? '0' : '2,4'} />
        ))}
        {min < 0 && (
          <line x1={padX} x2={w - padX} y1={zeroY} y2={zeroY}
                stroke="var(--muted)" strokeWidth="1" strokeDasharray="3,3" opacity="0.5" />
        )}
        <path d={area} fill="url(#pnl-fill)" />
        <path d={d} stroke={lineColor} strokeWidth="1.6" fill="none" strokeLinejoin="round" />
        <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="3" fill={lineColor} />
        <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="6" fill={lineColor} opacity="0.25" />
        <text x={w - padX} y={padY + 4} textAnchor="end"
              style={{ fontSize: 10, fill: 'var(--muted)', fontFamily: 'var(--font-geist-mono, monospace)' }}>
          {fmtUsd(max)}
        </text>
        <text x={w - padX} y={padY + innerH} textAnchor="end"
              style={{ fontSize: 10, fill: 'var(--muted)', fontFamily: 'var(--font-geist-mono, monospace)' }}>
          {fmtUsd(min)}
        </text>
      </svg>
    </div>
  )
}
