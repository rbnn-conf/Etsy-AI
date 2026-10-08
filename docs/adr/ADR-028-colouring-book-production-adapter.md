# ADR-028: Colouring-book Stage 2 production adapter

- **Status:** Accepted (owner request, 2026-09-28)
- **Extends:** ADR-024 (Stage 2 deterministic production)

## Context

Product #012 (a 24-page Christmas colouring book) reached
`CREATIVE_APPROVED` and failed at `/produce` with "No Stage 2 production
adapter for colouring-book". Colouring books have different manufacturing
needs from greeting cards:

- an ordered book of many pages;
- single-sided printing;
- a PNG page collection customers can reuse;
- packages that can exceed one Etsy file.

Etsy allows 5 digital files of 20 MB each. Measured on #012's approved proofs,
each 1024 × 1536 RGB page is about 2.2 MB as delivered by the image model. A
lossless, pixel-identical re-encode brings it to about 1.0 MB.

## Decision

- **Registered adapter:** `production/src/adapters/colouring-book.mjs`,
  alongside `greeting-card`. Routing is by `product_format`, with no
  product-ID code. `test/adapter-contract.test.mjs` pins the contract every
  adapter must meet.
- **Input (never repaired):** the handoff's pages in `page_number` order, each
  with exactly one approved asset. The adapter validates that:
  - the page count equals `page_count`;
  - pages are numbered 1..N with no gaps or duplicates;
  - no asset is reused;
  - every page has the same pixel size;
  - the orientation matches the specification;
  - no page is blank;
  - no page is an exact decoded duplicate of another.

  `production-plan.json` is refused. The generic handoff names every missing
  page as ranges, for example "No approved artwork for 21 of 24 pages
  (1, 4-23)".
- **Deliverables:**
  - `START-HERE-Printing-Guide.pdf`;
  - `A4/` and `US-Letter/` book PDFs, one page per sheet, whole artwork
    centred inside 10 mm margins at its own ratio;
  - `Colouring-Pages-PNG/`, pixel-identical to the approved artwork (lossless
    re-encode, verified by decoding; if a re-encode ever changed a pixel, the
    original bytes are used).

  A PDF that would not fit one Etsy file is split into volumes named
  `…-A4-Part-N-Pages-AA-BB.pdf`.
- **Encoding ladder:** pixel-identical PNG first, then JPEG 95/92 copies inside
  the PDFs, then JPEG 95/90/88 without the PNG collection. The first step
  that fits Etsy's 5 × 20 MB wins. The originals are never altered.
- **Packaging:** one `LumiumX-<Name>.zip` when everything fits. Otherwise
  deterministic next-fit `LumiumX-<Name>-Part-N.zip` parts, at most 5.
  - `build-record.json` `zip_parts` is the authoritative manifest: each part's
    exact entries.
  - A single part is also recorded as `zip`, the shape Stage 4 already reads.
- **QC** (generic checks plus adapter checks):
  - page count and order;
  - every page, in order, in both papers;
  - A4 / US Letter layout centred inside the margins;
  - PNG pages pixel-identical to the approved artwork;
  - consistent dimensions;
  - the guide states the page count;
  - a contact sheet of every page (visual QC without AI);
  - each ZIP part: hash, entries, each deliverable exactly once, size and
    Etsy file-name rule.

  Effective print resolution is recorded from real pixels. No DPI is claimed.
- **Stage 3 handoff:** `build-record.json` `stage3_handoff` records:
  - the format, page count, cover flag and page pixel size;
  - the available formats, with page and artwork sizes;
  - representative pages (the cover and pages spread through the book), each
    with the approved file and SHA-256;
  - the package contents.

  At the time, Stage 3 refused non-greeting-card products, clearly and before
  any format-specific read. **Amended by ADR-037:** Stage 3 now consumes this
  handoff through its `colouring-book` adapter.

## Alternatives considered

- **Deliver the original PNG bytes:** about 2.2 MB per page, so a 24-page
  book would need more than Etsy's 100 MB. The pixel-identical re-encode is
  lossless and verified.
- **Convert pages to greyscale:** smaller, but it changes approved pixels.
  The model's line art is not exactly grey. Rejected.
- **Always JPEG inside the PDFs:** loses quality when lossless fits. Rejected.

## Consequences

- **Stage 1 gap:** Stage 1 approves 3 style proofs, not artwork for every
  page. **Resolved by ADR-030:**
  - Stage 1 now generates, QCs and gets owner approval for the full book.
  - The adapter declares `artwork: 'full-book'`, so the handoff takes every
    page from the approved book (`book/pages/P001.png`…), bound to the
    owner's approval.
  - The style proofs are never used as pages here.
- **Stage 4 and split packages:** Stage 4 is unchanged. It builds its own
  single customer ZIP from the build record's output list. A split (more than
  20 MB) colouring book would be refused there with the existing clear error
  until Stage 4 uploads `zip_parts`. (Stage 3 support for colouring books,
  needed first, was added by ADR-037. **Resolved by ADR-038:** Stage 4 plans
  its own logical multi-file delivery and proves it equals these parts'
  entries.)
