export function fmtPrice(value: string | number, symbol: string): string {
  const n = Number(value)
  if (n >= 1000) return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (n < 1)     return n.toFixed(4)
  return n.toFixed(2)
}

export function fmtUsd(n: number, decimals = 2): string {
  const sign = n < 0 ? '-' : ''
  return sign + '$' + Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

export function fmtPct(n: number, decimals = 3): string {
  return (n >= 0 ? '+' : '') + n.toFixed(decimals) + '%'
}

export function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export function fmtRelative(ts: number, now = Date.now()): string {
  const ms = now - ts
  if (ms < 1000)      return 'now'
  if (ms < 60_000)    return Math.floor(ms / 1000) + 's'
  if (ms < 3_600_000) return Math.floor(ms / 60_000) + 'm'
  return Math.floor(ms / 3_600_000) + 'h'
}
