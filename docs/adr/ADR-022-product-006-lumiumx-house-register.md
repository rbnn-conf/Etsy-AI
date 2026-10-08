# ADR-022 — Product #006: reskin to the LumiumX house register (v5)

Status: Accepted (2026-09-15).

## Context

ADR-021 (2026-09-14) established Product #006 v4 as a near-exact recreation
of a third-party reference budget workbook's own rose/sage two-tone visual
system, per explicit owner instruction ("make it exactly like this").

Separately, and concurrently in this session, the owner asked for a
visual-only redesign of Product #001 to match a LumiumX-branded reference
mockup (a "Monthly Budget" dashboard: warm ivory canvas, terracotta/sage
accents, Spectral/Inter-style editorial typography, KPI cards, a Cash Flow
bar chart, a "Where Your Money Goes" donut with a centre total, an
"Available to Spend" feature, and editorial data tables). That work produced
a proven pattern in `products/001-*/xlsx/build.mjs`: a canvas-wash + masthead
treatment, whisper-tinted KPI blocks with a hairline frame, and (via the
newly-generalised `native-charts.mjs`) a wider primary chart beside a
narrower supporting one.

The owner then showed Product #006's own v4 Budget sheet, asked what had
"happened" to the design shown earlier — the answer being that it was a
*different* product (#006, unaffected by #001's session-internal
work-then-revert) — and, on confirming this, asked for the **same LumiumX
mockup** to become Product #006's design standard too, with #006's existing
functionality (categories, Transactions-List-driven Actuals, the ranking
engine) preserved exactly. The owner explicitly noted the accent colour
should be a customisable parameter of a shared pattern, not a one-off, with
more colour variants to follow later from a reference image still to be
supplied — that broader theming-system work is **not** part of this ADR and
has not been started; this ADR covers only Product #006's own reskin.

## Decision

1. **Adopt the LumiumX house register for Product #006**, superseding v4's
   rose/sage recreation. `xlsx-design-spec.json`'s `theme` block now carries
   the identical hex values Product #001 uses (`canvas` `#FAF7F2`, `ink`
   `#1F1F1F`, `subtleInk` `#3A3A3A`, `accent` `#C4644A`, `sage` `#7E8A7B`,
   `accentSoft` `#F2E6E1`, `sageSoft` `#E8ECE7`, Georgia display + Calibri
   body) — a per-product theme override on the same shared engine, not a
   change to `spreadsheet/src/design-system/tokens.mjs`'s `DEFAULT_THEME`.
   Product #001 and #005 are untouched.
