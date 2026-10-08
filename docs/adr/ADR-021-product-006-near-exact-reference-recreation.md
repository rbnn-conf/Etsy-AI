# ADR-021 — Product #006: near-exact reference recreation, native Excel charts

Status: Accepted (2026-09-14).

## Context

ADR-020 (2026-09-13) established Product #006 as Product #001's sage-green
"Digital Stationery" design *adapted* for Excel, explicitly declining to copy
the third-party reference workbook's own visual system — cards/badges stood
in for the reference's rose/sage two-tone look, and native charts were out of
scope (ExcelJS has no API to write them).

The owner then reviewed a screenshot of the reference workbook's own Budget
Planner Dashboard sheet and its actual `.xlsx` file directly, and gave an
explicit, unambiguous instruction: **"make it exactly like this."** Asked
specifically how to handle the one hard technical blocker — the reference's 4
native Excel charts on Budget plus a native doughnut progress ring on its
goal-tracking sheet, which ExcelJS cannot write — the owner chose **build
native charts (new capability)** over falling back to data-bar approximations.

A full reverse-engineering pass on the reference workbook (raw OOXML
inspection: `xl/charts/*.xml`, `xl/worksheets/sheet2.xml`, `xl/styles.xml`,
`xl/sharedStrings.xml`, read-only, never modified, never redistributed)
showed the reference is substantially larger and more functionally complex
than Product #006's first build:

- 11 expense categories, 8 bill categories, 6 income categories, 6 savings
  categories, 3 debt categories (not the ~8 generic categories originally
  used).
- A three-column-zone parallel layout on one Budget sheet — Cash Flow
  Summary + Income Summary + a ranked "Where My Money Went" table in one
  column zone, Expense Summary + Savings Tracker in a second, Bill Tracker +
  Debt Payments Tracker in a third — not stacked single-column tables.
- Every table's **Actual** column is a live `SUMIF` against one master
  Transactions List (Type → dependent Category dropdown), never typed by
  hand — the "Where My Money Went" pie is fed by a `LARGE`/`INDEX`/`MATCH`
  top-N ranking engine over that same data.
- 4 native charts on Budget (1 clustered bar, 3 pies) + 1 native doughnut
  progress ring on the goal-tracking sheet.
- An exact rose (`#EBC2B9`) + sage (`#5B8067`/`#8CB49A`) two-tone palette,
  Cambria display font, Quattrocento Sans body font.

## Decision

1. **Adopt native Excel chart-writing as a first-class capability of
   `@dpf/spreadsheet`**, not a one-off hack. `spreadsheet/src/engine/
   native-charts.mjs` exports `injectNativeCharts(buffer, chartsBySheet)`:
   it hand-authors the OOXML chart/drawing parts (bar, pie, doughnut —
   templated directly off the reference's own real chart XML, substituting
   our own cell ranges/colours/titles) and splices them into an
   already-built `.xlsx` zip via `jszip` (already an ExcelJS transitive
   dependency, now an explicit one). Sheet name → worksheet-part resolution
   walks `workbook.xml` → `r:id` → `workbook.xml.rels`, the same path Excel
   itself uses, so it doesn't assume any sheetN.xml numbering. Also exports
   `countChartParts` (a QC primitive — ExcelJS's own model can't see these
   post-spliced parts) and `withPreviewPaperSize` (a raw-XML `paperSize`
   patch for preview rendering — see point 4).
2. **`@dpf/spreadsheet`'s shared `DEFAULT_THEME` is untouched.** Product
   #006's rose/sage palette and Cambria/Quattrocento Sans fonts are a
   per-product `theme` override in `xlsx-design-spec.json`, exactly the
   mechanism ADR-020 already established — this ADR doesn't change that
   principle, only supersedes ADR-020's *design* conclusion for this one
   product now that the owner has clarified the actual target.
3. **Budget's structure was rebuilt to match**: three column-zones
   (`ZONE_A`/`ZONE_B`/`ZONE_C` in `build.mjs`), a Cash Flow Summary
   (Rollover / Total Income / Expenses / Bills / Debt / Savings / Total
   Leftover, `+`/`-` prefixed), a 4-card KPI band (Income / Expenses & Bills
   / Debt Payments / Savings — Expenses+Bills is the one KPI that sums two
   pools), and every category list matches the reference's real lists
   verbatim. **Actuals are now Transactions-List-driven** (`SUMIF` off a
   Type→Category dependent dropdown), reversing the "typed Actuals, matching
   Product #001/#005 house convention" decision from the original
   `PRODUCT_SPEC.md` — the mechanism that decision called "fragile" was
   specifically the reference's `OFFSET`/`MATCH`/`COUNTA` dependent-dropdown
   formula; here the same dependent-dropdown *behaviour* is delivered via a
   plain `INDIRECT($TypeCell)` data-validation formula instead, which is
   simpler and not fragile. This reversal is scoped to Product #006 only —
   #001 and #005 are untouched and keep typed Actuals.
