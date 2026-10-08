# LumiumX — Digital Product Factory

A Telegram-driven factory for Etsy digital products: colouring books, crochet
pattern bundles and greeting cards. The owner works entirely in Telegram. The
bot takes a product from idea to a verified Etsy draft, with an owner approval
gate after every customer-facing step.

## How it works

```text
Owner (Telegram) ⇄ automation/src/bot.mjs        one Node.js process, long-polls Telegram
                     │
                     ├─ Stage 1  creative     automation/        OpenAI: concepts, proofs, full book, crochet patterns
                     ├─ Stage 2  production   production/        deterministic: print-ready PDFs, ZIP packages, QC
                     ├─ Stage 3  marketing    automation/stage3 + marketing/stage3   listing copy + rendered listing images
                     ├─ Stage 4  Etsy         automation/stage4 + services/etsy      verified draft; publish only on explicit owner command
                     └─ SEO      research     automation/seo + seo/                  manual marketplace evidence, opportunity scoring
                     │
State: products/<NNN-slug>/product.json (+ artefacts)   automation/state/ (git-ignored runtime state)
```

No Docker, no database server, no web app. Everything is files plus three
external APIs: Telegram, OpenAI (Stages 1 and 3 only) and Etsy (Stage 4 only).

## Quick start

```bash
# Node.js 24+
npm --prefix services ci && npm --prefix marketing ci
npx --prefix marketing playwright install chromium
npm --prefix products/004-cozy-spooky-coloring ci   # required by production/
npm --prefix products/003-midnight-seance ci        # required by production/
npm test                                            # offline; no .env needed
```

To run the bot you also need a `.env`. Full onboarding, including safe
settings for a second developer: **[DEVELOPER_SETUP.md](DEVELOPER_SETUP.md)**.

## Entry points

| Command | What it does |
|---|---|
| `npm start` | Start the Telegram bot (`automation/src/bot.mjs`) |
| `npm run check-config` | Validate `.env` and print the next product ID; no network |
| `npm test` | Run every package's offline test suite and the services type check |
| `npm --prefix automation run seo:import-cycle` | Import a captured SEO research cycle |
| `npm --prefix seo run report` / `plan` / `research` | SEO engine CLIs |
| `npm --prefix services run etsy:connection -- <cmd>` | Etsy OAuth connection and checks (`docs/ETSY_CONNECTION.md`) |
| `node production/scripts/moonlit-*.mjs`, `node marketing/scripts/creative-preview.mjs`, `node automation/scripts/scratch-marketing-run.mjs` | Owner review tools; read-only on products, write to a scratch folder |

## Repository map

| Path | Contents |
|---|---|
| `automation/` | The bot: orchestration, Telegram UI, OpenAI client, Stage 3 copy, Stage 4 Etsy flow, SEO panel, cost ledger. Prompts, JSON schemas, Etsy taxonomy/section config |
| `production/` | `@dpf/production`: Stage 2 adapters (greeting card, colouring book, crochet pattern bundle), build, QC |
| `marketing/` | `@dpf/marketing`: Stage 3 facts, claims, Creative Director, route contracts, HTML→PNG rendering, QC |
| `seo/` | `@dpf/seo`: SEO / Discovery engine (no network, no model) |
| `services/` | `@dpf/services`: Etsy Open API v3 client (OAuth, encrypted token store, drafts, uploads) and the Telegram Bot API client |
| `spreadsheet/` | `@dpf/spreadsheet`: functional XLSX engine, kept for a future spreadsheet category (used by product 006 only) |
| `products/` | One folder per product. 008+ are bot-managed; 003-007 are hand-built (003/004 also supply Stage 2's libraries) |
| `docs/` | ADRs (`docs/adr/`), design knowledge base (`docs/design/`), SEO and Etsy guides; superseded docs in `docs/archive/` |
| `design/brand/` | LumiumX brand canon and tokens |
| `.claude/skills/` | Design skills used for AI-assisted design review |
| `tests/verify-foundation.sh` | Pre-commit secret-hygiene checks |

## Documentation

| Document | Covers |
|---|---|
| [DEVELOPER_SETUP.md](DEVELOPER_SETUP.md) | Install, configure, verify, run; rules for contributing safely |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Components, stages, data flow, boundaries |
| [OPERATIONS.md](OPERATIONS.md) | Running the bot, backups, recovery |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Day-to-day workflow, tests, Git conventions, troubleshooting |
| [SECURITY.md](SECURITY.md) | Secrets, Etsy publishing safeguards, logging |
| [ROADMAP.md](ROADMAP.md) | History and what's next |
| [CLAUDE.md](CLAUDE.md) | Rules for AI-assisted changes |
| `automation/docs/STAGE_1_README.md` | The full Telegram workflow, states and storage layout |
| `docs/ETSY_CONNECTION.md` | Connecting the Etsy shop |
| `docs/SEO_DISCOVERY_ENGINE.md` | The SEO engine |
| `docs/adr/` | Every significant decision (ADR-001 onwards) |

## Secrets

Never in Git. Real values live only in the git-ignored root `.env` and
`services/.secrets/`. `.env.example` and `automation/.env.example` list
variable names only. See `SECURITY.md`.
