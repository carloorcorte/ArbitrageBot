import { describe, it, expect, beforeEach } from 'bun:test'
import Decimal from 'decimal.js'
import { FeeCalculator } from './fees'
import type * as ccxt from 'ccxt'

function mockExchange(fees: Record<string, { maker: number; taker: number }>): ccxt.Exchange {
  return {
    markets: Object.fromEntries(
      Object.entries(fees).map(([symbol, f]) => [symbol, { maker: f.maker, taker: f.taker }])
    ),
  } as unknown as ccxt.Exchange
}

describe('FeeCalculator', () => {
  let calc: FeeCalculator

  beforeEach(() => {
    calc = new FeeCalculator()
  })

  describe('netProfit()', () => {
    it('computes gross profit, fees and net profit correctly', async () => {
      await calc.loadFees(new Map([
        ['binance', mockExchange({ 'BTC/USDT': { maker: 0.001, taker: 0.001 } })],
        ['kraken',  mockExchange({ 'BTC/USDT': { maker: 0.002, taker: 0.002 } })],
      ]))

      // buyAsk=100 sellBid=101 amount=1
      // buyCost=100 sellRevenue=101 gross=1
      // buyFee=100*0.001=0.1  sellFee=101*0.002=0.202
      // net=1-0.1-0.202=0.698  netPct=0.698%
      const r = calc.netProfit({
        buyExchange: 'binance', sellExchange: 'kraken',
        symbol: 'BTC/USDT', amount: new Decimal('1'),
        buyAsk: new Decimal('100'), sellBid: new Decimal('101'),
      })

      expect(r.grossProfit.toFixed(4)).toBe('1.0000')
      expect(r.buyFee.toFixed(4)).toBe('0.1000')
      expect(r.sellFee.toFixed(4)).toBe('0.2020')
      expect(r.netProfit.toFixed(4)).toBe('0.6980')
      expect(r.netPct.toFixed(4)).toBe('0.6980')
    })

    it('returns negative netProfit when fees exceed the spread', async () => {
      await calc.loadFees(new Map([
        ['binance', mockExchange({ 'BTC/USDT': { maker: 0.001, taker: 0.001 } })],
        ['kraken',  mockExchange({ 'BTC/USDT': { maker: 0.001, taker: 0.001 } })],
      ]))

      // spread 0.05%, fees 0.1% each = 0.2% total → definitely negative
      const r = calc.netProfit({
        buyExchange: 'binance', sellExchange: 'kraken',
        symbol: 'BTC/USDT', amount: new Decimal('1'),
        buyAsk: new Decimal('100'), sellBid: new Decimal('100.05'),
      })

      expect(r.netProfit.lt(0)).toBe(true)
      expect(r.netPct.lt(0)).toBe(true)
    })

    it('falls back to 0.1% taker fee when symbol is not in cache', () => {
      // No loadFees() called at all
      // buyFee=100*0.001=0.1  sellFee=101*0.001=0.101  net=1-0.1-0.101=0.799
      const r = calc.netProfit({
        buyExchange: 'binance', sellExchange: 'kraken',
        symbol: 'BTC/USDT', amount: new Decimal('1'),
        buyAsk: new Decimal('100'), sellBid: new Decimal('101'),
      })

      expect(r.netProfit.toFixed(4)).toBe('0.7990')
    })

    it('handles fees eating all profit on a large realistic trade', async () => {
      await calc.loadFees(new Map([
        ['binance', mockExchange({ 'BTC/USDT': { maker: 0.001, taker: 0.001 } })],
        ['kraken',  mockExchange({ 'BTC/USDT': { maker: 0.001, taker: 0.001 } })],
      ]))

      // BTC at 60000, amount 0.5 → $30k position, $100 gross spread
      // buyFee=30  sellFee=30.05  net=50-30-30.05=-10.05
      const r = calc.netProfit({
        buyExchange: 'binance', sellExchange: 'kraken',
        symbol: 'BTC/USDT', amount: new Decimal('0.5'),
        buyAsk: new Decimal('60000'), sellBid: new Decimal('60100'),
      })

      expect(r.netProfit.toFixed(2)).toBe('-10.05')
    })

    it('uses the correct exchange fee per side', async () => {
      // binance taker 0.1%, kraken taker 0.26%
      await calc.loadFees(new Map([
        ['binance', mockExchange({ 'ETH/USDT': { maker: 0.0008, taker: 0.001 } })],
        ['kraken',  mockExchange({ 'ETH/USDT': { maker: 0.0016, taker: 0.0026 } })],
      ]))

      const r = calc.netProfit({
        buyExchange: 'binance', sellExchange: 'kraken',
        symbol: 'ETH/USDT', amount: new Decimal('1'),
        buyAsk: new Decimal('2000'), sellBid: new Decimal('2010'),
      })

      expect(r.buyFee.toFixed(4)).toBe('2.0000')    // 2000 * 0.001
      expect(r.sellFee.toFixed(4)).toBe('5.2260')   // 2010 * 0.0026
    })
  })

  describe('isStale()', () => {
    it('returns true before any loadFees call', () => {
      expect(calc.isStale()).toBe(true)
    })

    it('returns false immediately after loadFees', async () => {
      await calc.loadFees(new Map([
        ['binance', mockExchange({ 'BTC/USDT': { maker: 0.001, taker: 0.001 } })],
      ]))
      expect(calc.isStale()).toBe(false)
    })
  })
})
