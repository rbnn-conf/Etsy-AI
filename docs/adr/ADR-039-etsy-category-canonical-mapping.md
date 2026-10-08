# ADR-039: Canonical Etsy categories and owner-approved taxonomy mapping

- **Status:** Accepted (owner request, 2026-09-29)
- **Extends:** ADR-026 (Stage 4 taxonomy) and ADR-037 (the colouring-book
  Stage 3 adapter).

## Context

Product #014 stopped in Stage 4 with `TAXONOMY_UNRESOLVED`. The approved
category was "Books Movies & Music > Books > Coloring Books", but Etsy's
node 339 is "Books, Movies & Music > Books > Coloring Books", with a comma.

**Origin:** `category_suggestion` in `marketing/listing.json` is free text
written by the Stage 3 OpenAI listing call. The listing schema offers only a
greeting-card example, and no canonical category existed for colouring
books. No Stage 1, SEO, schema default or template produced it. Stage 4
correctly refused to guess.

## Decision

- **Canonical category per format (Stage 3):**
  - A Stage 3 adapter may declare `etsyCategory`. The colouring-book
    adapter's is `Books, Movies & Music > Books > Coloring Books`
    (`COLOURING_BOOK_CATEGORY`).
  - For such a format, code sets `listing.category_suggestion` to it. The
    model's free text is kept only in `marketing/tag-selection.json`
    (`category: {model, final, source}`).
  - Greeting cards declare none, so they are unchanged.
- **Owner-approved mapping (Stage 4):**
  - `automation/config/etsy-taxonomy-map.json` (schema 1) lists exact
    canonical paths with their Etsy taxonomy IDs: today
    `Books, Movies & Music > Books > Coloring Books → 339`.
  - It is validated on load (valid IDs, no duplicate paths).
  - A mapping applies only if Etsy's live node with that ID still has exactly
    that path. Otherwise Stage 4 stops, saying what changed.
  - It is not used against the dry run's simulated taxonomy.
- **Resolution priority** (`automation/src/stage4/taxonomy.mjs`):
  1. the product's `etsy/settings.json` `taxonomy_id`, which must exist in
     Etsy's taxonomy;
  2. the owner-approved mapping (exact path, verified ID);
  3. an exact, unique Etsy taxonomy path match;
  4. `TAXONOMY_UNRESOLVED`, listing candidates with the same leaf name.

  "Exact" ignores only case and repeated spaces. Punctuation and wording
  count, so there is no fuzzy matching. All of this happens before any Etsy
  write.
- **#014:** its approved records are not rewritten (they are hash-bound to the
  owner's approval). It gets the product override
  `products/014-autumn-or-fall-colouring-pages/etsy/settings.json` =
  `{"taxonomy_id": 339}`, which Etsy's own `TAXONOMY_UNRESOLVED` message
  proposed.

## Alternatives considered

- **Punctuation-insensitive or fuzzy matching:** "Books Movies & Music" would
  resolve, but so could the wrong node. Rejected; the owner asked for no
  guessing.
- **Editing #014's approved `listing.json`:** it breaks the approval hash and
  the audit trail. Rejected in favour of the product override.
- **Hard-coding #014 or 339 in Stage 4:** rejected. The ID lives in reviewed
  configuration and is checked against Etsy on every run.

## Consequences

- Future colouring books reach Stage 4 with the canonical path and resolve
  to 339 through the mapping, with no owner action.
- **Adding a mapping:** add an entry after checking the ID on Etsy. If Etsy
  renames or removes the node, Stage 4 stops clearly instead of using a
  stale ID.
