import { pgTable, serial, varchar, numeric, timestamp, integer, pgEnum, index } from 'drizzle-orm/pg-core'

export const opportunityStatusEnum = pgEnum('opportunity_status', [
  'detected',
  'executed',
  'expired',
  'skipped_risk',
  'skipped_fees',
])

export const tradeSideEnum = pgEnum('trade_side', ['buy', 'sell'])

export const tradeModeEnum = pgEnum('trade_mode', ['paper', 'live'])

export const tradeStatusEnum = pgEnum('trade_status', ['pending', 'filled', 'partial', 'failed'])

export const opportunities = pgTable('opportunities', {
  id:              serial('id').primaryKey(),
  symbol:          varchar('symbol', { length: 20 }).notNull(),
  buyExchange:     varchar('buy_exchange', { length: 50 }).notNull(),
  sellExchange:    varchar('sell_exchange', { length: 50 }).notNull(),
  buyPrice:        numeric('buy_price',  { precision: 18, scale: 8 }).notNull(),
  sellPrice:       numeric('sell_price', { precision: 18, scale: 8 }).notNull(),
  grossSpreadPct:  numeric('gross_spread_pct', { precision: 10, scale: 6 }).notNull(),
  netProfitPct:    numeric('net_profit_pct',   { precision: 10, scale: 6 }).notNull(),
  estimatedAmount: numeric('estimated_amount', { precision: 18, scale: 8 }).notNull(),
  status:          opportunityStatusEnum('status').notNull().default('detected'),
  detectedAt:      timestamp('detected_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  symbolIdx:     index('opp_symbol_idx').on(t.symbol),
  detectedAtIdx: index('opp_detected_at_idx').on(t.detectedAt),
}))

export const trades = pgTable('trades', {
  id:            serial('id').primaryKey(),
  opportunityId: integer('opportunity_id').references(() => opportunities.id),
  exchange:      varchar('exchange', { length: 50 }).notNull(),
  side:          tradeSideEnum('side').notNull(),
  symbol:        varchar('symbol', { length: 20 }).notNull(),
  amount:        numeric('amount',   { precision: 18, scale: 8 }).notNull(),
  price:         numeric('price',    { precision: 18, scale: 8 }).notNull(),
  feePaid:       numeric('fee_paid', { precision: 18, scale: 8 }).notNull(),
  feeCurrency:   varchar('fee_currency', { length: 10 }).notNull(),
  orderId:       varchar('order_id', { length: 100 }),
  mode:          tradeModeEnum('mode').notNull(),
  status:        tradeStatusEnum('status').notNull().default('pending'),
  executedAt:    timestamp('executed_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  opportunityIdx: index('trades_opportunity_idx').on(t.opportunityId),
  executedAtIdx:  index('trades_executed_at_idx').on(t.executedAt),
}))

export const feeCache = pgTable('fee_cache', {
  exchange:  varchar('exchange', { length: 50 }).notNull(),
  symbol:    varchar('symbol',   { length: 20 }).notNull(),
  makerFee:  numeric('maker_fee', { precision: 10, scale: 6 }).notNull(),
  takerFee:  numeric('taker_fee', { precision: 10, scale: 6 }).notNull(),
  cachedAt:  timestamp('cached_at', { withTimezone: true }).notNull().defaultNow(),
})

export type Opportunity    = typeof opportunities.$inferSelect
export type NewOpportunity = typeof opportunities.$inferInsert
export type Trade          = typeof trades.$inferSelect
export type NewTrade       = typeof trades.$inferInsert
