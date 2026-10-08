# ADR-060: Colouring books on the Stage 3 Creative Director

Status: accepted (2026-10-06). Extends ADR-058 (Creative Director) and ADR-037 (colouring-book Stage 3).

## Context

Colouring-book campaigns used the older engine path: the model art-directed only three region
templates (hero, interior, lifestyle) and the other seven images were fixed factory templates on
flat grounds. The output was technically correct but read like a brochure. ADR-058 had already
built a generic Creative Director (baseline cards, one validated direction per card, composition
vocabulary, fallbacks, environment cap) for crochet; colouring books had only a stub.

## Decision

Colouring books opt into the same adapter slot (`creative:{plan,catalogue}`). No second framework.

- **Baseline** (`marketing/src/stage3/colouring-creative.mjs`): ten creative cards, one buyer job
  each: 01 hero (backplate A + real page + labelled coloured example), 02 preview (backplate A
  again, framed differently, real page cropped close), 03 contents, 04 coloured, 05 before/after,
  06 lifestyle (backplate B), 07 showcase, 08 download, 09 cosy lifestyle (backplate C), 10
  bundle. 03-05, 07, 08, 10 wrap the existing colouring-book primitives (portrait cards use a
  larger variant; Factory output is unchanged). Each card lists its `allowed_compositions`; the
  colouring compositions (`cb-*`) are invisible to other formats.
- **Campaign concept** (`campaign.concept`, additive to `marketing-creative-direction.schema.json`):
  campaign_concept, emotional_hook, buyer_feeling, visual_world {palette, materials, lighting,
  photography_style}, hero_subject, strongest_pages (catalogue ids), transformation_story,
  marketing_priority, avoid. Required in the model-facing schema for colouring books only
  (`creativeModelSchema`); crochet is asked exactly what it was before. `normaliseConcept`
  validates every field, falls back to the deterministic baseline and records `fallbacks`;
  materials naming a product substitute (paper, pages, books ...) are dropped. Descriptive only:
  never a claim, never used by the listing.
- **Copy**: the model may set `headline` (≤ 7 words, no digits) and `support` (≤ 12 words; any
  number must be a page count from the facts; `claimProblems` applies). Code renders all text.
- **Images**: ≤ 3 backplates (`maxEnvironments: 3`; a card with `scene_of` shares a backplate and
  costs nothing) + 1 coloured example. Backplate prompts carry the visual world, a reserved-area
  hint and "the real artwork is composited later"; the coloured-example prompt carries the
  concept palette and transformation story with strict preservation rules (Factory's prompt is
  unchanged).
- **Cost**: 1 listing + 1 Creative Director text call, 3 backplate + 1 example image calls.
- **Caching**: plan.json caches the direction and concept; scenes/examples by SHA-256 as before;
  the render digest adds `plan.creative.composer` (layout changes redo only free renders). A
  concept change never regenerates the example; QC flags it (`concept_sha`).
- **QC** (nothing weakened): example fidelity (`example-fidelity.mjs`, dark-line recall/precision
  vs the source page: < 0.75 hard fail, < 0.92 warning, never a regeneration); backplate
  differentiation (difference hash; identical = fail); hero not mostly copy; every card renders
  its focal asset; shared-backplate cards composed differently; product-like-shape warnings on
  every backplate (by scene id). Coverage floors and the campaign mean-share check stay.

## Alternatives considered

- A new colouring-specific marketing engine: duplicated ADR-058; rejected.
- Letting the model choose any composition: breaks layouts and other formats; rejected.
- Auto-regenerating a drifted example: hidden cost; rejected (the owner decides).

## Consequences

- New colouring-book Hybrid / AI Creative campaigns use this path. Plans already on disk (e.g.
  #017) keep their templates and render byte-identically; their examples get fidelity as a
  warning only. Factory, greeting cards, crochet, production and Stage 4 are unchanged.
- Reserved areas are hints: a backplate can still put props where the page lands; the code
  places the page large over it and QC warns on page-like shapes. Owner review remains the gate.

## Refinements before live activation (2026-10-06, after the scratch campaign)

- **Example follows the hero.** `finaliseColouringPlan` (run once after the Creative Director call, no model
  call) makes the coloured example from the hero's validated focal page; a non-page or cover hero falls back to
  the baseline hero page. The coloured and before/after cards show the same page. Still one example.
- **Unique lifestyle pages.** 01 / 06 / 09 prefer different pages: a repeat moves to the next unused page
  (concept.strongest_pages, then showcase, then collage order); a small book reuses only when nothing is left.
  Every change is recorded in the card's `fallbacks`.
- **Hero placement** (`heroPlacement`): the example tucks into the page's outer lower corner (≤ 8% overlap,
  never the page's central half). `COLOURING_CREATIVE_VERSION` 2.
- **Square pages** (a supported orientation): the creative compositions use the landscape-style layouts so every
  existing floor is met. Factory and landscape output are unchanged.
- **Scene briefs.** The colouring brief tells the model scene_brief is environment only and lists the banned
  words; colouring books also reject printable / worksheet / colouring sheet / product / mockup / print on top of
  the shared list (fallback to the baseline brief, recorded).
- **Listing.** An over-long `listing_claims` item is dropped before validation (never truncated) and recorded in
  `tag-selection.json` (`dropped_claims`); everything else is validated as before.

## Scene-brief length and the premium hero (2026-10-06, after #019)

- **Over-long briefs** (#019 hero comparison, #016 crochet card: `scene_brief: longer than 400`). Strict structured
  outputs only state the limit, and neither direction path had a length guard, so one long brief rejected a whole
  paid call. `fitBrief` (automation/src/stage3/engines.mjs) now compresses every over-long `slides[].scene_brief`
  before validation: parentheticals removed, whole trailing sentences (then trailing clauses) dropped, ending with a
  full stop; recorded (`normalized` / fallbacks `scene_brief (compressed)`). The creative path compresses instead of
  clearing to the baseline. Both prompts state the 400-character limit. Limits are unchanged.
- **Hero** (`cb-lifestyle-hero`, `COLOURING_CREATIVE_VERSION` 3): an editorial layered spread. The labelled coloured
  example is the warm front anchor, the real page it came from lies angled beside it, a second real page (the cover
  when there is one) sits behind; elegant serif headline from the season word; a premium cosy styled-tabletop brief.
  Real pages ≥ 34% in every orientation, the example covers ≤ 8% of its page and none of its centre (tested).
- **Hero comparison** for colouring books renders this creative hero card (same cost: 1 direction + 1 backplate per AI
  engine; an existing coloured example of the hero page is shown, none is generated there).
