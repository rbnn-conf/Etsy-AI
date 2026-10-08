# Architecture

## Current architecture

```text
Owner (Telegram app)
   │  long-poll getUpdates (no webhook, no public endpoint)
   ▼
automation/src/bot.mjs  ── one Node.js 24 process ──────────────────────────────┐
   │                                                                             │
   ├─ orchestrator/   state machine, product store, workflow actions             │
   ├─ telegram/       control panel, approvals, owner status message            │
   ├─ openai/         OpenAI client (Stage 1)            ──► OpenAI API         │
   ├─ stage3/         listing copy + AI environment scenes ──► OpenAI API       │
   ├─ stage4/         Etsy delivery plan, payload, draft  ──► services/src/etsy ──► Etsy API
   ├─ seo/            SEO owner panel                     ──► seo/src            │
   └─ costs/          priced OpenAI cost ledger                                  │
        │                                                                        │
        ├──► production/src   Stage 2, deterministic (no network, no model)      │
        └──► marketing/src/stage3   Stage 3 rendering + QC, deterministic        │
                                                                                 │
Files ◄──────────────────────────────────────────────────────────────────────────┘
  products/<NNN-slug>/   product.json (state, approvals, history) + artefacts per stage
  automation/state/      git-ignored runtime state: registry, Telegram offset, cost ledger, owner status, SEO sessions
  services/.secrets/     git-ignored encrypted Etsy token, its key, localhost TLS files
```

There is no Docker, no database and no server to deploy. The bot is started
with `npm start` on the owner's machine. `product.json` is the source of truth
for each product; every state change is schema-validated and appended to its
`status_history`. On start the bot recovers interrupted steps to a retryable
`FAILED` state.

### Packages

| Package | Role | Runtime dependencies |
|---|---|---|
| `automation/` (`@dpf/automation`) | The bot and every OpenAI call | none (uses `services/` TypeScript directly via Node type stripping) |
| `production/` (`@dpf/production`) | Stage 2 adapters, build, QC | **borrowed**: see "Hidden dependencies" |
| `marketing/` (`@dpf/marketing`) | Stage 3 facts, claims, creative direction, rendering, QC | `playwright` (Chromium, network hard-blocked) |
| `seo/` (`@dpf/seo`) | SEO / Discovery engine | none |
| `services/` (`@dpf/services`) | Etsy Open API v3 client + Telegram Bot API client | none (dev: `typescript`, `@types/node`) |
| `spreadsheet/` (`@dpf/spreadsheet`) | Functional XLSX engine, not wired into Stages 1-4 (product 006 only) | `exceljs`, `jszip` |

### Hidden dependencies (read before moving anything)

- `production/src/lib.mjs` loads `sharp`, `pdf-lib` and `fflate`, plus
  `hash`/`assert`/`validatePngStructure`/`verifyZip`, from
  `products/004-cozy-spooky-coloring/` (its `package.json`, `node_modules` and
  `src/core.mjs`).
- `production/src/lib.mjs` loads `@pdf-lib/fontkit` and the pdf.js page renderer
  (`src/render/pdf-preview.mjs`) from `products/003-midnight-seance/`.
- `production/src/crochet/design.mjs` and `crochet/moonlit/theme.mjs` load fonts
  from `products/003-midnight-seance/fonts/`.
- Therefore `npm ci` must be run in both product folders, and neither may be
  removed. Giving `production/` its own dependencies is a deferred follow-up.
- Stage 1 imports `production/src/index.mjs` for format adapters and QC helpers
  (the reverse direction, production → automation, is forbidden).

### Boundaries enforced by tests

- Production, marketing, services and spreadsheet code never import
  `automation/` (`automation/test/isolation-and-client.test.mjs`).
- The Etsy client is imported by exactly one automation module,
  `stage4/etsy-live.mjs`, which only `bot.mjs` loads.
- Only the Telegram SEO panel (`automation/src/seo/`) imports the SEO engine;
  Stage 1-4, production, marketing and services code never do
  (`seo/test/seo.test.mjs`).
- `services/` contains no LLM client (`services/test/no-runtime-llm.test.ts`).

## Stage 1 creative orchestrator (ADR-023)

A separate, owner-requested pre-production layer in `automation/`:
Telegram (own bot token) → optional reference images → OpenAI reference
analysis, creative direction and 3 concepts → 1 preview image per concept →
owner chooses visually → `product.json` specification → 3 proof images → approve / regenerate / change direction /
reject. It stops at `CREATIVE_APPROVED`, never calls Etsy or production
builds, and is never imported by production code. ADR-013 still applies to the
production pipeline. Details: `automation/docs/STAGE_1_README.md`.

## Stage 2 deterministic production (ADR-024)

`production/` (`@dpf/production`) turns a `CREATIVE_APPROVED` Stage 1
product into customer files under `products/<id>/production/`.

- **Handoff:** an immutable handoff manifest references the approved artwork
  by path and SHA-256.
- **Adapters:** one per product format: `greeting-card`, `colouring-book`
  (full-book artwork gate, ADR-030) and `crochet-pattern-bundle` (approved
  pattern-source gate, bound by SHA-256, ADR-041).
- **Build:** resumable and deterministic, recorded in `build-record.json`.
- **QC:** re-checks from disk and renders every PDF page.
- **Coordination:** the Stage 1 bot runs it, via `/produce <id>`, then the
  QC-gated review, then APPROVE PRODUCTION.
