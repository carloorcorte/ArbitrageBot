'use client'

import { StatusDot } from './atoms'
import { fmtUsd } from '@/lib/fmt'

interface Props {
  connected: boolean
  mode:      'paper' | 'live'
  pnl24h:   number
  killed:    boolean
  onKill:   () => void
}

export function TopBar({ connected, mode, pnl24h, killed, onKill }: Props) {
  return (
    <header
      className="sticky top-0 z-30 flex items-center justify-between gap-4 px-4 lg:px-6 py-3"
      style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}
    >
      {/* Left: brand + status */}
      <div className="flex items-center gap-4 lg:gap-6 min-w-0">
        <div className="flex items-center gap-2.5">
          <div style={{
            width: 26, height: 26, borderRadius: 5,
            background: 'linear-gradient(135deg, var(--accent), var(--accent))',
            display: 'grid', placeItems: 'center',
            boxShadow: '0 0 14px color-mix(in oklch, var(--accent) 50%, transparent)',
          }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 10 L6 4 L8 7 L12 2" stroke="black" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="12" cy="2" r="1" fill="black" />
            </svg>
          </div>
          <div className="hidden sm:flex flex-col leading-tight">
            <span className="font-mono font-semibold text-[13px]" style={{ color: 'var(--fg)', letterSpacing: '0.02em' }}>
              ArbitrageBot
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em]" style={{ color: 'var(--muted)' }}>
              CEX · cross-exchange
            </span>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-2 px-3 py-1.5"
             style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 4 }}>
          <StatusDot ok={connected && !killed} />
          <span className="font-mono text-[11px] uppercase tracking-[0.14em]"
                style={{ color: connected && !killed ? 'var(--pos)' : 'var(--neg)' }}>
            {!connected ? 'reconnecting' : killed ? 'paused' : 'live · ws'}
          </span>
        </div>
      </div>

      {/* Right: P&L + mode badge + kill */}
      <div className="flex items-center gap-2 lg:gap-3">
        <div className="hidden lg:flex flex-col items-end leading-tight">
          <span className="font-mono text-[10px] uppercase tracking-[0.16em]" style={{ color: 'var(--muted)' }}>
            P&amp;L 24h
          </span>
          <span className="font-mono font-semibold tabular-nums text-[13.5px]"
                style={{ color: pnl24h >= 0 ? 'var(--pos)' : 'var(--neg)' }}>
            {pnl24h >= 0 ? '+' : ''}{fmtUsd(pnl24h)}
          </span>
        </div>

        <div className="inline-flex p-0.5"
             style={{ background: 'var(--panel)', border: '1px solid var(--border)', borderRadius: 4 }}>
          <span className="font-mono uppercase tracking-[0.14em] px-3 py-1.5"
                style={{
                  fontSize: 10.5, borderRadius: 3, fontWeight: 600,
                  background: mode === 'live' ? 'var(--neg)' : 'var(--accent)',
                  color: 'black',
                }}>
            {mode}
          </span>
        </div>

        <button
          onClick={onKill}
          className="font-mono text-[11px] uppercase tracking-[0.14em] px-3 py-2 transition-colors"
          style={{
            background: killed ? 'var(--neg)' : 'transparent',
            color: killed ? 'black' : 'var(--neg)',
            border: '1px solid var(--neg)',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          {killed ? '◼ paused' : '⏻ kill'}
        </button>
      </div>
    </header>
  )
}
