# CLAUDE.md — Digital Product Factory

Guidance for Claude Code sessions working in this repository.

## What this project is

LumiumX: a Telegram-driven factory that takes Etsy digital products
(colouring books, crochet pattern bundles, greeting cards) from idea to a
verified Etsy draft, with an owner approval gate after every customer-facing
step. Onboarding: `DEVELOPER_SETUP.md`.

## Current architecture

```text
Owner (Telegram) ⇄ automation/src/bot.mjs (one Node.js process)
   → Stage 1 automation/ → Stage 2 production/ → Stage 3 marketing/ → Stage 4 services/src/etsy
   + SEO panel → seo/        State: products/<id>/product.json, automation/state/
```

Full detail in `ARCHITECTURE.md`. There is no Docker, database or n8n: they
were retired in ADR-069 (2026-10-08) together with the `services/` design /
review tiers, the Product #001 planner marketing and `design:pipeline`. Do not
reintroduce them without an explicit request.

**Hidden dependency:** `production/` loads `sharp`, `pdf-lib`, `fflate`,
`@pdf-lib/fontkit`, the pdf.js renderer and fonts from
`products/003-midnight-seance/` and `products/004-cozy-spooky-coloring/`. Never
delete or move those folders. Detaching them is deferred by the owner.

## Current phase

Phase 0 is complete and the Stage 1-4 factory has been built at the owner's
request, ahead of the original phase order (see `ROADMAP.md`). Do not start new
phases, product categories or infrastructure unless the owner explicitly asks.
The XLSX engine (`spreadsheet/` = `@dpf/spreadsheet`, ADR-010) and
Product #006 (ADR-020/021/022) are kept for a possible spreadsheet category
but are not wired into Stages 1-4. Full how-to: `docs/XLSX_PIPELINE.md`.

**Products #001 and the original #005 were removed on 2026-09-15** (the current
`products/005-cozy-autumn-adventures/` is a later hand-built colouring book).
Some docs (`docs/XLSX_PIPELINE.md`, `docs/design/*`, the archived docs in
`docs/archive/`) still use Product #001 as an illustrative example; treat any
`products/001-…` path as historical. **Canva is not a dependency** of anything.

**Production, rendering and QC are DETERMINISTIC (ADR-013, ADR-024).** There is
no LLM call in `production/`, `marketing/`, `seo/` or `services/`; Stage 3
listing images are composed in code (`marketing/src/stage3/`) from the real
approved artwork, and all text on them is code-rendered. Do not introduce an
LLM into those packages.

**Scoped exception (ADR-023):** `automation/` is the owner-requested Stage 1
creative orchestrator (Telegram request → OpenAI concepts/spec → 3 style
proofs → approval). It uses OpenAI, lives outside the production pipeline,
stops at `CREATIVE_APPROVED`, and must never be imported by production code
(enforced by tests). ADR-013 still governs everything else. See
`automation/docs/STAGE_1_README.md`.

**Stage 2 (ADR-024):** `production/` (`@dpf/production`) is the deterministic
production package for `CREATIVE_APPROVED` Stage 1 products. It makes no model
or network call, never imports `automation/`, and never modifies approved
artwork. The Stage 1 bot coordinates it via `/produce <id>` up to
`PRODUCTION_APPROVED`. 
**Stage 3 (ADR-025):** `/market <id>` produces the Etsy listing and listing
images for a `PRODUCTION_APPROVED` product. OpenAI writes the copy and
optional *background* scenes (`automation/src/stage3`). Facts, compositions
with the real Stage 2 artwork, rendering and QC are deterministic
(`marketing/src/stage3`). It never publishes. Marketing engines (ADR-029):
`factory` (default for `/market`), `hybrid` and `ai-creative`, chosen by the
owner in Telegram. The AI only art-directs and paints *environments*; the real
Stage 2 artwork is always composited by code, and all text is code-rendered.
Stage 3 adapters (registry `marketing/src/stage3/adapters/`, ADR-037): `greeting-card`
and `colouring-book`. For colouring books OpenAI also makes one labelled coloured
EXAMPLE per campaign (an image edit of a real page, never product art).
Stage 2 adapters: `greeting-card` and `colouring-book` (ADR-028). A colouring
book is production-ready only after Stage 1 has generated, QC'd and the owner
has approved its FULL book (ADR-030: `book/`, APPROVE FULL BOOK); Stage 2
never generates pages.
**Crochet pattern bundle (ADR-040, ADR-041):** canonical format `crochet-pattern-bundle`
(aliases: `automation/src/orchestrator/formats.mjs`).
- Stage 1: artwork `page_count` is 1-3; the pattern count is the owner's separate brief.
  Creative approval covers the look only.
