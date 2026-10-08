# ADR-041: Crochet pattern bundles: AI-assisted drafts, APPROVE PATTERNS, Stage 2 production

- **Status:** Accepted (owner request, 2026-09-29). **Extended by ADR-042:** the crochet
  Stage 3 adapter now exists (the "no Stage 3 adapter" statements below are
  historical), and the Etsy category has verified candidates awaiting the owner.
- **Extends:** ADR-040 (format, source contract, validator), ADR-023 (Stage 1),
  ADR-024/028/030 (Stage 2 adapters and the full-book gate), ADR-039 (Etsy
  taxonomy).
- **Scope:** makes `crochet-pattern-bundle` producible through `/produce`.
  No real product is created by this change.

## Context

ADR-040 defined the format and a strict validator but left it out of Stage 1
and Stage 2. The open question was who writes the instructions. Crochet
instructions are functional: a wrong round gives an item that does not work.
The owner decided that AI-assisted drafts are allowed as candidate content.
They must be clearly marked, reviewed and approved separately from the look,
and never presented as tested.

## Decision

- **Two separate Stage 1 gates.**
  - `APPROVE STYLE` (creative approval) covers the cover, the illustrations,
    the palette and the visual identity only. The approval message says it
    approves no crochet instructions.
  - `✅ Approve Patterns` approves the pattern source for production.
- **`page_count` and `pattern_count` are separate.**
  - `PAGE_RULES['crochet-pattern-bundle']` is 1–3: the Stage 1 artwork only
    (cover, a representative illustration, a motif).
  - The number of patterns is the owner's brief
    (`product.crochet.brief.pattern_count`, 1–60). A 33-pattern bundle needs
    at most 3 artwork pages.
