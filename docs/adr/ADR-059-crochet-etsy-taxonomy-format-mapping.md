# ADR-059: Fixed Etsy taxonomy mapping per product format (crochet patterns)

- **Status:** Accepted (owner request, 2026-10-06). The owner confirms the chosen
  ID before the first live Etsy retry of #016.
- **Amends:** ADR-039 (category mapping), ADR-041/042 (crochet: category unresolved).

## Context

#016 failed in Stage 4 with `TAXONOMY_UNRESOLVED`: `crochet-pattern-bundle` was on
the `unresolved` list in `automation/config/etsy-taxonomy-map.json`, so only a
per-product `etsy/settings.json` `taxonomy_id` could resolve it. The failure was
before any Etsy write: the API activity shows two reads (`checkAuth`,
`getSellerTaxonomyNodes`), no `draft.json`, and `etsy.listing_id` is null.

A path-only mapping (as for colouring books) was not enough for #016: its approved
`listing.json` has the model's free-text category ("… > Crochet Patterns"), which the
crochet adapter never overrode.

## Decision

- **A fixed per-format mapping** in the existing map file, `format_mappings`
  (`{format, path, taxonomy_id}`): `crochet-pattern-bundle` -> **6343**, "Craft
  Supplies & Tools > Patterns & How To > Patterns & Blueprints".
  - Etsy has no crochet-specific node under Patterns & How To (read-only lookup of
    2026-09-29, 3065 nodes, ADR-042). 86 "Art & Collectibles > Fiber Arts > Crochet"
    is for finished crocheted items and is recorded as rejected.
  - The crochet entry is removed from `unresolved`.
- **Resolution order** (`automation/src/stage4/taxonomy.mjs`): the product's
  `etsy/settings.json` taxonomy_id; then the FORMAT mapping; then the
  unresolved list; then the path mappings; then an exact path match; otherwise
  `TAXONOMY_UNRESOLVED`.
  - **Format mapping:** the free-text `category_suggestion` is never consulted. Etsy's
    live node with that ID must still have the approved path, or Stage 4 stops
    (`TAXONOMY_UNRESOLVED`) before any Etsy write.
  - **Dry run:** its simulated taxonomy has no real IDs, so the mapping is not applied.
- **Validation:** the loader rejects a non-positive or non-integer ID, a missing
  format or path, a path without `>`, a duplicate format, and a format that is also
  unresolved (`CONFIG`).
- **Future listings:** the crochet Stage 3 adapter sets `etsyCategory` to the same
  path (a test keeps the two equal), like colouring books. An already-approved
  `listing.json` is not changed.
- **Telegram:** an unresolved category shows "⚠️ Etsy category needs setup" (no
  approved category yet) or "needs checking" (the approved ID no longer matches
  Etsy), with Retry free. The long category strings and the raw error stay in the
  log and `last_error`.

## Alternatives considered

- **A product-local `etsy/settings.json` for #016 only:** rejected; every future crochet
  bundle would stop again.
- **Matching "Crochet Patterns" or "Patterns & Blueprints" by wording:** rejected
  (ADR-039: never fuzzy).
- **Changing #016's approved `listing.json`:** rejected; the mapping is by format.

## Consequences

- Crochet bundles resolve locally and automatically to 6343, still verified against
  Etsy on every run.
- Retry resumes at Etsy preparation: no Stage 1-3 work, no OpenAI call. A draft is
  created once; a recorded draft ID is reused and never duplicated (existing journal).
