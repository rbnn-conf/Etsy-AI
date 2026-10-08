# ADR-052: Crochet printable-character preflight and approved-source correction

- **Status:** Accepted (owner request, 2026-10-02).
- **Amends:** ADR-041 (pattern gate), ADR-047 (visual gate).

## Context

#016 passed pattern review and approval, then failed at the Stage 2 handoff:
"The approved pattern text uses characters the document fonts cannot print"
("બ" U+0AAC, "ં" U+0A82, "ધ" U+0AA7). The cause was a stray Gujarati word,
"બંધ" ("closed"), at the end of a complete English sentence in pattern 22
Sleeping Rosebud, `finishing[3]`: "…keeping the centre tightly closed. બંધ".

Three gaps:

- The font check ran only in Stage 2.
- There was no Telegram path to re-validate an approved source after it was
  edited.
- Any edit changes the source SHA-256, so the ADR-047 visual specs went
  stale. The only way out was a Restyle (paid image calls), even for a
  one-word text fix.

## Decision

- **One printable-character check:** `production/src/crochet/printable.mjs`.
  - It covers every string the documents print, with its JSON path
    (`printableStrings`).
  - A character is printable when all four document fonts (body, bold,
    display, italic) have a glyph for it. Whitespace is ignored. It is not an
    ASCII rule: typography such as — ’ “ ” … ½ ° × £ € é passes.
  - Stage 1 uses it at pattern review. Problems become validation errors
    (named by path) and `validation.unprintable`, which blocks APPROVE
    PATTERNS.
  - The owner sees: "❌ Pattern text contains unsupported characters /
    Pattern 22, Finishing 4: "બ" U+0AAC … / Fix the source and re-validate. /
    No model call was made." Full details go to the log.
  - Stage 2 keeps the same check as its final safety net (the HandoffError
    now names the paths too).
- **Re-validating an edited approved source** (`canReopenPatterns`): a
  crochet product with approved patterns, either approved or failed in
  production, shows "🔄 Re-validate edited patterns.json (free)".
  - If the file is unchanged, nothing happens.
  - Otherwise the approval moves to `crochet.approval_history` (event
    `patterns_reopened`), and the edited source goes through the normal free
    validation, review and APPROVE PATTERNS.
- **Visual-spec rebind** (`rebindVisualSpecs`). On re-approval, the checked
  visual specs follow the new source without new images only when:
  - they were made for the previous approval;
  - the pattern fingerprints recomputed from the new source are identical;
  - and every required spec still passes the pattern check.

  Specs, fingerprints and status are unchanged; a `rebinds` record is
  appended. The Stage 2 gate follows the Restyle's patterns SHA through that
  chain. Anything else (a changed flower, count, piece or ID) still needs a
  Restyle.
- **#016 correction (owner-approved, minimal):** in `crochet/patterns.json`
  only, the stray " બંધ" was deleted. The sentence already ends "tightly
  closed.", and no other byte changed. The saved draft file still holds the
  model's original output (provenance). A later reassembly from drafts would
  be caught by this same check.

## Consequences

- Unprintable text can no longer reach Stage 2 through Stage 1.
- A text-only correction to approved patterns costs nothing: re-validate,
  re-approve, then produce.
- An approval is never forged: the owner re-approves the exact new SHA-256.