- Pattern content (`crochet/patterns.json`, AI-assisted drafts or owner-authored) has its own
  gate: validator, then review, then ✅ Approve Patterns, bound by SHA-256.
- Stage 2 adapter: `production/src/adapters/crochet-pattern-bundle.mjs`.
- Stage 3 crochet adapter (ADR-042) enforces `crochet-integrity.mjs` through `claims.mjs`. Etsy category:
  fixed by format to taxonomy 6343 (Patterns & Blueprints; ADR-059), re-verified against Etsy on every run.
- Crochet instructions are functional: production never invents, completes or repairs them,
  and fails on missing, invalid or changed content.
- AI-assisted drafts are `unverified`. Never claim tested, verified or guaranteed without
  testing evidence; marketing uses `marketing/src/stage3/crochet-integrity.mjs`.
- ADR-043: over-long `finishing`/`assembly`/`notes` items are split losslessly before validation
  (never sliced; schema limits unchanged); step `text` is never split. The ONE crochet visual direction is
  `marketing/src/stage3/crochet-visual-direction.mjs`: illustrated branding, realistic crochet
  product. Every crochet image or direction prompt inherits it; other formats never read it.
- ADR-044: 🎨 Restyle Product (crochet, patterns approved) returns a CREATIVE_APPROVED product to
  SPEC_READY: archives direction/briefs/approval, rebuilds briefs from the approved patterns, clears
  only the style approval; no model/image call until the owner confirms new proofs. The brief prompt
  leads with the request's count/terms and warns on a mismatch.
- ADR-045: the crochet plan request ends with "EXACTLY N" and the model-facing schema states it; exact
  count validation stays strict. Only EXACT duplicate patterns are dropped, and only when that leaves N.
- ADR-046: the written pattern is the source of truth for crochet visuals. Fingerprints
  (`production/src/crochet/fingerprint.mjs`, explicit wording only, unknowns null) -> checked visual
  specs (`marketing/src/stage3/crochet-visual-spec.mjs`) -> image prompts. Every crochet piece maps to
  an approved pattern ID; ornaments are never crochet; code never sets `physically_verified`.
- ADR-047: Stage 2 refuses a crochet product unless `creative/visual-specs.json` matches the approved
  patterns and is internally_checked (re-checked in `production/src/crochet/visual-gate.mjs`); Stage 3
  gets `pattern_facts` + `pictured` and refuses unsupported counts; pre-pattern proofs are style-only.
- ADR-048: every bound of the crochet pattern schema is listed to the model from the schema
  (`patternLimitsBlock`); over-long finishing/assembly/notes are split, abbreviation meanings moved
  verbatim to notes, category/hook US/stitch names canonicalised; all other fields hard-fail by design.
- ADR-049: over-long section headings / step labels (presentation only) become `Section N` / `Step N`;
  step text is never changed.
- ADR-050: crochet bracket notation ("[sc, inc] rep 6 times") is not a placeholder; editorial brackets are. A defined
  multi-word abbreviation ("hdc dec") is one abbreviation. Assembly defines a standard abbreviation an AI draft forgot
  (inc/dec/sc...) from `crochet-terms.mjs`; pattern-defined stitches are never invented.
- ADR-051: assembly follows pieces, not sections: required when declared true, or when the text clearly makes
  detached pieces (`detachedPieces`); a plan's `assembly_required: false` reaches the source and is honoured.
