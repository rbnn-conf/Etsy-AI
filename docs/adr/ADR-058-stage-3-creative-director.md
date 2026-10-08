# ADR-058: Stage 3 Creative Director (creative cards inside the existing engines)

- **Status:** Accepted (owner request, 2026-10-06). First pilot: #016, code
  baseline only, with no model or image call.
- **Amends:** ADR-029 (marketing engines), ADR-041/042 (crochet Stage 3),
  ADR-046/047 (crochet visuals).

## Context

The Stage 3 architecture worked, but the listing images were safe and
template-like:

- **Fixed templates:** eight templates with code-written headlines.
- **Narrow AI direction:** only 3 of 8 slides were art-directed, and the model
  chose only a background archetype.
- **Unused renders:** the approved crochet renders (the 9-flower overview and
  the Garden Rose detail) never reached marketing.
- **Repetition:** most images were whole PDF pages floating on a cream
  gradient.

The owner rejected a new marketing subsystem and asked for a creative-direction
upgrade of the existing Stage 3.

## Decision

- **One buyer job per card.** The eight jobs are:
  - stop the scroll;
  - what am I getting;
  - show me the quality;
  - show me the variety;
  - why is this useful;
  - how does it work;
  - make me want it;
  - remove my doubts.
- **Per-card direction in `plan.json`.** Each card's direction is stored in
  the existing `plan.json` `directions[slide]`. It records:
  - the purpose, buyer message and emotional goal;
  - the headline;
  - the focal and supporting assets;
  - the composition and hierarchy;
  - the background and props;
  - the crop;
  - the text zone;
  - the claims used and what to avoid.
- **Code baseline first.** The format adapter's `creative.plan()` is the code
  baseline (crochet: `planCreative`, `marketing/src/stage3/crochet.mjs`).
  - **Hybrid / AI Creative:** these engines make ONE structured text call under
    the shared instruction (`automation/prompts/marketing-creative-director.md`,
    schema `marketing-creative-direction`). It refines every card.
  - **Validation:** `normaliseCreative` validates each value against:
    - the asset catalogue;
    - the composition vocabulary;
    - the claim and integrity checks;
    - a 7-word headline limit (no digits).
  - **Fallbacks:** invalid values fall back to the baseline, and each fallback
    is recorded. A scene brief that names a product substitute, text or
    people (even in a negation such as "no text") is never used: that card
    keeps the baseline brief, and the whole direction is not rejected.
  - **Factory:** unchanged.
- **Niche direction.** Each adapter gives `creativeDirection()`: the buyer
  thought, identity, preferred compositions, allowed props, truth rules and
  avoid list.
  - **Crochet:** premium, editorial, tactile.
  - **Colouring books:** playful.
  - **Greeting cards:** elegant and giftable.
  - **Creative plan:** only crochet has one so far. The other formats keep the
    region-template path unchanged.
- **Approved renders reach Stage 3.** The crochet facts carry `renders`: the
  bouquet, overview and detail renders from the handoff's checked visual specs.
  - Each render is SHA-verified, and must be `internally_checked` or
    `physically_verified`.
  - Each lists the approved pattern IDs and quantities it depicts.
  - Each records `text_free`, the region below the Stage 1 lettering (the
    Moonlit display crops, ADR-056).
  - A render can never be placed whole. It is shown only through a crop inside
    `text_free`, at most 2× its pixels (`MAX_UPSCALE`), and labelled as an
    illustration.
- **Small composer extensions** (`primitives.mjs`, `creative.mjs`):
  - `fitCrop` / `cropArt`: the whole image sits inside a `data-clip` frame
    (rect, soft, arch or round);
  - full-bleed (a render as the ground, with its sampled colour); the hero
    render is shown at `HERO_UPSCALE` = 1.5× for a crisp image;
  - `stack` (page stack or fan);
  - `bleed` (objects running off the canvas);
  - seven text zones;
  - deterministic grounds: linen, paper, ivory, sage, blush, dusk;
  - a coded placeholder table scene.

  The renderer reports each artwork's `visible` rect (clipped by every frame),
  and clipped content is not canvas overflow. Product share counts only the
  visible part, and the no-stretch check is unchanged.
- **Paid environments.** An AI environment is used only where a card's
  background is `environment`. The model may move the scene to another card,
  but never adds one: the campaign keeps at most the baseline's count
  (`environmentCap`; crochet: 1), and never more than `MAX_ENVIRONMENTS` = 2.
  The prompt (`creativeEnvironmentPrompt`) keeps every exclusion: no flowers,
  crochet, paper, text or people.
- **QC.** Engine QC adds:
  - **Variety:** fails when one composition is on more than a third of the
    cards, when one background, one headline placement or floating pages are
    on every card, when there is no lifestyle/desire card, or when the mean
    product share is under 35%.
  - **Render truth:** crops below the lettering, within the resolution floor,
    and every render tied to approved pattern IDs.

## Alternatives considered

- **A marketing-preparation / export subsystem:** rejected by the owner.
- **Extending the art-direction schema in place:** rejected. Strict mode makes
  every field required, which would change the greeting-card and
  colouring-book calls. A separate schema keeps their path byte-for-byte.
- **Letting the model write numbers into headlines:** rejected. Numbers come
  only from facts, as claim-tagged code copy.

## Consequences

- **Calls for a crochet Hybrid / AI Creative campaign:**
  - 1 text call (all eight cards);
  - 1 environment image call (the baseline lifestyle card);
  - the listing copy call, as before.
- **Free preview:** `marketing/scripts/creative-preview.mjs` renders the
  baseline to any folder outside the product (no call). The lifestyle card
  shows a labelled placeholder scene until the paid scene exists.
- **Hero comparison:** a crochet campaign does not reuse the comparison's paid
  hero.
- **Telegram:** Regenerate Scene is offered on a creative card only when it
  has an AI scene. Change Direction regenerates a scene only for such a card.
