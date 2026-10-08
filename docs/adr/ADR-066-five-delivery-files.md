# ADR-066: At most 5 Etsy delivery files, packed by Stage 2 and adopted by Stage 4

- **Status:** Accepted (owner request, 2026-10-07). Implemented and tested with local fixtures only.
- **Scope:** every split-packaged product (colouring books today). It amends ADR-038 without changing products
  that already fit.

## Context

Product #022 (85.67 MB: printing guide, A4 PDF 13.95 MB, US Letter PDF 13.95 MB, 25 page PNGs 57.76 MB) failed at
Stage 4 with `DELIVERY_INVALID: needs 6 delivery files … Etsy allows 5`.

- **Stage 2 had already packed it correctly:** 5 ZIP parts of 13.90 to 18.84 MB in `zip_parts`, verified by Stage 2 QC.
- **Stage 4's ADR-038 planner ignored those parts and re-planned by folder.** That gave A4, US Letter and 4 PNG parts:
  6 files. It can only merge whole pairs, and no pair fits under 19 MB.
- **The two layers also used different limits:** Stage 2 packed to 19.6 MB (98 % of 20 MB), Stage 4 allows 19.0 MB.

## Decision

1. **One limit.** `production/src/lib.mjs` `ETSY_FILE_SAFE = 19_000_000` equals Stage 4's `ETSY.fileBytesSafe`
   (enforced by a test).
   - Stage 2 packs split parts to `PART_CAPACITY` (the safe size minus 100 KB for ZIP overhead).
   - Stage 2 QC fails any part over the safe size, or more than 5 parts.
   - A product is therefore Etsy-ready only when its package is at most 5 files of at most 19 MB.
2. **Stage 4 adopts Stage 2's packaging** (`delivery-plan.mjs` step 4b). It does this only when whole logical groups
   cannot meet Etsy's file count. It first proves the parts hold every approved deliverable exactly once, with no
   unknown file, each part within the safe size and at most 5 parts. The parts get customer names from their
   contents (e.g. `…-US-Letter-and-Colouring-Pages-PNG-01-02.zip`).
3. **Stage 4 stays strict.** If the parts cannot be used, the same `DELIVERY_INVALID` is raised, with the reason, before
   any ZIP or Etsy call. Stage 4 never invents a split, drops, recompresses or degrades a file. ZIPs are still built
   deterministically and verified byte-for-byte (SHA-256) against the approved sources.

## Alternatives considered

- **A new contiguous split inside Stage 4.** Rejected: Stage 4 would make packaging decisions, and the result could
  differ from what Stage 2 QC verified.
- **Recompressing PNGs or PDFs.** Rejected: it lowers quality.
- **Nested ZIPs, or dropping the PNG set.** Rejected: confusing for the customer, or removes a deliverable.

## Consequences

- Products that fit in ADR-038 steps 1-4 plan exactly as before. This is tested: production parts never change a plan
  that fits.
- In a large colouring book, the PDF ZIPs may also carry a few page PNGs. File names state exactly what each holds.
- Rebuilding an existing product under the new capacity may move page boundaries between parts. The result is still at
  most 5 parts within the limit.
- **#022:** Retry resumes at Stage 4 only. It makes no OpenAI or image calls and uses all completed marketing. It
  creates its first (and only) Etsy draft, since none existed (`listing_id: null`), and uploads 5 files.
