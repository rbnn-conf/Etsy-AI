# Roadmap

Phases are built strictly in order. Nothing in a later phase is
implemented while an earlier phase is incomplete, and nothing here is
built ahead of the phase currently in progress — see `CLAUDE.md`.

## Current state (2026-10-08)

The owner-requested Telegram factory (Stages 1-4, ADR-023 onwards) now
delivers what Phases 2-5 below describe: deterministic PDF production and QC,
listing images and copy, multi-file delivery ZIPs, and a verified Etsy draft
with an explicit publish gate, plus the SEO / Discovery engine (ADR-031+).
The Phase 0 Docker / PostgreSQL / n8n foundation, the `services/`
design/review tiers and the Product #001 pipeline were never part of that
system and were retired in ADR-069. The sections below are kept as the
project's history.

## Phase 0 — Foundation ✅ (infrastructure retired in ADR-069)

- [x] Repository structure
- [x] Docker Compose (PostgreSQL + n8n)
- [x] PostgreSQL infrastructure + migration mechanism
- [x] n8n stood up, workflow export/versioning convention documented
- [x] Documentation set (README, ARCHITECTURE, SECURITY, DEVELOPMENT,
      OPERATIONS, ROADMAP, CLAUDE.md, ADRs)
- [x] Security baseline (`.gitignore`, `.env.example`, secrets
      architecture, Docker hardening)
- [x] Notion documentation structure + connection plan (`docs/archive/NOTION_SETUP.md`)

## Foundation taken ahead of order — Etsy API + DesignProvider (ADR-007)

Built after Phase 0, at the owner's explicit request, once the Etsy API
application was approved. This is integration *scaffolding*, not the
full pipeline — it does not complete Phase 1, 2, or 5.

- [x] `services/` TypeScript/Node tier established (ADR-007)
- [x] Etsy integration layer: OAuth2 + PKCE, token store, resilient HTTP
      client, error taxonomy, connectivity reads (`ping`, `users/me`,
      `getShop`). Listing CRUD / uploads / taxonomy are interface-only
      and throw until the Etsy publishing phase.
- [x] `DesignProvider` interface + `ProductSpec` contract + validator
      (renderer/provider-agnostic)
- [x] `LocalRendererProvider` (metadata only — does not touch the
      existing `products/<id>/test/` renderer)
- [x] Generated-product storage layout (`storage/products/{id}/…`)
- [ ] `CanvaDesignProvider` — **BLOCKED**: Canva API approval pending.
      Boundary object only; reports itself unavailable.
- [ ] Wire `LocalRendererProvider.generate()` to the real renderer —
      later phase, must not redesign it.

## Phase 1 — Product Specification

- [x] Product schema — migrations `0002`–`0005` (`products`,
      `product_versions`, `design_specs`, `pages`), ADR-008
- [x] `ProductSpec` contract formalised + validated
      (`services/src/design/product-spec.ts`) — provider/renderer agnostic
- [x] `ProductRepository` persistence boundary (validate → persist) over a
      `SqlExecutor` port; pure `ProductSpecMapper`
- [x] Design specification format — carried as `ProductSpec.designSystem`
      (opaque) + `design_specs` table; `DESIGN_SPEC.md` YAML slots in
- [x] Versioning strategy — `product_versions`, one row per `specVersion`
- [x] Real example: `products/006-…/product-spec.json` (validated)
- [ ] Product templates (in `templates/`) — still deferred; needs a
      DesignProvider that actually renders (Phase 2)
- [ ] Concrete `SqlExecutor` adapter + automated DB integration tests —
      deferred until a worker/pipeline persists specs

## First real product — Product #001 (removed 2026-09-15)

Built to prove the complete business loop before expanding the platform:
8-page print PDF (A4 + US Letter), Etsy listing copy, the Telegram
human-review gate, and a functional XLSX secondary artifact. **Product #001
was removed from the repository on 2026-09-15** — an owner decision, after
Product #006 was chosen as the standard design direction instead — see
`CLAUDE.md` and `docs/adr/` (ADR-014 through ADR-019, also removed with it).
The Telegram review-gate infrastructure it exercised (ADR-009,
`docs/archive/TELEGRAM_REVIEW.md`, `services/src/review/`, `services/src/telegram/`)
remains as generic, reusable infra with no current product using its full
print+marketing shape.

## XLSX / functional-spreadsheet engine (out of phase order, ADR-010)

Built at the owner's request so functional Excel workbooks are a
first-class export, without disturbing Etsy or the Telegram flow.

- [x] `@dpf/spreadsheet` (`spreadsheet/`) — reusable engine (ExcelJS
      wrapper), "Etsy Spreadsheet Design System v1", LibreOffice+pdftoppm
      PNG preview of the real file, workbook QC + `recalcWorkbook()`
      scenario checks, `SpreadsheetDesignSpec` contract, native Excel chart
      injection (`native-charts.mjs` — bar/pie/doughnut, ADR-021/022). 39
      tests.
