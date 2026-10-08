# ADR-012 — LumiumX Creative Director: a design-intelligence layer that emits machine-readable design direction

> **SUPERSEDED by [ADR-013](ADR-013-deterministic-lumiumx-pipeline.md) (2026-09-04).**
> The runtime LLM ("Creative Director") has been removed. The design +
> marketing pipeline is now fully deterministic: `DESIGN_SPEC.json` /
> `MARKETING_DESIGN_SPEC.json` are committed configuration, and marketing is
> composed in code (`@dpf/marketing` lifestyle-mockup engine). No OpenAI /
> Anthropic call, no API key, no model selection. The history below is kept for
> context only — the OpenAI provider boundary, `artifact-schema.ts`, the
> `creative-director-*` modules, `generate-design.ts` and the
> `lumiumx-creative-director` skill described here no longer exist.

Status: Superseded (was Accepted 2026-09-03). Owner-requested, taken ahead of phase order
(same basis as ADR-007/008/009/010/011). Builds on the design skill system
(commit 7a558ef) and the LumiumX editorial-finance redesign (commit 8f0615e).

## Context

The repo already had strong design **knowledge** (`docs/LUMIUMX_ETSY_DESIGN_SYSTEM.md`,
`docs/design/*`, the `.claude/skills/*` design skills) and a prose method for
producing a per-product "DESIGN DIRECTION" (`etsy-product-design` skill). What
it did not have:

- a **machine-readable** design direction the production engines could consume
  as data (the direction lived in Markdown prose and in code);
- a **single canonical** design system — three near-identical
  "editorial-finance" palettes had accumulated (`#6F8174` sage in
  `product-spec.json`, `#B5633F` in `test/DESIGN_SYSTEM.md`, `#C4644A` in the
  LUMIUMX brand spec and the shipped `marketing/` + `spreadsheet/` code);
- a **contract** a future orchestrator (n8n) could call;
- a **pre-render** quality gate — `docs/design/VISUAL_QA.md` scores rendered
  PNGs, but nothing scored the *direction* before a render was paid for.

The production engines (`products/<id>/render`, `@dpf/spreadsheet`,
`@dpf/marketing`), the Telegram review gate and the Etsy integration all work
and must not be disturbed.

## Decision

1. **A new design-intelligence layer at `design/`**, separate from the craft
   knowledge base at `docs/design/` (which is unchanged and still
   authoritative for method and rendered-PNG QA).
   - `design/brand/LUMIUMX_DESIGN_SYSTEM.md` + `lumiumx.tokens.json` —
     the **canonical** consolidation. Resolves the palette drift onto the
     `docs/LUMIUMX_ETSY_DESIGN_SYSTEM.md` values (`#C4644A`, `#1F1F1F`,
     `#FAF7F2`, `#7E8A7B`, `#E6E1D9`, `#3A3A3A`). It consolidates and points
     to the existing prose; it does **not** fork a second system.
   - `design/brand/ANTI_PATTERNS.md` — the named failure modes.
   - `design/brand/VISUAL_QA.md` — a 12-criterion 0–10 **design-direction**
     scorecard, run before any render. Complementary to
     `docs/design/VISUAL_QA.md` (the 0–2 / 46-pt rendered-pixel gate); both
     must pass.
   - `design/references/reference-00{1,2,3}/` — curated market references
     (the three Etsy budget-planner listings named in the request), analysed
     for **category design language only**. No seller assets, wording, or
     layouts are reproduced.

2. **Versioned JSON Schemas (`design/schemas/`, JSON Schema 2020-12)** —
   `CREATIVE_BRIEF` (input), `DESIGN_SPEC` (customer product direction),
   `MARKETING_DESIGN_SPEC` (Etsy asset-set direction). They describe design
   **intent** — no HTML/CSS, no cell addresses, no renderer options (the same
   provider-agnostic rule `product-spec.ts` enforces). `DESIGN_SPEC` and
   `MARKETING_DESIGN_SPEC` share the LumiumX identity but are never the same
   design (`differs_from_product_by` must be non-empty). Both require a
   `self_critique` block.

