import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { createBunWebSocket } from 'hono/bun'
import type { ServerWebSocket } from 'bun'
import Redis from 'ioredis'
import { connectRedis, redis } from '../cache/client'
import { disconnectDb } from '../db/client'
import opportunitiesRoute from './routes/opportunities'
import tradesRoute from './routes/trades'
import statusRoute from './routes/status'

const { upgradeWebSocket, websocket } = createBunWebSocket<ServerWebSocket>()

const app = new Hono()

app.use('*', logger())
app.use('/api/*', cors({ origin: ['http://localhost:3000'] }))

app.route('/api/opportunities', opportunitiesRoute)
app.route('/api/trades',        tradesRoute)
app.route('/api/status',        statusRoute)

// WebSocket: one Redis subscriber per connected client
// broadcasts price ticks + opportunities to the dashboard in real-time
app.get('/ws', upgradeWebSocket((_c) => {
  let sub: Redis | null = null

  return {
    async onOpen(_evt, ws) {
      sub = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379')

      await sub.psubscribe('prices:*', 'opportunities')

      sub.on('pmessage', (_pattern: string, channel: string, message: string) => {
        try {
          ws.send(JSON.stringify({ channel, data: JSON.parse(message) }))
        } catch {
          // client disconnected mid-send — ignore
        }
      })
    },

    onClose() {
      sub?.disconnect()
      sub = null
    },

    onError(_evt) {
      sub?.disconnect()
      sub = null
    },
  }
}))

const PORT = Number(process.env.API_PORT ?? 3001)

async function main() {
  await connectRedis()
  console.log('[API] Redis connected')

  const server = Bun.serve({
    port: PORT,
    fetch: app.fetch,
    websocket,
  })

  console.log(`[API] listening on http://localhost:${PORT}`)
  console.log(`[API] WebSocket on  ws://localhost:${PORT}/ws`)

  const shutdown = async () => {
    console.log('\n[API] shutting down...')
    server.stop()
    await disconnectDb()
    process.exit(0)
  }

  process.on('SIGINT',  shutdown)
  process.on('SIGTERM', shutdown)
}

main().catch((err) => {
  console.error('[API] fatal error:', err)
  process.exit(1)
})
