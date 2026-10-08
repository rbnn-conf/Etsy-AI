# ADR-054: Deterministic Etsy shop sections in Stage 4

- **Status:** Accepted (owner request, 2026-10-05).
- **Extends:** ADR-026 (Stage 4), ADR-039 (taxonomy mapping).

## Context

The owner wants every listing filed in the right Etsy shop section, with:

- no change to Stages 1–3;
- no model call, and no model inventing section names;
- no duplicate sections;
- retries that never restart earlier stages or repeat paid work.

## Decision

- **Configuration.** `automation/config/etsy-sections.json` (`loadSectionMap`
  checks it) lists:
  - the canonical sections: Budget & Finance, Autumn Printables, Halloween,
    Christmas, Colouring Books, Activity Books, Crochet Patterns, Greeting
    Cards;
  - the season and topic words;
  - the map. Keys are tried in order: `<format>:<theme>`, then `*:<theme>`,
    then `<format>`.
- **Resolution** (`automation/src/stage4/sections.mjs`, `resolveShopSection`)
  reads only structured metadata:
  - the canonical `product_format` of the selected concept;
  - `product.season` for seasons and `product.product_type` for topics,
    matched by whole words.

  Listing copy is never read. A season comes before a topic, and a theme
  section before the format section, because a listing has ONE section. These
  cases give no section and a warning ("No Etsy shop-section mapping found
  for …"):
  - a recognised season with no seasonal section (winter);
  - two seasons at once;
  - an unknown format.
- **The Etsy step** (`Stage4.organise`) runs after the uploads and before
  verification. The outcome is recorded in `etsy/section.json`. It:
  1. reads the shop's sections (`getShopSections`);
  2. reuses an exact or normalised title match (case, spacing, accents, "&"
     vs "and"); several matches are ambiguous and nothing is assigned;
  3. creates a missing section only when the token has `shops_w`, writing the
     intent before the POST;
  4. assigns it with `updateListing({shop_section_id})`, then reads the
     listing back.

  A listing already in its section is a no-op. A failure is recorded, never
  thrown, so the draft still completes.
- **Retry.** `/etsy <id> section` (`organiseOnly`) retries only this step. It
  runs no prepare, uploads, earlier stage or OpenAI, and the product state is
  unchanged.
- **Client.** The services `EtsyService` gains `getShopSections`,
  `createShopSection` and `updateListing({shopSectionId})`. `mapListing` reads
  `shop_section_id`. The live adapter, the activity log, the dry run and the
  test fake gain the same three operations.
- **Verification is unchanged.** Sections were already excluded from drift
  checks, so the publish fingerprint does not depend on them.

## Alternatives considered

- **Assign at PUBLISH:** this adds a write to the gated activation path. The
  draft is organised before review instead.
- **Classify from listing titles or tags:** marketing prose, not authoritative.
- **Widen the OAuth pin to `shops_w` now:** a security-posture change. It is
  left to the owner; existing sections work with the current scopes.

## Consequences

- With today's `listings_r listings_w` token, sections that already exist on
  Etsy are reused and assigned. A missing one is reported ("create it on Etsy,
  or re-authorise with shops_w").
- Creating sections automatically needs the owner to widen
  `CONNECTION_SCOPES` and reconnect.
