# ADR-030: Stage 1 full-book artwork for colouring books

- **Status:** Accepted (owner request, 2026-09-29)
- **Extends:** ADR-023 (Stage 1), ADR-028 (colouring-book Stage 2 adapter).
  OpenAI use stays in `automation/`. `production/` stays model-free.

## Context

Stage 1 approved a STYLE from 3 proofs. For a greeting card, those proofs
are the product. For a colouring book they are 3 pages of many: #012
approved pages 2, 3 and 24 of 24.

The Stage 2 adapter correctly refused the book, because it never invents
pages. Stage 1 owns creative artwork, so the missing pages must be generated,
checked and approved there, never in Stage 2.

## Decision

- **Workflow (full-book formats only):**

  ```
  CREATIVE_APPROVED (style) → BOOK_GENERATING → AWAITING_BOOK_APPROVAL
    → ✅ Approve Full Book → CREATIVE_APPROVED + book.approval → /produce
  ```

  - `book_stopped` returns to `CREATIVE_APPROVED` and keeps every page. It is
    used for Stop, Cancel and Change Book Direction.
  - A format opts in through its Stage 2 adapter: `artwork: 'full-book'`.
    `FULL_ARTWORK_FORMATS` in automation must equal that set (a test checks
    it).
  - Greeting cards are unchanged.
- **Page manifest (`book/manifest.json`):**
  - Authoritative, ordered P001..PNNN.
  - Derived deterministically from the approved specification and creative
    direction (no model call).
  - Each page records:
    - title, scene and composition;
    - subject, and any required quoted text;
    - complexity and style reference;
    - negative constraints and production notes.
  - It records the specification hash, the direction version, and the
    generation model, size and quality.
  - It is written before any page image and never rewritten silently. Its
    SHA-256 is in `product.json` `book.manifest`.
- **Style reference:**
  - Every page prompt is the approved proofs' own prompt for that page:
    - the same shared style;
    - the same 12 style parameters;
    - the same canvas and avoid list;
    - the same direction version.
  - Added to it:
    - the manifest's page detail;
    - a BOOK CONSISTENCY paragraph: match the approved pages' line weight,
      detail, difficulty, density, borders, margins, black-and-white
      treatment and characters;
    - any owner direction, for the book or for the page.
  - The proofs are also the QC reference for style drift (warnings only).
  - Investigated option: send the proofs as image inputs. The repo's image
    client only has text-to-image `/images/generations`; adding `/images/edits`
    would be a new, untested paid path. Deferred.
- **Reusing the approved proofs:** a proof becomes a book page only if all of
  these hold:
  - it renders that specification page (not a variation);
  - it was made from the current page text and direction version;
  - it has exactly the book's pixel size;
  - it passes the page checks.

  It is copied into `book/pages/`; the proof file is never touched. #012's 3
  proofs all qualify.
- **Source size:** the largest documented size for the model family and
  orientation (`imageSizeFor`; portrait gpt-image: 1024×1536). The quality is
  the proofs' quality. The actual decoded pixel size is recorded per page.
  No DPI claim is made; Stage 2 computes the effective resolution.
- **Generation, resume and failure:**
  - One metered image call per page (step `book-page` → ledger stage Artwork,
    operation `book`), in page order.
  - After each page, before the next call, the bot saves:
    - the artwork, with its checksum and dimensions;
    - the page status;
    - the prompt, in `book/prompts/`;
    - the cost event.
  - A failure parks the product in FAILED (step `book`). The paid retry is
    confirmed with an estimate of only the pages still missing, and resumes
    at the first page without artwork.
  - A page file written just before a crash, but never recorded, is adopted
    without a new call.
  - Nonces and the lock make repeated or stale presses do nothing.
- **Creative QC** (`production/src/artwork-qc.mjs`: deterministic, shared with
  Stage 2):
  - Failures:
    - page count;
    - P001..PNNN sequence;
    - every file present, with its checksum matching;
    - valid PNG;
    - expected size and orientation;
    - blank page;
    - exact decoded duplicate;
    - black-and-white line art (colour > 2%, white paper < 35%, near-black
      > 40%);
    - clipping (ink > 2% of an edge's outer 4 px).
  - Warnings:
    - grey shading;
    - crowded margins;
    - a little colour;
    - density outside 0.4–2× the proofs;
    - mixed models.
  - The thresholds were calibrated on #012's real proofs, which pass cleanly.
- **Telegram:**
  - The generation screen shows:
    - pages required, reusable and to generate;
    - image calls and the ledger-based £ estimate;
    - the pixel size.
  - The review sends one album of contact sheets (8 pages per sheet,
    QC-coloured outlines), never one message per page. It then shows:
    - pages and reused counts;
    - QC PASS/FAIL with named pages;
    - generation cost and product total;
    - 👀 View Pages batches, 🔎 Inspect, ✏️ Regenerate, ✅ Approve (only on a
      QC pass), ❌ Reject / Change Direction.
  - Per page:
    - 👀 View Full Size;
    - ✨ Regenerate: 1 paid call, confirmed;
    - ✏️ Change Direction: 1 paid call; the instruction goes into that page's
      prompt and is kept on later regenerations.
  - Replaced pages go to `book/history/`, never deleted.
  - Change Book Direction archives the generated pages, keeps the reused
    proofs, and shows the new plan and cost. Nothing is generated until the
    owner confirms.
- **Approval and Stage 2:**
  - APPROVE FULL BOOK re-reads every page and records `book.approval`:
    - by and when;
    - the manifest SHA-256;
    - the page digest (= QC fingerprint);
    - the QC report SHA-256.
  - The Stage 2 handoff accepts an `artwork: 'full-book'` adapter only with
    that approval. It re-verifies:
    - the manifest against the specification;
    - every page file, by checksum;
    - that the digest matches the approval;
    - that the QC report is unchanged, passed, and ran over exactly these
      pages.

    It then runs its own unchanged adapter validation. Handoff assets are the
    book pages (P001…), recorded as `approved.full_artwork`.
  - `/produce` before approval shows the book status instead.
- **Factory status:** an adapter shows 🟢 Ready only when its whole path
  works; a full-book adapter without Stage 1 support would show
  🟡 Stage 1 incomplete.

## Consequences

- A 24-page book with 3 reusable proofs costs 21 image calls, about £0.22 at
  the ledger's recent proof average (medium quality, 1024×1536). The owner
  sees this before confirming.
- Stage 2 no longer takes a colouring book's pages from style proofs, even if
  proofs happened to cover every page. The production fixtures model an
  approved full book.
- Style consistency rests on the locked prompt plus the owner's review. The QC
  can flag density drift, but not a changed character design.
- Stage 3 marketing for colouring books and Stage 4 upload of split packages
  are still not implemented (ADR-028).
