# ADR-025: Stage 3, Etsy listing and marketing

Status: **Accepted** (owner request, 2026-09-27). Extends ADR-023 and ADR-024.
ADR-013 continues to govern `production/`, `marketing/src` and `services/`.

## Context

Stage 2 ends at `PRODUCTION_APPROVED` with a verified customer package.
The owner wants an Etsy listing and a listing-image set, written with OpenAI,
that can only claim what that package really contains, and that never shows
a product different from the one the customer receives. Publishing to Etsy
belongs to a later Stage 4.

## Decision

- **Entry and states:** `/market <id>` runs only on `PRODUCTION_APPROVED`.
  The flow is `MARKETING_PLANNING` → `MARKETING_GENERATING` → `MARKETING_QC`
  → `AWAITING_MARKETING_APPROVAL` → `MARKETING_APPROVED` (terminal). Nothing
  is published and no Etsy call exists in the path.
- **Source of truth:** `marketing/src/stage3/facts.mjs` derives facts only
  from the Stage 2 handoff, build record, QC report and deliverables, each
  re-verified by SHA-256. A claim allow-list is built from those facts.
- **Model work** (`automation/src/stage3`, OpenAI):
  - One text call for the listing.
  - One text call for the environment-scene briefs and the one supporting
    line on "tone" slides (the gifting slide).
  - Up to `AUTOMATION_MARKETING_SCENES` (0–4, default 4) AI **environment**
    images.
  - Every output is validated against the facts: Etsy limits from
    `services/src/etsy/reviewed-product.ts`, and a deterministic claim linter
    that rejects editable, Canva, physical or shipped, DPI, formats or sizes
    not produced, and fake urgency.
  - **Output contract:** the model sees every limit the local validator
    enforces. `strictSchema()` strips range keywords that strict structured
    outputs do not take (length, item count, numeric bound, pattern) and
    writes each one into that property's description. Rules only the local
    validator knows (allowed claim keys, unique tags, tag characters,
    two-decimal price) are in the schema descriptions. The listing prompt
    ends with an OUTPUT CONTRACT section. Output that breaks a limit is
    rejected whole, never truncated, and a test fails if a stripped limit is
    left out. The first live #009 run returned more than 12
    `listing_claims`, which is what prompted this.
  - **Tags are chosen by code:** the model returns 18–20 `tag_candidates`;
    `marketing/src/stage3/tags.mjs` picks the 13 final Etsy tags. It uses
    the same length and character rules as the Etsy layer.
    - Characters are cleaned up and the tag is lowercased.
    - Only a tag that is too long gets substitutions, and only three whole-word,
      same-meaning ones: christmas → xmas, greetings → greeting,
      colouring → coloring. A tag still too long after that is discarded,
      never sliced.
    - Duplicates, and more than 6 title-only tags, are skipped.
    - Fewer than 13 valid tags rejects the listing; no tag is invented.
    - Materials get the same character clean-up and are dropped if still
      invalid.
    - Every candidate and material is claim-checked before selection, so an
      unsupported claim still rejects the listing.
    - The pool and each decision are recorded in `marketing/tag-selection.json`
      as an audit only. Stage 4 uses `listing.json` `tags`.
    - This came from the second live #009 run, where a 21+ character tag
      rejected an otherwise valid listing.
- **Visual system (art-directed campaign, owner request 2026-09-27):** the
  first live #009 set read as an editorial document. The problems were
  ivory space, small floating product, repeated image-left/copy-right
  layouts and weak thumbnails. It is replaced by an Etsy sales campaign.
  - `campaign.mjs` holds the campaign direction as data: colour tokens,
    scene directions and art-directed copy.
  - `primitives.mjs` holds the placement, environment and text building
    blocks.
  - `greeting-card.mjs` combines nine named compositions, each answering
    one buyer question, with a deliberate density rhythm: heroLifestyle,
    dualProductLifestyle, openCardLifestyle, contentsGrid, artworkHero,
    printProcess, sizeComparison, giftLifestyle and digitalInfo.
  - With one design, heroLifestyle sizes the card from its aspect ratio to
    about 48% of the canvas (2026-09-28, after #013's 2:3 card measured 32%
    in the old fixed 880 px slot). Wide and square cards sit under the
    centred header; portrait cards go on the right with the copy in a
    column beside them. Multi-design heroes are unchanged.
  - Headlines and factual labels are code-rendered campaign copy. The model
    writes only scene briefs and one tone line.
  - Up to four environment scenes (tabletop, gift, print, inside, in that
    priority) are reused across slides. Slides without a scene get a coded
    environment, so `0` scenes still produce a full campaign.
  - Each render also produces 300 px thumbnails and a contact sheet, which
    is sent with the Telegram review.
  - New QC checks: product share of the canvas per slide, headline legible
    at 300 px, rendered headline equals the planned text, thumbnails present.
