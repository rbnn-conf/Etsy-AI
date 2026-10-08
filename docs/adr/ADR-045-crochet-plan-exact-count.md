# ADR-045: Crochet plan, exact pattern count

- **Status:** Accepted (owner request, 2026-10-02).
- **Extends:** ADR-041 and ADR-042 (crochet plan), ADR-043 (lossless
  normalisation).

## Context

#016 asked for 33 patterns. The plan call returned 34, and `planProblems`
correctly rejected it ("34 patterns planned; the owner asked for 33"). The
rejected output was billed, and its body was not kept.

The number 33 never reached the parts of the request that shape the array:

- **The schema the model sees.** OpenAI strict mode does not accept
  `minItems`/`maxItems`, so `strictSchema()` strips them and restates the
  committed limits in prose. For `patterns` that prose was "Exactly the
  number of patterns the owner asked for… At least 1 item. Maximum 60 items".
  The only number the model saw there was 60.
- **The system prompt** said "the number the owner asked for", with no
  number.
- **The user message** stated "EXACTLY 33" once, in the middle, followed by
  the terminology and guidance.
- **The request and the concept** describe "33 crochet flower & bouquet
  patterns", which invites an extra arrangement item.

## Decision

- **Request.** The plan request ends with a PATTERN COUNT block:
  - "Generate EXACTLY N patterns. The `patterns` array length MUST equal N."
  - No bonus pattern, alternate, extra motif, appendix pattern, variation or
    duplicate.
  - Arrangements made only of other patterns go in `combinations`.
  - "Before returning JSON, count the items." N is always the owner's brief.
- **Schema.** `structured()` takes `modelSchema`, which changes only what
  the model is told. For the plan, `patterns` gets `minItems = maxItems = N`
  and an "EXACTLY N" description, so `strictSchema()` also states "Exactly N
  items." Local validation still uses the committed schema (1–60), and
  `planProblems` stays the exact-count authority.
- **Repair, the only one.** Through the existing normalize hook (ADR-043):
  when the plan has more than N patterns and removing EXACT copies of an
  earlier pattern (every field identical, key order ignored) leaves exactly N,
  the copies are removed and logged.
  - A unique extra item, a near-duplicate (same id, different content), too
    few patterns, or duplicates that do not land on exactly N are left
    unchanged, and validation rejects them.
  - Nothing is truncated, invented or reworded.
- **Telegram.** A plan-count failure is shown as "❌ Product #NNN failed at
  Pattern Plan / Planned X patterns, but N were requested. / Completed files
  were kept. / Retry will call OpenAI."
  - The exception text stays in the bot log and `product.json`
    `last_error` (`knownFailure` in `automation/src/telegram/ui.mjs`).

## Alternatives considered

- **`patterns.slice(0, N)`:** rejected. It would drop a legitimate pattern
  arbitrarily.
- **Relaxing the count:** rejected. The owner's count is the product.
- **Semantic de-duplication:** rejected. It is not deterministic enough to
  remove content safely.