- **Boundaries:** no model client and no network code. It reuses #004's and
  #003's installed libraries, and never imports `automation/`. It stops at
  `PRODUCTION_APPROVED`; listing, marketing and Etsy are Stage 3.

## Stage 3 listing and marketing (ADR-025)

`/market <id>` on a `PRODUCTION_APPROVED` product.

- **Facts:** derived only from the verified Stage 2 package, with a claim
  allow-list built from them.
- **OpenAI** (`automation/src/stage3`): the listing copy, environment
  briefs with one tone line, and up to four AI environment scenes. Every
  output is claim-checked.
- **Deterministic** (`marketing/src/stage3`, reusing `@dpf/marketing`):
  the facts, the art-directed campaign planner, nine real-artwork
  compositions, rendering with 300 px thumbnails, and QC.
- **Strategy:** a deterministic marketing strategy (`marketing/strategy.json`,
  product family plus theme) shapes both the listing copy and the visual
  campaign. Facts still come only from production.
- **Adapters (ADR-037):** a registry (`marketing/src/stage3/adapters/`) picks
  the per-format facts, claims, planner, compositions, model facts and engine
  hooks: `greeting-card`, `colouring-book` and `crochet-pattern-bundle`
  (ADR-042: real PDF renders, integrity-checked claims, no AI images of
  finished items). For colouring books, OpenAI
  also makes one coloured example: an image edit of a real page, labelled
  and never counted as product artwork.
- **Gate:** QC-gated owner review, ending at `MARKETING_APPROVED`.
- **Out of scope:** Etsy publishing (Stage 4).

## Stage 4 Etsy draft and explicit publish (ADR-026)

`/etsy <id>` on a `MARKETING_APPROVED` product. It creates a draft only.

- **Engine** (`automation/src/stage4`, zero OpenAI):
  - verified inputs and the customer delivery set (ADR-038): ONE product
    delivered as 1-5 deterministic ZIPs (the delivery files), planned in
    logical groups and proved complete (every approved file exactly once,
    identical bytes) before any Etsy call;
  - a payload with the category verified against Etsy's taxonomy;
  - a journalled draft and uploads that are never duplicated;
  - remote read-back verification.
- **Etsy client:** `services/src/etsy` (ADR-007), reached only through
  `stage4/etsy-live.mjs`, which only `bot.mjs` loads. The dry run is the
  default.
- **Publishing:** PUBLISH, then CONFIRM PUBLISH, plus `ETSY_PUBLISH_ENABLED`
  (checked in the bot and inside `EtsyService.activateListing`, the only
  code that sends `state=active`), plus revalidation and an active
  read-back, ending at `PUBLISHED`.

## Telegram control panel and cost ledger (ADR-027)

- **Control panel:** `/start` opens it (`automation/src/telegram/menu.mjs`).
  It is a second interface over the same workflow actions, with no separate
  state, and never offers Etsy publishing.
- **Cost ledger:** `automation/src/costs` holds the versioned pricing, the
  one calculator and the append-only ledger. Every metered OpenAI call becomes
  a priced (or explicitly unpriced) event with its pricing version and GBP
  rate.

## SEO / Discovery engine (ADR-031 to ADR-036)

`seo/` decides what search positioning makes commercial sense before a product
is made. It works only on manually captured Etsy Marketplace Insights (never
scraped or estimated), has no network and no model, and its opportunity score
is a LumiumX decision-support metric, not the Etsy algorithm. The owner drives
it from the bot's SEO panel (`automation/src/seo/`). Details:
`docs/SEO_DISCOVERY_ENGINE.md`.

## Retired components (ADR-069)

Removed in the 2026-10 repository cleanup because nothing in the running
system used them. Their code is kept in the owner's private archive of the
original repository (see `docs/archive/README.md`); their ADRs stay in
`docs/adr/` with a retirement note.

| Component | Was | Replaced by |
|---|---|---|
| Docker Compose, PostgreSQL, SQL migrations, infrastructure scripts | Phase 0 foundation (ADR-002, ADR-003, ADR-008 schema) | File-based state in `products/` and `automation/state/` |
| n8n | Planned orchestrator (ADR-004) | The Telegram bot |
| `services/src/design`, `services/src/db` | DesignProvider/Canva boundary, ProductSpec repository, `design:pipeline` for Product #001 (ADR-007, ADR-008, ADR-013 pipeline) | Stage 2 adapters in `production/` |
| `services/src/review`, review bot scripts | ADR-009 Telegram review bot | The automation bot's approval gates |
| Planner compositions in `marketing/` | Product #001 listing images (ADR-019) | `marketing/src/stage3/` |
| `design/schemas`, `design/scripts` | DESIGN_SPEC contracts for the removed pipeline | Stage 3 plans validated in `marketing/src/stage3/` |

## Why this structure

- **One process, files as state.** At one owner and one shop, JSON files with
  schema validation, append-only history and SHA-256 approval binding are
  simpler and more auditable than a database. Product records are committed;
  regenerable binaries are git-ignored.
- **OpenAI only where judgement is needed.** Creative concepts, artwork and
  listing copy use OpenAI in `automation/`. Production, rendering, QC and Etsy
  verification are deterministic and testable offline.
- **Owner gates everywhere.** Nothing customer-facing advances without an
  explicit Telegram approval, and publishing to Etsy needs three independent
  confirmations (see `SECURITY.md`).
- **Prefer boring infrastructure.** No queues, services or containers until a
  real need appears.