- ADR-052: one printable-character check (`production/src/crochet/printable.mjs`, the document fonts) runs at
  pattern review (blocks approval) and again in Stage 2. An approved source edited later is re-validated free
  ("Re-validate edited patterns.json"); its checked visuals are re-bound only when fingerprints are identical.
- ADR-053: one authoritative pattern checksum (`crochet.approval.source_sha256`); a handoff made for an earlier approval
  is archived and rebuilt from the current one (`writeHandoff`), on re-approval, Build or retry. Edits without re-approval stay refused.
- ADR-055: Stage 2 `atomicWrite` retries a Windows EPERM/EBUSY/EACCES rename (50/100/200/400 ms, then throws; never deletes the
  destination first); one production step per product (`production/.build.lock`); builds remove only stale `*.tmp-*` files.
- ADR-056: Moonlit Meadow crochet document design (`production/src/crochet/moonlit/`, reading measure 130 mm, shared hook text
  rule `crochet/hook.mjs`). LIVE since 2026-10-06: the registry uses `crochetPatternBundleMoonlit` (v2); classic (v1) stays available, unregistered.
- ADR-057: APPROVE PRODUCTION is refused unless build-record `adapter` {format, design, version} equals the live adapter
  (`production/src/package-design.mjs`); missing metadata is refused; the refusal offers only 🏭 Rebuild / Back.
- ADR-058: Stage 3 Creative Director. Hybrid / AI Creative crochet campaigns are 8 creative cards, one buyer job each,
  directed in `plan.json` `directions` (code baseline `planCreative`; 1 text call, prompt `marketing-creative-director.md`;
  validated by `marketing/src/stage3/creative.mjs`). Approved renders reach Stage 3 with their pattern IDs and are only
  shown cropped below their lettering (≤ 2×). AI environments never exceed the baseline (crochet: 1; max 2); variety + render-truth QC. Factory is unchanged.
- ADR-060: colouring books use the ADR-058 Creative Director too (`marketing/src/stage3/colouring-creative.mjs`): 10 creative cards,
  a validated campaign concept, ≤ 3 backplates (01/02 share one) + 1 coloured example; example-fidelity QC (severe = fail, never auto-regenerated).
  Older plans (no concept) render unchanged; Factory unchanged.
- ADR-061: the specification's model schema offers only the canvas values `FORMAT_CANVAS` allows (and the concept's
  orientation); a format-fixed `edge` is set before validation. `canvasProblems` is unchanged. Add a `FORMAT_CANVAS` rule and the contract follows.
- ADR-063: crochet VISUAL SET = 1 collection hero + 1 finished-item preview per approved pattern. A deterministic director
  (`production/src/crochet/visual-set.mjs`, no model) writes briefs bound to fingerprint SHA-256s; props are never crochet and
  previews show exactly one product. Prompts are built by code (`automation/src/openai/crochet-visuals.mjs`). Each image is paid,
  confirmed (count + estimate) and resumable. Restyle Hero / Preview / All never touches patterns. Once a set exists, Stage 2
  requires its approval and places each preview in the fixed top-right slot, captioned as an illustration.
- ADR-064: Stage 3 ROUTE CONTRACTS (`marketing/src/stage3/routes.mjs`): Factory / Hybrid / AI Creative heroes differ by a
  code-owned structured route (composition, camera, page arrangement, environment, props, story, transformation demo), not
  adjectives. Colouring: Hybrid = line art + labelled coloured example (`cb-lifestyle-hero`), AI Creative = single-page
  editorial reveal (`cb-editorial-hero`). A deterministic pre-image gate refuses or redirects (once, free) a near-duplicate
  hero before any paid image. Listing: `editable` is rejected only as an affirmative claim; `correctUnsupported` only deletes
  an unsupported qualifier before validation; a rejected listing is saved (`marketing/listing.rejected.json`) and re-checked
  free on Retry.
