# ADR-037: Stage 3 adapter registry and colouring-book marketing

- **Status:** Accepted (owner request, 2026-09-29)
- **Extends:** ADR-025 (Stage 3), ADR-029 (engines) and ADR-028 (the
  colouring-book Stage 2 adapter and its `stage3_handoff`). The ADR-023
  scoping still applies: OpenAI use stays in `automation/`, and the
  deterministic core (`marketing/src/stage3`) stays model-free.

## Context

Product #014, a colouring book, passed Stage 2 and was approved. `/market`
then stopped with `No Stage 3 marketing support for "colouring-book" yet`.
Stage 3 had no adapter registry: `facts.mjs` refused every format except
greeting cards, and the planner, compositions, claim counts, artwork
preparation, model facts and engine hooks all assumed card designs, fronts
and insides. Stage 2 already records what marketing may use
(`build-record.json` `stage3_handoff`).

The owner wants first-class colouring-book marketing: a hero, an interior
page, a collage, a coloured-in example, before/after, what's included,
printable/download information, features, a lifestyle image and a closing
summary. It must be reusable for any colouring book, whatever the theme or
audience. OpenAI owns the visual treatment (environments, colouring examples,
art direction); code owns orchestration, discovery, validation, storage,
retries, Telegram and deterministic checks.

## Decision

- **Stage 3 adapter registry** (`marketing/src/stage3/adapters/`), the twin
  of `production/src/adapters`. The contract is `facts`, `claimIndex`,
  `planSlides`, `prepareArt`, `composeSlide`, `modelFacts`,
  `sceneExclusions` and `engines {regionTemplates, minShare, slideArtwork,
  heroBenefits, representative, decor?}`. `campaign` and `examplePrompt` are
  optional. The contract is tested in `marketing/test/stage3-adapters.test.mjs`.
  - `deriveFacts` keeps the shared checks (state, owner approval, handoff and
    build-record SHA-256), then picks the adapter by the handoff's
    `product_format`. An unknown format still fails clearly, before any
    format-specific read.
  - The workflow, renderer, engines, claim linter and model prompts call
    format-agnostic entry points. There are no `productType ===` branches:
    optional behaviour (coloured examples) is driven by the plan.
  - **Greeting cards are unchanged:** the same code, moved behind the
    `greeting-card` adapter. The existing Stage 3 and engine suites pass
    unmodified.
- **Colouring-book adapter** (`adapters/colouring-book.mjs` and
  `colouring-book.mjs`):
  - **Facts** come from the handoff book, the build record (`stage3_handoff`,
    `zip_parts`), the QC report and the approved direction, all
    SHA-verified. Nothing in Stage 2 is written.
  - **Asset discovery** needs no file-name conventions:
    - the lead is the cover, else the first page;
    - the showcase pages are Stage 2's `representative_pages`, else the
      first, middle and last colouring pages;
    - the collage is up to 9 pages spread through the book;
    - the example is the first showcase page.
    - Every page used must exist with its approved SHA-256. Otherwise Stage 3
      fails with a named page and file, before any OpenAI call.
  - **Campaign (up to 10 images):** hero, interior, collage, coloured,
    before-after, included, printable, features, lifestyle, bundle. Headlines
    and labels come from the facts (page count, formats, page titles, line
    art). The accent follows the strategy theme (Christmas, Halloween,
    autumn, wedding or neutral). Nothing is product-specific.
  - **Claims:** a page-count rule (`count_rules`: N pages or C colouring
    pages; "one design per page" is not a count), page titles and numbers,
    formats, paper sizes, the guide, line art, and the example disclosure.
- **OpenAI owns the visual treatment:**
  - listing copy (1 text call);
  - scene briefs and tone lines (1 text call), or with an engine the art
    direction (1 text call);
  - AI **environments**: `desk` and `cosy` in Factory; one per art-directed
    image (hero, interior, lifestyle) with Hybrid or AI Creative;
  - **coloured examples:** one **image edit** (`/images/edits`,
    `OpenAIClient.imageEdit`, step `marketing-example`) of the real approved
    page, which the model colours in without redrawing it. The page's bytes
    are re-verified against Stage 2 first. The result is stored in
    `marketing/examples/`.
- **Product truth for examples:**
  - A coloured example is a marketing illustration, never product artwork: it
    has no `data-art`, so it is not traced.
  - It always appears beside the real line-art page, and is always labelled
    "Coloured example" (claim key `example`).
  - QC adds three checks: examples generated, never used as product artwork,
    and labelled on every slide that uses one. All existing Stage 3 checks
    still apply.
- **Engines:** Hybrid and AI Creative work for colouring books through the
  adapter hooks. The holly "sprigs" décor is ruled out for them.
- **Cost and confirmation:** the example is one metered image call (ledger
  stage "marketing") and is included in the estimate. `/market`, 🛍 Create
  Listing & Marketing and 🔄 Retry (API cost) + Confirm stay the only ways to
  spend. Every paid artefact is made only if missing, so a retry never pays
  twice.

