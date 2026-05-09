# Progress & Roadmap

Stato del progetto, decisioni prese e prossimi step.

---

## Stato attuale — 2026-05-06

### Fatto

- [x] **Pianificazione e architettura** — tipo di arbitraggio scelto (cross-exchange CEX), stack tecnologico definito (Bun + CCXT Pro + Hono + Next.js + PostgreSQL + Redis), architettura a due processi documentata
- [x] **Documentazione** — `CLAUDE.md`, `docs/architecture.md`, `docs/domain.md`, `docs/system-architect-overview.md`
- [x] **Scaffolding progetto** — Bun init, dipendenze installate, struttura cartelle, tsconfig, drizzle.config, .env.example, package.json scripts
- [x] **Redis client** — tre connessioni separate (`redis`, `redisPub`, `redisSub`) come richiesto da Pub/Sub
- [x] **Database schema** — tabelle `opportunities`, `trades`, `fee_cache` con Drizzle ORM, tipi TypeScript inferiti
- [x] **FeedManager** — WebSocket CCXT Pro per Binance + Kraken, loop paralleli per ogni (exchange, symbol), scrive su Redis HSET + PUBLISH
- [x] **FeeCalculator** — calcolo profitto netto con `decimal.js` (no float nativi), cache fee schedules da CCXT con refresh orario
- [x] **OpportunityDetector** — subscribe Redis `prices:*`, confronta prezzi tra exchange, filtra per `MIN_NET_PROFIT_PCT`
- [x] **RiskManager** — limiti posizione, perdita giornaliera, circuit breaker (3 perdite in 5 min → pausa 30 min)
- [x] **Executor** — paper mode completo (simula fill, logga su PostgreSQL), live mode placeholder
- [x] **Engine entry point** — `src/engine.ts`, graceful shutdown, refresh fee orario, typecheck OK
- [x] **Docker Compose** — PostgreSQL 16 + Redis 7, volumi persistenti
- [x] **Migration DB** — tabelle `opportunities`, `trades`, `fee_cache` create
- [x] **Engine testato live** — feed Binance e Kraken su BTC/USDT e ETH/USDT confermati in Redis
- [x] **API process** — Hono REST (`/api/opportunities`, `/api/trades`, `/api/status`) + WebSocket `/ws` che fa bridge Redis → client
- [x] **Dashboard** — Next.js + shadcn/ui, price table real-time, opportunity feed, stats bar, build OK

### Non ancora fatto

- [ ] Test unitari — almeno `FeeCalculator` e `RiskManager`
- [ ] Live executor — ordini reali su entrambi gli exchange simultaneamente
- [ ] Credenziali exchange reali in `.env` (per live trading)

---

## Roadmap

### Phase 1 — Validazione in paper trading
Obiettivo: verificare che il sistema rilevi opportunità reali prima di rischiare soldi.

- [ ] Avviare Redis e PostgreSQL (Docker)
- [ ] Applicare migration DB (`bun run db:migrate`)
- [ ] Testare feed con `src/test-feed.ts` (prezzi in console, no infrastruttura)
- [ ] Avviare engine completo in paper mode (`bun run dev`)
- [ ] Costruire API process con Hono (REST + WebSocket)
- [ ] Costruire dashboard minimale (price table + opportunity feed)
- [ ] Raccogliere dati: quante opportunità appaiono al giorno? Su quali symbol? Con che spread?

### Phase 2 — Live trading (piccole somme)
Prerequisito: Phase 1 completata, fondi pre-posizionati su Binance e Kraken.

- [ ] Implementare live executor con gestione errori robusta
- [ ] Aggiungere API keys reali in `.env` (mai committate)
- [ ] Testare con `MAX_POSITION_USD=10` (rischio minimo)
- [ ] Alert su errori critici (Telegram bot o email)
- [ ] Monitoraggio P&L reale vs paper

### Phase 3 — Ottimizzazione e scaling
Prerequisito: Phase 2 stabile e profittevole.

- [ ] Aggiungere exchange (Bybit, Coinbase Advanced)
- [ ] Aggiungere più symbol basandosi sui dati Phase 1
- [ ] Analisi storica: orari migliori, coppie migliori
- [ ] Valutare migrazione detector a Rust se latenza è il limite
- [ ] Refactor in microservizi se si vuole scalare

---

## Decisioni chiave prese

| Data | Decisione | Motivazione |
|---|---|---|
| 2026-05-06 | Cross-exchange CEX (Binance + Kraken) | Più semplice da implementare, liquido, API stabili |
| 2026-05-06 | Full TypeScript / Bun (no Rust per ora) | Bottleneck è latenza di rete, non CPU. Rust aggiunge complessità senza benefici concreti in phase 1 |
| 2026-05-06 | Architettura a due processi (engine + API) | Isolamento: crash della dashboard non ferma il trading |
| 2026-05-06 | Paper trading come default | Sicurezza: un bug non brucia soldi veri senza scelta esplicita |
| 2026-05-06 | `decimal.js` per tutti i calcoli finanziari | Float JS introduce errori di arrotondamento significativi su valori monetari |