2. **`cardHeading` (the per-sheet band-heading helper) now delegates to the
   shared `sectionHeading` component** instead of painting a solid
   rose/coloured band — every call site (`zoneTable`, Transactions List,
   Where My Money Went, Goal Tracker's section headings) keeps its existing
   call signature, so this is a one-function change, not a rewrite of every
   caller. The per-sheet unconditional 4-row colour band is replaced with
   the same warm-ivory canvas wash + "LUMIUMX / phase" masthead Product #001
   uses (`forEachCell` fill before content, then a two-part masthead row).
3. **KPI cards get a soft family-tinted fill + hairline frame**
   (`kpiBlockFrame`, ported from Product #001's build.mjs): income plain,
   the two spending pools (Expenses & Bills, Debt Payments) pale terracotta,
   Savings pale sage — restrained, not a saturated bordered card.
4. **Budget's layout changes from three stacked column-zones to a KPI band →
   2 charts → Cash Flow Summary → Available to Spend → a 3-across × 2-row
   table grid → Transactions List**, matching the mockup's flow. Every
   table's own cells, formulas and named-range wiring are unchanged; only
   *where on the sheet* each `zoneTable()` call is positioned changed. The
   ranking engine (Lists sheet) and its `Where My Money Went` table are
   unchanged mechanically — the table now sits in the grid's third slot
   instead of stacked under Income Summary.
5. **Two of v4's four Budget charts are dropped** (Income Breakdown, Actual
   Allocation) as redundant with tables already on the page — Income
   Summary and the KPI band already show that data. No data or formula is
   lost; both are still real tables. The remaining two charts are
   **Cash Flow** (bar, now with inline `£` value labels via a new
   `showValues` option) and **Where My Money Went** (now a *doughnut*, not a
   flat pie, with a live centre total reading straight through the ring's
   unfilled hole) — matching the mockup's two-chart, primary/supporting
   weighting rather than four charts of equal visual weight.
6. **`native-charts.mjs` gained two small, additive, backward-compatible
   capabilities**, both exercised for the first time by this product:
   - `barChartXml`: an optional `showValues` (+ `valueNumFmt`) flag adds a
     per-series `<c:dLbls>` data-label block. Existing callers that omit it
     get byte-identical output.
   - `doughnutChartXml`: optional `title`, `categoriesRef`/`categories` and
     `legendPos` turn the previously bare 2-slice progress ring into a
     titled, legended, N-slice doughnut. Callers that omit these (Goal
     Tracker's own progress ring, both here and on every other product)
     keep the exact original no-title/no-legend output.
   Both were verified against the full `spreadsheet` test suite (39/39
   passing, no changes needed to existing tests) before and after.
7. **The doughnut's centre total is a real cell, not a chart feature.** A
   merged range is positioned at the injected doughnut's anchor centre,
   holding `=<ranking engine total>`; because the doughnut's plot area is
   unfilled (`<c:spPr><a:noFill/></c:spPr>`, added to both `pieChartXml` and
   `doughnutChartXml` this revision) and the chart space itself already had
   `alpha="0"`, the cell reads straight through the ring's hole once the
   chart is spliced in over it. Verified visually in the rendered preview.
8. **The doughnut's legend data is a small new summary block on the Lists
   sheet** (`P70:Q74`, well clear of the ranking engine's own `I:N` working
   rows): the top 4 ranked categories plus a computed `Other` = total minus
   the top 4 — reusing the ranking engine's existing output rather than
   building a second mechanism.
9. **Two real bugs were found and fixed during this pass, both worth
   recording as lessons**, not just fixed silently:
   - **Column width is a whole-column property**, exactly as Excel row
     height is a whole-row property (the lesson ADR-021 already recorded
     for rows). Positioning Debt Payments Tracker and Bill Tracker at
     different `left` columns while both used the `hasDueAndPaid` column
     shape (different intended widths for the *same* physical columns)
     produced `###`-truncated currency cells and wrapped headers. Fixed by
     aligning every table to the same `left` as the row-1 table with the
     *identical* column shape (Bill Tracker ↔ Debt Payments Tracker;
     Expense Summary ↔ Savings Tracker; Income Summary ↔ Where My Money
     Went, the latter two harmonised to identical explicit widths since
     their shapes only approximately matched).
   - **OOXML element order is not advisory.** `CT_BarSer`'s schema requires
     `dLbls` after `invertIfNegative` (and before `cat`/`val`); the first
     `showValues` implementation put it before `invertIfNegative`, and
     LibreOffice silently mis-rendered the category axis as a result (it
     showed the *value* numbers where category text belonged) rather than
     rejecting the file outright. Fixed by correcting the element order;
     confirmed via a direct raw-XML dump of the built chart, not just a
     visual re-check, once the render looked wrong.
   - A third, unrelated pre-existing bug was also caught and fixed in the
     same pass: the Cash Flow bar chart's `categoriesRef` was hardcoded to
     column `B` (a leftover assumption from v4's `ZONE_A = 2` layout, where
     the category column genuinely was B); once Cash Flow Summary moved to
     `left: 1` in this revision, its category column became `A`, so the
     hardcoded `B` silently plotted the *Expected-amount* column as if it
     were categories. Fixed by threading the real column letter through
     `budget.cashFlow.categoryCol` instead of hardcoding it.
10. **Stale instructional copy was corrected**: the Instructions sheet's
    cell-colour key and subtitle referenced "rose/sage-filled = calculated"
    and "white cells are yours," accurate for v4's fills but not for v5's
    no-fill-on-calculated convention. Updated to "cream cell = you type
    here; plain cell = calculated," matching what the sheet now actually
    looks like.

## Alternatives considered

- **Leave charts at four, just recolour them.** Rejected — the mockup shows
  two charts of clearly different visual weight (Cash Flow dominant, Where
  Your Money Goes supporting), not four small ones; keeping four would have
  fought the "sleek, not dense" brief regardless of colour.
- **Keep the three-column-zone stack, only reskin colours/fonts.** Rejected
  — the mockup's flow (charts → Available to Spend → a clean table grid) is
  materially different from v4's stacked zones, and matching it faithfully
  needed the regrid, not just new colours on the old shape.
- **A literal 3×2 grid with Income Summary duplicated in both slots**
  (matching the mockup's own apparent "Income (Full Breakdown)" duplicate).
  Rejected — a duplicate table adds no information; the ranked Where My
  Money Went table (already built, otherwise homeless in the new layout)
  fills that slot with real, distinct value instead.
- **Push the theming-system generalisation (customisable accent, other
  colour variants) into this same change.** Rejected for scope — the owner
  said a reference image for that broader work is still to come; this ADR
  covers Product #006's own reskin only, using the exact mechanism (a
  per-product `theme` override) that already made Product #001 and #006 v4
  independently customisable.

## Consequences

- Verified (2026-09-15): `node cli.mjs` → 52/52 workbook QC checks
  (including the full LibreOffice recalculation scenario — unchanged
  formulas, still verified end to end), 11/11 preview checks, 3 native
  chart parts confirmed present (`countChartParts`, down from 5 — the QC
  assertion was updated to match the deliberate chart-count change).
  `spreadsheet` package: 39/39 tests passing throughout (no test needed
  updating; the two new chart-engine options are additive).
- Visual QA done by reading the actual rendered PNGs (all 3 sheets, both
  Budget charts, the Goal Tracker ring, the Transactions List's colour-coded
  Type column) for the seeded example workbook — confirmed real proportional
  data, correct category-axis labels, no column-width artefacts, no stale
  copy.
- `docs/LUMIUMX_ETSY_DESIGN_SYSTEM.md` and the `etsy-design-director`/
  `spreadsheet-design` skills remain stale, as already flagged in ADR-020
  and ADR-021 — unchanged by this ADR, still a follow-up.
- The broader ask — a shared, colour-customisable version of this layout as
  the default for *all* future spreadsheet products — is explicitly **not**
  done by this ADR. Product #001 and Product #006 each still carry their own
  independent `theme` override with the same hex values by coincidence of
  both having been asked to match the same mockup, not because of any new
  shared theming mechanism. That generalisation is real follow-up work,
  blocked on the additional reference image the owner said would follow.
