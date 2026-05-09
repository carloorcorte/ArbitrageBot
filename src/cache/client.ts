import Redis from 'ioredis'

const redisConfig = {
  lazyConnect: true,
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
}

function createClient(name: string): Redis {
  const url = process.env.REDIS_URL ?? 'redis://localhost:6379'
  const client = new Redis(url, redisConfig)

  client.on('error', (err) => console.error(`[Redis:${name}] error:`, err.message))
  client.on('connect', () => console.log(`[Redis:${name}] connected`))

  return client
}

// Three separate clients — pub/sub clients cannot issue regular commands once subscribed
export const redis    = createClient('main')
export const redisPub = createClient('pub')
export const redisSub = createClient('sub')

export async function connectRedis(): Promise<void> {
  await Promise.all([redis.connect(), redisPub.connect(), redisSub.connect()])
}

export async function disconnectRedis(): Promise<void> {
  await Promise.all([redis.quit(), redisPub.quit(), redisSub.quit()])
}
