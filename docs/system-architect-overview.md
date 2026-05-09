# Architettura del Sistema — Crypto Arbitrage Engine

Rileggo tutto da zero come se non avessi mai visto il progetto, ragionando sulle decisioni tecniche e sul perché ogni scelta ha senso.

---

## Il problema che stiamo risolvendo

Lo stesso asset (es. Bitcoin) ha prezzi leggermente diversi su exchange diversi in ogni momento. La differenza esiste perché ogni exchange è un mercato separato con i suoi order book e i suoi partecipanti. Se BTC/USDT costa 100.000 su Binance e 100.120 su Kraken, un sistema può:

1. Comprare 1 BTC su Binance a 100.000
2. Vendere 1 BTC su Kraken a 100.120
3. Guadagnare 120 USDT lordi

Dopo le commissioni (~0.2% totale su entrambi i lati = ~200 USDT di costo) questo trade specifico sarebbe in perdita. Servono spread più ampi o commissioni più basse.

**Il sistema deve fare questo migliaia di volte al secondo in modo automatico**, trovare solo i casi in cui il profitto netto è positivo, e eseguire i trade prima che la finestra si chiuda.

---

## Vincoli fondamentali che guidano l'architettura

Prima di parlare di codice, questi vincoli determinano tutto:

1. **La latenza è denaro.** Ogni millisecondo di ritardo tra "vedo l'opportunità" e "eseguo il trade" è una finestra in cui il prezzo può muoversi contro di noi.
2. **I fondi devono essere pre-posizionati.** Non possiamo spostare crypto tra exchange in tempo reale (ci vogliono minuti/ore). Dobbiamo avere USDT già su Binance e BTC già su Kraken (o viceversa) prima che l'opportunità appaia.
3. **Due ordini devono partire simultaneamente.** Se eseguiamo prima il buy e poi il sell (o viceversa), nel mezzo il prezzo può muoversi e il secondo leg fallisce o va in perdita.
4. **Le fees annullano la maggior parte delle opportunità.** Il nostro rilevatore deve calcolare il profitto netto *prima* di decidere se eseguire.
5. **Il sistema deve essere sicuro per default.** Un bug nell'executor può bruciare soldi veri. La paper trading mode deve essere il default, non un'opzione.

---

## Architettura a due processi

Abbiamo scelto di separare il sistema in **due processi indipendenti** invece di uno unico.

```
┌─────────────────────────────┐     ┌──────────────────────────────┐
│      ENGINE PROCESS         │     │       API PROCESS            │
│                             │     │                              │
│  Price feeds (CCXT WS)      │     │  Hono REST API               │
│  Opportunity detection      │◄────►  Hono WebSocket              │
│  Risk management            │Redis│  Serve dashboard             │
│  Trade execution            │Pub/ │  Serve PostgreSQL data       │
│                             │Sub  │                              │
└─────────────────────────────┘     └──────────────────────────────┘
              │                                    │
              └──────────────┬─────────────────────┘
                             │
                      PostgreSQL
                   (trade/opportunity log)
```

**Perché due processi separati invece di uno?**

- Se la dashboard crasha, l'engine continua a fare trading. Se li avessimo nello stesso processo, un errore nella UI potrebbe fermare l'engine.
- Possiamo riavviare l'API senza interrompere i feed.
- In futuro, l'engine può girare su un server vicino agli exchange (bassa latenza) mentre la dashboard gira su un server normale.
- Redis è il bus di comunicazione: ogni processo usa solo quello che gli serve.

---

## I componenti interni dell'Engine

### 1. FeedManager

**Responsabilità**: mantenere connessioni WebSocket con tutti gli exchange e rendere disponibili i prezzi in tempo reale al resto del sistema.

```
Binance WS ──→ watchOrderBook('BTC/USDT') ──→ Redis HSET + PUBLISH
Kraken WS  ──→ watchOrderBook('BTC/USDT') ──→ Redis HSET + PUBLISH
```

CCXT Pro usa un pattern `while(true)` per ogni coppia (exchange, symbol):

