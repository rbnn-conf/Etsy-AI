# ADR-044: Crochet RESTYLE action and the pattern-brief guard

- **Status:** Accepted (owner request, 2026-10-02).
- **Extends:** ADR-041 (crochet production), ADR-043 (crochet visual
  direction).
- **Scope:** crochet pattern bundles only. No other format, gate or stage
  changes.

## Context

- **Brief mismatch.** Product #016 was requested as "33 crochet flower &
  bouquet patterns, US terms", but its pattern brief was recorded as 12
  patterns, UK terms.
  - The brief is a separate Telegram reply, parsed by `parseBrief`. The
    prompt's examples were "33", "33 US" and "12 UK"; the recorded brief
    matches the last one exactly.
  - Nothing compared the brief with the request.
- **No way back to the style gate.** #016's style was approved under the
  old illustrated (gouache) direction. ADR-043 now requires a realistic
  crochet product.
  - The bot had no path from `CREATIVE_APPROVED` back to the style gate:
    Change Direction works only in `AWAITING_CREATIVE_APPROVAL`.
  - Change Direction rewrites only the direction file. The page briefs,
    which carried most of the superseded wording, stay as they were.

## Decision

- **Brief guard** (`requestedBrief` and `briefMismatch` in
  `automation/src/orchestrator/crochet.mjs`; `automation/src/telegram/crochet.mjs`):
  - The brief prompt leads with the request's own count and terms ("To
    match it, reply: 33 US"). The "12 UK" example is gone.
  - A brief that differs from the request gets a visible warning before any
    paid drafting.
  - The brief still decides.
- **Brief reset** uses the existing workflow actions only: Reject Patterns
  (allowed in `FAILED` during patterns), then ✏️ Change Pattern Count.
  - Reject archives `plan.json`, drafts, the source and `review.txt` to
    `crochet/history/rejected-<stamp>/` and clears the crochet state except
    the brief.
- **RESTYLE** (`automation/src/orchestrator/restyle.mjs`; `runRestyle` in
  the workflow):
  - New transition `restyle_started`: `CREATIVE_APPROVED` → `SPEC_READY`.
  - Offered only for a crochet product whose patterns are approved. The new
    briefs need the real pattern names and count.
  - Makes no model or image call.
  - Archives to `creative/history/restyle-<stamp>/`:
    - the previous direction;
    - the page briefs;
    - the approval record, including the approved attempt and each proof's
      SHA-256;
    - the restyle values used.
  - The proof images stay in their attempt folders.
  - Writes the restyled direction (version + 1, `source: restyle`) and
    rebuilds the three page briefs from the approved pattern source:
    - a cover with a realistic crochet hero, whose count and terms come from
      the approved source;
    - a pattern overview of individual crochet pieces by their real names,
      with no list on the page (Stage 2 typesets the index in code);
    - a macro stitch-detail motif.
  - Per-product values come from `creative/restyle-direction.json` when
    present; otherwise generic defaults are used.
  - `restyleConflicts` refuses the restyle if superseded wording would reach
    a proof prompt: gouache, an illustrated bouquet, never photographic,
    illustrations only, painted flowers, or bans on finished crochet or
    yarn.
  - Clears only `creative_approved_at` and appends a `restyles[]` record
    (reason, archive, previous approval, patterns SHA-256). `crochet`
    (including the pattern approval) is untouched.
  - New proofs are made only through 🎨 Generate Style Proofs, behind the
    paid confirmation (3 image calls). APPROVE STYLE then sets a new
    `creative_approved_at`, so Stage 2 takes the new attempt.
  - Telegram copy: "Restyle #NNN? / Current proofs will be archived. /
    Patterns will not be changed. / New proofs will require 3 image calls."
    The buttons are Confirm Restyle and Cancel.

## Alternatives considered

- **Editing #016's `product.json` by hand:** rejected. It bypasses the
  state machine and leaves no audit trail.
- **Re-running the specification model:** rejected. It is a paid call, could
  change page count or canvas, and could reintroduce stale wording.
- **A new product:** rejected. It loses #016's identity and history.

## Consequences

- A running bot must be restarted to offer Restyle, because schemas are
  cached per process.
- Concept records stay historical. Restyle never reads them into a prompt.
