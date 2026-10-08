# ADR-013 — LumiumX design + marketing is fully deterministic (no runtime LLM)

> **Note ([ADR-069](ADR-069-repository-cleanup.md), 2026-10-08):** the Product #001 `design:pipeline`, its DESIGN_SPEC schemas and the planner compositions were removed. The principle stands: production, rendering and QC are deterministic; OpenAI is used only in `automation/` (ADR-023, ADR-025).

Status: **Accepted** — supersedes ADR-012 (the LumiumX Creative Director / AI
design-generation layer).

## Context

ADR-012 introduced an AI "Creative Director": at product-generation time the
pipeline called an LLM (OpenAI Responses API, Anthropic as an alternative) with
~140 k characters of inlined repository context to produce `DESIGN_SPEC.json` /
`MARKETING_DESIGN_SPEC.json`. It worked technically, but:

- **The marketing output was not commercially good enough** — a large beige
  editorial page with a floating PDF mockup and explanatory copy. It read as
  "a document being explained", not "a product you want on your desk".
- **Runtime cost + non-determinism** — every product generation spent LLM
  tokens, could fail on a transient API error or a schema-shaped-but-weak
  response, and produced a different artefact each run.
- **Operational surface** — API keys, model selection, provider fallback,
  retry/backoff, structured-output machinery, a large prompt-context loader,
  and a skill/methodology doc, all only to fill in two JSON files.

## Decision

**Remove the runtime LLM entirely.** The production factory is deterministic:

```
PRODUCT SPEC
  → validate deterministic design config   (committed DESIGN_SPEC / MARKETING_DESIGN_SPEC JSON)
  → deterministic PDF / XLSX renderers      (real customer product)
  → real product page renders
  → deterministic lifestyle marketing engine (@dpf/marketing)
      real page renders  +  coded desk scene (CSS gradients + inline SVG props)
  → 6 marketing PNGs
  → automated QC (PDF 226 · workbook 81 · previews 18 · marketing visual+claims)
  → verify outputs on disk (absolute paths printed)
  → Telegram review → HUMAN APPROVAL → Etsy DRAFT
```

There is **no OpenAI/Anthropic call, no LLM call, no API key, no model
selection, no runtime prompt** anywhere in `npm run design:pipeline`.

### What changed

1. **Deleted the runtime LLM system** — `creative-director-{client,core,openai,anthropic}.ts`,
   `artifact-schema.ts`, `scripts/generate-design.ts`, the AI config block in
   `config/env.ts`, the three AI test files, the `lumiumx-creative-director`
   skill, `CREATIVE_BRIEF.schema.json` + fixtures + validator, the AI-authored
   `DESIGN_RATIONALE.md` / `DESIGN_QA.md` / `COMPARISON.md` /
   `RENDERER_COMPATIBILITY.md`, and all `OPENAI_*` / `ANTHROPIC_*` / `AI_PROVIDER`
   entries in `.env.example`.
2. **`DESIGN_SPEC.json` / `MARKETING_DESIGN_SPEC.json` are committed configuration.**
   The pipeline's first stage is now `scripts/validate-design-config.ts` — it
   only *validates* the committed JSON (`validateDesignSpec` /
   `validateMarketingDesignSpec`, unchanged). The JSON Schemas and validators
   are kept as the config contract.
3. **Redesigned `@dpf/marketing` into a deterministic lifestyle-mockup engine.**
   New `marketing/src/primitives/` (`deskScene`, `paperSheet`, `paperStack`,
   `prop`, `headlineBlock`, `chip`) and `marketing/src/compositions/` (the six
   assets). The desk is layered CSS gradients + an inline SVG grain; props
   (pencil, brass clip, ceramic mug, coins, greenery) are pure CSS / inline
   SVG; the **product shown is always a real rendered page** laid on the desk
   with a three-part shadow and a slight perspective. Minimal Spectral/Inter
   copy; factual spans still `claim()`-stamped for Marketing-Claim QC. One
   engine — the old editorial `components/index.mjs` + `css.mjs` are replaced,
   not duplicated.
4. **Pipeline / config** — `design:generate` npm script removed; added
   `design:validate`. `design:pipeline` lost its `--design generate|ondisk`
   flag. n8n workflow no longer passes a design mode or references AI env vars.

### Kept (still required, not LLM-specific)

Product specs; the deterministic PDF renderer (`products/<id>/render`); the
XLSX renderer + `@dpf/spreadsheet`; `design/brand/` tokens + design-system doc
+ anti-patterns + visual-QA rubric (human design canon); `design/references/`
(competitor analysis that informs the compositions); `DESIGN_SPEC` /
`MARKETING_DESIGN_SPEC` schemas + validators (now config contracts); Marketing-
Claim QC; Telegram review + state machine; Etsy DRAFT hand-off;
`product-paths.ts` output verification; `design-provider.ts` (the unrelated
Canva/LocalRenderer abstraction).

## Consequences

- **0 LLM calls / 0 tokens** for a normal product generation. No API key is
  needed to design or render anything. `services/test/no-runtime-llm.test.ts`
  guards against regression.
- Marketing is now art-directed in code and versioned like any other source —
  reproducible, reviewable in diff, and free to run.
- Every visual decision is a code change a human reviews; the Human Review Gate
  (Telegram APPROVE/REJECT → Etsy DRAFT) is unchanged and still mandatory.
- New products reuse the `marketing/src/primitives` + `compositions`; only the
  per-product data (which pages, which props, copy) lives in
  `products/<id>/marketing/build.mjs`.
- A future need for AI assistance would be a *build-time* tool (a human runs it,
  reviews the diff, commits), never a runtime pipeline dependency.