```typescript
async function watchLoop(exchange: ccxt.pro.Exchange, symbol: string) {
  while (true) {
    const ob = await exchange.watchOrderBook(symbol, 5)
    // ob.bids[0][0] = miglior bid (prezzo più alto che qualcuno paga)
    // ob.asks[0][0] = miglior ask (prezzo più basso a cui qualcuno vende)
    
    await redis.hset(`tick:${symbol}:${exchange.id}`, {
      bid: ob.bids[0][0].toString(),
      ask: ob.asks[0][0].toString(),
      ts: Date.now(),
    })
    await redis.expire(`tick:${symbol}:${exchange.id}`, 10) // scade dopo 10s = dati stale
    
    await redisPub.publish(`prices:${symbol}`, JSON.stringify({
      exchange: exchange.id, bid: ob.bids[0][0], ask: ob.asks[0][0]
    }))
  }
}
```

Tutti i loop girano **in parallelo** con `Promise.all`. CCXT Pro gestisce la riconnessione automaticamente in caso di disconnessione.

**Perché Redis e non solo un evento in memoria?**
Perché il detector e l'executor girano in processi separati. Redis è il bus condiviso. Anche se usassimo un solo processo, Redis ci permette di avere uno storico dei prezzi recenti (HSET) che il detector può consultare per confrontare tutti gli exchange contemporaneamente.

---

### 2. OpportunityDetector

**Responsabilità**: ricevere ogni aggiornamento di prezzo e decidere se esiste un'opportunità di arbitraggio.

Il detector si iscrive al canale Redis con pattern matching:

```typescript
await redisSub.psubscribe('prices:*')

redisSub.on('pmessage', async (pattern, channel, message) => {
  const { exchange, bid, ask } = JSON.parse(message)
  const symbol = channel.replace('prices:', '') // es. 'BTC/USDT'
  
  // Legge i prezzi più recenti da TUTTI gli exchange per questo symbol
  const [binanceTick, krakenTick] = await Promise.all([
    redis.hgetall(`tick:${symbol}:binance`),
    redis.hgetall(`tick:${symbol}:kraken`),
  ])
  
  // Trova il miglior posto dove comprare (ask più basso)
  // e il miglior posto dove vendere (bid più alto)
  const bestBuy  = { exchange: 'binance', price: binanceTick.ask }
  const bestSell = { exchange: 'kraken',  price: krakenTick.bid }
  
  const result = feeCalculator.netProfit({ bestBuy, bestSell, symbol, amount })
  
  if (result.netProfitPct > MIN_NET_PROFIT_PCT) {
    riskManager.check(result) // può lanciare se i limiti sono violati
    await executor.execute(result)
  }
})
```

**Perché scatta ad ogni aggiornamento di prezzo e non su un timer?**
L'opportunità appare e scompare in millisecondi. Un timer fisso (es. ogni 100ms) introduce latenza artificiale. Reagire ad ogni evento è il modo più veloce.

---

### 3. FeeCalculator

**Responsabilità**: calcolare il profitto netto reale dopo tutte le commissioni.

Le commissioni su un'operazione di arbitraggio cross-exchange:
- **Fee acquisto** = `buy_price × amount × taker_fee_buy_exchange`
- **Fee vendita** = `sell_price × amount × taker_fee_sell_exchange`

```typescript
function netProfit(params: {
  buyExchange: string, sellExchange: string,
  symbol: string, amount: Decimal,
  buyAsk: Decimal, sellBid: Decimal
}): ArbitrageResult {
  const grossProfit = sellBid.minus(buyAsk).times(amount)
  const buyFee = buyAsk.times(amount).times(takerFee[buyExchange][symbol])
  const sellFee = sellBid.times(amount).times(takerFee[sellExchange][symbol])
  const netProfit = grossProfit.minus(buyFee).minus(sellFee)
  const netPct = netProfit.div(buyAsk.times(amount)).times(100)
  
  return { grossProfit, buyFee, sellFee, netProfit, netPct }
}
```

**IMPORTANTE: tutti i calcoli usano `decimal.js`, mai i float nativi di JavaScript.**

