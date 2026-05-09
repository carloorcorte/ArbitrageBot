export interface PriceTick {
  exchange:  string
  symbol:    string
  bid:       string
  ask:       string
  timestamp: number
}

export interface ArbitrageOpportunity {
  symbol:         string
  buyExchange:    string
  sellExchange:   string
  buyAsk:         string
  sellBid:        string
  amount:         string
  grossSpreadPct: string
  netProfitPct:   string
  detectedAt:     number
}

export interface WsMessage {
  channel: string
  data:    PriceTick | ArbitrageOpportunity
}

export type PriceMap = Record<string, Record<string, { bid: string; ask: string; timestamp: number } | null>>

export interface Trade {
  id:            number
  opportunityId: number | null
  exchange:      string
  side:          'buy' | 'sell'
  symbol:        string
  amount:        string
  price:         string
  feePaid:       string
  feeCurrency:   string
  orderId:       string | null
  mode:          'paper' | 'live'
  status:        'pending' | 'filled' | 'partial' | 'failed'
  executedAt:    string
}
