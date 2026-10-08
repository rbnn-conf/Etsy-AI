# Handover — repository state as of 2026-09-16

Written for an AI coding agent (Codex or similar) doing a first-pass
analysis of this repository after a fresh `git pull`. This is a factual
state summary, not a design pitch — read `CLAUDE.md` first for the
project's operating rules, then this file for what actually exists right
now, then the pointers below for depth.

## One-paragraph summary

This repo is a Digital Product Factory: infrastructure (Postgres, n8n,
Etsy API integration, a Telegram human-review gate) plus per-product
generation code under `products/<id>/`. **Product #006 (Minimalist Budget &
Goals Planner) is the only product in the repository as of this commit.**
Two earlier products — #001 (Minimalist Monthly Budget Planner) and #005
(LumiumX Smart Budget Dashboard) — were built, then removed outright by
owner decision on 2026-09-15/16 (both design directions were judged
failures; #006's direction was chosen as the standard instead). This
handover exists because that removal touched more than just two
`products/<id>/` directories — some genuinely shared infrastructure had
product-#001-specific logic embedded in it, and that had to be untangled
too. Read the "What was removed, and why the cleanup went deeper than two
directories" section below before assuming any file that mentions "#001" or
"#005" is either fully current or fully dead — check the specific note for
that file.

## What exists now

- **`products/006-minimalist-budget-and-goals-planner/`** — the only
  product. Excel-only (`primaryExport.type: "xlsx"`), GBP-hard. Start here:
  `PRODUCT_SPEC.md`, `product-spec.json`, `xlsx-design-spec.json`, then
  `xlsx/build.mjs` (the actual generator). Status: TEST/REVIEW — not
  approved by the owner yet, nothing drafted or published on Etsy.
  - `docs/adr/ADR-020-product-006-sage-green-excel-adaptation.md`,
    `ADR-021-product-006-near-exact-reference-recreation.md`,
    `ADR-022-product-006-lumiumx-house-register.md` — its full decision
    history, v1 through v5 (see "Revision history" in `PRODUCT_SPEC.md` for
    the short version).
  - Build/QC/preview: `cd products/006-*/xlsx && node cli.mjs` (blank
    workbook) and `node example.mjs` (seeded example + previews). Last known
    good run: 52/52 workbook QC (including a full LibreOffice recalculation
    scenario), 11/11 preview checks, 3 native chart parts.
  - Telegram review: `cd services && npm run telegram:submit-006-review`.
- **`spreadsheet/`** (`@dpf/spreadsheet`) — the shared, reusable functional-XLSX
  engine (ExcelJS wrapper + design-system components + native Excel chart
  injection via raw OOXML, since ExcelJS can't write charts). Used by #006.
  39/39 tests passing. This is real, live, generic infrastructure — nothing
  about it is product-#001-specific.
- **`services/`** (`@dpf/services`) — Etsy API integration, `DesignProvider`/
  `ProductSpec` contracts, the Telegram review-gate state machine
  (`services/src/review/`, `services/src/telegram/`). Generic. 170/170 tests
  passing, clean `tsc --noEmit`. Product #006 does **not** use this tier's
  full review/Etsy-draft assembler (`assembleSubmission`,
  `expectedOutputs()`) — it has its own small one-off Telegram script
  (`services/src/telegram/scripts/submit-product-006-review.ts`) because its
  shape (one XLSX, no print PDF, no Etsy listing yet) doesn't fit that
  assembler. That assembler currently has **no consumer** — it's real,
  tested, working code, just currently unexercised by any product on disk.
- **`marketing/`** (`@dpf/marketing`) — a deterministic (no LLM)
  HTML/CSS→Playwright→PNG composition engine for Etsy listing images. Also
  currently has **no consumer** (see below — its main composition set was
  built specifically for #001's card design). Not used by #006.
- Core foundation (Docker Compose, Postgres, n8n, the Notion docs plan) is
  unaffected by any of this and is unchanged.

## What was removed, and why the cleanup went deeper than two directories

The owner asked to delete Product #001 and Product #005 entirely (source +
generated `storage/` output + product-specific ADRs/scripts) and keep only
#006. Investigating the removal surfaced that **`services/`'s "generic"
review/telegram tier had real, functional, #001-specific code living inside
it**, not just #001 as an illustrative example in comments:

- `services/src/review/product-001-preview-selection.ts` and
  `product-001-submission.ts` — hardcoded to #001's exact 13-page/5-theme
  structure, imported and re-exported from `services/src/review/index.ts`,
  and conditionally invoked from the generic `submit-for-review.ts` and
  `review-demo.ts` scripts (`productId === "001" ? ... : null`). **Deleted**,
  along with the conditional branches in the two scripts and the exports in
  `index.ts`. `docs/adr/ADR-017-telegram-review-v2-integration.md`
  (which specified this exact mechanism) was deleted with it.
- `services/src/design/product-paths.ts` — had `PRODUCT_001_THEMES`,
  `PRODUCT_001_DEFAULT_THEME`, `PRODUCT_001_SIZES`, and a
  `product001V2Outputs()` function feeding a `productId === "001"` branch
  inside the otherwise-generic `expectedOutputs()`. **Removed** (the branch
  and the constants); `expectedOutputs()`/`verifyOutputs()`/
  `formatOutputsBlock()` remain as generic, reusable, but currently
  unexercised infra.
- Test files that actually **read real files from `products/001-…/`**
  on disk (not just used `"001"` as an arbitrary mock ID) were deleted:
  `services/test/product-001-preview-selection.test.ts`,
  `product-paths.test.ts` (also dynamically imported the now-deleted
  `products/001-…/render/build.mjs`), `design-spec.test.ts`,
  `product-spec-fixture.test.ts`.
- Test files that use `"001"`/`"storage/products/001"` purely as an
  **arbitrary mock fixture ID** (writing to their own temp directories, not
  reading the real repo) were **left alone** — they still pass:
  `etsy-create-draft.test.ts`, `telegram-notifier.test.ts`,
  `telegram-callback-dispatcher.test.ts`, `review-service.test.ts`,
  `assemble-submission.test.ts`, `telegram-messages.test.ts`. The string
  `"001"` in these is just a stand-in; nothing depends on the real product.
- ADRs deleted: 014 (product-001-v2-rebuild), 015 (product-001-theme-system),
  016 (product-001-interactive-pdf), 017 (see above), 018
  (product-001-visual-reset), 019 (product-001-marketing-reset). ADRs
  007–013 and 020–022 are untouched — they describe genuinely generic
  infrastructure or #006 itself.
- `products/001-minimalist-monthly-budget-planner/` (tracked, 61 files) and
  `products/005-lumiumx-smart-budget-dashboard/` (untracked — **#005 had
  never been committed to git**, so this removal is permanent with no git
  history to recover it from) were deleted in full, along with their
  `storage/products/{001,005}/` generated output (gitignored, local-only,
  irrelevant to git history either way).
- `services/src/telegram/scripts/submit-product-005-review.ts` (untracked)
  and its `package.json` script entry were removed.

**Verified after cleanup**: `services` — `npm run typecheck` clean,
`npm test` 170/170. `spreadsheet` — `npm test` 39/39. `products/006-*/xlsx`
— `node cli.mjs` 52/52 workbook QC, 11/11 preview checks.

## Known stale documentation (not fixed — read with this in mind)

A deliberate scope boundary: many docs use Product #001 as a **worked
example** to explain otherwise-generic mechanics, without any functional
code dependency on it. Rewriting all of these was judged out of scope for
this pass (large surface, no functional risk, purely illustrative). Treat
any `products/001-…`/`Product #001` mention in the files below as
historical/illustrative, not current state:

- `ARCHITECTURE.md` (the `products/001-…/` code-block example under
  "Per-product generation pipelines")
- `docs/XLSX_PIPELINE.md`, `docs/TELEGRAM_REVIEW.md`, `docs/PRODUCT_MODEL.md`,
  `docs/DESIGN_PROVIDER.md` — all use #001 as their running example
- `docs/design/*.md` (`SPREADSHEET_UX.md`, `COLOUR.md`, `DESIGN_PRINCIPLES.md`,
  `TYPOGRAPHY.md`, `ETSY_PRODUCT_DESIGN.md`, `examples/EXAMPLES.md`) and
  `design/` (brand tokens, schemas) — #001 appears as a worked example in
  the shared design knowledge base
- `.claude/skills/colour-system/SKILL.md`,
  `.claude/skills/design-review/SKILL.md` (+ its `references/workflow.md`)
  — not yet swept (two skills that ARE actively loaded per `CLAUDE.md`'s
  "Design standard" section, `spreadsheet-design` and `typography`, WERE
  swept — their `products/001-…` pointers now point at #006/ADR-022 or are
  marked historical)
- `services/README.md` (usage examples like `--product 001`),
  `services/src/etsy/scripts/create-draft-listing.ts` (docstring example
  path), `services/src/design/providers/local-renderer-provider.ts`
  (a comment reference to `products/001-…/test/`)
- `marketing/src/index.mjs`, `marketing/src/compositions/planner.mjs`,
  `marketing/src/planner-metadata.mjs`,
  `marketing/src/design-system/planner-{css,icons}.mjs` — **this is the
  deeper one**: `@dpf/marketing`'s "planner" composition set (its main/only
  fleshed-out composition type) was built specifically to match Product
  #001's v3.0 card-based visual system (ADR-018/019). It is not literally
  broken (no dangling imports — it doesn't read files from
  `products/001-…/` at runtime, it's self-contained composition code), but
  it is now **orphaned**: no product on disk generates the metadata this
  composition expects. If a future product wants Etsy marketing PNGs, audit
  whether this composition is reusable as-is or needs its own reskin/rebuild
  first — don't assume it's product-agnostic just because `marketing/` is a
  shared top-level package.
- Old ADRs (007–013, plus 020–021 for #006's own earlier revisions) were
  **not edited** even where they mention #001 — they're a historical record
  of decisions made at the time and shouldn't be revised after the fact.

## Suggested reading order for a first analysis pass

1. `CLAUDE.md` — operating rules, current phase, and the paragraph
   documenting this exact removal.
2. This file.
3. `ROADMAP.md` — phase-by-phase status, now reflecting #006 as the current
   product (the former "Product #001 end-to-end" and "Product #005"
   sections were replaced/removed).
4. `products/006-minimalist-budget-and-goals-planner/PRODUCT_SPEC.md` +
   `docs/adr/ADR-022-product-006-lumiumx-house-register.md` for the current
   product in depth.
5. `docs/XLSX_PIPELINE.md` for the generic engine mechanics (treating its
   #001 examples as illustrative per the section above).

## What this handover does NOT cover

- Etsy OAuth / draft-creation status — unchanged by this cleanup, see
  `services/README.md` and `ROADMAP.md`'s Phase 5.
- Any opinion on whether #006's v5 design (LumiumX house register) will be
  approved — it's in TEST/REVIEW, sent to Telegram, awaiting the owner.
- A plan for what a 7th product should look like — none exists yet.
