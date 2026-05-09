# Claude Tools

Guida completa agli strumenti Claude Code configurati in questo progetto:
agenti, slash commands e MCP server.

---

## Agenti

Gli agenti sono profili specializzati che Claude attiva automaticamente in base al contesto,
oppure puoi invocarli esplicitamente nella chat.

**Come invocare:** menzionali nella richiesta, es:
> *"con il security-engineer, fai una review di questa route"*
> *"usa il refactoring-expert per pulire questo componente"*

### Progetto Slippage

| Nome | Descrizione | Invocazione |
|------|-------------|-------------|
| `frontend-architect` | Componenti React/Next.js, layout Tailwind, design system. Esperto di App Router, Server Components, Tailwind v4. | *"riprogetta questo componente"*, *"come strutturiamo questa pagina"* |
| `content-manager` | Gestisce artisti, release, metadata SEO, Open Graph. Definisce schema dati e testi del sito. | *"aggiungi questa release"*, *"ottimizza i metadata SEO"* |

### Engineering

| Nome | Descrizione | Invocazione |
|------|-------------|-------------|
| `system-architect` | Architettura di sistema scalabile, decisioni tecniche a lungo termine, trade-off tra approcci. | *"come architettiamo questa feature"*, *"valutiamo questi approcci"* |
| `backend-architect` | API design, schema DB, integrità dei dati, fault tolerance, autenticazione. | *"progetta questa API"*, *"come strutturiamo il database"* |
| `tech-stack-researcher` | Ricerca e confronto di tecnologie, consigli su stack e librerie prima di iniziare. | *"quale libreria uso per X"*, *"confronta queste opzioni"* |
| `requirements-analyst` | Trasforma idee vaghe in specifiche concrete, analisi requisiti, user stories. | *"aiutami a definire questa feature"*, *"analizza questi requisiti"* |

### Qualità

| Nome | Descrizione | Invocazione |
|------|-------------|-------------|
| `security-engineer` | Vulnerabilità OWASP, threat modeling, audit sicurezza, autenticazione/autorizzazione. | *"fai una security review"*, *"questo codice è sicuro?"* |
| `performance-engineer` | Core Web Vitals, ottimizzazione bundle, analisi bottleneck. Approccio: misura prima, ottimizza dopo. | *"perché la pagina è lenta"*, *"ottimizza questo componente"* |
| `refactoring-expert` | Pulizia codice, riduzione debito tecnico, clean code, pattern consolidati. | *"refactorizza questo file"*, *"riduci la complessità"* |

### Analisi & Ricerca

| Nome | Descrizione | Invocazione |
|------|-------------|-------------|
| `deep-research-agent` | Ricerca approfondita con strategie adattive, analisi multi-fonte, sintesi complessa. | *"ricerca come funziona X"*, *"analizza le opzioni per Y"* |

### Comunicazione

| Nome | Descrizione | Invocazione |
|------|-------------|-------------|
| `technical-writer` | Documentazione tecnica, README, guide API, adattata al pubblico target. | *"documenta questa funzione"*, *"scrivi il README per X"* |
| `learning-guide` | Spiega concetti di programmazione con progressione didattica ed esempi pratici. | *"spiegami come funziona X"*, *"non capisco questo pattern"* |

---

## Slash Commands

I comandi slash si invocano digitando `/nome-comando` nella chat.
Puoi passare argomenti dopo il nome, es: `/page-new about`.


### Pianificazione

| Comando | Descrizione | Esempio |
|---------|-------------|---------|
| `/new-task` | Analizza la complessità di un task e crea un piano di implementazione | `/new-task implementare sistema di ricerca` |
| `/feature-plan` | Pianifica una feature con specifiche tecniche dettagliate | `/feature-plan pagina artisti con filtri` |

### Qualità del codice

| Comando | Descrizione | Esempio |
|---------|-------------|---------|
| `/lint` | Esegue il linting e corregge i problemi di qualità del codice | `/lint` |
| `/code-cleanup` | Refactoring e pulizia del codice secondo best practice | `/code-cleanup src/components/Header.tsx` |
| `/code-optimize` | Analizza e ottimizza il codice per performance e memoria | `/code-optimize src/app/[locale]/page.tsx` |
| `/code-explain` | Spiega il funzionamento di un pezzo di codice | `/code-explain src/i18n/routing.ts` |

### API

| Comando | Descrizione | Esempio |
|---------|-------------|---------|
| `/api-new` | Crea una nuova API route Next.js con validazione e TypeScript | `/api-new releases` |
| `/api-test` | Genera test automatici per endpoint API | `/api-test src/app/api/releases/route.ts` |
| `/api-protect` | Aggiunge autenticazione e autorizzazione a endpoint API | `/api-protect src/app/api/releases/route.ts` |

### Documentazione

| Comando | Descrizione | Esempio |
|---------|-------------|---------|
| `/docs-generate` | Genera documentazione per codice, API e componenti | `/docs-generate src/components/` |

---

## MCP Server

I MCP server estendono le capacità di Claude con strumenti esterni.
Sono configurati in `.mcp.json` e si attivano automaticamente.

| Server | Descrizione | Quando si attiva |
|--------|-------------|------------------|
| `context7` | Documentazione aggiornata di librerie e framework (Next.js, React, Tailwind, ecc.) | Quando chiedi come usare una libreria specifica — Claude recupera la doc aggiornata invece di usare solo la sua conoscenza |
| `playwright` | Automazione browser: screenshot, click, navigazione, test E2E | Quando devi testare il sito visivamente, verificare layout, o fare test di regressione UI |

### Usare context7 esplicitamente

Puoi chiedere a Claude di usarlo in modo esplicito:
> *"usando context7, come si configura next-intl con App Router?"*
> *"cerca nella doc di Tailwind v4 come definire un tema custom"*

### Usare Playwright esplicitamente

> *"fai uno screenshot della homepage"*
> *"verifica che il menu mobile funzioni su 390px"*
> *"testa il cambio lingua sulla pagina releases"*

---

## Riepilogo rapido

```
Stai progettando qualcosa?     → /feature-plan o /new-task
Vuoi creare una pagina?        → /page-new
Vuoi creare un componente?     → /component-new
Il codice fa schifo?           → /code-cleanup o /lint
Vuoi ottimizzare?              → /code-optimize
Non capisci del codice?        → /code-explain
Hai bisogno di una API?        → /api-new → /api-test → /api-protect
Vuoi documentazione?           → /docs-generate
Review sicurezza?              → security-engineer agent
Problema di performance?       → performance-engineer agent
Decisione architetturale?      → system-architect agent
```