### Amendment (2026-09-29): page-quantity contract

The first real #014 listing said "one page", and the claim linter rejected
it: it said "one page" but production has 12 pages (11 colouring pages).
The model had been given a bare `pages: 12` beside `colouring_pages: 11`,
`one_design_per_page: true` and "Each page is one colouring design", with no
rule on how to state a quantity.

- **Facts:** `facts.book.non_colouring_pages` names each other page from
  Stage 2's page roles (for #014: page 1, the cover). `facts.page_quantity`
  = `{total_pages, content_pages, content:'colouring'}`. It is checked
  against `stage3_handoff` `page_count` and `colouring_pages`; a
  disagreement stops Stage 3 before any AI call. Nothing is hard-coded.
- **Model facts:** a single authoritative `product_quantity` block
  (`colouring_pages`, `total_document_pages`, `non_colouring_pages`).
  The ambiguous `one_design_per_page` flag is removed. A
  `reference_images` note says any artwork shown is ONE page from the book,
  not the product and not a count.
- **Model contract:** the optional adapter hook `modelRules(facts)`. For
  colouring books it is added as a "FORMAT RULES" section to the listing,
  marketing-copy and art-direction prompts. Greeting cards have none, so
  their prompts are byte-identical. The rules:
  - it is one multi-page book;
  - state "C colouring pages", and the total only together with what the
    other pages are;
  - never "N colouring pages" when N is not the colouring count;
  - never "one page" or "a single page" unless the book really has one;
  - never count images, titles or files;
  - no bonus or extra content;
  - layout facts are written without numbers.
- **Validation** (`claims.mjs` `pageQuantityProblems`; stricter, never
  weaker):
  - "colouring pages", designs, illustrations and "pages to colour" must
    equal the colouring count;
  - "N pages" or "N-page" must be the total or the colouring count;
  - singular product claims ("one page", "a single page", "1 colouring
    page") are rejected when the book has more than one page;
  - bonus, extra or additional pages or files are rejected (negations are
    allowed);
  - printing and layout wording is not a quantity: "print/colour one page
    at a time", "fits on one page", "one design per page", "two pages per
    sheet", "a one-page printing guide".

  Greeting cards keep their original design-count check.
- **Image copy:** headlines and labels state the colouring count ("11
  colouring pages", "11 colouring pages + cover"), not the total.
- **Retry cost:** a rejected listing is never saved. It is still metered as
  `rejected` because OpenAI bills it. A retry therefore makes one new
  listing call; there is no valid partial result to reuse.

## Alternatives considered

- **`if (product_format === 'colouring-book')` branches in Stage 3:** smaller
  diff, but spreads format logic through the workflow, renderer, engines,
  claims and prompts. Rejected by the owner and by ADR-024's adapter pattern.
- **Let the model render finished listing images (a whole advert with the
  page and text):** the page could be redrawn and the claims could be wrong.
  Rejected, as in ADR-029. The model paints environments and colours a
  copy of a real page; code composites and writes.
- **A coloured example from text-to-image:** it would be a different drawing.
  Rejected. An image edit of the approved page keeps the example tied to it.
- **No coloured example:** safest, but it drops the most persuasive
  colouring-book image. Instead it is kept, labelled and shown beside the
  real page.

## Consequences

- Stage 3 supports `greeting-card` and `colouring-book`. A new format adds
  one adapter (and, if it has one, a Stage 2 `stage3Metadata`).
- **Product #014:** "🔄 Retry (API cost)" + Confirm (or `/market 014` after
  cancelling the failure) resumes at Stage 3 from `PRODUCTION_APPROVED`. Stage
  2 does not rerun, and its files, book pages and ZIPs are only read. The
  expected cost is 2 text calls + 3 image calls (2 scenes + 1 coloured
  example) with Factory.
- **Model fidelity:** an image edit can still drift from the line art. The
  example is labelled and shown beside the real page, and the owner reviews
  it in Telegram. It is not a production claim.
- **Stage 4:** multi-file delivery was added by ADR-038 (#014 is delivered
  as 5 files).
- **Landscape books (2026-10-06):** the coloured, before-after, included,
  features and bundle compositions were sized for portrait pages, so a
  landscape book (e.g. #017, 1400×933) rendered its real pages as thumbnails
  and failed the product-share QC (4.7 / 10 / 11 / 15 / 16 %). Each now has a
  landscape layout (`wide(page)` in `marketing/src/stage3/colouring-book.mjs`):
  a cascade for coloured / before-after / bundle, larger previews for
  included, a text band over a large page for features. Portrait output is
  byte-identical and the QC floors (.08 / .2 / .12 / .3 / .3) are unchanged.
  `CAMPAIGN_VERSION` was bumped so cached renders are redone (free).
