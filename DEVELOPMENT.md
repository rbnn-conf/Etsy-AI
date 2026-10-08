# Development

First-time setup is in `DEVELOPER_SETUP.md`. This page is the day-to-day
reference.

## Commands

| Action | Command |
|---|---|
| Run every test suite + type check | `npm test` (repo root) |
| One package | `npm --prefix <automation\|production\|marketing\|seo\|services\|spreadsheet> test` |
| One test file | `node --test automation/test/<file>.test.mjs` |
| Type-check `services/` | `npm --prefix services run typecheck` |
| Validate configuration | `npm run check-config` |
| Start the bot | `npm start` |
| Secret-hygiene check before committing | `bash tests/verify-foundation.sh` |

All tests are offline: OpenAI, Telegram and Etsy are mocked or stubbed, and
they need no `.env`. Tests write only to temporary folders. Marketing render
tests need Playwright Chromium (`npx --prefix marketing playwright install chromium`).

## Making a change

1. Branch: `feature/<name>`, `fix/<name>` or `chore/<name>`.
2. Read the newest ADRs touching the area (`docs/adr/`); they describe the
   current contract. Many behaviours are bound by tests that read source files.
3. Change code and tests together. Keep files LF.
4. Run the package's tests, then `npm test` before opening a PR.
5. A significant decision gets an ADR (Context / Decision / Alternatives /
   Consequences). Architecture, security or operational changes update
   `ARCHITECTURE.md`, `SECURITY.md` or `OPERATIONS.md` in the same change.
6. Run `bash tests/verify-foundation.sh`, then commit with explicit paths
   (avoid `git add .`: product folders contain large generated files that must
   stay ignored).

## Conventions

- ES modules (`.mjs`) everywhere; `services/` is TypeScript run natively by
  Node (no build step, erasable syntax only).
- No new runtime dependency without a concrete need. Prefer the standard
  library.
- Product formats are registered in `automation/src/orchestrator/page-rules.mjs`
  (Stage 1), `production/src/adapters/` (Stage 2) and
  `marketing/src/stage3/adapters/` (Stage 3). A new format needs all three plus
  an Etsy taxonomy mapping in `automation/config/etsy-taxonomy-map.json`.
- Prompts live in `automation/prompts/`, model output schemas in
  `automation/schemas/`.
- Never create live Etsy objects during development or tests.

## Troubleshooting

**`Cannot find module 'sharp'` / `'pdf-lib'` / `'@pdf-lib/fontkit'`** — run
`npm --prefix products/004-cozy-spooky-coloring ci` and
`npm --prefix products/003-midnight-seance ci` (Stage 2 borrows their
dependencies; see `ARCHITECTURE.md`).

**Marketing tests fail launching Chromium** — run
`npx --prefix marketing playwright install chromium`.

**`check-config` fails** — it lists each missing or invalid variable. Variable
names are in `.env.example` and `automation/.env.example`.

**Bot starts but never sees button presses** — another process is polling the
same bot token. Telegram allows one poller per token.

**Tests fail on source-text assertions after a fresh Windows clone** — the
files were checked out with CRLF. `.gitattributes` forces LF; if you cloned
before it existed, run `git add --renormalize . && git checkout -- .` on a
clean tree.
