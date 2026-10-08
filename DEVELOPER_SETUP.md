# Developer setup

How to get a working copy of LumiumX running, how to verify it, and how to
change it safely. Read `README.md` first for what the system does, then
`ARCHITECTURE.md` for how it fits together.

## 1. What you are setting up

One Node.js process: the Telegram bot in `automation/`. It drives the
whole product pipeline (Stage 1 creative, Stage 2 production, Stage 3
marketing, Stage 4 Etsy draft) and the SEO panel. There is no Docker, no
database server and no web app. State lives in JSON files under
`products/<NNN-slug>/` and `automation/state/`.

## 2. Prerequisites

| Tool | Version | Why |
|---|---|---|
| Node.js | **24 or newer** | `automation`, `production` and `seo` require it; TypeScript in `services/` runs natively (no build step) |
| npm | bundled with Node | installs the few dependencies below |
| Git | any recent | |
| Playwright Chromium | installed by step 4 | Stage 3 renders listing images headlessly (network blocked) |
| LibreOffice + poppler | optional | only for the spreadsheet engine's preview tests (`spreadsheet/`); those tests skip without them |

The owner develops on Windows; in PowerShell use `npm.cmd` if script
execution policy blocks `npm`. Every command below works the same in Git Bash
or on macOS/Linux.

## 3. Clone

```bash
git clone https://github.com/rbnn-conf/Etsy-AI.git
cd Etsy-AI
```

`main` is the current application. Branch from it for your work.

The repository is large (about 1 GB; product artwork is committed). Generated binaries
(proof images, deliverables, marketing PNGs, delivery ZIPs) are git-ignored and
will not be in your clone; the JSON records that describe them are.

## 4. Install dependencies

Only these folders have dependencies. `automation/`, `production/` and `seo/`
have none of their own.

```bash
npm --prefix services ci                         # dev only: typescript, @types/node
npm --prefix marketing ci                        # playwright
npx --prefix marketing playwright install chromium
npm --prefix products/004-cozy-spooky-coloring ci   # REQUIRED by production/ (sharp, pdf-lib, fflate)
npm --prefix products/003-midnight-seance ci        # REQUIRED by production/ (@pdf-lib/fontkit, pdfjs-dist)
npm --prefix spreadsheet ci                      # only if you work on the spreadsheet engine
```

**Hidden dependency, read this.** Stage 2 (`production/src/lib.mjs`) loads
`sharp`, `pdf-lib`, `fflate` and helper code from
`products/004-cozy-spooky-coloring/`, and `@pdf-lib/fontkit`, its PDF
renderer and fonts from `products/003-midnight-seance/`. Without the two
product installs above, production builds and many tests fail. Never delete
or move those two folders. Giving `production/` its own `package.json` is a
known follow-up (deferred by the owner).

## 5. Configure `.env` (only to run the bot; tests need nothing)

All tests run offline with mocked OpenAI, Telegram and Etsy. You need a `.env`
only to run the bot.

1. Create `.env` in the repository root (git-ignored; never commit it).
2. Copy the variable **names** from `.env.example` (Etsy, review-bot chat) and
   `automation/.env.example` (bot token, OpenAI, limits). Fill in values.

For a second developer the safe setup is:

| Concern | Do this |
|---|---|
| Telegram | Create **your own** bot with @BotFather and use your own chat. Telegram allows one poller per token: running with the owner's token steals the owner's button presses. |
| Products | Point `AUTOMATION_PRODUCTS_DIR` and `AUTOMATION_STATE_DIR` at a scratch folder outside the repository, so you never write into the owner's real products. |
| OpenAI | Use your own key with a spending limit. Every image is paid. The bot shows counts and estimates before large runs. |
| Etsy | Leave `ETSY_STAGE4_DRY_RUN` unset (dry run is the default: zero Etsy requests). Never set `ETSY_DRAFT_WRITES_ENABLED` or `ETSY_PUBLISH_ENABLED` to `true` and never connect the owner's shop. The encrypted token in `services/.secrets/` is the owner's and is not in Git. |

## 6. Verify

```bash
npm --prefix automation run check-config   # local only: validates .env, prints next product ID, exits
npm test                                   # every package suite (from the repo root)
```

`npm test` at the root runs, in order: automation (the largest suite, about
10 minutes), production, marketing, seo, services and spreadsheet, then the
services type check. Run a single package with `npm --prefix <package> test`.

Expected: everything passes; spreadsheet skips 2 preview tests when
LibreOffice is absent.

## 7. Run

```bash
npm start            # = npm --prefix automation start; long-polls Telegram until Ctrl-C
```

Send `/start` to your bot for the control panel. The full Telegram guide is
`automation/docs/STAGE_1_README.md`.

## 8. Where to start reading

| Area | Start here |
|---|---|
| Bot entry point | `automation/src/bot.mjs` |
| Workflow, states and transitions | `automation/src/orchestrator/workflow.mjs`, `state.mjs` |
| Telegram UI | `automation/src/telegram/` |
| OpenAI calls (Stage 1 and Stage 3 copy/scenes only) | `automation/src/openai/`, `automation/src/stage3/` |
| Stage 2 production (deterministic) | `production/src/index.mjs`, `production/src/adapters/` |
| Stage 3 marketing (deterministic rendering) | `marketing/src/stage3/` |
| Stage 4 Etsy draft/publish | `automation/src/stage4/`, `services/src/etsy/` |
| SEO engine | `seo/src/`, Telegram side `automation/src/seo/` |
| Why things are the way they are | `docs/adr/` (newest ADRs describe current behaviour) |

## 9. Rules that keep the system safe

- **Never commit secrets.** `.env`, `services/.secrets/` and token files are
  git-ignored. `.env.example` files hold names only. See `SECURITY.md`.
- **Never create live Etsy objects or publish during development or tests.**
  Publishing needs PUBLISH + CONFIRM PUBLISH in Telegram plus
  `ETSY_PUBLISH_ENABLED=true`; `EtsyService.activateListing` is the only code
  that may set a listing active.
- **Production and marketing rendering are deterministic.** Only
  `automation/` calls OpenAI. Production code must never import `automation/`;
  isolation tests enforce this.
- **Do not edit product records by hand** unless you know the approval binding:
  approvals are bound to files by SHA-256, and Stage 2/4 refuse changed inputs.
- **Human review gate:** every customer-facing artifact is shown to the owner
  and approved before anything depends on it.
- **Keep files LF.** Some tests read source files with regular expressions.
  Write files with LF line endings (`.gitattributes` enforces this on checkout).
- **Document decisions.** A significant change gets an ADR in `docs/adr/` and
  updates the relevant top-level doc in the same change.
- **Git:** branch from the agreed base as `feature/<name>`, `fix/<name>` or
  `chore/<name>`; open a PR; never force-push shared branches.

## 10. Things that look odd but are intentional

- `products/003-…` and `products/004-…` are older hand-built products whose
  installed libraries and fonts Stage 2 reuses (see step 4).
- `products/005-…`, `006-…` and `007-…` are hand-built products. The bot only
  manages products whose `product.json` says `"managed_by": "automation-stage-1"`.
- `automation/reserved-product-ids.json` stops the bot from reusing numbers
  assigned outside it.
- `spreadsheet/` (`@dpf/spreadsheet`) is a working XLSX engine kept for a
  possible spreadsheet product category; it is not wired into Stages 1-4.
- `docs/archive/` holds superseded documents, kept for history only.