- **Product truth vs sales presentation (owner request 2026-09-27):** the
  production facts and claim allow-list decide what the listing may say. A
  deterministic marketing strategy decides how it is presented.
  - The strategy is `marketing/strategy.json`, produced by
    `marketing/src/stage3/strategy.mjs` with no model call.
  - It combines a product-family profile (greeting_card, colouring_book,
    activity_book, party_kit, planner, spreadsheet, general_printable) with
    a theme modifier (christmas, halloween_cute, halloween_dark, autumn,
    wedding, none).
  - It sets intent, emotional angle, tone, positioning, description order,
    vocabulary, CTA style, SEO focus, emoji range and visual mood.
  - The listing prompt uses it for a search-first title, a customer-facing
    summary and a seven-part description (emotional hook first, digital
    disclosure last).
  - The visual campaign reads the same strategy: its theme picks the
    tokens, and its mood goes into the plan and every scene prompt.
  - Two new rejection rules: a description whose first sentence lists
    files, and a description or disclaimer without the digital /
    nothing-shipped disclosure.
  - The claim linter was tightened: counts with any describing words
    ("three robin designs") and any non-negated shipping wording.
  - The strategy is reused by REGENERATE LISTING COPY and REGENERATE
    MARKETING, and recomputed by REGENERATE ALL.
  - Listing-only regeneration is refused, at no cost, when the images
    predate the campaign system.
- **Copy accuracy (2026-09-28):**
  - Authorship and process words (handmade, hand-painted, hand-drawn,
    artisan, original painting) are removed from every creative text
    passed to the model. The claim linter rejects them unless production
    metadata proves them (`facts.process_claims`, never set today).
  - Design descriptions use verified metadata only (`facts.creative`): the
    collection look from the approved concept and direction, plus a
    per-design description from the approved page brief only when that
    page's role matches its use. A page repurposed from another role (like
    #009's Design B, briefed as the back) is not described by its brief.
    The owner's optional `marketing/creative-notes.json` takes precedence.
    The inside is described by its facts only.
  - Titles lead with search intent. A generated title containing the
    internal product name is rejected (generation-time only; QC does not
    re-judge existing titles for SEO style).
- **Product art is never generated.**
  - Compositions (`marketing/src/stage3`, deterministic, reusing
    `@dpf/marketing`'s renderer, fonts, claim stamps and QC) place the real
    Stage 2 originals and fresh renders of the customer PDFs whole.
  - Every artwork element carries its SHA-256, so QC can trace it and
    measure it for stretch.
  - Scene prompts are environment-only and list what they must not contain:
    cards, greeting cards, paper or printed artwork, text, letters, logos,
    birds, robins, the artwork's subject and people. The gift scene may show
    one blank kraft envelope; the print scene an empty printer.
  - Placement adds only presentation (perspective, rotation, shadow,
    overlap, an open card, a paper sheet). Pixels and aspect ratio are
    unchanged.
  - All factual text on images is rendered by code, never by an image model.
- **QC** blocks the review on any failure.
- **Idempotent and accounted:**
  - Each paid artefact (listing, image copy, each scene) is created only if
    missing.
  - REGENERATE LISTING COPY, MARKETING or ALL archive exactly their scope to
    `marketing/history/vNN/`.
  - Every OpenAI attempt is metered into `product.json` `api_usage` with
    outcome `ok`, `api_error` or `rejected`. This includes Stage 1 calls,
    which fixes the earlier gap where rejected calls went unrecorded.

## Consequences

- A full run costs 2 text calls plus up to 4 medium-quality square images.
  REGENERATE MARKETING costs 1 text call plus up to 4 images. Setting
  `AUTOMATION_MARKETING_SCENES=0` uses coded environments at no image cost.
- `automation/` may import `marketing/src/stage3/index.mjs`, and only that;
  a test enforces it. It still never imports Etsy code or product build
  scripts.
- Images are 2000x2000 PNG. Stage 4 decides the Etsy upload format.
