# Stage 1 Creative Orchestrator — Repository Audit

Audited 2026-09-27 on branch `feature/automation-stage-1` (created from
`feature/product-ghost-activity-book`), before any Stage 1 code was written.

## 1. Existing architecture

| Area | What exists | Where |
|---|---|---|
| Telegram client | Dependency-free Bot API client: `sendMessage` (inline keyboards), `sendPhoto`, `sendPhotoAlbum`, `sendDocument`, `answerCallbackQuery`, `editMessageReplyMarkup`, `getUpdates`. Injectable `fetchImpl`, typed errors. **No `getFile` or file download.** | `services/src/telegram/telegram-client.ts` |
| Telegram bot | Long-polling `review-bot` (no webhook) that routes APPROVE/REJECT presses into `ReviewService`, whose APPROVE creates an Etsy **draft**. | `services/src/telegram/scripts/review-bot.ts`, `callback-dispatcher.ts`, `callback-data.ts` |
| Callback format | `r1\|action\|productId\|nonce`, 64-byte cap, never-throw parser, nonce rejects stale keyboards. | `callback-data.ts` |
| Telegram config | `loadTelegramConfig`: `TELEGRAM_NOTIFICATIONS_ENABLED`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `TELEGRAM_ALLOWED_USER_IDS`. `isTelegramActorAuthorized` checks chat and user allow-list. | `services/src/config/env.ts` |
| Env handling | Repo-root `.env` (git-ignored), loaded with `node --env-file-if-exists=../.env`. `.env.example` holds names only. | `SECURITY.md`, ADR-006 |
| Runtime | Node 24 (`v24.15.0`). Services are TypeScript run directly (type stripping); product scripts are `.mjs` and import the `.ts` modules directly (e.g. Product #005/#007 `review.mjs`). | — |
| Products | `products/NNN-slug/`, three-digit launch-order prefix. Present: 001, 003, 004, 005, 006 (budget workbook), 007 (Cute Ghost activity book, uncommitted on its branch). **Next free number: 008.** | `products/` |
| Product metadata | Varies per product: `product-spec.json` (`ProductSpec`, services), `story-order.json` (#004/#005), `page-map.json` (#007), `listing/listing.json`, `MARKETING_DESIGN_SPEC.json`. No single cross-product `product.json`. | — |
| Build / QC | Per-product `src/build.mjs`, `src/qc.mjs`, `npm test`. #004/#005/#007 share #004's primitives (validation, PDF, ZIP). | `products/00{4,5,7}-…/src/` |
| OpenAI | **Deliberately none.** ADR-012 added an OpenAI "Creative Director"; ADR-013 removed it. `services/test/no-runtime-llm.test.ts` fails if `openai`/`OPENAI_API_KEY`/`creative-director` appear in `services/src`, or if `.env.example` declares `OPENAI_API_KEY`/`OPENAI_MODEL`/`AI_PROVIDER`. | ADR-013, guard test |
| Claude/Codex | Human-in-the-loop sessions driving the per-product scripts (CLAUDE.md, skills in `.claude/skills/`). There is no programmatic Claude or Codex integration to call. | — |

## 2. Reusable components

- `TelegramClient`: all sending, callbacks, keyboards and `getUpdates`. Stage 1
  adds one **additive** method pair (`getFile` + `downloadFile`); nothing
  existing changes.
- `loadTelegramConfig`-style parsing and `isTelegramActorAuthorized` for chat
  and user authorisation.
- The callback-data conventions (versioned prefix, 64-byte cap, nonce against
  stale keyboards), reimplemented with a distinct `a1` prefix so the two bots'
  buttons can never be confused.
- The repo-root `.env` loading pattern.

## 3. What Stage 1 needs that does not exist

- Receiving **messages and photos**; the review bot only handles button presses.
- Downloading Telegram files (`getFile`), so references are stored locally and
  never depend on Telegram URLs.
- An OpenAI client (Responses API for structured JSON and vision; Images API).
- A persisted, explicit state machine with locking and idempotency.
- Per-product workspaces with `product.json` as the single source of truth.
- A small JSON Schema validator. No validator is installed, and adding a
  dependency is not justified for this subset.

## 4. Files created and changed

**Created (all new, under `automation/` unless noted):**

- `automation/package.json`, `automation/.env.example`, `automation/.gitignore`
- `automation/src/orchestrator/workflow.mjs`: the Stage 1 workflow (commands, callbacks, steps)
- `automation/src/orchestrator/state.mjs`: state machine, transitions, locks
- `automation/src/orchestrator/store.mjs`: atomic product workspace and registry persistence
- `automation/src/orchestrator/schema.mjs`: minimal JSON Schema validator
- `automation/src/orchestrator/proofs.mjs`: deterministic proof-page selection
- `automation/src/openai/client.mjs`: fetch-based Responses and Images client (no SDK)
- `automation/src/openai/{reference-analysis,direction,ideas,specification,images,prompts}.mjs`
- `automation/src/telegram/{commands,approvals}.mjs`: parsing, keyboards, callback data
- `automation/src/config.mjs`, `automation/src/log.mjs` (secret redaction)
- `automation/src/bot.mjs`: long-poll entry point
- `automation/prompts/*.md` (4) and `automation/schemas/*.schema.json` (product, creative-direction, reference-analysis, concepts, specification)
- `automation/test/{stage1,isolation-and-client}.test.mjs` + `helpers.mjs` (OpenAI and Telegram fully mocked)
- `automation/docs/example-product.SYNTHETIC-FIXTURE.json` (synthetic, from the mocked end-to-end run; numbered 001 because the harness uses an empty temp folder)
- `automation/reserved-product-ids.json` (committed floor for the allocator: 007 reserved)
- `automation/test/allocator.test.mjs`
- `services/test/telegram-client-files.test.ts` (tests for the additive client methods)
- `automation/docs/STAGE_1_AUDIT.md`, `automation/docs/STAGE_1_README.md`
- `docs/adr/ADR-023-stage-1-creative-orchestrator.md`

**Changed (small and additive):**

- `services/src/telegram/telegram-client.ts`: add `getFile`/`downloadFile`,
  and add `photo`/`document`/`caption` to the `TelegramUpdate` type. No
  behaviour change for existing callers.
- `ROADMAP.md`, `ARCHITECTURE.md`, `CLAUDE.md`, `SECURITY.md`: document the
  scoped exception to ADR-013 (required by CLAUDE.md's documentation rule).

**Not changed:** the root `.env.example` (see risk R2), `services/test/no-runtime-llm.test.ts`,
every existing product directory, the review bot and the production scripts.

## 5. Risks

- **R1: ADR-013 conflict.** Stage 1 reintroduces an LLM, which ADR-013 forbids
  *for the production pipeline*. Mitigation: ADR-023 scopes the exception to
  `automation/` (pre-production creative exploration only). A new test asserts
  that no production code imports `automation/`, and the existing guard stays
  untouched and passing.
- **R2: `.env.example` guard.** Adding `OPENAI_API_KEY` to the root
  `.env.example` would fail the ADR-013 guard, and that file also has your
  uncommitted edits. Mitigation: Stage 1 variable names live in
  `automation/.env.example`; the values go in the same repo-root `.env`.
- **R3: Telegram single-poller conflict.** Telegram allows one `getUpdates`
  consumer per bot token. Running Stage 1 on the review bot's token would
  steal its APPROVE/REJECT presses. Mitigation: a separate token
  (`AUTOMATION_TELEGRAM_BOT_TOKEN`, a second bot from BotFather). If the same
  token is configured, the bot refuses to start unless
  `AUTOMATION_ALLOW_SHARED_TOKEN=true`, and only then with a warning.
- **R4: Cost.** Image generation is billed. Only three proofs per attempt; no
  automatic full-product generation; persisted locks and rotating nonces
  prevent duplicate presses from generating twice; usage is recorded per call.
- **R5: Model names.** OpenAI model identifiers change over time. They are
  required env values with documented examples, not hard-coded guesses, and a
  wrong value fails with a clear message.
- **R6: Crash mid-generation.** Restart recovery moves a product stuck in a
  generating state back to its last stable state, keeps completed files, and
  offers RETRY.
- **R7: Reference copying.** Prompts instruct extracting *general*
  characteristics only; `creative-direction.json` carries an `avoid` list that
  every image prompt includes. Human review remains the real safeguard.
- **R8: Text in generated images.** Image models often misspell text. Proofs
  test *style*; flagged as a manual check.

## 6. How existing production stays unaffected

- There are no imports from production code into `automation/`; a test enforces it.
- The existing review bot, `ReviewService`, Etsy draft path and all product
  pipelines are untouched and keep their own token.
- The only change to shared code is additive (two new client methods and
  optional type fields), covered by the existing services test suite plus new tests.
- Stage 1 never calls Etsy, never runs product builds and never generates marketing.
- New product workspaces take the next free number (008+) and never write
  into existing product directories.
