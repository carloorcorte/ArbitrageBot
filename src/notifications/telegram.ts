import type { ArbitrageOpportunity } from '../core/detector'

export class TelegramNotifier {
  private readonly token:   string
  private readonly chatId:  string
  readonly enabled: boolean

  constructor() {
    this.token  = process.env.TELEGRAM_BOT_TOKEN ?? ''
    this.chatId = process.env.TELEGRAM_CHAT_ID   ?? ''
    this.enabled = Boolean(this.token && this.chatId)
    if (!this.enabled) console.log('[Telegram] disabled — set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to enable')
  }

  async opportunity(opp: ArbitrageOpportunity): Promise<void> {
    const paper = process.env.PAPER_TRADING !== 'false'
    await this.send(
      `${paper ? '📋' : '💰'} <b>Arbitrage${paper ? ' (paper)' : ''}</b>\n` +
      `<b>${opp.symbol}</b>  <code>+${opp.netProfitPct.toFixed(4)}%</code> net\n` +
      `Buy  <b>${opp.buyExchange}</b>  @ ${opp.buyAsk.toFixed(4)}\n` +
      `Sell <b>${opp.sellExchange}</b>  @ ${opp.sellBid.toFixed(4)}`
    )
  }

  async circuitBreaker(message: string): Promise<void> {
    await this.send(`🚨 <b>Circuit breaker</b>\n${message}`)
  }

  async info(message: string): Promise<void> {
    await this.send(`ℹ️ ${message}`)
  }

  private async send(text: string): Promise<void> {
    if (!this.enabled) return
    try {
      const res = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ chat_id: this.chatId, text, parse_mode: 'HTML' }),
      })
      if (!res.ok) console.error('[Telegram] send failed:', await res.text())
    } catch (err) {
      console.error('[Telegram] send error:', (err as Error).message)
    }
  }
}