Esempio del problema con float:
```javascript
0.1 + 0.2 === 0.30000000000000004  // JavaScript float
// Su un trade da 10.000 USD questo errore diventa centinaia di dollari
```

Le fee schedule vengono caricate da CCXT (`exchange.markets[symbol].taker`) all'avvio e aggiornate ogni ora.

---

### 4. RiskManager

**Responsabilità**: essere il guardiano che impedisce al sistema di fare cose stupide.

```typescript
class RiskManager {
  check(opp: ArbitrageResult): void {
    // 1. Dimensione massima per trade
    if (opp.tradeValueUsd > MAX_POSITION_USD)
      throw new RiskError('Position too large')
    
    // 2. Perdita giornaliera cumulativa
    if (this.dailyPnl < -MAX_DAILY_LOSS_USD)
      throw new RiskError('Daily loss limit reached')
    
    // 3. Circuit breaker: 3 perdite consecutive in 5 minuti → pausa 30 minuti
    if (this.consecutiveLosses >= 3 && this.timeSinceFirstLoss < 5 * 60 * 1000)
      throw new RiskError('Circuit breaker: too many consecutive losses')
  }
}
```

Il circuit breaker è critico: un mercato in rapida caduta può generare molti falsi positivi di opportunità che risultano in perdite. Il circuit breaker interrompe il bleeding automaticamente.

---

### 5. Executor

**Responsabilità**: eseguire il trade (simulato o reale).

```typescript
class Executor {
  async execute(opp: ArbitrageResult): Promise<void> {
    if (process.env.PAPER_TRADING !== 'false') {
      await this.paperExecute(opp)
    } else {
      await this.liveExecute(opp)
    }
  }
  
  private async paperExecute(opp: ArbitrageResult): Promise<void> {
    // Simula fill al prezzo corrente, logga su PostgreSQL come mode='paper'
    await db.insert(trades).values([
      { opportunityId: opp.id, exchange: opp.buyExchange, side: 'buy',  mode: 'paper', ... },
      { opportunityId: opp.id, exchange: opp.sellExchange, side: 'sell', mode: 'paper', ... },
    ])
  }
  
  private async liveExecute(opp: ArbitrageResult): Promise<void> {
    // SIMULTANEI — mai sequenziali
    const [buyOrder, sellOrder] = await Promise.all([
      this.buyExchange.createOrder(opp.symbol, 'market', 'buy',  opp.amount),
      this.sellExchange.createOrder(opp.symbol, 'market', 'sell', opp.amount),
    ])
    // Logga entrambi su PostgreSQL
  }
}
```

**Perché `Promise.all` e non `await` sequenziale?**
Se eseguiamo prima il buy e poi il sell, nel tempo che passa tra i due ordini (anche solo 50ms) il prezzo di Kraken può muoversi. Con `Promise.all` i due ordini partono contemporaneamente (o quasi — dipende dalla latenza di rete verso i due exchange).

---

## L'API Process

Il processo API è più semplice: legge da PostgreSQL per i dati storici e da Redis per i dati real-time.

### Hono REST

```typescript
const app = new Hono()

app.get('/api/opportunities', async (c) => {
  const data = await db.select().from(opportunities)
    .orderBy(desc(opportunities.detectedAt))
    .limit(50)
  return c.json(data)
})

app.get('/api/status', async (c) => {
  return c.json({
    paperMode: process.env.PAPER_TRADING !== 'false',
    dailyPnl: riskManager.dailyPnl,
    tradesExecuted: riskManager.tradeCount,
  })
})
```

### Hono WebSocket — bridge Redis → Dashboard

```typescript
app.get('/ws', upgradeWebSocket((c) => {
  let sub: Redis
  
  return {
    async onOpen(event, ws) {
      sub = new Redis(process.env.REDIS_URL)
      await sub.psubscribe('prices:*', 'opportunities')
      
      sub.on('pmessage', (pattern, channel, message) => {
        ws.send(JSON.stringify({ channel, data: JSON.parse(message) }))
      })
    },
    onClose() {
      sub?.disconnect()
    },
  }
}))
```

Ogni client WebSocket apre la sua connessione Redis dedicata (subscriber) e riceve tutte le notifiche. La dashboard si connette a `/ws` e aggiorna la UI in tempo reale.

