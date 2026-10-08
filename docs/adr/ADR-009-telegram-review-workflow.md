# ADR-009: Telegram human-in-the-loop product review

> **RETIRED by [ADR-069](ADR-069-repository-cleanup.md) (2026-10-08).** The review bot (`services/src/review`, `telegram:review-bot`) was replaced by the automation bot's approval gates (ADR-023 onwards). The human review gate itself still applies.

## Context

The CLAUDE.md "Human Review Gate" requires that any customer-facing
artifact is put in front of the owner for approval before dependent
artifacts are created. For Product #001 that step was manual: open the
PDFs from `storage/`, read `listing/LISTING.md`, then run
`npm run etsy:create-draft` by hand.

The owner wants to run that gate from a phone, matching the pattern the
Faceless YouTube project (`../faceless-content`) already uses — Telegram
notifications driven from an n8n workflow. That project's Telegram layer is
**notification-only** (`sendMessage` via an n8n HTTP node, gated by
`TELEGRAM_NOTIFICATIONS_ENABLED` / `TELEGRAM_BOT_TOKEN` /
`TELEGRAM_CHAT_ID`, best-effort, never fails a run). It has **no** inline
keyboards or callback handling; approval there is a human flipping a DB
status.

This project has no n8n workflow for products yet, but it does have a
`services/` TypeScript tier (ADR-007) with a working `EtsyService` whose
draft-creation path is implemented and unit-tested (the first-product
milestone). What was missing: a review state, a notification + approval
surface, and the glue from "APPROVE" to the existing Etsy call.

## Decision

Build the review workflow as a **`services/` module, not an n8n workflow** —
it needs to call `EtsyService` and enforce a state machine, which is code,
not orchestration. Two new modules:

- **`services/src/review/`** — transport-agnostic. `ReviewService` owns the
  state machine (`review-state.ts`), persists one
  `storage/products/<id>/review-state.json` per product via `ReviewStore`,
  and is the only caller of the Etsy draft path from this workflow. It
  depends on a `ReviewNotifier` interface (implemented by Telegram, a
  console printer, or a test spy) and an `EtsyDraftCreator` interface
  (implemented by `ListingBackedDraftCreator`, which runs the **same**
  `createDraftFromListingSpec` the `etsy:create-draft` CLI now uses —
  extracted into `services/src/etsy/create-draft.ts`, no second client).
- **`services/src/telegram/`** — a minimal Bot API client (`fetch`, no
  deps), pure message/keyboard rendering, safe `callback_data`
  encode/parse, and `dispatchCallback` which authorises an update and
  routes it into `ReviewService`. The `review-bot` script long-polls
  `getUpdates`.

**Config** reuses the YouTube naming: `TELEGRAM_NOTIFICATIONS_ENABLED`
(default true), `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, plus a new
`TELEGRAM_ALLOWED_USER_IDS`. Names only in `.env.example`; the token is a
secret and lives only in the repo-root `.env`. Disabled/unconfigured →
`NoopReviewNotifier`, pipeline unaffected.

**State machine**: `GENERATED → QC_PASSED → AWAITING_REVIEW → APPROVED →
ETSY_DRAFT_CREATED → PUBLISHED`, with `QC_FAILED`, `REJECTED` and
`ETSY_DRAFT_FAILED` branches. Transitions are a static table; illegal moves
throw. `PUBLISHED` is never set by this workflow.

**Idempotency / safety**: APPROVE only from `AWAITING_REVIEW` (or retry
from `ETSY_DRAFT_FAILED`); a rejected or QC-failed product can't be
approved; a second APPROVE returns `already_done` and does not create a
second draft; concurrent presses are serialised by an in-process lock; a
stale keyboard (old nonce) is refused; a failed draft lands in
`ETSY_DRAFT_FAILED`, never a success state.

**Security**: the update is untrusted — chat id must match, user id must be
on the allow-list when set, `callback_data` is re-validated. Long-poll
only; no webhook, no public endpoint. Etsy errors are categorised and
scrubbed before display.

**Hard stop at draft**: APPROVE creates an Etsy *draft* and uploads
images/files. It never publishes. A `PUBLISH` action is explicitly
deferred until several products are proven.

## Alternatives considered

- **n8n workflow with a Telegram node** (YouTube's approach). Rejected for
  now: the approval branch has to call `EtsyService` and hold a state
  machine with idempotency guarantees — that belongs in tested code, not
  workflow JSON. An n8n workflow can later shell out to
  `telegram:submit-review` / drive `review-bot` if orchestration is
  wanted.
- **Telegram webhook + small HTTP server.** Rejected: adds a public
  endpoint and a long-running service to secure and deploy. Long-poll
  `getUpdates` needs neither and is fine for one reviewer.
- **No explicit review state (just read Etsy listing status).** Rejected:
  can't represent `AWAITING_REVIEW` / `REJECTED` / `QC_FAILED`, and can't
  make APPROVE idempotent before the draft exists.
- **A generic "notification service" abstraction.** Rejected as premature —
  one `ReviewNotifier` interface with a Telegram impl and a console impl is
  enough; generalise when a second real channel appears.

## Consequences

- New env vars (`TELEGRAM_*`) move from SECURITY.md "future" to "current";
  `.env.example` gains the block. `TELEGRAM_BOT_TOKEN` moves out of the
  future list.
- New npm scripts: `telegram:submit-review`, `telegram:review-bot`,
  `telegram:review-demo`. Still zero runtime dependencies.
- `create-draft-listing.ts` is refactored to a thin wrapper over the new
  `createDraftFromListingSpec` — behaviour unchanged, now shared.
- `EtsyRequest`/`EtsyService` are untouched; the Telegram layer depends on
  `IEtsyService` only.
- The review gate for Product #001 is now: `telegram:submit-review` →
  phone → APPROVE → real Etsy draft → manual Publish. Still blocked on the
  owner completing the Etsy OAuth flow (unchanged from the first-product
  milestone).
- `storage/products/<id>/review-state.json` is a new (git-ignored)
  artifact. Deleting it resets a product's review state.
- Tests: `+74` (`telegram-config`, `telegram-callback-data`,
  `telegram-messages`, `telegram-notifier`, `telegram-callback-dispatcher`,
  `assemble-submission`, `etsy-create-draft`, `review-state`,
  `review-service`), all offline with fakes. No test sends a real Telegram
  message or creates a real listing.
- **Telegram is visual-only.** The review request is: ONE concise headline
  message (summary + GBP price + Etsy title + tags + APPROVE/REJECT
  keyboard) → the page-preview album (primary page-size variant only by
  default; `--all-preview-variants` sends every variant) → the listing-image
  album. **No PDFs are sent to Telegram** — the customer PDFs stay in
  `storage/…/final/` and are uploaded to Etsy on APPROVE by the unchanged
  `createDraftFromListingSpec` path (which reads `listing.json.files`). The
  notifier depends on a `TelegramSender` interface so the delivery path is
  unit-tested with a recorder, no network.
- **Currency.** The review UI + listing model use GBP (UK operation).
  `listing.json` already carried explicit `currency` + `price`; Product
  #001 is now `"GBP"` / `5.99`, rendered `£5.99 GBP` by a small
  symbol/`toFixed`/code formatter (`formatPrice`). Etsy is decoupled:
  `createDraftFromListingSpec` sends the amount verbatim, Etsy prices it in
  the shop's currency, and a `currency`/`shop` mismatch is surfaced
  (`currencyMismatch` on the result, a warning line) — never converted. No
  FX system.
