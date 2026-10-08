# ADR-042: First crochet product: collection plan, Stage 3 crochet marketing, SEO evidence

- **Status:** Accepted (owner request, 2026-09-29).
- **Extends:** ADR-041 (crochet production), ADR-033/034/036 (SEO), ADR-037
  (Stage 3 adapters), ADR-039 (Etsy taxonomy).
- **Scope:** the smallest additions needed for the first real crochet product
  (Crochet Flower Bouquet Pattern Bundle, 33 base patterns) to continue into
  marketing and Etsy preparation. Owner approval gates are unchanged, and
  none is simulated.

## Decision

- **Collection plan before any pattern** (`automation/schemas/crochet-plan.schema.json`,
  `planProblems` in `automation/src/orchestrator/crochet.mjs`):
  - Every planned pattern states:
    - its role (focal, secondary, filler, accent, foliage, structural);
    - difficulty and approximate size;
    - suggested yarn weight and hook;
    - construction and main stitches;
    - whether assembly is required, and its artwork need.
  - The plan is rejected, and no pattern is drafted, on:
    - the wrong count, or duplicate ids or names;
    - near-duplicates, i.e. the same base name after size or colour words
      ("Small Rosebud" beside "Rosebud");
    - a combinable collection without focal, filler/accent and
      foliage/structural pieces, or without one combination that joins a
      focal piece with foliage or stems;
    - a single difficulty, or more than 75% at one level, when there are 6
      or more patterns;
    - under 25% beginner or easy patterns when the audience includes
      beginners.
  - A planned `assembly_required` is carried into the draft, where the
    validator enforces it.
  - The owner's brief may carry collection guidance (`33 US: roses, daisies …`).
    It is passed to the plan call as creative direction, not a checklist.
- **Overview artwork slot:**
  - A Stage 1 page typed overview/collection/index (or
    `crochet_artwork.overview`) is placed on the welcome page.
  - Pattern artwork is still never inferred.
- **Stage 3 crochet adapter** (`marketing/src/stage3/adapters/crochet-pattern-bundle.mjs`,
  compositions in `marketing/src/stage3/crochet.mjs`):
  - Eight images: hero, a real pattern page, the pattern collage, the real
    index, what's included, printable/download, lifestyle and summary.
  - The real product is:
    - true renders of the customer PDFs (cover, pattern pages, index, the
      references, the guide);
    - the approved Stage 1 illustration.
  - OpenAI writes the listing copy and tone lines, and paints environment
    scenes that may never contain flowers or any crocheted or knitted item.
    Nothing can read as a photograph of a finished piece. There are no AI
    "examples".
  - No `etsyCategory` is declared (see taxonomy).
- **Integrity enforced:**
  - `claims.mjs` `claimProblems`, used for listing copy, tag candidates,
    image headlines and tone lines, applies `crochetClaimProblems` to every
    crochet text. That rejects:
    - "tested", "verified" or "test-crocheted" unless every pattern is tested;
    - professionally tested, guaranteed or error-free;
    - "photo of the finished item";
    - unsupported "step-by-step";
    - video, yarn or kit claims;
    - open-ended counts ("150+ patterns").
  - A generic `itemQuantityProblems` checks "N … patterns" against the real
    count and rejects bonus or extra patterns.
  - "Handmade" is allowed only through `process_claims`, because the buyer
    makes the pieces. The model rules forbid calling the patterns handmade.
- **Strategy:** a `crochet_pattern` family (making-focused tone; "tested" and
  "guaranteed" avoided).
- **SEO:**
  - **Search shapes** (ADR-033 amendment): the crochet family's theme queries
    read `crochet {theme} pattern` (singular theme, derived from the idea's
    words, still guarded), because buyers search "crochet rose pattern", not
    "roses crochet pattern bundle". Other families are unchanged.
  - **Owner evidence** is stored with the existing path. Files are in
    `seo/fixtures/research-cycle/crochet-flower-bouquet-real/` (idea,
    engine-derived profile, and 8 captured observations each opened
    individually by the owner). They were imported with `seo:import-cycle`
    into session `s34a01377dc`, attached to #015.
  - Rounded values are flagged, and the capture date and trend stay null.
  - Readiness is `RESEARCH_INCOMPLETE`: finishing, scoring and approval are
    owner actions.
  - **Approved SEO reaches the listing:** only a session the owner scored and
    approved (`SeoPanel.approvedKeywords`) is passed to the listing call, as
    search focus (primary phrase leads the title, no keyword stuffing).
    Unapproved research is never used.
- **Etsy taxonomy:**
  - A read-only `GET seller-taxonomy/nodes` through the existing
    `EtsyService` on 2026-09-29 returned 3065 nodes. There is no crochet node
    under Patterns & How To.
  - Verified candidates are recorded in the unresolved entry:
    - 6343 "Craft Supplies & Tools > Patterns & How To > Patterns & Blueprints"
      (recommended);
    - 86 "Art & Collectibles > Fiber Arts > Crochet" (finished items; not
      recommended).
  - Stage 4 names the live candidates when it stops with
    `TAXONOMY_UNRESOLVED`. The choice stays the owner's (ADR-039).

## Alternatives considered

- **Reuse the colouring-book compositions with crochet copy.** Rejected: its
  AI "coloured example" has no honest crochet equivalent. An AI image of a
  finished piece would be the misrepresentation ADR-041 forbids.
- **Choose 6343 automatically.** Rejected: mappings are owner-approved.
- **Treat off-plan captures as evidence without a plan change.** The engine
  deliberately scores planned queries only. Fixing the query shape keeps
  that rule.

## Consequences

- The fixture path `/newproduct` → … → `/market` → APPROVE MARKETING →
  `/etsy` works in tests and stops at `TAXONOMY_UNRESOLVED` (dry run).
- The real product needs the owner at each gate: concept, style, brief and
  paid drafting, patterns, production, the SEO decision, marketing, and the
  category.