- ADR-065: the hero chosen in the comparison IS the campaign hero. `engine_chosen.approved_hero` references the candidate
  by SHA-256; the plan reuses its direction, campaign and paid backplate, and `plan.approved_hero.locked` (composition,
  focal page, text zone, scene brief, route, backplate SHA) is checked before any paid image (`ApprovalIntegrityError`).
  Copy/crop may adapt. Legacy approvals are honoured as stored when the comparison preceded the choice.
- ADR-066: at most 5 Etsy delivery files of at most 19 MB. Stage 2 packs split parts to the shared safe size
  (`ETSY_FILE_SAFE` = Stage 4 `ETSY.fileBytesSafe`; QC enforces size and count); when whole logical groups need more than 5
  files, Stage 4's planner adopts Stage 2's `zip_parts` (every file exactly once, proven) instead of failing. Stage 4 never
  splits, drops or recompresses; products that already fit plan exactly as before.
- ADR-067: decorative artwork overflow (full-book creative QC rule `artwork-edge-overflow`) is owner-reviewable: ✅ ACCEPT
  OVERFLOW records a product- and report-specific exception (`book.qc.override`, `book.override_history`), carried into the
  approval and re-checked by the Stage 2 handoff (`production/src/artwork-override.mjs`). It never clears any other check;
  regenerating a page voids it. Production QC states "PASS WITH OWNER OVERRIDE — …" only when everything else passes.
- ADR-068: a crochet plan declares `collection_type` (arrangement | coordinated-set | independent) and `role_plan` (slots per
  role, summing to the brief's count) BEFORE its patterns; the #016 arrangement rules apply to declared arrangements (and to
  legacy plans with combinations, as before). Role names = `PLAN_ROLES` = the schema enum. Rejected plans report every problem
  and are kept in `crochet/plan.rejected.json` (diagnosis only).
- ADR-062: owner status UX (presentation only). `#guarded` drives one edited Telegram status message per step
  (`telegram/status.mjs` texts derived from persisted state; `orchestrator/owner-status.mjs`, injected as `ownerStatus`), 🟢/🟠/🔴/✅,
  and ONE 🔔 reminder per 10-minute owner wait, keyed `status@entered_at` in `state/owner-status.json`. Never stall-detects; never changes state.
**SEO / Discovery Engine (ADR-031, `seo/`):** decides WHAT search positioning makes
commercial sense before manufacturing (the Production Engine decides HOW). Manual
Marketplace Insights data only (never scraped or estimated), no network, no model;
it and the Production Engine never import each other, except the Telegram owner interface `automation/src/seo/` (ADR-036),
which only calls the engine. See `docs/SEO_DISCOVERY_ENGINE.md`.
Its opportunity score (ADR-032) is a LumiumX internal decision-support metric, NOT the Etsy algorithm; the owner fixed
the formula, so do not re-weight it to force results. Handoff documents exist only for owner-approved briefs.
The research planner (ADR-033) proposes searches only: a generated query is not evidence of demand; related terms are
discovered, not researched. Research expansion (ADR-034) scores only captured observations: discovery is not evidence.
**Stage 4 (ADR-026):** `/etsy <id>` creates and verifies an Etsy **draft** for a
`MARKETING_APPROVED` product (`automation/src/stage4`, zero OpenAI; dry run by
default). Publishing needs PUBLISH + CONFIRM PUBLISH + `ETSY_PUBLISH_ENABLED=true`;
`EtsyService.activateListing` is the only code that may set `state=active`.
One PRODUCT (one listing) may have several DELIVERY FILES: Stage 4 plans 1-5
customer-named ZIPs and proves them complete before any Etsy call (ADR-038). Never
publish or create live Etsy objects during development or tests.
Shop sections (ADR-054): `automation/config/etsy-sections.json` maps format + season/topic to ONE canonical
section (no model, no guessing); Stage 4 reuses or (only with `shops_w`) creates it and assigns the draft,
idempotently and never fatally; `/etsy <id> section` retries only that step.

## Security rules

- Never commit `.env`, API keys, tokens, credentials, or anything
  matching the patterns in `.gitignore`. If you're about to write a
  value that looks like a real secret into any tracked file, stop.
