# ADR-047: Crochet visual production gate, Stage 3 visual facts, style-proof scope

- **Status:** Accepted (owner request, 2026-10-02).
- **Extends:** ADR-046 (pattern-to-visual integrity), ADR-044 (restyle),
  ADR-041 and ADR-042 (crochet).

## Context

ADR-046 made the crochet visuals traceable to the written patterns, but did
not enforce it:

- production could start without checked visuals;
- Stage 3 marketing never saw the pattern facts;
- Stage 1 proofs made before the patterns existed were not marked as
  style-only.

## Decision

- **Production gate** (`production/src/crochet/visual-gate.mjs`, run by
  `createHandoff` as the authority):
  - A crochet product enters Stage 2 only when:
    - `creative/visual-specs.json` exists;
    - its `patterns_sha256` equals the approved pattern source;
    - its fingerprints equal the ones recomputed now;
    - the file status and every required spec (cover, overview, detail) are
      `internally_checked` or `physically_verified`;
    - re-running the pattern-to-visual checks finds nothing;
    - the latest Restyle wrote these specs, and the approved style proofs
      were made under that Restyle.
  - `physically_verified` is accepted but never required, and never set by
    code.
  - The checker (`visual-spec.mjs`) moved into the production package so
    Stage 2 re-runs it rather than trusting a recorded status. Marketing
    re-exports it.
  - The specs file becomes a verified content source of the handoff, so a
    later edit is refused.
  - `/produce` and the Build button pre-check with the same function
    (`crochetProductionReadiness`). They show "❌ #NNN cannot enter
    production / Crochet visuals are not checked against the approved
    patterns. / Run Restyle and approve the new proofs first." with no
    state change, so Restyle stays available. The reasons go to the log.
- **Stage 3 facts.** The handoff's `crochet.visuals` reaches the build
  record's `stage3_handoff.visuals` (`crochetVisualFacts`):
  - match status, with `physically_verified` true only if the record says
    so;
  - the pictured items (approved pattern IDs and quantities);
  - per-pattern `listingFacts`: type, size, yarn weight, hook, fibres,
    colours, petal, layer and leaf counts, centre, stem, embellishments.
    Unknowns stay null or "not stated".
  - The Stage 3 crochet adapter passes these to the model as `pattern_facts`
    (source of truth), `pictured` (the only allowed representation) and
    `visual_match_status`, with rules that branding is decoration only.
  - `countClaimProblems` refuses any petal, petal-layer or leaf count that
    no approved pattern establishes. Pattern names are exempt.
  - "Physically verified" is refused unless the human record says so.
- **Stage 1 proof scope.** Before the patterns exist, crochet previews and
  proofs are CONCEPT / STYLE proofs only:
  - The image prompt adds `STYLE_PROOF_NOTE`.
  - The direction and specification text models are told never to name
    species, counts or pattern names.
  - The proof attempt records `purpose: concept-style`, and the proof
    review says what such proofs cannot show.
  - After Restyle, proofs carry `TRACEABLE_NOTE` and
    `purpose: traceable-product`.
  - The Stage 1 order is unchanged.

## Consequences

- Every crochet product needs Restyle and newly approved proofs before
  `/produce`, including #016.
- Packages built before this gate carry no visual facts. Stage 3 then
  offers none and invents none.