3. **A reusable agent — `.claude/skills/lumiumx-creative-director/`** — with
   explicit instructions for the 17 steps (understand product → customer →
   references → direction → brand rules → hierarchy → type → colour → layout →
   components → product pages → marketing creative → accessibility → print →
   differentiation → structured output → self-critique). It **outputs
   specifications only** — it never renders PDF/XLSX/PNG, and it never claims
   an integration that does not exist. It is the machine-readable successor to
   the `etsy-product-design` skill's prose DESIGN DIRECTION; `spreadsheet-design`
   and `etsy-marketing-creative` are its downstream executors, `etsy-design-director`
   its enforcer, `visual-qa` its rendered-output gate.

4. **The integration boundary is the existing service tier.**
   `services/src/design/design-spec.ts` adds
   `validateCreativeBrief` / `validateDesignSpec` / `validateMarketingDesignSpec`
   (+ throwing wrappers), hand-written and dependency-free, mirroring
   `product-spec.ts`. `design/scripts/validate-design-spec.mjs` is the
   dependency-free portable/pipeline mirror. No new package, no new service,
   no framework, no dependency.

5. **Product #001 is the integration test.**
   `products/001-minimalist-monthly-budget-planner/design/` holds a full
   worked set — `CREATIVE_BRIEF.json`, `DESIGN_SPEC.json`,
   `MARKETING_DESIGN_SPEC.json`, `DESIGN_RATIONALE.md`, `DESIGN_QA.md`,
   `COMPARISON.md` — validated in the `services` test suite. It consolidates
   #001's established editorial-finance direction; it does **not** redesign
   the product and does **not** edit `product-spec.json`.

## Alternatives considered

- **Extend the `etsy-product-design` skill to emit JSON** — rejected: that
  skill's contract is the prose DESIGN DIRECTION; a machine-readable direction
  with its own schema, validator and QA gate is a distinct concern. The two
  are cross-linked, not merged.
- **Add `ajv` and validate against the JSON Schema at runtime** — rejected:
  the repo deliberately hand-rolls its validators (`product-spec.ts`,
  `spreadsheet-spec.mjs`); a new dependency for this is not warranted. The
  schema files are the human-readable authority; the validators enforce them.
- **Make the Creative Director render** — rejected outright: it is the
  intelligence layer; rendering stays with the production engines.
- **Put the direction in the DB / a new table** — rejected: no persistence
  path exists yet (`0006` migration still deferred); files under
  `products/<id>/design/` match how `product-spec.json` / `DESIGN_SPEC.md`
  already live.
- **Wire an n8n workflow now** — rejected: no workflow exists and none is in
  phase. Only the *contract* (`CREATIVE_BRIEF`) is defined.

## Consequences

- New top-level `design/` tree (brand canon, schemas, references, one script).
  New per-product `products/<id>/design/`.
- `services/src/design/` gains `design-spec.ts` (+ 12 tests in
  `services/test/design-spec.test.ts`). `services` suite: 164 → 176 tests,
  `npm run typecheck` clean. No change to any existing `services` module
  beyond an `index.ts` re-export.
- **Palette drift is documented, not yet reconciled.** `product-spec.json`'s
  `style` / `designSystem` block still carries sage `#6F8174`. Reconciling it
  to `#C4644A` is a visual change to a live product → it goes through the
  Human Review Gate, tracked in
  `design/brand/LUMIUMX_DESIGN_SYSTEM.md` → "Resolved conflicts". This branch
  does not make that change.
