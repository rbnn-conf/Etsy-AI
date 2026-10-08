# ADR-062: Owner status and progress messages in Telegram

- **Status:** Accepted (owner request, 2026-10-06).
- **Scope:** presentation only (`automation/`). Pipeline semantics,
  approvals, retries, locks, product state and API behaviour are unchanged.

## Context

AI generation, image generation and production can run for several
minutes. During that time Telegram showed nothing. The owner could not
tell whether the pipeline was working, stalled, failed, or waiting for
them.

## Decision

- **One hook point.** Every long step already runs through
  `Workflow.#guarded()`, which calls `commit()` at item boundaries. The
  status layer hooks into lock acquired, commit, success and failure there.
  The step code itself is not changed. Two loops that hold progress outside
  `product.json` report it with `#progress()`: marketing AI images (made /
  planned) and Stage 2 files written (a count only, because the build does
  not expose its total).
- **Pure texts** (`automation/src/telegram/status.mjs`). `progressOf(product,
  step)` reads progress from persisted state: proof images, drafted
  patterns, book pages, Stage 2/3/4 sub-states. A progress bar appears only
  where the total is known. There are no percentages and no countdown; the
  elapsed time is shown instead.
- **One message per step** (`automation/src/orchestrator/owner-status.mjs`).
  The status message is edited in place, never re-sent:
  - The progress content is edited at most once per 3 s.
  - The elapsed time alone is refreshed at most once per 45 s, by a 15 s
    timer in `bot.mjs`.
  - Steps chained in one Telegram update share one message, for example
    ideation → previews, and concept → specification → proofs.
  - Quick steps (restyle, Etsy section, Etsy refresh) get a message only if
    they are still running after 5 s.
- **Four owner states.**
  - 🟢 RUNNING: no action needed.
  - 🟠 ACTION REQUIRED: "Pipeline paused until you respond."
  - 🔴 FAILED: intervention required.
  - ✅ COMPLETE.

  When a step ends, the status message changes to the state that matches
  the persisted product. Each actionable message gets the 🟠 or 🔴 header
  at the top, so an approval never looks like an information-only status:
  reviews with buttons, and failures with Retry.
- **One reminder per waiting state.** A product at an owner gate
  (`AWAITING_*`) or in `FAILED` for 10 minutes gets one 🔔 reminder. The
  state's key is `status@entered_at`, taken from the persisted
  `status_history`.
  - When the owner responds, the state changes and the old record is
    cleared. A later waiting state can then get its own single reminder.
  - Waits already overdue on the first run (no state file yet) and waits
    older than 24 h are recorded but never sent.
  - The owner is not reminded about products they simply have not moved
    on, such as `CREATIVE_APPROVED`.
- **No stall detection.** An awaited OpenAI, image, file or Etsy call stays
  RUNNING however long it takes. Any future stall detection must be based
  on a real timeout or health signal, not on silence.
- **Bookkeeping lives in `automation/state/owner-status.json`**
  (git-ignored): status message IDs and the reminders sent.
  - `product.json` and its schema are untouched.
  - After a restart, `Workflow.recover()` closes any status message left
    RUNNING, using the persisted product state. Nothing is restarted, and
    no reminder is repeated.
- **Fail-safe.** Every status method swallows its own errors, and every
  Telegram call made by the layer is time-bounded at 10 s. A status problem
  cannot fail or stall a step.
- **Injected.** `Workflow` receives the status layer as `ownerStatus`, in
  the same way as `costs`. Without it, every message is byte-identical to
  before, and a test asserts this.

## Alternatives considered

- **Hard-coding progress messages in each run method.** Rejected. It would
  duplicate code in ten places and would drift from the state.
- **A new message per update.** Rejected because it floods the chat.
- **Storing the status message IDs in `product.json`.** Rejected. That
  would mix presentation into authoritative state and require a schema
  change.
- **Typing indicators (`sendChatAction`).** Rejected. They expire after
  5 s and carry no progress information.

## Consequences

The owner always sees one of the four states. Silence during a long call
now shows as a running status with the elapsed time. Tests in
`automation/test/owner-status.test.mjs` cover:

- formatting;
- the transitions;
- throttling;
- reminders, including restarts;
- that the same flow with the layer on and off makes the same OpenAI calls,
  reaches the same product state and sends the same messages, apart from
  the header.
