import { connectRedis, disconnectRedis } from './cache/client'
import { disconnectDb } from './db/client'
import { FeedManager } from './feeds/feed-manager'
import { FeeCalculator } from './core/fees'
import { OpportunityDetector } from './core/detector'
import { RiskManager } from './core/risk'
import { Executor } from './core/executor'
import { TelegramNotifier } from './notifications/telegram'
import ccxt from 'ccxt'
import type { Exchange } from 'ccxt'

const SYMBOLS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT', 'DOGE/USDT']

const EXCHANGE_CONFIGS = [
  {
    id:     'binance',
    apiKey: process.env.BINANCE_API_KEY,
    secret: process.env.BINANCE_SECRET,
  },
  {
    id:     'kraken',
    apiKey: process.env.KRAKEN_API_KEY,
    secret: process.env.KRAKEN_SECRET,
  },
  {
    id:     'blofin',
    apiKey: process.env.BLOFIN_API_KEY,
    secret: process.env.BLOFIN_SECRET,
  },
]

async function main(): Promise<void> {
  console.log('[Engine] starting...')
  console.log(`[Engine] paper trading: ${process.env.PAPER_TRADING !== 'false'}`)
  console.log(`[Engine] symbols: ${SYMBOLS.join(', ')}`)
  console.log(`[Engine] exchanges: ${EXCHANGE_CONFIGS.map((e) => e.id).join(', ')}`)

  await connectRedis()
  console.log('[Engine] Redis connected')

  // Load REST exchange instances for fee data
  const restExchanges = new Map<string, Exchange>()
  for (const config of EXCHANGE_CONFIGS) {
    const ExchangeClass = (ccxt as unknown as Record<string, new (config: object) => Exchange>)[config.id]
    if (!ExchangeClass) throw new Error(`Exchange not supported: ${config.id}`)
    const exchange = new ExchangeClass({ enableRateLimit: true })
    await exchange.loadMarkets()
    restExchanges.set(config.id, exchange)
  }

  const feeCalc  = new FeeCalculator()
  await feeCalc.loadFees(restExchanges)

  const telegram = new TelegramNotifier()
  const riskMgr  = new RiskManager((msg) => telegram.circuitBreaker(msg))
  const executor = new Executor(
    riskMgr,
    EXCHANGE_CONFIGS,
    (msg) => telegram.circuitBreaker(msg),
  )

  if (telegram.enabled) await telegram.info('Engine started ✅')

  const detector = new OpportunityDetector(
    EXCHANGE_CONFIGS.map((e) => e.id),
    feeCalc,
    async (opp) => {
      await telegram.opportunity(opp)
      await executor.execute(opp)
    },
  )

  const feedMgr = new FeedManager(EXCHANGE_CONFIGS, SYMBOLS)

  // Refresh fees hourly in the background
  const feeRefreshInterval = setInterval(async () => {
    if (feeCalc.isStale()) {
      await feeCalc.loadFees(restExchanges)
    }
  }, 60_000)

  // Graceful shutdown
  const shutdown = async () => {
    console.log('\n[Engine] shutting down...')
    clearInterval(feeRefreshInterval)
    detector.stop()
    await feedMgr.stop()
    await disconnectRedis()
    await disconnectDb()
    console.log('[Engine] stopped')
    process.exit(0)
  }

  process.on('SIGINT',  shutdown)
  process.on('SIGTERM', shutdown)

  // Start detector first so it's ready when price ticks arrive
  await detector.start()

  // Start feed — this runs indefinitely via Promise.all internal loops
  await feedMgr.start()
}

main().catch((err) => {
  console.error('[Engine] fatal error:', err)
  process.exit(1)
})