- **The engines partially read `DESIGN_SPEC.json` (updated Prompt 2).** The
  print renderer (`products/001-*/render/build.mjs`) now sources its **palette
  and spacing scale** from `DESIGN_SPEC.json` via a thin, fallback-safe token
  adapter (`loadDesignTokens()`); the rendered PDF is now on the canonical
  LumiumX palette, 226/226 QC unchanged. Type scale, per-page composition, the
  `@dpf/spreadsheet` theme, and the `@dpf/marketing` `listing_sequence` are
  **not** yet spec-driven — that is engine-level work for Prompt 3
  (`products/001-*/design/RENDERER_COMPATIBILITY.md`). `product-spec.json` /
  `xlsx-design-spec.json` are unchanged.
- **Marketing set is now 6 assets, rendered and inspected.** A `lifestyle`
  component was added to `@dpf/marketing` (an honest flat-lay of real page
  renders — no photo, no AI scene); `MARKETING_DESIGN_SPEC.json` is at
  v1.1.0. Marketing QC 39/39, +2 component tests (marketing suite 13 → 15).

### Prompt 3 — productionised (feat(design): productionize LumiumX creative pipeline)

- **Anthropic API integration.** `services/src/design/creative-director-client.ts`
  — raw `fetch` to `POST /v1/messages` (same "no deps" posture as the Etsy /
  Telegram clients), retry on 429/5xx, key scrubbed from every error/log. The
  system prompt = the `lumiumx-creative-director` skill + a strict one-`json`-block
  output contract. Output is never trusted: `extractArtifacts` → `validateDesignSpec`
  + `validateMarketingDesignSpec` (schema + design + anti-pattern gate) →
  only then are the four files written. `services/src/design/scripts/generate-design.ts`
  (`npm run design:generate`, `--offline` / `--dry-run`). Env var `ANTHROPIC_API_KEY`
  (name only in `.env.example`); model default `claude-opus-5`, `ANTHROPIC_MODEL`
  override. +13 tests (mock `fetchImpl`).
- **DESIGN_SPEC drives more of the renderers.** Print renderer: palette +
  spacing + typeface families. Spreadsheet: `spreadsheet/src/spec/design-spec-adapter.mjs`
  (`designSpecToSpreadsheetTheme`) → the `@dpf/spreadsheet` theme, merged under
  `xlsx-design-spec.json`. Marketing: `products/001-*/marketing/build.mjs` is
  driven by `MARKETING_DESIGN_SPEC.listing_sequence` (a `SLOT_BUILDERS` map),
  count asserted, palette from the spec. Per-page *composition* stays
  hand-authored — a documented boundary, not a gap (`RENDERER_COMPATIBILITY.md`).
- **Marketing-only seeded previews.** `products/001-*/marketing/seed-data.mjs`
  + `seeded-preview.mjs` write a realistic example month into a SEPARATE
  workbook (`storage/products/001/marketing-preview/seeded.xlsx`) — only
  `protection.locked === false` cells — and render it. The customer
  `final/*.xlsx` is verified byte-identical (hard gate). Closes the blank-`£0.00`
  marketing gap. Marketing set re-scored **8.83/10**; combined **≈ 8.87**.
- **Orchestration.** `services/src/design/scripts/pipeline.ts`
  (`npm run design:pipeline`) coordinates: design intent → render PDF → render
  XLSX + seeded previews + marketing → QC → Telegram review request. A failed
  stage aborts BEFORE the review request. `n8n/workflows/lumiumx-product-pipeline.json`
  calls this one script via an Execute Command node — n8n coordinates, it does
  not design or render. Secrets are read by name from the n8n process env.
- **Telegram + Etsy unchanged.** The existing review state machine, bot, and
  `createDraftFromListingSpec` are reused as-is. `listing.json.images` now
  points at the 6 composed marketing PNGs (ranked, alt text); `files` stays the
  two blank customer PDFs. `telegram:review-demo --approve/--reject` exercised:
  APPROVE → fake draft (never publishes), REJECT → no draft.
- **`product-spec.json` reconciled.** Its stale `style` / `designSystem` blocks
  (sage `#6F8174`, Inter-only, `#1A1A1A`) now carry the canonical LumiumX
  tokens, pointing at `design/DESIGN_SPEC.json` as authoritative. No functional
  print parameter changed; 226/226 QC re-run green.
