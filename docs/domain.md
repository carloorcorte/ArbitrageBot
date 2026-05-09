# Domain Concepts — Crypto Arbitrage

Reference for crypto/finance concepts used in this codebase. Useful for developers without a crypto background.

## What is Arbitrage?

Arbitrage is buying an asset on one market and selling it on another at a higher price, profiting from the price difference. For crypto:

- **Cross-exchange arbitrage**: BTC/USDT costs 100,000 on Binance and 100,150 on Kraken → buy on Binance, sell on Kraken, profit = 150 USDT (before fees).
- The window for opportunity is typically milliseconds to seconds before other bots close the gap.

## Key Terms

**Bid / Ask / Spread**
- **Bid**: highest price a buyer is willing to pay
- **Ask**: lowest price a seller is willing to accept
- **Spread**: ask − bid (the market maker's profit margin)
- For arbitrage: we buy at the ask price and sell at the bid price

**Order Book**
The list of all pending buy and sell orders at each price level. Depth matters: a large order can consume multiple price levels, moving the actual fill price away from the quoted best price.

**Slippage**
The difference between the expected price and the actual fill price. Happens when your order is larger than the available liquidity at the best price level, consuming deeper into the order book. Larger trades = more slippage.

**Market Order vs Limit Order**
- **Market order**: executes immediately at whatever price is available. Fast but subject to slippage.
- **Limit order**: executes only at your specified price or better. No slippage, but may not fill if price moves.
- For arbitrage, we use **market orders** because speed matters more than exact price.

**Maker / Taker Fees**
- **Taker**: you take liquidity (market order). Fee is higher (e.g. 0.1%).
- **Maker**: you add liquidity (limit order that sits in the book). Fee is lower (e.g. 0.08%).
- Arbitrage uses taker fees because we use market orders.

**Net Profit Formula**

```
gross_spread = sell_price - buy_price
buy_fee  = buy_price  × amount × taker_fee_buy_exchange
sell_fee = sell_price × amount × taker_fee_sell_exchange
net_profit = gross_spread × amount - buy_fee - sell_fee
net_profit_pct = net_profit / (buy_price × amount) × 100
```

A trade is only worth executing if `net_profit_pct > MIN_NET_PROFIT_PCT` (e.g. 0.1%).

## Why Cross-Exchange Arbitrage Is Hard in Practice

1. **Execution risk**: by the time both orders land, the price may have moved. The buy fills but the sell doesn't (or vice versa), leaving an open position.
2. **Pre-funded accounts**: to execute simultaneously, you need funds already sitting on both exchanges. You cannot withdraw from exchange A to fund exchange B fast enough (crypto withdrawals take minutes to hours).
3. **Competition**: institutional bots with co-location (servers physically close to exchange matching engines) see prices and execute faster.
4. **Fees erode margins**: opportunities that look profitable often disappear once fees are calculated.

## Paper Trading

Running the full system with real market data but without placing real orders. Simulated fills use the current mid-price. Used to:
- Validate that the detection logic works
- Measure how often real opportunities appear
- Estimate P&L before risking capital

Controlled by `PAPER_TRADING=true` env variable.

## Exchanges Used

**Binance**: Largest crypto exchange by volume. Very low fees (0.1% taker, lower with BNB). Excellent API with low latency WebSocket.

**Kraken**: EU-regulated, solid API. Slightly higher fees (0.26% taker for low volume) but strong reputation and reliability.

Both have REST + WebSocket APIs. CCXT Pro provides a unified interface so we write the same code for both.
