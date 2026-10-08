# ADR-020 — Product #006: sage-green Digital Stationery adapted for Excel; documentation staleness found

Status: Accepted (2026-09-13).

## Context

Product #006 ("Minimalist Budget & Goals Planner") was commissioned as a
design × functionality recombination: Product #001's design language,
applied to the functionality of a third-party reference budget workbook
(inspected read-only, never modified, never redistributed). The first
build used `@dpf/spreadsheet`'s `DEFAULT_THEME` — warm ivory, charcoal
ink, terracotta accent, hairline rules, no card surfaces — on the
understanding that this theme was Product #001's current design.

The owner reviewed a Telegram preview of Product #001's *actual* current
listing and flagged a mismatch: Product #001 no longer looks like that.
ADR-018 (2026-09-05) completely reset Product #001's visual system to a
card/badge "Digital Stationery" register (rounded cards, box-shadow,
icon badges, category chips, status pills; 5 themes including
sage-green) — but that reset only ever touched Product #001's own
`render/` (print-PDF, Chromium/HTML/CSS) pipeline. Three things were
never updated to reflect it, and were traced during this product's
build:

1. `spreadsheet/src/design-system/tokens.mjs`'s `DEFAULT_THEME`
   ("etsy-spreadsheet-v1") — still the pre-ADR-018 terracotta/hairline
   palette.
2. `docs/LUMIUMX_ETSY_DESIGN_SYSTEM.md` — still documents terracotta as
   the universal Finance/Planning family accent with no mention of
   ADR-018 or the sage-green theme.
3. The `etsy-design-director` and `spreadsheet-design` skills — both
   still instruct against cards/boxes ("no boxes' rule", "structure from
   hairline rules... not boxes") and describe the old accent system as
   current.

The owner's direction, given explicitly: use the sage-green card-based
system shown in the Telegram screenshot as "the general basis for ALL
designs moving forward in terms of colour coding and styling," adapted
"as best as you can" given the target format's constraints. For Product
#006 specifically, the format is Excel (`.xlsx` via `@dpf/spreadsheet`/
ExcelJS), which — unlike Chromium/HTML/CSS — cannot render
border-radius, box-shadow, gradients, or embedded SVG icons.

A second, separate correction followed: the owner clarified the
product's *structure* should match the reference workbook's actual
3-sheet shape (Instructions / Budget / BONUS - Goal Tracker, with Budget
as one dense workspace) rather than the spread-out multi-sheet structure
the first build used. That is a structural decision specific to Product
#006's spec and is recorded in `product-spec.json`/`PRODUCT_SPEC.md`,
not repeated here.

## Decision

1. **Product #006 overrides the theme per-product; the shared engine
   default is intentionally left alone.** `xlsx-design-spec.json`
   defines a full sage-green `theme.color` block (ink `#212B22`,
   accent `#4F7A52`, band `#EAF2E2`, inputFill `#F5F9F0`, etc., sourced
   from `design/tokens/themes/sage-green.tokens.json`) which
   `resolveTheme()` deep-merges over `DEFAULT_THEME` at build time.
   `@dpf/spreadsheet`'s `DEFAULT_THEME` itself is NOT changed by this
   ADR — Product #005 (in-progress, uncommitted) explicitly opts into
   the old theme in its own spec and must not be affected by this
   product's build. Whether `DEFAULT_THEME` itself should eventually
   move to sage-green as the house default is an open question, not
   decided here (see Consequences).
