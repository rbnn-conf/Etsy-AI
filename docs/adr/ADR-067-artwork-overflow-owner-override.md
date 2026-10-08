# ADR-067: Owner override for decorative artwork overflow

- **Status:** Accepted (owner request, 2026-10-07). Implemented and tested with fake models only.
- **Scope:** the Stage 1 full-book creative QC (colouring and activity books) and its Stage 2 handoff.

## Context

The full-book creative QC (`production/src/artwork-qc.mjs`) fails a page when more than 2 % of its outermost 4 px
contain ink ("artwork runs off the page edge"). That fails the check "safe margins: no clipping at the page edges".
A failed QC hides ✅ Approve Full Book, and the Stage 2 handoff refuses any book whose QC did not pass.

Some styles reach the edge on purpose, and the owner wants to judge those pages. The check is pixel-based on Stage 1
artwork and never measures text, so there was no combined rule to split. Code-rendered text has its own blocking
checks: crochet "no page overflow or text clipping", and PDF layout and page-count checks.

## Decision

1. **Detection is unchanged.** The margin check is tagged `rule: artwork-edge-overflow, overridable: true` and still
   fails the QC.
2. **The rule logic lives in `production/src/artwork-override.mjs`** (pure, shared by Stage 1 and Stage 2):
   - `overflowReview`: a QC is reviewable only when the overflow check is its ONLY failing check.
   - `overflowOverride`: builds the owner record and refuses when anything else fails.
   - `effectiveBookQc`: passes only when the report passed, or when the override matches this report's SHA-256, its
     pages fingerprint, the rule, and every overflowing page.
3. **Telegram.** The review shows the product, each flagged page with its reason and 🔎 buttons that open the page
   render, and three choices:
   - ✅ ACCEPT OVERFLOW (`bovr`);
   - 🔁 FIX / REGENERATE (the existing page-regeneration picker);
   - ❌ CANCEL (back to the review; nothing changes).
4. **Recording.** ACCEPT stores `book.qc.override`: kind `owner-approved exception`, the rule, the pages and reasons, who
   accepted it and when, the QC SHA-256, the fingerprint and the statement. It is also appended to
   `book.override_history`, which is never removed. The raw QC result stays `passed: false`.
5. **Approval and production.** ✅ Approve Full Book copies the override into `book.approval`. The Stage 2 handoff
   re-checks it against the approved QC report. The production QC report then carries `owner_overrides` and
   `status: "PASS WITH OWNER OVERRIDE — decorative artwork overflow accepted on pages …"`, but only when every
   production check passes.
6. **Scope of an override.** One product, one QC report. Regenerating any page re-runs the QC, which voids the
   override (the history is kept). There is no global setting.

## Alternatives considered

- **Raising the edge threshold.** Rejected: it weakens detection for every product.
- **A global "allow overflow" flag.** Rejected: it would apply silently to future products.
- **Rewriting `qc.passed`.** Rejected: the raw result must stay auditable.

## Consequences

- Missing, blank, duplicate, invalid, coloured, wrong-size or wrong-orientation pages still block, and so does any
  production check (page count, PDFs, output files, text). An override can never clear them.
- The owner, not code, decides whether edge-reaching artwork is acceptable, page by page, with an audit trail.
