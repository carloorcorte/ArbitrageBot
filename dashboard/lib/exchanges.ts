export interface Exchange {
  id:   string
  name: string
  tone: string
}

export const EXCHANGES: Exchange[] = [
  { id: 'binance', name: 'Binance', tone: 'oklch(0.82 0.16 90)'  },
  { id: 'kraken',  name: 'Kraken',  tone: 'oklch(0.70 0.18 280)' },
  { id: 'blofin',  name: 'BloFin',  tone: 'oklch(0.78 0.16 200)' },
  { id: 'bitunix', name: 'Bitunix', tone: 'oklch(0.74 0.18 30)'  },
]

export const SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT', 'DOGE/USDT']
