# ADR-043: Crochet finishing-item split and the crochet visual direction

- **Status:** Accepted (owner request, 2026-10-02).
- **Extends:** ADR-041 (crochet production), ADR-042 (crochet marketing).
- **Scope:** two narrow changes for `crochet-pattern-bundle` only. Other
  formats, the Stage 1/2/3 architecture and the approval gates are unchanged.

## Context

1. Product #016 stopped at `patterns` with
   `crochet-pattern: model output rejected: $.finishing[0]: longer than 300`.
   OpenAI strict mode does not accept `maxLength`, so `strictSchema()` strips
   it and the limit reaches the model only as a description. The model wrote
   one long finishing paragraph. The local validator rejected the whole draft,
   which is correct, but the cause is avoidable.
2. Crochet artwork read as watercolour or illustration, not as crochet. The
   model-written creative direction (gouache) applied to the product itself.
   Its avoid list banned "photorealism" and "finished crochet objects". The
   canvas hint said "clearly an illustration, not a photograph". Nothing
   separated the branding from the product.

## Decision

- **Finishing items** (`automation/src/orchestrator/bounded-text.mjs`,
  `normalizePatternDraft` in `automation/src/openai/crochet.mjs`):
  - The prompt and the schema description tell the model: short, separate
    finishing items, one action per item, each 300 characters or fewer, and
    another item instead of a longer one. `maxLength` stays 300.
  - `structured()` takes an optional `normalize` step, run after parsing and
    before validation. Only the crochet pattern call uses it, for the
    free-text arrays `finishing` (300), `assembly` (400) and `notes` (300)
    (`BOUNDED_INSTRUCTION_ARRAYS`; each field's limit is read from the
    schema).
  - An over-long item is split at sentence ends, then at `; : ,`, then
    between words. Every word is kept, in order. Nothing is rewritten, cut
    mid-word or dropped, and items within the limit are untouched. Each split
    is logged.
  - The validator still decides. A single word over 300 characters, more
    than 8 items after splitting, or any other invalid field is rejected as
    before.
  - This is re-chunking, not repair. ADR-041's "never repaired" still holds
    for content.
  - `instructions[].steps[].text` (600) and the scalar strings (`gauge` 200,
    `finished_size` 80, ...) are deliberately never split. A step's text is
    bound to its label, stitch count and order, so splitting it would change
    the pattern's structure. Instead, the prompt and the schema descriptions
    state each limit. The model is told: one round, row or labelled range per
    step, never several independent rounds in one paragraph, and another
    explicit step instead. An over-long step is still rejected, as before.
- **Crochet visual direction**
  (`marketing/src/stage3/crochet-visual-direction.mjs`, exported by the Stage 3
  index) is the one source:
  - BRANDING layer (Moonlit Meadow identity, palette, crescent moons,
    botanical ornaments, serif type): illustration and subtle watercolour
    are allowed here only.
  - PRODUCT layer: realistic, photographed crochet with visible yarn fibres
    and stitches. It must never look watercolour, illustrated, vector,
    digitally painted, porcelain, plastic, like real flowers or like clipart.
  - It also holds the hero priorities and hierarchy, the 8-image listing
    sequence, and the digital-product disclosure.
  - Inherited by:
    - the Stage 1 creative direction and specification calls
      (`crochetDirectionBrief`);
    - artwork proofs (`buildImagePrompt`);
    - concept previews (passed in by the workflow, because the preview
      module imports no marketing code);
    - the Stage 3 crochet adapter's model rules (`crochetMarketingDirection`).
  - Entries on a stored avoid list that would forbid the realistic product
    are dropped from crochet image prompts. Every other entry is kept.
- **Integrity is unchanged.** A rendered crochet piece is a visualisation,
  never a photograph of a test-made item and never something the buyer
  receives (`crochet-integrity.mjs`). AI environments in Stage 3 still never
  contain crocheted items. Code composites the approved artwork.

## Alternatives considered

- **Raise `maxLength`:** rejected (owner). The limit is intentional.
- **`slice(0, 300)`:** rejected. It destroys instructions.
- **Re-asking the model on failure:** this is a paid call each time, and it
  already exists as the owner's redraft.
- **Prompt fragments in each builder:** rejected. They drift, and there would
  be no single source.

## Consequences

- Retrying #016 resumes at its saved plan. It makes up to 12 pattern calls
  (OpenAI).
- #016's look was approved under the old gouache direction. Its stored
  direction and cover brief still describe an illustrated bouquet. A new
  proof would get the crochet block, but the prompt would mix both looks.
  Realistic crochet artwork for #016 needs new proofs and a new style
  approval, which are paid image calls. The bot has no path from
  `CREATIVE_APPROVED` back to the style gate: Change Direction works only in
  `AWAITING_CREATIVE_APPROVAL`, and it rewrites the direction file but not
  the page briefs. Pattern approval is bound only to the `patterns.json`
  SHA-256, so a restyle would not affect the approved patterns.
- The Stage 3 crochet composer still builds its existing 8 slides from the
  real Stage 2 pages and the approved Stage 1 artwork (1–3 pages). Images in
  the sequence that need several realistic crochet renders (overview, macro
  detail, variations, lifestyle with a vase) are recorded as direction. The
  composer does not produce them yet.
