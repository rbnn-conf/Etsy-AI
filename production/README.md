# @dpf/production: Stage 2 deterministic production

This package turns a `CREATIVE_APPROVED` Stage 1 product into customer-ready
files. It makes no model call and no network call, and adds no dependency
(ADR-024, ADR-013). It is started from Telegram with `/produce <number>`; see
`automation/docs/STAGE_1_README.md`.

```
npm.cmd --prefix production test     # fixtures only
```

## What it writes (under `products/<id>/production/`)

```
handoff.json          immutable Stage 1 -> 2 contract (approved artwork by path + SHA-256)
build-record.json     every output, its hash and its source hashes (resume + traceability)
qc-report.json        QC checks, effective print resolution, preview list
previews/             PNG renders of the actual PDFs, for the owner's review
deliverables/<Package>/   the customer folder (also inside the ZIP)
package/<Package>.zip     one file of at most 20 MB, ready to upload later (Stage 3)
package/<Package>-Part-N.zip   colouring books only, when the package needs more than one 20 MB file
.build.lock           present only while a production step runs (ADR-055)
```

The approved originals (`proofs/attempt-NN/*.png`) are only ever read. If one
changes after the handoff, production stops.

Every file is written write-then-rename (`atomicWrite`, `src/lib.mjs`), so a
file is always either its previous complete version or the new one. On
Windows a rename refused with EPERM/EBUSY/EACCES (a file briefly held open by
antivirus, the indexer or an editor) is retried after 50/100/200/400 ms, then
the error is thrown; Retry resumes free. One production step runs per product
at a time (`production/.build.lock`, `src/build-lock.mjs`), and each build
first removes abandoned `*.tmp-*` files no live writer can own (ADR-055).

## Approved assets and the production plan

The handoff lists every image of the approved proof attempt as an **asset**
(`proof-01`, `proof-02`, …). Assets are not pages: an asset can become a
front, a shared inside, a back or an alternative design.

The adapter decides each asset's customer-facing role:

- **From the specification's page roles by default.** For a greeting card,
  that means one card variant per front page, sharing the one inside and
  back.
- **From an optional, owner-authored `products/<id>/production-plan.json`**
  when one exists. It is validated strictly: unknown fields, unknown assets,
  a reused front or the wrong product number stop production instead of
  being guessed.

```json
{ "schema_version": 1, "product_id": "009", "decided_by": "owner", "reason": "…",
  "card_variants": [
    { "id": "A", "name": "Merry Christmas",  "front_source": "proof-01", "inside_source": "proof-02", "back_type": "minimal" },
    { "id": "B", "name": "Christmas Wishes", "front_source": "proof-03", "inside_source": "proof-02", "back_type": "minimal" } ] }
```

- **Optional fields:** `inside_left_source`, and
  `back_type: "approved"` with a `back_source`.
- **Changing the plan:** it may change only between runs. After CANCEL,
  `/produce` archives the old handoff as `production/handoff.vNN.json` and
  writes a new one. A change during production is refused.

## Adapters

`src/adapters/<format>.mjs` maps pages to roles, lists review notes, and plans
outputs. Two adapters are registered, `greeting-card` and `colouring-book`;
any other format fails with "no adapter yet (available: …)". The contract every
adapter meets (shape, handoff, plan, safe output names, guide, previews) is
checked by `test/adapter-contract.test.mjs`. A new format adds one file there
plus a contract fixture.

## Crochet pattern bundle (`crochet-pattern-bundle`): registered adapter (ADR-040, ADR-041)

- **Document designs (ADR-056):** `crochetAdapter({design})` builds the
  Moonlit Meadow design (v2, `crochetPatternBundleMoonlit`, registered since
  2026-10-06, `src/crochet/moonlit/`) or the `classic` design (v1, available,
  not registered).
  - **Scratch review:** `scripts/moonlit-scratch-build.mjs` builds any
    approved product into a scratch folder.
  - **Hook text:** hook sizes print through one rule, `src/crochet/hook.mjs`.
- **Source:** `products/<id>/crochet/patterns.json`, the owner-approved
  pattern content. Its shape is in `schemas/crochet-pattern-bundle.schema.json`.