---

## Il Database

PostgreSQL serve per **persistenza a lungo termine**: storico delle opportunità, P&L, audit trail.

Redis serve per **comunicazione real-time tra processi**: velocità sub-millisecondo, ma i dati sono volatili (TTL 10s per i tick).

**Separazione netta**: non usiamo PostgreSQL per cose real-time, non usiamo Redis come database permanente.

---

## Sequenza di avvio

```
1. Engine avvia
   ├── Connette a PostgreSQL (esegue migration se necessario)
   ├── Connette a Redis (redis, redisPub, redisSub)
   ├── Carica fee schedules da tutti gli exchange via CCXT REST
   ├── Inizializza RiskManager con stato daily P&L = 0
   ├── Avvia FeedManager (apre WS su tutti gli exchange/symbol)
   └── Avvia OpportunityDetector (si iscrive a Redis)

2. API avvia (indipendente)
   ├── Connette a PostgreSQL (read-only queries)
   ├── Connette a Redis (sub per WebSocket)
   └── Avvia Hono server su porta 3001

3. Dashboard avvia (Next.js dev server o build)
   ├── Connette a /ws per real-time
   └── fetch() su /api/* per dati storici
```

---

## Decisioni architetturali chiave e alternative scartate

| Decisione | Alternativa scartata | Perché la scelta attuale |
|---|---|---|
| Bun runtime | Node.js | Bun è ~3x più veloce, WebSocket nativo, stessa API |
| CCXT Pro (WebSocket) | REST polling | REST introduce latenza artificiale (rate limit 1-10 req/s). WebSocket è push-based, latenza <10ms |
| Redis Pub/Sub | Shared memory / event emitter | Redis permette processi separati e storico dei tick. Event emitter funzionerebbe solo con un solo processo |
| PostgreSQL per log | MongoDB / SQLite | ACID transactions garantiscono che se crasha durante un trade, il log è consistente. SQLite non scala bene in multi-process |
| decimal.js per finanza | Float nativi JS | Float nativi JS hanno errori di arrotondamento che su valori finanziari diventano significativi |
| Paper trading di default | Richiedere opt-in esplicito | Un bug nell'executor non deve mai bruciare soldi veri. Il sistema deve essere sicuro senza configurazione |

---

## La dashboard (Next.js)

La dashboard è una webapp standard con tre sezioni:

1. **Price Table** — tabella real-time: righe = symbol (BTC/USDT, ETH/USDT), colonne = exchange. Aggiornata via WebSocket.
2. **Opportunity Feed** — stream delle ultime opportunità rilevate con: spread lordo, profitto netto stimato, exchange buy/sell, stato (detected/executed/expired).
3. **P&L Chart** — grafico del profitto cumulativo (paper o reale) nel tempo.

Controlli:
- Start/Stop engine (POST `/api/engine/start`)
- Toggle paper/live (con doppia conferma per live)
- Parametri rischio editabili: `MIN_NET_PROFIT_PCT`, `MAX_POSITION_USD`

---

## Roadmap tecnica consigliata

```
Phase 1 — Validazione (paper trading)
  ├── Implementa FeedManager + Redis
  ├── Implementa OpportunityDetector + FeeCalculator
  ├── Paper Executor + log PostgreSQL
  └── Dashboard minimale (price table + opportunity feed)
      → Obiettivo: verificare che il sistema rilevi opportunità reali

Phase 2 — Live trading (piccole somme)
  ├── Live Executor con gestione errori robusta
  ├── RiskManager completo con circuit breaker
  └── Alert (Telegram o email) su errori critici
      → Obiettivo: validare l'esecuzione con €50-100 per trade

Phase 3 — Ottimizzazione
  ├── Aggiungere più exchange (Bybit, Coinbase)
  ├── Analisi storica: quali symbol e orari hanno più opportunità
  └── Eventuale migrazione del detector a Rust se la latenza diventa il limite
```

La fase 1 è completamente senza rischio finanziario e permette di capire se il mercato offre realmente opportunità con il profilo fee/spread degli exchange scelti.