2. **Concrete Excel adaptations of the Digital Stationery vocabulary**,
   applied in `xlsx/build.mjs`:
   - *Cards* → filled (`#EAF2E2`) + bordered cell blocks via one new
     local helper, `cardHeading()`. No rounding — ExcelJS cannot draw
     `border-radius`.
   - *Icon badges* → dropped entirely. There is no equivalent to an
     inline SVG icon in a cell grid; a fabricated substitute (emoji,
     Wingdings glyph) would read as clutter, not craft, and was
     rejected on sight per the design-director standard's own rule
     against decorative icon glyphs.
   - *Category chips / status pills* → two-tone fill+font conditional
     formatting (`categoryPalette`, `goalStatusPalette` in
     `xlsx-design-spec.json`) plus a coloured left-border "chip" on
     category cells.
   - *PLAN/TRACK/REVIEW nav-pills* → phase-grouped sheet tab colours
     (`phaseTabColor`: Instructions light sage `#8FAE72`, Budget sage
     `#4F7A52`, Goal Tracker dark forest `#35502F`) — the closest native
     Excel equivalent to a coloured navigation affordance.
   - *Progress rings* → unchanged mechanism (native Excel data bar via
     `progressBar()`), recoloured to the sage accent.
3. **No `@dpf/spreadsheet` engine/component code changes.** Every
   adaptation above is composed in `products/006-*/xlsx/build.mjs` from
   existing primitives (`write`, `conditional`, `dataBar`, fills,
   borders) plus the one new local helper. `WorkbookBuilder`,
   `design-system/components.mjs`, and `DEFAULT_THEME` are untouched.
4. **Documentation/skill staleness is flagged here, not silently fixed
   everywhere.** This ADR is the record of the discovery. Whether and
   how far to rewrite `docs/LUMIUMX_ETSY_DESIGN_SYSTEM.md` and the
   `etsy-design-director`/`spreadsheet-design` skills to describe
   sage-green/cards as the current standard is a larger, shop-wide
   change than one product's build and is being scoped as a
   follow-up rather than rushed into this change (see Consequences).

## Alternatives considered

- **Change `@dpf/spreadsheet`'s `DEFAULT_THEME` to sage-green directly.**
  Rejected for this change — Product #005 is in-progress, uncommitted,
  and explicitly declares (in its own `product-spec.json`) that it wants
  the old theme ("print-PDF-only, ADR-018" reasoning, i.e. spreadsheets
  are out of scope for the print reset). Changing the shared default
  would silently alter Product #005's output without its owner's
  request, violating the instruction to never touch other in-progress
  products.
- **Fabricate icon glyphs in cells (Wingdings/emoji) to preserve the
  icon-badge look.** Rejected — reads as clutter/generic rather than
  premium, and the design-director standard explicitly rejects icon
  glyphs in tinted squares regardless of medium.
- **Leave Product #006 on the terracotta theme and treat the Telegram
  screenshot as a one-off Product #001 change.** Rejected — the owner
  was explicit that the sage-green card system should be the general
  basis for designs going forward, not a Product #001-only fact.

## Consequences

- Verified (2026-09-13): `node cli.mjs` → 49/49 structural/formula/
  formatting/print QC checks, 8/8 preview checks, 3 sheets rendered one
  per page at A3/`fitToPage 1x1` (same pagination technique as Product
  #005), all visually inspected against the sage-green reference
  screenshot.
- `docs/LUMIUMX_ETSY_DESIGN_SYSTEM.md` and the `etsy-design-director`/
  `spreadsheet-design` skills remain stale as of this ADR — they still
  describe terracotta-hairline-no-boxes as current truth and do not
  mention ADR-018 or sage-green. This is tracked as an explicit
  follow-up, not resolved here, because rewriting the 860-line brand
  doc and two skills is a shop-wide change deserving its own scoped
  pass rather than a rider on one product's ADR.
- Future spreadsheet products that want the sage-green card system
  should follow Product #006's pattern (per-product `theme` override in
  their own `xlsx-design-spec.json`, not a `DEFAULT_THEME` change) until
  a decision is made — separately — to migrate the shared default.
- `spreadsheet-design` skill's rule "no solid coloured section bars" /
  "at most two cell fills per sheet" is knowingly exceeded by Product
  #006's card-header bands and category-chip borders; this is the
  Excel-specific adaptation this ADR authorizes, not a violation to be
  cleaned up.
