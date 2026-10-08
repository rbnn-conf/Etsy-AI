# ADR-036: Telegram is the owner interface for the SEO engine

- **Status:** Accepted (owner specification, 2026-09-30). Branch `feature/seo-discovery-engine`.
- **Builds on:** ADR-031 to ADR-035 (SEO engine). Their rules are **not changed**:
  - the opportunity formula, weights and relevance values;
  - expansion, readiness and the evidence package;
  - FINISH_WITH_CURRENT_EVIDENCE.
- **Amends:** ADR-031's "the SEO engine and the Production Engine never import each other". See the Boundary section.

## Context

The SEO engine was usable only through a developer CLI. The owner runs the
factory from the Telegram control panel (`automation/`), and needs to do SEO work
there too:
- audit an existing product;
- research a new one;
- type in Marketplace Insights;
- reuse earlier captures;
- see the evidence;
- finish early;
- receive a recommendation.

## Decision

### Boundary

- **One adapter:** `automation/src/seo/` (panel, screens, state, library,
  catalogue) and its owner script `automation/scripts/seo-import-cycle.mjs` are the
  only automation code that uses the SEO engine. They import `seo/src/index.mjs`.
- **Everyone else stays out:** Stage 1–4 code, `production/`, `marketing/` and
  `services/` never import `seo/`. The SEO suite enforces this, with this one
  folder exempt. `seo/` still never imports `automation/`, the Production Engine,
  Etsy, Telegram or a model.
- **No second SEO implementation:** planning, relevance, expansion, readiness,
  evidence, scoring, duplicate intent and finishing are engine calls. The adapter
  only routes buttons and messages and stores Telegram input state.

### Engine additions (no rule changes)

- **`ResearchWorkspace`** (`seo/src/workspace.mjs`): the file-backed session,
  shared by the CLI and Telegram. CLI behaviour is unchanged.
- **`capture.mjs`:** reads what the owner copies from Etsy.
  - Etsy's rounded values ("4.3k", "2.6M") are stored as their expanded number,
    marked `exact:false`, and the provenance note states they are rounded. They
    are never presented as exact.
  - 30 daily counts give an exact total (the convention used for the real
    2026-09-29 captures).
  - Related-term lines are parsed as discovery metadata only.
- **`intake.mjs` `profileFromIdea`:** the relevance profile comes from the
  owner-confirmed structured idea:
  - themes → central themes;
  - formats plus their format family → formats;
  - audiences → audiences;
  - styles and delivery words → attributes.

  Nothing else is inferred, and one word may belong to only one facet.
- **`listingRecommendationFromResult`:** the ADR-032 listing recommendation, built
  from an already computed result (the evidence package's score).
  `createListingRecommendation` now calls it, with identical output (tested).
- **`revision.mjs` `proposeRevision`:** a deterministic proposal for an existing
  listing.
  - **Title:** the primary keyword, plus at most two single-kind qualifiers from
    secondary or supporting keywords (an audience → "for …", a style → prefix),
    then the page count and formats. Each word is used once; within 140
    characters.
  - **Tags:** keep, add and remove, from the recommendation's tag candidates.
  - **Description:** a new opening line, then the owner's current, verified copy
    unchanged.
  - **Owner checks:** qualifiers that the current listing does not state (for
    example "adults") are flagged for the owner to confirm.

### Telegram

- **Home:** a 🔎 SEO button; `/seo` opens the same dashboard. The dashboard offers
  Audit Existing Product, Research New Product, Insights Library and Active Research.
- **Buttons:**
  - navigation uses the existing `m1` menu data (validated, read-only);
  - write actions use `s1|action|id|nonce`, a copy of the product `a1` pattern.
    The id is a session (`s…`) or an input entry (`e…`), and every write rotates
    the nonce, so a stale or repeated press is refused. A second Save never
    creates a second observation.
- **State:** `automation/state/seo/` (git-ignored) holds the session index,
  product links, per-chat input entries and nonces, plus one engine workspace
  per session. Multi-step input survives restarts and navigation.
- **Audit of an existing product:** reads local files only, in this order:
  - the Stage 4 payload;
  - the Stage 3 listing;
  - a hand-built `listing/listing.json`;
  - a hand-built `listing/description.md`.

  Etsy is never read. With no research, the owner starts it and confirms each
  structured detail. Suggestions come only from the listing's own words, and
  nothing is set silently.
- **Capture flow:** the steps are searches, then daily counts (only when a
  rounded value was entered), results, conversion buttons, trend (skippable),
  related terms (plain terms or `term | searches | results | conversion`), and a
  review. Only Save writes, as a new write-once research version.
- **Finish:** the button is offered only while expansion is open (an expansion
  round is pending, or EXPANSION_RECOMMENDED). It uses the engine's
  FINISH_WITH_CURRENT_EVIDENCE.
- **Insights Library:** an index over every session's research versions. It
  offers search, keyword history (oldest first) and recent research, with no
  averaging and no numbers of its own.
- **Reuse:** before asking for a lookup, the library is checked for the same
  normalised term in another session.
  - Reusing copies the historical observation unchanged (same content-addressed
    id, capture date and source) into the session's next research version, and
    records the reuse (from which research version).
  - "Research Again" captures a new observation; both stay in the history.
  - Freshness: the capture date is shown, and the owner decides. There is no
    automatic expiry.
- **Revision and approval:**
  - "Generate SEO Revision" uses `proposeRevision` (no OpenAI, £0.00).
  - "Approve" saves `approved-revision.json` and nothing else.
  - A product with an Etsy listing (live or draft), or a hand-built product whose
    Etsy state is unknown locally, gets the 🔴 manual path: copy the recommended
    SEO as text, and an Etsy editor link when the listing id is known.
  - A local, never-drafted product keeps the approved revision as a future input
    to its Etsy draft. That wiring is not built in this phase.
  - Publishing is never offered, and `ETSY_PUBLISH_ENABLED` is not touched.
- **Existing research:** `npm --prefix automation run seo:import-cycle` replays a
  completed cycle (captures plus the owner's finish record) into a session
  attached to a product. The #005 acceptance scenario uses this.

### OpenAI and cost

The Stage 3 listing-copy path needs Stage 2 production facts, which hand-built
products do not have. The owner's current description is also verified copy. A
deterministic revision is therefore both useful and free, so the SEO panel makes
**no OpenAI call** and adds no LLM client.

## Alternatives considered

- **Telegram code calling a separate SEO copy:** rejected, because it duplicates
  rules.
- **Reading live Etsy listings for the audit:** rejected, because opening an
  audit must not call Etsy.
- **An OpenAI-written revision:** not needed now (see above); it would need a
  confirmed, ledgered paid call.

## Consequences and limitations

- The title composer is intentionally simple. The description revision adds an
  opening line and keeps the current copy.
- An approved revision is saved but not yet consumed by Stage 3/4 draft
  generation.
- The library is rebuilt by scanning sessions on demand, which is fine at the
  current scale.
- A hand-built product's audit uses its local listing file, which may differ from
  what is live on Etsy.
