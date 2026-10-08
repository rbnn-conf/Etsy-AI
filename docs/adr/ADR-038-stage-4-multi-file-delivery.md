# ADR-038: Stage 4 multi-file digital delivery (one product, several delivery files)

- **Status:** Accepted (owner request, 2026-09-29)
- **Extends:** ADR-026 (Stage 4). It resolves the Stage 4 gap recorded in
  ADR-028 ("a split colouring-book package would be refused").

## Context

Product #014 (a 12-page colouring book) was approved through Stage 3. Stage 4
then stopped with `DELIVERY_INVALID`: the single customer ZIP was 60.35 MB,
and Etsy allows 20 MB per digital file and 5 files per listing.

**Measured cause:** the approved artwork is delivered three times, all
lossless and already compressed. Zipping saves about 0.2%.

| Content | Files | Size |
|---|---|---|
| A4 PDFs | 2 | 20.08 MB |
| US Letter PDFs | 2 | 20.08 MB |
| PNG pages | 12 | 20.34 MB |
| Printing guide | 1 | ~2 KB |

No single file is large; the biggest is 16.87 MB. Stage 2 had already
produced 5 approved, byte-greedy "Part-N" ZIPs, but Stage 4 always built one
ZIP of its own.

## Decision

- **PRODUCT vs DELIVERY FILE.** A *product* is the approved Stage 2
  deliverable set: one product ID and one Etsy listing. A *delivery file* is
  one ZIP uploaded to that listing's digital files. One product may have
  several delivery files. Splitting never creates listings or product IDs,
  and never changes marketing.
- **Delivery planner** (`automation/src/stage4/delivery-plan.mjs`): pure,
  deterministic and format-agnostic. It uses no format checks; the input is
  the build record's customer outputs (path, kind, bytes, page numbers). In
  order of preference:
  1. **One ZIP,** when everything fits the safe size. It is named
     `${package}.zip` exactly as before, so single-file products (greeting
     cards) are byte-identical: same ZIP, same payload hash.
  2. **One ZIP per logical group:** each top-level deliverables folder. Loose
     top-level files (the START-HERE guide) join the first group.
  3. **An oversize group splits** into the fewest contiguous parts, balanced,
     in build-record order, so page ranges stay together.
  4. **Merge to meet the file limit:** while there are more ZIPs than Etsy
     allows, the two smallest that fit together are merged.
  5. **Otherwise a clear error** (`DELIVERY_INVALID`): when a single file is
     over the safe size, or the product still needs more files than allowed.
     Nothing is removed, split inside a file or recompressed.
- **Limits:**
  - `ETSY.fileBytesSafe` = 19 MB, 5% headroom. The planner sizes from source
    bytes plus ZIP overhead, an upper bound.
  - The hard 20 MB cap (`ETSY.fileBytesMax`) is still enforced on every
    built ZIP, and `ETSY.filesMax` = 5.
  - Tests may pass stricter limits (`config.deliveryLimits`), never looser.
- **Names:** product words plus content, within Etsy's 70-character rule. The
  product words are shortened if needed, never the content label. Example:
  `Harvest-Market-Autumn-Colouring-Pages-US-Letter-Pages-01-10.zip`.
- **Delivery manifest** (`etsy/delivery/delivery-manifest.json`, schema 2):
  - the strategy, the limits and the plan hash;
  - per package: rank, upload name, file, SHA-256, bytes, human size,
    purpose, and its exact contents (entry, source, SHA-256, bytes);
  - the excluded non-deliverable files.

  A single-file product also keeps the former `zip` record.
- **Set verification** (`verifyDeliverySet`), by path and SHA-256, not by
  count. It checks:
  - every ZIP opens;
  - every approved file is present exactly once;
  - there are no extra or internal files (marketing, JSON, QC, dotfiles);
  - the bytes are identical to the approved sources;
  - each ZIP holds exactly its planned files;
  - the union equals the approved Stage 2 package's entries (one ZIP or its
    parts);
  - every ZIP is within the 20 MB cap and the safe size;
  - there are at most 5 files, with unique, valid names.
- **Order in Stage 4:**
  1. approved inputs;
  2. **the delivery set is built and verified** (no Etsy call yet);
  3. auth;
  4. taxonomy;
  5. payload;
  6. draft;
  7. uploads.

  A packaging failure therefore reaches Etsy with zero requests.
  `payload.files` lists every delivery file in rank order. Uploads were
  already journalled per file, so there is exactly one draft with N files.
  Remote verification checks every file, and the publish revalidation
  re-hashes every file (formerly only the first).

## Alternatives considered

- **Upload Stage 2's existing `zip_parts`:** they are approved and verified,
  but split greedily by bytes: "Part-4" mixed the US Letter volume with PNG
  pages 1–9. The names don't tell customers what they contain. Rejected in
  favour of logical groups. Stage 4 still proves its union equals those
  parts' entries.
- **Recompress or downscale to fit one ZIP:** it changes approved bytes.
  Rejected (owner instruction).
- **Several listings:** that is not one product. Rejected.
- **Format-specific checks for colouring books:** the planner only sees
  folders, sizes and page numbers, so any product type can use it.

## Consequences

- **Product #014** is delivered as 5 files:
  - A4 pages 1–10 + guide: 16.85 MB;
  - US Letter pages 1–10: 16.84 MB;
  - A4 + US Letter pages 11–12: 6.41 MB;
  - PNG pages 1–6: 10.34 MB;
  - PNG pages 7–12: 9.91 MB.
- **Retrying #014:** it resumes at Stage 4 (`ETSY_PREPARING`, a free step).
  There is no OpenAI call and Stages 2 and 3 do not rerun.
- **Greeting cards are unchanged:** the existing Stage 4 suite passes
  unmodified.
- **Not changed here:** category resolution. #014's approved category "Books
  Movies & Music > Books > Coloring Books" has no comma after "Books", while
  Etsy's own top level is "Books, Movies & Music". Stage 4 never guesses, so
  the owner sets `taxonomy_id` in `products/014-…/etsy/settings.json`
  (ADR-026). Done for #014 (339) and prevented for future colouring books by
  ADR-039.
