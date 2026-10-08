# ADR-046: Crochet pattern-to-visual integrity

- **Status:** Accepted (owner request, 2026-10-02).
- **Extends:** ADR-041 and ADR-042 (crochet integrity), ADR-043 (visual
  direction), ADR-044 (restyle).

## Context

A buyer must never receive a crochet pattern that makes something materially
different from the listing image. Until now, crochet visuals came from a
creative brief:

- the Stage 1 style proofs are made before any pattern exists;
- the restyle values named flowers in free text ("blush roses, cream
  daisies…").

Nothing tied a pictured piece to a written pattern.

## Decision

- **The written pattern is the source of truth.**
- **Fingerprint** (`production/src/crochet/fingerprint.mjs`, exported by
  `@dpf/production`). It is derived deterministically from one validated
  pattern:
  - **Read directly:** name, category, size, yarn weight, hook, fibres,
    yarn colours and roles, materials, sections, assembly.
  - **Explicit wording only:** counts and shapes such as "18 petals",
    "three petal layers", "Leaves (make 2)", "spiral centre", "15 cm stem".
  - **Never computed:** values implied only by stitch arithmetic, per-unit
    counts ("6 petals per section") and conflicting statements. These stay
    null and are listed in `unknown`.
  - **Known absence:** a piece the complete instructions never make (no
    leaf or stem instruction) is recorded as absent. Wire, beads and other
    embellishments come only from the materials or instructions.
  - Every value records its evidence.
- **Visual spec** (`marketing/src/stage3/crochet-visual-spec.mjs`, exported
  by the Stage 3 index):
  - `{kind, items:[{pattern_id, quantity, features}], ornaments,
    composition, status}`, built from fingerprints.
  - `visualSpecProblems` hard-fails, where the pattern states the attribute:
    motif or flower type, petal count, petal layers, petal shape, centre,
    leaves, stem, wire, embellishments, size (more than 25% out), and any
    feature it cannot check. Attributes the pattern does not state never
    fail. Colourway differences are warnings.
  - Every item must be an approved pattern ID. An invented motif fails.
  - Branding ornaments must be flat media (illustration, watercolour, line
    art, print, foil), never crochet.
  - `crochetProductPrompt` builds the image prompt from a CHECKED spec only.
    It names each piece with its pattern-supported features, lists the
    unknowns as "not specified, keep plain", and forbids additions.
- **`visual_match_status`:**
  - `derived`: the spec was built from the patterns.
  - `internally_checked`: the spec passed the checks.
  - `physically_verified`: a person crocheted the pattern and confirmed the
    result. This is in the schema, but code never sets it.
- **Restyle** (ADR-044) builds the three artwork briefs from checked specs:
  - **Cover:** an approved `combinations` arrangement (real pattern IDs and
    quantities; `cover.hero_combination` may choose one), else the focal
    pattern.
  - **Overview:** up to nine approved patterns.
  - **Detail:** the focal pattern.
  - Restyle writes `creative/visual-specs.json` (fingerprints, specs,
    patterns SHA-256, status) and records the status on the restyle.
  - It refuses `hero_subject`/`detail_subject`, an unknown combination, and
    a crochet species named in the shared style text.
- **Claims** (`crochet-integrity.mjs`):
  - "photographed", "finished/tested sample", "exactly as pictured" and
    "exact result" are refused unless there is photographic evidence of a
    physically made piece.
  - The model is told to say "Rendered example of the finished crochet
    design."
  - The digital-product disclosure is unchanged.

## Alternatives considered

- **Parsing stitch arithmetic for petal counts:** rejected. It cannot be
  made reliable without a crochet simulator, and a wrong count is worse than
  "unknown".
- **Checking finished images by vision model:** rejected. It is a paid call
  and probabilistic, and it is not needed when the prompt is built from the
  spec.

## Consequences

- **Initial style proofs (before patterns exist) cannot be traceable.** For
  crochet, a traceable product image exists only after APPROVE PATTERNS,
  via Restyle.
- **Gaps left to follow-up** (not built here):
  - a Stage 2 gate requiring `internally_checked` visuals;
  - carrying the specs into Stage 3 facts.
