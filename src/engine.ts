import { connectRedis, disconnectRedis } from './cache/client'
import { disconnectDb } from './db/client'
import { BinanceFeed } from './feeds/binance-feed'
import { KrakenFeed } from './feeds/kraken-feed'
import { BlofInFeed } from './feeds/blofin-feed'
import { BitunixFeed } from './feeds/bitunix-feed'
import { FeeCalculator } from './core/fees'
import { OpportunityDetector } from './core/detector'
import { RiskManager } from './core/risk'
import { Executor } from './core/executor'
import { TelegramNotifier } from './notifications/telegram'

const SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT', 'DOGE/USDT']
const EXCHANGES = ['binance', 'kraken', 'blofin', 'bitunix']

// Static taker fees (maker ≈ 0 or lower; executor always takes liquidity)
// Binance: standard 0.10%; with BNB discount or VIP tiers can be lower
// Kraken:  standard 0.26% spot taker; adjust if you have a fee discount
// BloFin:  standard 0.06%; with −60% VIP discount: 0.024% = 0.00024
// Bitunix: standard 0.06%; with −80% VIP discount: 0.012% = 0.00012 (configured via env)
const EXCHANGE_FEES: Record<string, { maker: number; taker: number }> = {
  binance: { maker: 0.001,   taker: 0.001   },
  kraken:  { maker: 0.0016,  taker: 0.0026  },
  blofin:  { maker: 0.0002,  taker: 0.00024 },
}

async function main(): Promise<void> {
  console.log('[Engine] starting...')
  console.log(`[Engine] paper trading: ${process.env.PAPER_TRADING !== 'false'}`)
  console.log(`[Engine] symbols: ${SYMBOLS.join(', ')}`)
  console.log(`[Engine] exchanges: ${EXCHANGES.join(', ')}`)

  await connectRedis()
  console.log('[Engine] Redis connected')

  const feeCalc = new FeeCalculator()
  for (const [id, fees] of Object.entries(EXCHANGE_FEES)) {
    feeCalc.setStaticFees(id, fees.maker, fees.taker)
  }
  const bitunixTaker = Number(process.env.BITUNIX_TAKER_FEE ?? '0.00012')
  feeCalc.setStaticFees('bitunix', bitunixTaker * 0.8, bitunixTaker)

  const telegram = new TelegramNotifier()
  const riskMgr  = new RiskManager((msg) => telegram.circuitBreaker(msg))
  const executor = new Executor(
    riskMgr,
    [],   // no CCXT exchange configs — native feeds only
    (msg) => telegram.circuitBreaker(msg),
  )

  if (telegram.enabled) await telegram.info('Engine started ✅')

  const detector = new OpportunityDetector(
    EXCHANGES,
    feeCalc,
    async (opp) => {
      await telegram.opportunity(opp)
      await executor.execute(opp)
    },
  )

  const binanceFeed = new BinanceFeed(SYMBOLS)
  const krakenFeed  = new KrakenFeed(SYMBOLS)
  const blofInFeed  = new BlofInFeed(SYMBOLS)
  const bitunixFeed = new BitunixFeed(SYMBOLS)

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n[Engine] shutting down...')
    detector.stop()
    await Promise.all([
      binanceFeed.stop(),
      krakenFeed.stop(),
      blofInFeed.stop(),
      bitunixFeed.stop(),
    ])
    await disconnectRedis()
    await disconnectDb()
    console.log('[Engine] stopped')
    process.exit(0)
  }

  process.on('SIGINT',  shutdown)
  process.on('SIGTERM', shutdown)

  await detector.start()

  await Promise.all([
    binanceFeed.start(),
    krakenFeed.start(),
    blofInFeed.start(),
    bitunixFeed.start(),
  ])
}

main().catch((err) => {
  console.error('[Engine] fatal error:', err)
  process.exit(1)
})
