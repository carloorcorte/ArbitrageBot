import { Hono } from 'hono'
import { db } from '../../db/client'
import { opportunities } from '../../db/schema'
import { desc, gte, sql } from 'drizzle-orm'

const app = new Hono()

app.get('/', async (c) => {
  const limit  = Number(c.req.query('limit')  ?? 50)
  const since  = c.req.query('since')

  const rows = await db
    .select()
    .from(opportunities)
    .where(since ? gte(opportunities.detectedAt, new Date(since)) : undefined)
    .orderBy(desc(opportunities.detectedAt))
    .limit(Math.min(limit, 200))

  return c.json(rows)
})

app.get('/stats', async (c) => {
  const [stats] = await db
    .select({
      total:    sql<number>`cast(count(*) as int)`,
      executed: sql<number>`cast(sum(case when status = 'executed' then 1 else 0 end) as int)`,
      skipped:  sql<number>`cast(sum(case when status like 'skipped%' then 1 else 0 end) as int)`,
    })
    .from(opportunities)

  return c.json(stats ?? { total: 0, executed: 0, skipped: 0 })
})

export default app
