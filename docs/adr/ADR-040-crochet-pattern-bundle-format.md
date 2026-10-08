# ADR-040: Crochet pattern bundle format (definition, source contract, validation)

- **Status:** Accepted (owner request, 2026-09-29). Architecture, schemas,
  registration and validation only. **Amended by ADR-041** (same day): the
  format is now enabled in Stage 1 and Stage 2, `ai-assisted-draft` is an
  accepted origin, and the "Not enabled yet" section below is historical.
- **Relates to:** ADR-023 (Stage 1), ADR-024/028/030 (Stage 2 adapters,
  full-book gate), ADR-036 (SEO Telegram intake), ADR-038 (delivery files).

## Context

The owner wants a new digital product format: downloadable **crochet pattern
bundles** (for example, 33 crochet flower patterns for bouquets). Unlike cards
and colouring books, the core of this product is **functional text**:
materials, hook sizes, abbreviations, and round-by-round instructions that a
customer follows. Instructions that are wrong or invented produce an item
that does not work.

The pipeline has no alias resolution for formats today. Stage 1 lists its
formats in `PAGE_RULES` and the concepts schema enum, which is sent to
OpenAI. Stage 2 and Stage 3 register adapters in frozen registries whose
contract tests need real build functions.

## Decision

- **Canonical id `crochet-pattern-bundle`.**
  - `automation/src/orchestrator/formats.mjs` holds `CANONICAL_FORMATS` (the
    Stage 1 formats plus this one), `FORMAT_ALIASES` and
    `resolveFormat(text)`.
  - `resolveFormat` returns the canonical id or `null`. It never guesses:
    "crochet" alone or "knitting pattern" resolve to `null`.
  - Aliases: crochet pattern, crochet-pattern, crochet bundle, crochet
    pattern bundle, crochet flower pattern, crochet flower bouquet pattern.
    Case, `-`/`_`/spacing and a plural `-s` are normalised.
  - `formatSupport(f)` reports `{known, stage1, stage2}`.
- **Source contract.** The approved pattern content is a file,
  `products/<id>/crochet/patterns.json` (`PATTERN_SOURCE`).
  - Shape: `production/schemas/crochet-pattern-bundle.schema.json`.
  - Bundle fields: `title`, `theme`, `audience[]`, `skill_level[]`,
    `delivery[]`, `style[]`, `pattern_count`, `terminology` (US|UK),
    `provenance {author, origin}`, an optional shared `abbreviations`
    glossary, and `patterns[]`.
  - Pattern fields: `pattern_id`, `name`, `category`, `difficulty`,
    `finished_size`, `yarn[]`, `yarn_weight` (Craft Yarn Council 0–7),
    `hook_size {mm, us}`, `additional_materials[]`, `stitches_used[]`,
    `abbreviations`, `gauge`, `instructions[{heading, steps[{label, text,
    stitch_count}]}]`, `assembly[]`, `finishing[]`, `notes[]` and `testing`.
- **Validation** (`production/src/crochet/bundle.mjs`, pure).
  `assertCrochetBundle` throws a non-retryable `HandoffError` that names every
  problem. It never repairs, completes or fills anything. It rejects:
  - unknown fields, and a wrong `schema_version` or `format`;
  - `pattern_count` not equal to the number of patterns supplied;
  - a duplicate `pattern_id`, or a duplicate name (ignoring case and spacing);
  - missing yarn, yarn weight or additional materials;
  - a missing `hook_size`, unless the pattern explicitly sets
    `requires_hook: false`;
  - `terminology` not declared, or a stitch that exists only in the other
    terminology (US `sc`/`hdc` in a UK bundle, UK `htr` in a US bundle);
  - a listed stitch, or a standard abbreviation used in the instruction text,
    that is not defined in the pattern's or the bundle's glossary;
  - empty instructions or steps, or placeholder text (TODO, TBD,
    `...`, lorem ipsum, or an editorial bracket such as `[insert instructions
    here]`; a bracketed stitch sequence such as `[sc in next st, inc] rep 6
    times` is crochet notation, ADR-050);
  - missing assembly, when more than one piece is made or
    `assembly_required` is true (pieces, not instruction sections: ADR-051);
  - missing finishing;
  - a difficulty outside the bundle's `skill_level`;
  - `testing.status: "tested"` without `tested_by`, `tested_on` and
    `evidence`;
  - "tested" wording in the title or a pattern name, unless every pattern has
    that evidence. If `testing` is absent, the pattern is untested.
- **Deliverable model** (`production/src/crochet/deliverables.mjs`).
  `crochetDeliverablePlan` validates the bundle, then declares the files. It
  renders nothing. The declared files are:
  - the START-HERE printing and crochet guide;
  - per paper (A4 and US Letter): the complete bundle PDF, the pattern index,
    the materials and abbreviations reference, and one PDF per pattern;
  - one ZIP per paper size (Stage 4 re-plans delivery files, ADR-038);
  - previews of real outputs, for review and marketing.

  Paths follow the adapter contract's safe-name rule.
- **Not enabled yet:**
  - Stage 1: the format is not in `PAGE_RULES`, the concepts enum or the
    creative-director prompt, so OpenAI cannot propose it.
  - Stage 2: it is not in `ADAPTERS`. `/produce` refuses it with the existing
    "No Stage 2 production adapter" error.
  - Stage 3 and Stage 4: unchanged.

  Each is enabled in a later change, with the owner's approval flow.
- **SEO compatibility** (`seo/`, no production import):
  - `FORMAT_FAMILIES` gains `['crochet pattern','crochet pattern bundle']`.
  - `profileFromIdea` (ADR-036) keeps its themes > formats > audiences >
    attributes word ownership. When that would drop **every** format (themes
    "crochet flowers" and format "crochet pattern bundle" share "crochet"),
    formats claim their words first. Ideas that already kept a format are
    unaffected. Before this change, such ideas failed intake.
  - The example configuration is a fixture
    (`seo/fixtures/ideas/crochet-flower-pattern-bundle.json`), not a global
    default. It has format "crochet pattern bundle", 10 floral themes, 4
    audiences, digital and printable delivery, 5 styles and `item_count` 33.

## Alternatives considered

- **Register a Stage 2 adapter now with stub builders.** Rejected. The
  contract test requires real `plan`/`build`, and a stub would look producible.
- **Add the format to the Stage 1 enum now.** Rejected. It changes the schema
  and prompt sent to OpenAI for every product, and Stage 1 has no step yet
  that approves pattern text. OpenAI would be the only possible author, and
  that is exactly the invention this ADR forbids.
- **Validate with the JSON Schema only.** Rejected. Count, uniqueness,
  abbreviation, terminology and evidence rules are semantic. The schema
  documents the shape, and a test keeps its required lists equal to the
  validator's.
- **Put the alias table in `seo/`.** Rejected. SEO must not become the owner
  of production formats (ADR-031). SEO keeps free-text formats and families.

## Consequences

- The format is defined, validated and testable. There is no path yet that
  makes a crochet product.
- **Open decision for the next change: who authors the patterns.** The
  contract requires `provenance.author` and an origin of owner-authored,
  commissioned or licensed. Model-written instructions are not an accepted
  origin. Allowing them would need an explicit owner decision and a testing
  policy.
- Listing and marketing copy must not say "tested" unless `isTested` holds
  for every pattern.
- AI-generated "photos" of finished crochet items would misrepresent what the
  customer can make. The marketing adapter needs its own rule for this.
- The Etsy category for crochet patterns (ADR-039) is not mapped yet.