- **Validation:** `validateCrochetBundle` / `assertCrochetBundle`
  (`src/crochet/bundle.mjs`) check:
  - that `pattern_count` equals the patterns supplied;
  - unique ids and names;
  - yarn, yarn weight, materials and hook size;
  - that terminology is declared, with no stitch from the other terminology;
  - that every abbreviation used is defined;
  - non-empty, non-placeholder instructions;
  - assembly when several pieces are made, and finishing;
  - `testing` evidence before any "tested" wording.

  A failure is a `HandoffError` that lists every problem. Nothing is ever
  written or repaired.
- **Approval gate:** the handoff needs `product.crochet.approval` (✅ Approve
  Patterns in Stage 1). `crochet/patterns.json` must still hash to the
  approved SHA-256 and pass the validator again. It is listed in the
  handoff's `content_sources` and re-verified on every build and QC run. A
  changed source is refused until it is revalidated and approved again.
- **Deliverables** (`src/crochet/deliverables.mjs`, built by
  `src/adapters/crochet-pattern-bundle.mjs`):
  - `START-HERE-Printing-and-Crochet-Guide.pdf`;
  - per paper (`A4/`, `US-Letter/`): the complete bundle, pattern index,
    materials and tools reference, and abbreviations reference;
  - `A4-Individual-Patterns/` and `US-Letter-Individual-Patterns/`: one PDF
    per pattern;
  - one ZIP, or Part-N ZIPs when larger;
  - previews: cover, index, first pattern, materials.
- **Design** (`src/crochet/design.mjs`, `layout.mjs`, `templates.mjs`):
  - Palette: warm cream, blush panels, muted rose labels, sage and lavender
    used sparingly.
  - Type: Spectral and Source Sans 3; body text 10.5 pt.
  - The layout wraps at word boundaries only, and every source text is
    placed verbatim. Text is never shortened, replaced or scaled.
- **Artwork:**
  - The hero is required (plan, else the cover page, else page 1).
  - The motif is optional.
  - Per-pattern artwork and captioned diagrams come only from
    `production-plan.json` `crochet_artwork`:

```json
{ "schema_version": 1, "product_id": "015", "decided_by": "owner", "reason": "…",
  "crochet_artwork": { "hero": "proof-01", "motif": "proof-03",
    "patterns": { "classic-rose": "proof-02" },
    "diagrams": { "classic-rose": [ { "asset": "proof-02", "caption": "Petal layout" } ] } } }
```

- **QC:**
  - approval binding, count, duplicates;
  - instructions, placeholders, abbreviations and terminology;
  - verbatim text (layout and pdf.js);
  - materials, hooks, assembly and finishing rendered;
  - overflow and clipping, and index page numbers;
  - artwork, and the A4 and US Letter sets;
  - no testing or guarantee wording.

## Colouring book (`colouring-book`, v1): an ordered book (ADR-028)

- **Input:** every specification page, in order, each with exactly one
  approved asset. Production stops, with the reason, on any of these:
  - missing pages (listed as ranges);
  - gaps or duplicate page numbers;
  - a reused asset;
  - mixed pixel sizes or the wrong orientation;
  - a blank page;
  - an exact decoded duplicate;
  - a `production-plan.json`.

  Nothing is repaired or generated.
- **Files:**
  - `START-HERE-Printing-Guide.pdf`: states the page count; no DPI claims.
  - `A4/…-A4.pdf` and `US-Letter/…-US-Letter.pdf`: one page per sheet
    (single-sided), the whole page centred inside 10 mm margins at its own
    ratio.
  - `Colouring-Pages-PNG/…-Page-NN.png`: pixel-identical to the approved
    artwork (lossless re-encode, checked by decoding).
- **Too big for one Etsy file:**
  - PDFs split into volumes (`…-A4-Part-N-Pages-AA-BB.pdf`);
  - the package splits into `…-Part-N.zip` (at most 5 × 20 MB), listed with
    exact entries in `build-record.json` `zip_parts`;
  - a package that fits one file stays one `<Package>.zip`.
