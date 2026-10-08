# ADR-027: Telegram control panel and OpenAI cost ledger

Status: **Accepted** (owner request, 2026-09-28). Extends ADR-023 to ADR-026.

## Context

The factory is driven from Telegram, but only through slash commands and the
buttons on each review message. The owner wants a control panel (home, product
browser, product screens, Etsy drafts, costs, status, help) and a trustworthy
record of what OpenAI costs, per product and overall. The owner has also decided
to publish on Etsy by hand: the factory stops at a verified draft.

## Decision

- **Control panel** (`automation/src/telegram/menu.mjs`): `/start`, `/menu`,
  `/help` and `/costs`, plus buttons.
  - Navigation buttons (`m1|screen|a|b`) are read-only and validated, and edit
    the menu message in place.
  - Every button that changes a product is an existing `a1` product action
    carrying the product's current nonce. Stale or repeated presses are
    refused exactly as before.
  - The new actions `go`, `prev`, `produce`, `market` and `edraft` run the
    **same** code path as `/go`, `/previews`, `/produce`, `/market` and
    `/etsy`.
  - Expensive or destructive actions show a confirmation first; read-only
    navigation does not.
  - Product state is read from `product.json`; there is no second state
    system.
- **No publishing in the menus:** they never offer an Etsy publish or confirm
  action, and "Refresh Draft" re-verifies without re-sending the Stage 4
  review keyboard. `ETSY_PUBLISH_ENABLED` is unchanged; the status screen
  shows publishing as manual.
- **Cost ledger** (`automation/src/costs/`), the only place usage becomes
  money:
  - Every metered OpenAI attempt (ok, api_error, rejected) becomes one
    append-only event in `automation/state/costs/ledger.jsonl` (git-ignored).
    It records the API-reported usage, image size, quality and count,
    pricing version, USD cost, the GBP rate used and the GBP cost.
  - No keys, tokens or prompts.
  - An unknown model, missing usage or an unpriced usage category is recorded
    as unpriced with a reason; nothing is invented.
  - A ledger failure is logged and never affects product state.
- **Pricing** (`automation/config/openai-pricing.json`): versioned, per-1M
  token prices from OpenAI's pricing page, and a configured USD→GBP rate
  (`AUTOMATION_FX_USD_GBP` overrides it).
  - A price change is a new version; past events keep theirs.
  - There are no live FX calls.
- **Honest history:** tracking starts at the first run (`tracking.json`).
  Screens say "Tracked since …" and count OpenAI calls recorded in
  `product.json` before that as not included. Deterministic stages
  (Production, QC, Etsy) show £0.00 only once a product has reached them.

## Consequences

- All displayed values are labelled "Estimated API cost". Long-context
  surcharges are not modelled.
- Pre-tracking products (including #009) show their earlier calls as
  untracked, not as £0.00.

## Amendment 2026-09-28: Telegram UX v2

- **Presentation layer** (`automation/src/telegram/ui.mjs`): one vocabulary
  for headings, status marks (🟢 ⚠️ ⛔ 🔒 🧪), money, product IDs and button
  labels. It also holds the `m1` navigation data and the retry-safety rule.
- **Dashboard:** `/start` shows factory health, active products, Etsy
  drafts and tracked spend.
  - **Create Product:** a chat-level "describe a product" prompt, valid for
    15 minutes. The next plain message becomes `/newproduct`. Creating a
    product is free.
  - **Tools:** the command list, the billing link and the server check.
- **Native "/" menu:** `setMyCommands` at startup, for owner-facing commands
  only. Added: `/products`, `/status <n>`, and `/etsy` with no product (the
  drafts screen). All earlier commands are unchanged.
- **Guidance:** every review message ends with "What can I do here?" and
  Home. The help lists only the actions and commands for that state.
  Approvals offer the next stage; paid and Etsy steps go through their
  confirmation screen.
- **Failures:** "needs attention", then:
  - 🔄 Retry Safe Step only for known, idempotent, free steps;
  - 🔄 Retry (API cost), with confirmation, for OpenAI steps;
  - no retry for an uncertain Etsy creation (until
    `/etsy <n> confirm-no-draft`) or an unexpectedly active listing;
  - 📋 Details.

  Cancel moved to the product screen, with confirmation. The old `a1 cancel`
  action still works.
- **Costs:** the period table plus a URL button to
  `https://platform.openai.com/usage`. The bot never reads billing or claims
  to know the remaining credit.
- **Factory:** services, Publishing 🔒 Manual, and the production adapters
  from the Stage 2 registry. It makes no API calls.
- **Unchanged:**
  - one-time `a1` nonces, so stale product buttons are refused;
  - `m1` navigation, which is read-only;
  - the Stage 4 PUBLISH → CONFIRM PUBLISH gate. It appears only in the Stage
    4 review, when `ETSY_PUBLISH_ENABLED=true` and verification passed. No
    menu, dashboard or guidance screen has a publish button (tested across
    every state).