4. **The ranking engine (Lists sheet) uses a non-CSE array-formula trick,
   not a literal port of the reference's legacy array formulas.** ExcelJS
   has no API to mark a cell as a true `t="array"` formula (verified: even a
   value like `{formula, result}` always serialises as a plain `<f>`).
   Wrapping the label-matching condition in `INDEX(range, 0)` forces array
   evaluation without Ctrl+Shift+Enter — the classic, well-documented
   technique — functionally identical to the reference's `LARGE`/`INDEX`/
   `MATCH`/`COUNTIF` engine, portable to any modern Excel.
5. **Preview rendering (`preview.mjs`) was substantially reworked twice**
   during this change, for two independent bugs discovered via visual QC:
   - Forcing an entire sheet onto one page (`fitToHeight:1`, the approach
     inherited from Product #005) made Budget — now ~240 rows — render at
     illegible size. Fixed: `fitToWidth:1, fitToHeight:0` (this product's
     own house print default, already correct for the real deliverable),
     letting Budget span as many naturally-paginated, legible pages as it
     needs.
   - `renderXlsxPreview`'s `excludeSheets`/`includeOnly` options force a
     load→modify→save round-trip through ExcelJS to drop sheets
     (`stripSheetsForPreview`) — and a plain ExcelJS round-trip, even with
     **no** sheet removed, silently drops any OOXML part it has no model
     for, which is exactly what `injectNativeCharts` adds. Verified
     empirically (a no-op round-trip test dropped all 5 chart parts).
     Fixed: `preview.mjs` never round-trips the already chart-injected file
     through ExcelJS — `withPreviewPaperSize` patches only the `paperSize`
     attribute via raw XML, and sheet→page mapping is done by searching
     each rendered page's text (`pdftotext`) for that sheet's unique
     masthead kicker, since a continuation page carries no such marker.
     (A second bug in this same mechanism — matching the generic
     substring `"PLAN"` for Budget's kicker, which also matched the word
     "Planner" in every page's footer — was caught and fixed by matching
     the full `"PLAN · TRACK"` kicker text instead.)
6. **Example-data seeding was moved inside `build.mjs`** (`buildProduct006Workbook({ seed, outPath })`)
   rather than `example.mjs` loading the already-built file and writing
   values on top via its own ExcelJS pass — for the same round-trip
   reason as point 5: seeding must happen before the one-way write that
   injects charts, never after.
7. **Deliberately still not carried over** (unchanged from ADR-020/
   `PRODUCT_SPEC.md`, this instruction wasn't about these): shop branding,
   external hyperlinks (Etsy shop, YouTube tutorial, Google Drive links),
   decorative lifestyle photography, the reference's live `"$"`-symbol-
   fanout currency mechanism (this shop is GBP-hard by house convention,
   unrelated to this product's design), and its full ~500-row / 30-row-
   per-table blank padding (reduced to smaller but still generous
   capacities — same categories, same mechanics, less file bloat).
8. **The reference's literal 3×3 merged-cell goal-card grid was adapted to
   a flowing 8-row table** (Goal / Reward / Deadline / Status / Steps Done
   / Steps Total / Progress, plus the Areas-of-Life roll-up and the
   doughnut ring) rather than replicated cell-for-cell — same fields, same
   capacity (8 goals), same overall-progress ring, simpler layout. This is
   the one deliberate fidelity trade-off in this pass, made for engineering
   time, not carried out of the same necessity as points 1–6.

## Alternatives considered

- **Skip native charts, keep data-bar/table approximations.** Rejected —
  explicitly the alternative the owner was offered and didn't choose.
- **Literal legacy CSE array formulas for the ranking engine**, matching
  the reference byte-for-byte. Rejected — not reachable through ExcelJS's
  API without a further raw-XML mechanism on top of what was already being
  built for charts; the `INDEX(range,0)` non-CSE technique gives identical
  results with less new surface area.
- **Change `renderXlsxPreview` itself** to preserve unknown OOXML parts
  through `stripSheetsForPreview`. Rejected for this change — would touch
  shared engine code every other product's preview also depends on, for a
  need only this (first) chart-injecting product currently has; solved
  locally in `preview.mjs` instead. Worth revisiting if a future product
  also injects native charts and needs sheet isolation.

## Consequences

- Verified (2026-09-14): `node cli.mjs` → 52/52 workbook QC checks
  (including a full LibreOffice recalculation scenario that seeds real
  Transactions rows and checks every Actual, every KPI, Cash Flow Summary,
  and the ranking engine's top result), 11/11 preview checks, 5 native
  chart parts confirmed present (`countChartParts`). `spreadsheet` package:
  39/39 tests (4 new, covering bar/pie/doughnut injection, the extLst
  placement regression, and multi-chart-per-sheet drawing reuse).
- Visual QA done by reading the actual rendered PNGs (blank template and
  the seeded example) for all 3 sheets, all 4 Budget charts, and the Goal
  Tracker doughnut — confirmed real proportional data, not placeholders.
- `docs/LUMIUMX_ETSY_DESIGN_SYSTEM.md` and the `etsy-design-director`/
  `spreadsheet-design` skills remain stale, as already flagged in ADR-020 —
  unchanged by this ADR, still a follow-up.
- `native-charts.mjs`'s sheet-resolution logic is duplicated once (inside
  `injectNativeCharts` and again as `resolveSheetPath` for
  `withPreviewPaperSize`) rather than refactored to share — a known, minor
  piece of debt, left alone this pass to avoid touching already-tested code
  under time pressure.