- **Encoding ladder:** lossless PNG inside the PDFs first, then JPEG 95/92,
  then JPEG without the PNG collection. The originals are never altered.
- **QC:**
  - page count and order;
  - every page in both papers;
  - margins and centring;
  - PNG pixel identity;
  - dimensions;
  - the guide's page count;
  - a contact sheet of every page (`previews/contact-sheet.png`);
  - every ZIP part verified.
- **Stage 3 handoff:** `build-record.json` `stage3_handoff` records:
  - the format, page count and pixel size;
  - the formats with page and artwork sizes;
  - representative pages (approved file and SHA-256);
  - the package contents.

  Marketing must use these real pages. Stage 3 reads them through its
  `colouring-book` adapter (ADR-037), read-only and SHA-verified.
- **Artwork source (ADR-030):** the adapter declares `artwork: 'full-book'`.
  The handoff therefore accepts a colouring book only with the Stage 1
  full-book approval (`product.json` `book.approval`). It re-verifies:
  - the page manifest `book/manifest.json`, against the specification;
  - every `book/pages/PNNN.png`, by SHA-256;
  - the approved page digest;
  - the passing creative QC report `book/qc.json`, run over exactly those
    pages.

  Without the approval it stops with the available/missing pages. The style
  proofs are never used as book pages.
- **Shared QC:** `src/artwork-qc.mjs` (deterministic page inspection, book QC
  and review contact sheets) is shared with Stage 1's creative QC.

## Greeting card (`greeting-card`, v2): card variants

- **Variants:** each variant is one folded card, made of a front, an optional
  inside (and inside-left), and a back. The back is either an approved asset
  or a **deterministic minimal back**: a small, letter-spaced Spectral
  "LUMIUMX" wordmark in brand ink, with no URL, QR code or promotion.
- **Supported shapes, with no product-specific code:**
  - one front and one inside;
  - several fronts sharing an inside;
  - an optional approved back.
- **File names:** a single design keeps the `…-Folded-Card-A4.pdf` names.
  Several designs are named per design, e.g.
  `…-Merry-Christmas-A4.pdf` and `…-Christmas-Wishes-A4.pdf`.
- **Per variant, A4 / US Letter folded card:** 2 landscape pages.
  - Page 1 is the outside (back | front) with trim and fold marks.
  - Page 2 is the inside (inside-left | inside-right).
  - Panels have the artwork's own ratio, sit inside 12 mm margins, and are
    centred so double-sided printing (flip on the short edge) lines up.
- **Card panels 4 x 6 in:** one PDF per variant, one page per panel. The
  size is exactly 2:3, the Stage 1 ratio.
- **Card artwork:** each approved asset a variant uses, once and
  byte-for-byte, named by its role (e.g. `…-Front-A-Merry-Christmas.png`,
  `…-Inside.png`).
- **Printing guide:** `START-HERE-Printing-Guide.pdf`. It states how many
  card designs are included and names each one.
- **Owner previews:** each variant's outside, then each distinct inside once.
- **Never cropped or stretched:** every image is placed whole.
- **Image encoding in the PDFs:** lossless PNG first, falling back to JPEG
  95/92/90/88 (4:4:4) only when needed to keep the package inside one 20 MB
  file. The originals always stay lossless.

## QC

- Approved artwork is unchanged.
- Every expected file is present with its recorded hash.
- All variants are complete.
- File names are safe.
- There are no duplicate outputs.
- The originals are identical to the approved artwork.
- Derived files are traceable to the approved artwork.
- Aspect ratio is preserved.
- PDFs are readable, with the right page counts, sizes and orientation.
- No rendered page is blank.
- The ZIP matches the deliverables exactly and fits within 20 MB.
- No resolution claim goes beyond what the pixels support.
- **Greeting card only:**
  - every variant has all its files and uses exactly its assigned front,
    inside and back;
  - a minimal back contains only the wordmark as text;
  - the shared inside is referenced correctly;
  - the guide names the designs.
- **Blank-page exemption:** a minimal back page (almost empty by design) is
  excluded from the blank-page check and verified by the wordmark check
  instead.
