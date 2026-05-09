import { Hono } from 'hono'
import { db } from '../../db/client'
import { trades } from '../../db/schema'
import { desc, sum, sql } from 'drizzle-orm'

const app = new Hono()

app.get('/', async (c) => {
  const limit = Number(c.req.query('limit') ?? 50)

  const rows = await db
    .select()
    .from(trades)
    .orderBy(desc(trades.executedAt))
    .limit(Math.min(limit, 200))

  return c.json(rows)
})

app.get('/pnl', async (c) => {
  const [result] = await db
    .select({
      totalTrades: sql<number>`cast(count(*) as int)`,
      paperTrades: sql<number>`cast(sum(case when mode = 'paper' then 1 else 0 end) as int)`,
      liveTrades:  sql<number>`cast(sum(case when mode = 'live' then 1 else 0 end) as int)`,
    })
    .from(trades)

  return c.json(result ?? { totalTrades: 0, paperTrades: 0, liveTrades: 0 })
})

export default app
