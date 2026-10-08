# ADR-069: Retire the unused Phase 0 infrastructure and legacy tiers

- **Status:** Accepted (owner-approved repository audit, 2026-10-08).
- **Scope:** repository structure and documentation only. No Stage 1-4, SEO,
  Telegram, crochet or colouring-book behaviour changes.
- **Supersedes in part:** ADR-002, ADR-003, ADR-004 (retired), the
  DesignProvider/ProductSpec parts of ADR-007 and ADR-008, ADR-009, and the
  `design:pipeline` of ADR-013. Each keeps its file with a status note.

## Context

The repository grew through several approaches: a Phase 0 Docker stack
(PostgreSQL + n8n), a `services/` design and review tier, a Product #001
pipeline, and finally the Telegram-driven Stage 1-4 factory in `automation/`,
`production/`, `marketing/` and `seo/`. Only the last is in use. An audit
traced every import, dynamic import, `createRequire`, npm script, subprocess
call and configuration reference from the bot (`automation/src/bot.mjs`), the
owner CLIs and every test suite. It found:

- no code opens a database connection; n8n's only workflow ran the
  Product #001 `design:pipeline`, and the product it targeted was removed;
- the bot reaches 11 of 53 `services/` files (`etsy/*`, `config/env.ts`,
  `telegram/telegram-client.ts`); the design, repository and review tiers were
  reachable only from their own scripts and tests;
- the planner compositions in `marketing/` were reachable only from tests;
- the top-level documentation still described the Phase 0 stack, which made
  the project hard to understand for a second developer.

## Decision

Remove, with their tests, scripts and references:

- `n8n/`, `docker-compose.yml`, `infrastructure/`, `database/`, the
  `workers/` and `templates/` placeholders, the Etsy API spike script;
- the `products/001-…` leftovers;
- `services/src/design`, `services/src/db`, `services/src/review`, the review
  bot's Telegram modules and scripts;
- the Product #001 planner compositions and primitives in `marketing/`;
- `design/schemas` and `design/scripts`.

Archive superseded documents in `docs/archive/` (Product 3 build prompts and
reports, the review-bot, DesignProvider and product-model guides, the
2026-09-16 handover, the Notion setup, the Stage 1 audit).

Keep: everything the running system uses; `spreadsheet/` and Product #006 (a
possible future spreadsheet category); products 003-007 (003 and 004 supply
Stage 2's libraries and fonts); every product record, approval and ADR.

Make the root `package.json` the entry point (`npm start`, `npm run
check-config`, `npm test`), add `DEVELOPER_SETUP.md`, rewrite the top-level
documents for the Node.js/Telegram architecture, and add `.gitattributes` so
every checkout uses LF (some tests read source text).

## Alternatives considered

- **Keep the Docker stack for later.** Rejected: unused infrastructure is a
  maintenance and onboarding cost, and the archived original repository keeps it recoverable when a
  real need appears.
- **Detach `production/` from products 003/004 now.** Deferred by the owner: a
  real code change, to be done separately with its own ADR and test pass.
- **Delete superseded docs.** Rejected: archiving keeps the reasoning
  available without cluttering the active tree.

## Consequences

- One runtime (Node.js) and one entry point. No Docker or database setup.
- Test counts drop only by the removed modules' tests: services 190 → 59
  (131 tests in 13 removed files), marketing 110 → 96 (10 planner tests, 4 net
  in the rewritten render test). All other suites are unchanged.
- Any old Docker volumes on a developer machine are left untouched; remove
  them by hand if wanted.
- The production dependency on `products/003-…` and `products/004-…`
  remains and is documented in `ARCHITECTURE.md` and `DEVELOPER_SETUP.md`.
