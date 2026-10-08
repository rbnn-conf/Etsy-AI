# ADR-063: Crochet visual set: collection hero and per-pattern finished-item previews

- **Status:** Accepted (owner request, 2026-10-06). Implemented. No live
  generation has been run.
- **Scope:** reusable for every `crochet-pattern-bundle`. Product #020 is
  only the worked example.

## Context

Crochet visuals came only from the three Restyle style proofs (cover,
overview, detail; ADR-044/046/047).

- The cover read as a catalogue, not a lifestyle scene.
- No pattern page showed what its finished item looks like.

The owner wants:

- a commercial collection HERO;
- one finished-item PREVIEW per approved pattern, in the top right of that
  pattern's instruction page.

Validation, fingerprints (ADR-046), the Restyle gate (ADR-047) and pattern
integrity must not weaken.

## Decision

1. **The visual director is deterministic** (`production/src/crochet/visual-set.mjs`;
   no model).
   - From the approved patterns and their fingerprints it builds one
     `hero_scene_brief` and one `pattern_preview_brief` per pattern.
   - The art direction decides HOW pieces are staged. A pattern's function
     comes from its name and category: a placemat goes beneath a plate, a
     napkin ring is wrapped around a linen napkin. It also sets the seasonal
     environment, light, camera and composition.
   - It never decides WHAT crochet exists. Every crochet object in a brief is
     an approved pattern ID, `quantity` 1, bound to the SHA-256 of that
     pattern's current fingerprint.
   - Props are concrete and never crochet. A prop that duplicates an approved
     type is dropped (no linen runner beside a crochet runner). So is one that
     resembles the subjects (no real leaves in a leaf set).
   - Vague wording ("complementary crochet decorations") is refused.
   - A preview shows exactly ONE crochet product, and its forbidden list names
     every other pattern.
   - The hero stages at most 8 pieces: the plan's focal pattern first, else
     the largest.
2. **The prompt builder is code-only** (`automation/src/openai/crochet-visuals.mjs`).
   - Each prompt has three explicit sections: APPROVED CROCHET OBJECTS (exact
     count), NON-CROCHET PROPS, and FORBIDDEN CROCHET OBJECTS.
   - It adds the product layer of the ADR-043 crochet direction (realistic
     yarn, never illustrated).
   - It refuses any brief that fails `briefProblems`.
   - Images use the existing metered client: steps `crochet-hero` and
     `crochet-preview`, priced as `artwork`. There is no text-model call.
   - Sizes: hero landscape, previews square. The square suits the 56 × 70 mm
     slot (80 % kept, ≥ 300 ppi).
3. **Stage 1 flow (states `VISUALS_GENERATING` and `AWAITING_VISUALS_APPROVAL`).**
   - **Start:** after APPROVE PATTERNS, from CREATIVE_APPROVED. From
     PRODUCTION_APPROVED (Product #020), `production_reopened` runs first and
     is recorded, and the package must then be rebuilt (free).
   - **Confirm:** the owner sees "1 collection hero + N pattern preview images,
     Total: N+1 image generations", the cost warning and the ledger estimate.
   - **Generate:** briefs are persisted first, then one image at a time, each
     committed before the next.
   - **Retry:** resumes at the first missing image. An image written just
     before a crash is adopted, never bought again.
   - **QC and review:** deterministic QC, a visual manifest, then the owner
     review with every image.
   - **Approve:** ✅ APPROVE VISUAL SET writes the approval into
     `visual-manifest.json` and binds `product.crochet_visuals.approval` to
     the manifest SHA-256, the asset digest and the patterns SHA-256.
   - **Restyle** (Hero / one Preview / All): archives exactly the chosen
     images to `visuals/crochet/history/`, regenerates only those and clears
     the visual approval. Patterns, fingerprints and briefs never change. If
     the approved patterns' fingerprints changed, only Restyle All re-plans
     the set; old and new are never mixed.
   - **Stop:** keeps every image.
4. **Stage 2.**
   - **Handoff:** once a product has a visual set, it is MANDATORY. The handoff
     (`approvedVisualSet`) re-reads the manifest and every file by SHA-256 and
     re-runs the brief and fingerprint checks against the approved patterns.
     It refuses an unapproved, changed, incomplete or stale set
     (`CROCHET_VISUAL_SET_UNAPPROVED`).
   - **Products without a set** build exactly as before. The adapter version
     is unchanged (ADR-057).
   - **Placement:** the adapter places each preview in the existing fixed
     top-right `patternHeroImage` slot (Moonlit: 56 × 70 mm arch), captioned
     "Illustrative finished-item preview". The image never sets page
     geometry: it is a cover crop with the aspect kept.
   - **QC** checks that each pattern's first page carries exactly its own
     preview, at one geometry per paper, inside the page, with no text
     overlap, undistorted and at ≥ 200 ppi.
5. **QC is honest.** Code checks:
   - mapping and the fingerprint binding;
   - that no crochet item appears in props or staging;
   - files: present, unchanged, PNG, not blank;
   - print resolution and crop.

   It cannot see image content and makes no claim about stitch-level
   correctness. The owner reviews every image. Images are AI illustrations,
   never photographs of test-crocheted items. Patterns stay unverified unless
   they are test-crocheted.

## Alternatives considered

- **A text-model "art director" call.** Rejected for now. A model call adds
  cost, and it could name products that are not approved. The deterministic
  director is fully checkable. A model could be added later only as an
  optional styling layer over the same checked brief.
- **Reusing the 3-proof Restyle flow.** Rejected: it has a fixed page count,
  not one image per pattern.
- **Mandatory for every crochet product at once.** Rejected: it would block
  existing products (#016, #020) from rebuilding. Instead, a set is mandatory
  once the owner creates one.
- **Placing the hero on the PDF cover.** Deferred. The cover keeps its
  approved proof. The hero is recorded and approved for Stage 3 and the
  owner's listing work.

## Consequences

- Product #020 makes 7 image calls (1 + 6) when the owner confirms. Nothing
  has been generated.
- New files per product:
  - `visuals/crochet/briefs.json`
  - `visuals/crochet/hero/hero.png`
  - `visuals/crochet/previews/NN-<pattern_id>.png`
  - `visuals/crochet/prompts/`
  - `visuals/crochet/history/`
  - `visuals/crochet/visual-manifest.json`
- Greeting cards, colouring books, Stage 3, Stage 4 and Etsy are unchanged.