- **Pattern authoring policy.**
  - New origin `ai-assisted-draft` for provenance and per pattern.
  - An AI-assisted pattern must state `verification_status`; code sets it to
    `unverified`.
  - `tested` requires a testing record with `tested_by`, `tested_on` and
    `evidence` (ADR-040's rule, unchanged).
  - A testing record that says tested, alongside `verification_status`
    `unverified`, is inconsistent and rejected.
  - "Verified", "guaranteed", "error-free" and "foolproof" in the title or a
    pattern name are rejected.
  - The model schema (`automation/schemas/crochet-pattern.schema.json`) has
    no `testing`, `origin` or `verification_status` field. Code adds the
    identity, `origin: ai-assisted-draft` and `verification_status:
    unverified`.
  - The approval record keeps the origin and the verification counts.
    Approval for production is never verification.
- **Candidate content** (`automation/src/openai/crochet.mjs`, structured
  outputs):
  - One plan call. It must return exactly the brief's count of unique
    patterns; otherwise it is rejected, never trimmed or padded.
  - Then one call per pattern, each saved before the next
    (`crochet/drafts/<id>.json`), so it resumes after a failure.
  - The drafts are assembled into `crochet/patterns.json`, and the Stage 2
    validator runs.
  - A failing pattern is not repaired. The owner gets:
    - **🔁 Redraft Invalid Patterns**, which passes the validator's errors
      back to the model;
    - **✏️ Revise a Pattern**, one pattern with the owner's instruction;
    - **🔄 Re-validate** after editing the file by hand;
    - **❌ Reject**, which archives every file to
      `crochet/history/rejected-<time>/`.
  - An owner-authored source can be validated for free with **📂 Validate
    Supplied patterns.json**, with no model call.
  - US terminology is used unless the brief asks for UK.
- **APPROVE PATTERNS, bound by SHA-256** (the full-book philosophy, ADR-030).
  Approval requires:
  - a passing validation;
  - the file on disk still hashing to the validated SHA-256;
  - a fresh re-validation;
  - the brief's count.

  The record is `product.crochet.approval` = `{approved_at, by,
  source_sha256, pattern_count, origin, verification}`.

  `createHandoff` then re-reads `crochet/patterns.json`, compares its SHA-256
  with the approval and runs the validator again. A changed source is
  refused with "changed after APPROVE PATTERNS … revalidate and approve
  again". The handoff lists the file in `content_sources`, and
  `verifyHandoffSources` re-checks it on every build and QC run.
- **States:**
  - `CREATIVE_APPROVED → PATTERNS_GENERATING → AWAITING_PATTERN_APPROVAL`.
  - `patterns_approved` returns to `CREATIVE_APPROVED` with the approval.
  - `patterns_stopped` (reject, or from FAILED) returns to
    `CREATIVE_APPROVED`.
  - `/produce` refuses a crochet product until the patterns are approved.
- **Stage 2 adapter** (`production/src/adapters/crochet-pattern-bundle.mjs`,
  `content: 'crochet-patterns'`):
  - Deterministic, with no model and no network. It builds the ADR-040
    deliverables: the START-HERE guide; per paper (A4, US Letter) the
    complete bundle, pattern index, materials and tools reference and
    abbreviations reference; one PDF per pattern.
  - Packaging: one ZIP, or Part-N ZIPs when larger.
  - Previews: cover, index, first pattern, and materials.
- **Document design** (`production/src/crochet/design.mjs`, `layout.mjs`,
  `templates.mjs`):
  - Palette: warm cream, soft blush panels, muted rose labels, sage and a
    little lavender, warm charcoal type.
  - Type: Spectral for display and Source Sans 3 for body, 10.5 pt with
    about 1.45 leading.
  - Pages stay white; there are no ink-heavy backgrounds.
  - Templates: cover, welcome/how to use, index, materials, abbreviations,
    pattern (with assembly and finishing), an optional combination guide
    (`combinations` in the source), back page and printing guide.
  - Nothing is flower-specific.
  - The layout wraps at word boundaries only. Text is never shortened,
    hyphenated or scaled. A character the fonts cannot draw, or a word wider
    than its column, stops production.
- **Artwork contract.**
  - The hero is required: the owner's `production-plan.json`
    `crochet_artwork.hero`, else the cover page, else page 1.
  - The motif is optional.
  - Per-pattern artwork and captioned diagrams come ONLY from the owner's
    plan, never inferred. Without them, pattern pages are typographic.
  - Unknown assets or patterns, a diagram with no caption, an unknown slot,
    or a blank or undecodable asset stop production.
  - Stage 2 never generates artwork and never reads an image to write an
    instruction.
- **QC** (adapter checks, on top of the generic Stage 2 QC):
  - The source matches the approval.
  - The source is still valid (count, duplicates, instructions,
    placeholders, abbreviations, terminology).
  - The layout reproduces the built pagination.
  - Every pattern appears in both papers, in the bundle and as its own PDF.
  - The laid-out lines join back to each source field exactly.
  - pdf.js text of every pattern PDF contains every step, material, hook,
    assembly and finishing line.
  - There are no blank pattern pages and no overflow or clipping.
  - Index page numbers are correct.
  - The artwork is valid.
  - A4 and US Letter sets are complete, and the guide is present.
  - No testing or guarantee wording appears unless every pattern is tested.

  The generic QC covers PDFs opening, page sizes, blank pages and ZIP
  entries against the build record.
- **Marketing integrity** (`marketing/src/stage3/crochet-integrity.mjs`):
  - It checks claims against the build record's `stage3_handoff`:
    - "tested", "test-crocheted" or "verified" only when every pattern is
      tested;
    - never professionally tested, tester-approved, guaranteed, error-free or
      foolproof;
    - artwork is an illustration or styled preview, never a photograph of an
      item made from the patterns;
    - "step-by-step" only when the deliverables support it;
    - no video, yarn or kit claims.
  - It also supplies model rules and internal image-provenance labels.
  - **No crochet Stage 3 campaign adapter is registered.** Marketing and
    design are owned outside Claude (owner decision). `/market` refuses
    crochet with the existing "No Stage 3 marketing support" error, before
    any model call.
- **Etsy taxonomy** (ADR-039 extension):
  - `automation/config/etsy-taxonomy-map.json` gains an explicit `unresolved`
    list with `crochet-pattern-bundle` in it.
  - Stage 4 stops with `TAXONOMY_UNRESOLVED`, naming the category, unless the
    product's `etsy/settings.json` `taxonomy_id` is set. That ID is verified
    against Etsy's live taxonomy.
  - No ID is guessed and no path match is attempted.

## Alternatives considered

- **Only owner-authored patterns.** This is the safest option, but the owner
  asked for AI-assisted drafts. They are allowed as clearly labelled,
  unverified drafts behind their own approval.
- **Let Stage 2 fix small validation errors** (e.g. add a missing
  abbreviation). Rejected: that invents content. Errors go back to redraft
  or revision.
- **One model call for the whole bundle.** Rejected: 33 patterns are too
  large for one reliable structured output, and the call cannot be resumed.
- **Treat creative approval as pattern approval.** Rejected: the look and the
  instructions are different decisions.
- **Guess the Etsy crochet category ID.** Rejected (ADR-039: never guess).

## Consequences

- `/new …` → style approval → brief → candidate patterns → validation →
  APPROVE PATTERNS → `/produce` → APPROVE PRODUCTION works with fixtures
  (tests).
- `/market` does not work for crochet until a Stage 3 crochet adapter is
  built. It must apply `crochet-integrity.mjs`.
- `/etsy` stops at `TAXONOMY_UNRESOLVED` until the owner sets a verified
  `taxonomy_id`. It would also need approved marketing first.
- AI-assisted patterns ship as owner-approved, unverified drafts. Physical
  testing, if wanted, is a separate human step recorded as evidence.