- `.env.example` gets variable *names* only — never real or
  plausible-looking fake values.
- Never hard-code credentials in source, docs, tests, or scripts.
- Before committing, prefer running `tests/verify-foundation.sh` — it
  checks for accidentally-staged secrets.
- Full policy: `SECURITY.md`. When in doubt, that document wins.

## How to handle secrets

- Real values live only in the developer's local `.env` (git-ignored)
  and `services/.secrets/` (the encrypted Etsy token and its key).
- If a task seems to require inventing or guessing a credential,
  account, or external identifier — don't. Document the blocker
  instead (what's needed, from whom) rather than fabricating a
  placeholder that looks real.

## Coding conventions

- Prefer boring, reliable infrastructure over clever infrastructure.
- Plain, explicit Node.js scripts over frameworks, for anything simple
  enough that a framework would be overhead.
- State is JSON files validated against schemas; no database, ORM or
  migration framework should be added without a concrete need.

## Documentation rules

- GitHub (this repo) is the source of truth for code, configuration,
  scripts and documentation. Notion was planned as a human-readable layer
  (ADR-005, `docs/archive/NOTION_SETUP.md`) but is not connected; if it is,
  link and summarize rather than duplicating files.
- Any significant infrastructure decision gets an ADR in `docs/adr/`
  (Context / Decision / Alternatives considered / Consequences, kept
  concise).
- Changes to architecture, security posture, or operational procedure
  must update the relevant doc (`ARCHITECTURE.md`, `SECURITY.md`,
  `OPERATIONS.md`) in the same change — not as a follow-up.

## How to make changes safely

- Before any command that could discard uncommitted work (`git
  checkout`/`restore`/`reset`/`clean`, `rm -rf` on a repo path), check
  `git status` first and confirm with the user if anything looks like
  in-progress work.
- Product folders, `automation/state/` and `services/.secrets/` hold
  approvals, cost history and credentials that Git does not fully capture.
  Never delete or rewrite them without explicit confirmation.
- Follow the Git workflow in `DEVELOPMENT.md`: `main` is stable;
  `feature/<name>`, `fix/<name>`, `chore/<name>` for everything else.

## Two principles to hold onto

> Prefer boring, reliable infrastructure over clever infrastructure.

> Never solve a future problem by adding infrastructure today unless
> the current phase genuinely requires it.

Concretely: don't add Redis, queues, databases, containers, monitoring
stacks or additional services because they "will be needed eventually."
They will be added when a real need appears — see `ROADMAP.md` and ADR-069.

## Destructive operations require explicit confirmation

This includes (non-exhaustive): deleting product folders, runtime state
or data, force-pushing, rewriting Git history, deleting files the user didn't just create
in the current session, and anything touching `.env` contents. Ask
first. The cost of asking is low; the cost of guessing wrong here is
not.

## Changes must be documented

A change that isn't reflected in the relevant `.md` file or ADR isn't
finished. Documentation drift is the failure mode this whole structure
exists to prevent.
## Human Review Gate

For any visual or customer-facing artifact:

BUILD → SHOW → REVIEW → APPROVE → CONTINUE

Automated QA is not sufficient for completion.

Claude must make the actual artifact available for human inspection and must stop before creating dependent artifacts until the owner approves the output.

## Design standard

Any visual work (Etsy listing images, mockups, workbook/spreadsheet visual
design, shop assets) must follow the project design system. Load the relevant
skill(s) — `etsy-design-director` (owns the standard), plus `graphic-design`,
`typography`, `colour-system`, `layout-composition`, `spreadsheet-design`,
`etsy-marketing-creative` — and run `visual-qa` before showing work. Stage 3
listing images are composed deterministically in `marketing/src/stage3/`
(Creative Director, route contracts; ADR-058, ADR-064). `/design-review` runs the full art-director
pass. Knowledge base: `docs/design/` (craft) and `design/brand/` (canon +
tokens); brand spec `docs/LUMIUMX_ETSY_DESIGN_SYSTEM.md`. Technically-valid
output that looks generic / AI-generated does not pass the gate.