- [x] `ProductSpec` gains optional `primaryExport` (`pdf`/`xlsx`/`hybrid`)
      + opaque `spreadsheet`; `validateProductSpec` enforces the
      `xlsx`-in-`exportFormats` rule. No DB migration yet (persistence
      path still deferred — a `0006` migration adds the columns then).
- [x] `@dpf/marketing` (`marketing/`, ADR-011) — a deterministic
      lifestyle-mockup composition engine (HTML/CSS → Playwright/Chromium
      → 2000×2000 Etsy listing PNGs). Currently has no consumer (Product
      #001, which used it, was removed) but remains as reusable,
      product-agnostic infra.
- [ ] DB migration `0006` for `primaryExport` / `spreadsheet`, when specs
      are actually persisted.

## Product #006 — Minimalist Budget & Goals Planner (out of phase order)

The current live product on the XLSX engine above. TEST/REVIEW status —
not yet approved, nothing drafted or published on Etsy.

- [x] `products/006-minimalist-budget-and-goals-planner/` — Excel-only
      (`primaryExport.type: "xlsx"`), GBP hard, a Transactions-List-driven
      budget dashboard + a Goal Tracker sheet.
- [x] v4 (ADR-021, 2026-09-14): near-exact recreation of a third-party
      reference workbook's own structure/functionality — category lists,
      SUMIF-driven Actuals off one Transactions List, a non-CSE ranking
      engine, native Excel charts (bar + pies + a doughnut).
- [x] v5 (ADR-022, 2026-09-15): reskinned to the LumiumX house register
      (the same warm-ivory/terracotta/sage palette and card language as the
      former Product #001) — KPI band, a Cash Flow bar + Where My Money
      Went doughnut (with a live centre total), Available to Spend, a
      3-across × 2-row table grid, Transactions List. Structure/formulas
      unchanged from v4.
- [x] Workbook QC 52/52 (incl. a full LibreOffice recalculation scenario).
- [ ] Human visual sign-off (sent to Telegram for review).
- [ ] Etsy listing work — explicitly out of scope until approved.

## Automation Stage 1 — creative orchestrator (out of phase order, ADR-023)

- [x] `automation/`: Telegram request → reference analysis → 3 concepts →
      `product.json` spec → 3 proofs → owner approval; explicit persisted
      state machine, locking, retry, restart recovery; 20 offline tests.
- [ ] Live run with a second bot token and OpenAI credentials (owner).
      First live run (Product #009, "christmas greetings card") failed at
      ideation: every product needed 5+ pages. Fixed 2026-09-27 with page
      counts that depend on the product format (cards 1–4, books 10+), plus
      `deliverable_components` (see `automation/docs/STAGE_1_README.md`).
- [x] Visual concept selection (owner request, 2026-09-27): one preview image
      per concept before choosing A/B/C; new states CONCEPT_PREVIEWS_GENERATING
      and AWAITING_CONCEPT_SELECTION; resumable, batch-limited (ADR-023 amendment).
- [x] Concept diversity (2026-09-27): style-only creative direction, per-concept
      `visual_route`, deterministic diversity gate before preview spend,
      leak guard, one-time rebuild of legacy directions (ADR-023 amendment).
- [x] Stage 2 deterministic production (ADR-024): `production/` package, handoff,
      greeting-card adapter (A4 / US Letter folded card, 4x6 in panels, originals,
      guide, one ZIP), QC, `/produce` + Telegram production review.
- [x] Greeting-card variants (assets vs roles, owner `production-plan.json`, minimal back).
- [ ] Product #009 production run and owner approval (owner action: `/produce 009`; two designs, option B).
- [x] Stage 3 listing + marketing (ADR-025): `/market`, facts-only claims, real-artwork
      images, QC, scoped regeneration, full OpenAI attempt accounting.
- [ ] Product #009 marketing run and owner approval (owner action: `/market 009`).
- [x] Stage 4 Etsy draft + explicit publish (ADR-026): `/etsy`, deterministic payload and customer ZIP,
      journalled idempotent uploads, remote verification, gated two-step publish. Dry run by default.
- [x] Telegram control panel + OpenAI cost ledger (ADR-027): /start menus, state-aware product screens,
      confirmations, estimated API cost per product/model/period, factory status. Publishing stays manual on Etsy.
- [x] Colouring-book Stage 2 adapter (ADR-028): ordered book, A4 / US Letter PDFs, pixel-identical PNG
      pages, guide, Etsy-sized ZIP parts, book QC + contact sheet, Stage 3 metadata, adapter contract tests.
- [x] Stage 1 full-book artwork for colouring books (ADR-030): authoritative page manifest, reuse of matching style
      proofs, page-by-page resumable paid generation (confirmed, costed), deterministic creative QC, contact-sheet review,
      per-page regenerate / change direction, APPROVE FULL BOOK; Stage 2 accepts a colouring book only after it.
- [ ] Product #012 full book (owner action: 🎨 Generate Remaining 21 Pages, ≈21 image calls; then review and approve).
- [x] SEO / Discovery Engine v1 foundation (ADR-031, `seo/`, branch feature/seo-discovery-engine): manual Etsy Marketplace
      Insights observations (strict, versioned, null-for-unknown), product ideas, evidence-only SEO brief contract, existing-listing
      snapshots + market comparison. No scoring, no network, loosely coupled to the Production Engine.
- [x] SEO Opportunity Engine v1 (ADR-032, `seo/`): transparent LumiumX internal opportunity score (not the Etsy algorithm), relevance
      classes, keyword roles, close competition, confidence, listing recommendations, owner approval states, SEO → Production handoff document.
- [x] SEO Research Planner (ADR-033, `seo/src/planner.mjs`): structured idea intake, completeness, P1/P2/P3 Marketplace Insights research
      plans (a generated query is not evidence of demand), related-term capture (discovered, not researched), existing-listing research gaps.
- [x] SEO Research Expansion + Clustering (ADR-034): term lifecycle, relevance-gated expansion rounds with a 40/3/10 budget, readiness
      rules, buyer-intent clusters, captured-only evidence package into the unchanged Opportunity Engine (discovery is not evidence).
- [x] SEO owner action FINISH_WITH_CURRENT_EVIDENCE (ADR-035): stop expansion and score with captured evidence; unresearched terms
      stay unknown (owner_stopped). Real Cozy Autumn cycle kept as a regression fixture.
- [x] Telegram SEO owner interface (ADR-036, `automation/src/seo/`): audit, new-product research, step-by-step Marketplace Insights
      capture, Insights Library with provenance-preserving reuse, owner finish, results and a deterministic SEO revision (no Etsy writes).
- [ ] SEO next: Etsy listing builder (Phase 3), owner approval UI (Telegram), SUPPORTING-primary owner override, v1.1 performance feedback.
- [x] Telegram UX v2 (ADR-027 amendment): factory dashboard, native "/" command menu, guided next-step
      buttons, contextual help, failure screen with state-proven safe retry, costs + OpenAI billing link, adapter status.
- [x] Selectable Stage 3 marketing engines (ADR-029): Factory (unchanged), Hybrid (recommended; AI art direction +
      environments, real artwork composited by code), AI Creative (wider AI layout control, deterministic reconstruction);
      hero comparison, per-image regeneration (£0 composite rebuild), engine QC, costed in the ledger.
- [ ] Owner test of Hybrid / AI Creative on the next product (real OpenAI calls; compare with Factory first).
- [x] Stage 3 adapter registry + colouring-book marketing (ADR-037): greeting cards unchanged behind their adapter;
      colouring books get a 10-image campaign from the Stage 2 handoff (real pages composited by code), AI environments
      and one labelled AI coloured example (image edit of a real page), example QC, all three engines.
- [x] Product #014 Stage 3 (marketing approved).
- [x] Stage 4 multi-file delivery (ADR-038): one product -> up to 5 customer-named delivery ZIPs, deterministic
      planner (logical groups, balanced page ranges, 19 MB headroom), set verification before any Etsy call.
- [x] Canonical Etsy categories + owner-approved taxonomy mapping (ADR-039): colouring books -> 339; #014 override set (etsy/settings.json).
- [x] Crochet pattern bundle format, part 1 (ADR-040): canonical id + aliases, source schema, strict validator (never invents
      instructions), declared deliverable model, SEO intake compatibility. Not yet in Stage 1/2/3; no product.
- [x] Crochet pattern bundle, part 2 (ADR-041): AI-assisted drafts (unverified) or owner-authored source, APPROVE PATTERNS
      (SHA-256), Stage 1 enablement (artwork page_count 1-3, separate pattern count), Stage 2 adapter + document design + QC,
      marketing integrity rules, Etsy category explicitly unresolved.
- [x] Crochet Stage 3 adapter + integrity enforcement, collection-plan contract, SEO search shape, owner evidence stored (ADR-042).
- [x] Crochet Etsy category: fixed per-format mapping to 6343 Patterns & Blueprints (ADR-059; owner confirms before the first live retry).
- [ ] Product #015 Crochet Flower Bouquet Pattern Bundle: owner gates (concept, style, brief, patterns, production, SEO, marketing).
- [ ] Product #014 Stage 4 (owner action: 🔄 Retry Safe Step; no OpenAI cost; creates a DRAFT only).
- [ ] Product #009 Milestone A: first live DRAFT (owner: connect the shop, set seller declarations, `/etsy 009`).
- [ ] Product #009 Milestone B: publish after the owner has inspected the real draft (`ETSY_PUBLISH_ENABLED=true`).

## Product #007 — Cute Ghost Halloween Activity Book (out of phase order)

Owner handoff (called "#006" there; renumbered because `006-…` exists).
30 supplied PNG pages processed unchanged — no regeneration.

- [x] `products/007-cute-ghost-halloween-activity-book/` — source validation,
      A4 + US Letter PDFs, 30 original PNGs, printing guide, 5 Etsy ZIPs,
      10 listing images, listing copy, QC, tests. Reuses Product #004's
      primitives without modifying them. See its `README.md`.
- [ ] Owner decision on P002 (mockup-framed source) — blocker.
- [ ] Owner review via Telegram; nothing drafted or published on Etsy.

## LumiumX design + marketing — DETERMINISTIC (out of phase order, ADR-013 supersedes ADR-012)

Built at the owner's request. The pipeline that produces the customer PDF/XLSX
and the six Etsy marketing PNGs is **fully deterministic — no runtime LLM**.

- [x] `design/` layer kept as human canon: `design/brand/` (LumiumX design
      system + `lumiumx.tokens.json` + `ANTI_PATTERNS.md` + `VISUAL_QA.md`),
      `design/references/` (three Etsy budget-planner listings analysed for
      category design language), `design/schemas/` (`DESIGN_SPEC` /
      `MARKETING_DESIGN_SPEC` JSON Schema 2020-12).
- [x] `DESIGN_SPEC.json` / `MARKETING_DESIGN_SPEC.json` are **committed
      configuration**. Pipeline stage 1 = `services/src/design/scripts/validate-design-config.ts`
      (`validateDesignSpec` / `validateMarketingDesignSpec`) — deterministic, no key.
- [x] **Removed the runtime LLM (ADR-013).** Deleted
      `creative-director-{client,core,openai,anthropic}.ts`, `artifact-schema.ts`,
      `scripts/generate-design.ts`, the AI block in `config/env.ts`, the
      `lumiumx-creative-director` skill, `CREATIVE_BRIEF` schema+fixtures+validator,
      the AI-authored rationale/QA/comparison docs, and every `OPENAI_*` /
      `ANTHROPIC_*` / `AI_PROVIDER` in `.env.example`. 0 LLM calls / 0 tokens
      for a product generation; guarded by `services/test/no-runtime-llm.test.ts`.
- [x] **Redesigned `@dpf/marketing` into a deterministic lifestyle-mockup
      engine.** `marketing/src/primitives/` (`deskScene`, `paperSheet`,
      `paperStack`, `prop`, `headlineBlock`, `chip`) + `marketing/src/compositions/`
      (the six assets). Real rendered product pages laid on a coded warm-desk
      scene (CSS gradients + inline SVG props); minimal Spectral/Inter copy;
      claim-stamped for Marketing-Claim QC. One engine — the old editorial
      components/css are replaced, not duplicated.
- [x] Pipeline re-run end-to-end, deterministic (historical result, while
      Product #001 was still the exercising product): PDF QC 226/226,
      workbook 81/81, previews 18/18, marketing visual QC pass + claims
      10/10. The deterministic mechanism itself (`validate-design-config.ts`,
      `@dpf/marketing`) is unchanged and reusable by a future product.
- [x] ~~Wire `npm run design:pipeline` into an n8n workflow~~ — superseded:
      the Telegram bot creates verified Etsy drafts (ADR-026); the pipeline and
      n8n were retired in ADR-069.

## Phase 2 — PDF Production

- HTML/CSS rendering pipeline
- PDF generation
- Page validation
- Automated QA checks

## Phase 3 — Asset Production

- Preview image generation
- Mockup generation
- Thumbnail generation
- ZIP packaging for delivery

## Phase 4 — Listing Production

- Etsy title generation
- Etsy description generation
- Tag generation
- Metadata assembly
- Pricing suggestions

## Phase 5 — Etsy Integration

- Etsy API credentials + OAuth flow
- Draft listing creation
- Human approval step — **done in code** for the first product as a
  `services/` Telegram bot (ADR-009), not n8n. An n8n workflow can drive
  the same `telegram:*` scripts later if orchestration is wanted.
- Publishing (still manual in the Etsy UI by design)

## Phase 6 — Analytics

- Sales tracking
- Conversion tracking
- Product performance reporting
- Automated reporting

---

Phase 0 is implemented, plus the out-of-order Etsy/DesignProvider
foundation above (ADR-007). Phases 1–6 are otherwise intentionally
unimplemented — see `CLAUDE.md` for the rule this roadmap exists to
support: don't build future-phase infrastructure early just because
it's been planned. The foundation above was an explicit, owner-approved
exception, scoped to integration scaffolding only.
