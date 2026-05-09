'use client'

import { useEffect, useRef, useState } from 'react'
import type { Exchange } from '@/lib/exchanges'

// ── FlashCell ──────────────────────────────────────────────────────
// Flashes green/red for 600ms when value changes.
export function FlashCell({
  value,
  formatter,
  className = '',
}: {
  value: number
  formatter?: (v: number) => string
  className?: string
}) {
  const [flash, setFlash] = useState<'up' | 'down' | null>(null)
  const prev = useRef(value)

  useEffect(() => {
    if (prev.current !== value) {
      setFlash(value > prev.current ? 'up' : 'down')
      prev.current = value
      const t = setTimeout(() => setFlash(null), 600)
      return () => clearTimeout(t)
    }
  }, [value])

  const bg =
    flash === 'up'   ? 'rgba(120,210,145,0.18)' :
    flash === 'down' ? 'rgba(220,110,110,0.18)' : 'transparent'

  return (
    <span
      className={'tabular-nums ' + className}
      style={{ backgroundColor: bg, padding: '1px 4px', borderRadius: 3, transition: 'background-color 0.5s' }}
    >
      {formatter ? formatter(value) : value}
    </span>
  )
}

// ── ExchangePill ───────────────────────────────────────────────────
export function ExchangePill({ ex, exchanges, size = 'sm' }: { ex: string; exchanges: Exchange[]; size?: 'sm' | 'md' }) {
  const meta = exchanges.find((e) => e.id === ex)
  const tone = meta?.tone ?? 'oklch(0.7 0 0)'
  return (
    <span
      className="inline-flex items-center gap-1.5 font-mono uppercase tracking-wider"
      style={{
        fontSize: size === 'sm' ? 11 : 12,
        padding: size === 'sm' ? '2px 6px' : '2px 9px',
        borderRadius: 3,
        background: 'var(--panel-2)',
        border: '1px solid var(--border)',
        color: 'var(--fg)',
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: tone, boxShadow: `0 0 6px ${tone}`, flexShrink: 0 }} />
      {meta?.name ?? ex}
    </span>
  )
}

// ── Sparkline ──────────────────────────────────────────────────────
export function Sparkline({
  data,
  color = 'currentColor',
  width = 120,
  height = 32,
  fill = true,
}: {
  data: number[]
  color?: string
  width?: number
  height?: number
  fill?: boolean
}) {
  if (!data?.length) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const step = width / Math.max(data.length - 1, 1)
  const pts = data.map((v, i) => [i * step, height - ((v - min) / range) * (height - 2) - 1] as [number, number])
  const d = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
  const area = `${d} L${width},${height} L0,${height} Z`
  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      {fill && <path d={area} fill={color} opacity="0.12" />}
      <path d={d} stroke={color} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── StatusDot ──────────────────────────────────────────────────────
export function StatusDot({ ok, size = 8 }: { ok: boolean; size?: number }) {
  const color = ok ? 'var(--pos)' : 'var(--neg)'
  return (
    <span className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <span
        className="absolute inset-0 rounded-full"
        style={{ background: color, animation: ok ? 'arb-pulse 1.6s ease-in-out infinite' : 'none' }}
      />
      <span className="relative rounded-full" style={{ width: size - 2, height: size - 2, background: color }} />
    </span>
  )
}

// ── KpiCard ────────────────────────────────────────────────────────
export function KpiCard({
  label,
  value,
  sub,
  tone = 'neutral',
  spark,
  suffix,
}: {
  label: string
  value: string
  sub?: string
  tone?: 'pos' | 'neg' | 'accent' | 'neutral'
  spark?: number[]
  suffix?: React.ReactNode
}) {
  const toneColor =
    tone === 'pos'    ? 'var(--pos)'    :
    tone === 'neg'    ? 'var(--neg)'    :
    tone === 'accent' ? 'var(--accent)' : 'var(--fg)'

  return (
    <div
      className="relative flex flex-col justify-between p-4 lg:p-5"
      style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 6, minHeight: 110 }}
    >
      <div className="flex items-start justify-between">
        <span className="font-mono uppercase tracking-[0.14em]" style={{ fontSize: 10.5, color: 'var(--muted)' }}>
          {label}
        </span>
        {suffix}
      </div>
      <div className="flex items-end justify-between gap-3 mt-3">
        <div className="min-w-0">
          <div className="font-mono font-semibold leading-none" style={{ fontSize: 28, color: toneColor, letterSpacing: '-0.02em' }}>
            {value}
          </div>
          {sub && <div className="mt-1.5 text-[11px]" style={{ color: 'var(--muted)' }}>{sub}</div>}
        </div>
        {spark && spark.length > 0 && (
          <div style={{ color: toneColor }}>
            <Sparkline data={spark} color={toneColor} width={90} height={32} />
          </div>
        )}
      </div>
    </div>
  )
}

// ── Panel ──────────────────────────────────────────────────────────
export function Panel({
  title,
  sub,
  right,
  children,
  className = '',
}: {
  title: string
  sub?: string
  right?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={'flex flex-col ' + className}
      style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 6 }}
    >
      <header
        className="flex items-center justify-between px-4 lg:px-5 py-3"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <div className="flex items-baseline gap-3 min-w-0">
          <h3 className="font-mono uppercase tracking-[0.14em]" style={{ fontSize: 11, color: 'var(--fg)' }}>
            {title}
          </h3>
          {sub && <span className="text-[11px] font-mono" style={{ color: 'var(--muted)' }}>{sub}</span>}
        </div>
        {right}
      </header>
      <div className="p-3 lg:p-4 flex-1">{children}</div>
    </section>
  )
}