- **Security.** A real-looking `TELEGRAM_BOT_TOKEN` value was found committed in
  `.env.example` (violates the repo's own "names only" rule) — removed. No
  Anthropic key is committed; `.env` stays git-ignored.
- The print PDF pipeline (226-check QC), `@dpf/spreadsheet`, `@dpf/marketing`,
  the Telegram flow and the Etsy integration are untouched and still pass.
- No n8n workflow, no Anthropic-API call, and no automatic hand-off are
  introduced or implied.

### Provider swap — OpenAI is now the default (feat(design): switch creative director to OpenAI)

- **Why.** The project has OpenAI API credits, not Anthropic. This is a
  provider swap, not an architecture change: the contracts, schemas,
  validators, renderers, QC, Telegram approval and Etsy safety gates are all
  unchanged.
- **Provider boundary.** `creative-director-client.ts` is now provider-neutral:
  it builds the prompts, extracts the one `json` block and runs
  `validateDesignSpec` + `validateMarketingDesignSpec` identically regardless
  of provider. The HTTP call sits behind a small `CreativeDirectorProvider`
  interface (`creative-director-core.ts`) with two raw-`fetch` implementations —
  `creative-director-openai.ts` (OpenAI **Responses API**, `POST /v1/responses`,
  `Authorization: Bearer`) and `creative-director-anthropic.ts` (the previous
  Messages API client, moved). No SDK, no plugin framework.
- **Selection.** `AI_PROVIDER` = `openai` (default) | `anthropic`;
  `loadCreativeDirectorConfig()` rejects any other value. Keys:
  `OPENAI_API_KEY` / `OPENAI_MODEL` (default `gpt-5`) / `OPENAI_API_BASE_URL`;
  the `ANTHROPIC_*` vars still select the alternative. Names only in
  `.env.example`; the selected provider's key is scrubbed from every error/log.
- **Validation is unchanged and still blocking.** OpenAI response → extract
  candidate JSON → `DESIGN_SPEC` → `MARKETING_DESIGN_SPEC` → anti-pattern gate →
  only then write. A malformed/invalid response exits non-zero and writes
  nothing; the pipeline aborts before render/review. Transient 429/5xx/transport
  errors retry with the same backoff as before; validation failures never retry.
- **`--dry-run` / `--offline` preserved.** `--dry-run` still builds the prompts
  and prints provider + model + sizes with no API call and no write; `--offline`
  still re-validates the on-disk artefacts through the same gate with no key.
- **Tests.** +`creative-director-openai.test.ts` (request construction, valid
  response, malformed response, invalid `DESIGN_SPEC`, invalid
  `MARKETING_DESIGN_SPEC`, missing key, 429/5xx retry, refusal, truncation) and
  provider-selection tests in `creative-director.test.ts`. Full services suite
  green (210); spreadsheet 34; marketing 15. Pipeline re-run in `ondisk` mode:
  PDF QC 226/226, workbook 81/81, preview 18/18, marketing 15/15 claims,
  `AWAITING_REVIEW`, nothing published.

### Structured OpenAI output (fix(design): enforce structured OpenAI creative output)

- **Why.** The first live OpenAI run returned a differently-shaped, incomplete
  object — 35 validator/contract failures (missing `metadata.design_version`,
  `brand.mood`, `typography.hierarchy`, `layout.margins`, empty `components`,
  malformed `listing_sequence`, no hero, …). Free-text "return JSON" plus a
  prose contract was not enough; the real schemas were never even in the prompt.
- **Fix, three parts, no weakening of validation:**
  1. **Strict structured output.** `artifact-schema.ts` holds
     `ARTIFACT_JSON_SCHEMA` — the four-key envelope in the strict subset the
     OpenAI Responses API `text.format: { type: "json_schema", strict: true }`
     accepts (every object closed + every property required; no `oneOf` / `$ref`
     / `propertyNames`). It is a **derived, mechanically-aligned** view of
     `design/schemas/*.schema.json` + the hand validators — not a competing
     contract. `createOpenAiProvider` sends it on every call (disable with
     `structuredOutput: false`). `artifact-schema.test.ts` is the drift guard:
     it proves the schema is strict-compatible, is a subset of the real
     contracts (every real `required` ⊆ the structured `required`; keys ⊆ the
     real closed objects), pins the enums to `LISTING_SLOTS` / `ACCENT_FAMILIES`,
     and shows the committed known-good specs still satisfy it (not
     over-constrained).
  2. **Explicit contract in the prompt.** `buildSystemPrompt` now spells out
     every required field of both specs plus the LumiumX creative direction;
     `generate-design.ts` inlines `design/schemas/DESIGN_SPEC.schema.json` and
     `MARKETING_DESIGN_SPEC.schema.json` verbatim as inputs. `buildUserPrompt`
     takes a `GenerationContext` so the runner pins `created_by.model` / `.date`
     instead of the model guessing.
  3. **Truncation is fatal.** `generateDesign` rejects a response whose stop
     reason is `max_output_tokens` / `length` / `incomplete` / `content_filter`
     (stage `empty`) so a cut-off JSON never reaches the validators. CLI output
     budget raised to 50 000 tokens.
- **The authoritative validators (`validateDesignSpec` / `validateMarketingDesignSpec`)
  and `design/schemas/*.schema.json` are unchanged.** No repair/patch layer —
  an invalid response still stops the pipeline and writes nothing.
- **Result.** Live `gpt-5` generation for Product #001 now returns a
  `DESIGN_SPEC` + `MARKETING_DESIGN_SPEC` that pass both the TS validators and
  the standalone `validate-design-spec.mjs` schema check with zero issues; the
  committed `products/001-*/design/*` are that generated output. `--design generate`
  drove the full pipeline: PDF A4+Letter, XLSX, 6 marketing PNGs, QC 226 / 81 /
  18 / 15, `AWAITING_REVIEW`, nothing published. Tests: services 225,
  spreadsheet 34, marketing 15.

### Generated previews are discoverable (fix(pipeline): make generated previews discoverable)

- **Why.** After a green run there was nothing obvious to inspect: the files
  *do* exist (always at `<repoRoot>/storage/products/<id>/…`, resolved from
  `import.meta.dirname` in every renderer / QC / Telegram script — never
  `process.cwd()`), but `storage/**` is git-ignored and the pipeline only
  printed relative-looking paths.
- **Fix (output/UX only — no architecture, provider, schema, design-system,
  Telegram-semantics or Etsy change).**
  - `services/src/design/product-paths.ts` — one canonical resolver
    (`REPO_ROOT`, `productStorageDir`, `productSlug`) plus `expectedOutputs()`
    (the 2 PDFs + customer XLSX + 6 named marketing PNGs + 8 workbook previews +
    8 seeded previews + seeded workbook, as absolute paths), `verifyOutputs()`
    and `formatOutputsBlock()`.
  - `pipeline.ts` gains stage **6 "Verify outputs on disk"** between QC and the
    Telegram hand-off: it prints `=== OUTPUTS ===` with every absolute path and
    **aborts (exit 1, no Telegram, no Etsy) if any expected file is missing or
    zero-byte**. Telegram becomes stage 7 and only runs on a clean verify.
  - New `npm run design:preview -- --product 001` (`design/scripts/preview.ts`):
    verify + print the absolute paths; `--open` opens the marketing dir via the
    host file manager; `--paths-only` prints the canonical dirs with no checks.
- **Confirmed:** identical resolution from `services/`, the repo root and an
  unrelated CWD; a removed marketing PNG aborts the pipeline before the review;
  Telegram (without `--console`) still receives the same PNG package from the
  same canonical directory. +`product-paths.test.ts` (11). Tests: services 237,
  spreadsheet 34, marketing 15.
