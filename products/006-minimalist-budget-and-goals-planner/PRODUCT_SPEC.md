# Product #006 — Minimalist Budget & Goals Planner (Excel Edition)

**Status:** TEST / REVIEW VERSION — not approved, not listed on Etsy.

## What this is

Functionally a near-exact recreation of a third-party reference budget
workbook (`Simple Budget Spreadsheet (Green)`, "The Weekly Crew" — inspected
read-only, never modified, never redistributed, no branding carried over):
same categories, same Transactions-List-driven Actuals, same ranking engine
as when it was first built (see "Revision history"). Visually, as of v5, it
wears the LumiumX house register — the same warm-ivory/terracotta/sage
palette and card language as Product #001 — per a LumiumX-branded reference
mockup the owner supplied. This is a new, independent product. It does not
replace or modify Product #001, Product #005 (the unrelated in-progress
"LumiumX Smart Budget Dashboard"), or any other approved/live product.

## Structure — 3 sheets

1. **Instructions** — how the workbook flows, the cell-colour key (cream
   cell = type here; plain/no-fill = calculated), a "Different Transaction
   Types" glossary (Income/Expenses/Bills/Debt/Savings — the authoritative
   distinction between Expenses and Bills), a worked example, printing tips.
   No third-party branding or links.
2. **Budget** — THE PRODUCT. One workspace, top to bottom:
   - Budget-period + rollover inputs, then a 4-card KPI band (Income /
     Expenses & Bills / Debt Payments / Savings), each a soft family-tinted
     block (income=plain, spending pools=pale terracotta, savings=pale
     sage).
   - 2 native charts: **Cash Flow** (a bar, Expected vs Actual, with inline
     £ value labels — the primary visual, 10 of 16 columns) and **Where My
     Money Went** (a doughnut with a live centre total, 6 of 16 columns).
   - A compact **Cash Flow Summary** (Rollover / Total Income / Expenses /
     Bills / Debt / Savings / Total Leftover), then an **Available to
     Spend** feature (a large figure + an on-track/over-budget status line).
   - A 3-across x 2-row grid of category tables: **Income Summary / Expense
     Summary / Bill Tracker** on row 1, **Savings Tracker / Debt Payments
     Tracker / a ranked "Where My Money Went" table** on row 2 (the table
     feeding the doughnut's top-4-plus-Other legend).
   - A full-width **Transactions List** below the grid — the single place
     amounts are typed. Every table's **Actual** column is a live `SUMIF`
     off this list (never typed directly); a Type dropdown drives a
     dependent Category dropdown (`INDIRECT`) scoped to that Type, and the
     Type column itself reads as a restrained colour-coded word (sage for
     Income/Savings, terracotta for Expense).
3. **BONUS - Goal Tracker** — an Areas-of-Life roll-up (5 life areas: goals
   set / achieved / average progress), a native doughnut progress ring for
   overall completion, and an 8-row goals table (Life Area / Goal / Reward
   / Deadline / Status / Steps Done / Steps Total / Progress).

See `xlsx-design-spec.json` for the exact category lists, theme, and chart
specs, and `docs/adr/ADR-021-product-006-near-exact-reference-recreation.md`
(v4, structure/functionality) and
`docs/adr/ADR-022-product-006-lumiumx-house-register.md` (v5, this visual
pass) for the full technical rationale.

## Design — the LumiumX house register (v5)

Palette, fonts and layout language now match Product #001: warm ivory
canvas `#FAF7F2`, ink `#1F1F1F`, terracotta accent `#C4644A`, sage secondary
`#7E8A7B`, Georgia (display/titles) + Calibri (body) — the same Excel-safe
stand-in for Spectral/Inter that Product #001 uses. This **supersedes** v4's
hex-for-hex recreation of the reference workbook's own rose (`#EBC2B9`) +
sage two-tone palette and Cambria/Quattrocento Sans fonts (ADR-021) — see
"Revision history" below for why. No solid section-band fills anywhere;
section headings are plain tracked caps + a hairline, matching Product
#001's register.

Native charts were the one piece Excel-adjacent tooling couldn't produce
out of the box (ExcelJS can't write charts at all) — `@dpf/spreadsheet`
gained a real capability for this in v4 (`injectNativeCharts`, raw OOXML
chart/drawing injection) rather than falling back to a data-bar
approximation, extended in v5 with optional data labels and
titled/legended/multi-slice doughnuts. 3 real, native Excel charts ship in
this workbook: a clustered bar (Cash Flow, with inline value labels), a
doughnut with a live centre total (Where My Money Went, fed by the ranking
engine's top-4-plus-Other), and a doughnut (Goal Tracker's overall-progress
ring). v4 shipped 4 charts on Budget; Income Breakdown and Actual Allocation
were dropped in v5 as redundant with tables already on the page — no data
or functionality lost, both are still real tables.

## Functionality carried over

- Income, Expense, Bill, Debt and Savings each tracked Expected vs a
  **live** Actual (SUMIF off the Transactions List, not typed) — matching
  the reference's actual mechanism, not the "typed Actuals" convention
  Product #001/#005 use (see "Revision history": this is a deliberate,
  scoped reversal for #006 only).
- Bill/Debt: Due (day-of-month) + Paid checkbox + a live "still to pay"
  figure.
- Expense/Savings/Bill/Debt: a native progress bar (Actual ÷ Expected).
- A single Transactions List (Date / Type / Category / Amount /
  Description) with a Type→Category dependent dropdown and income/savings
  row tinting — the one place amounts are entered.
- A top-20 "Where My Money Went" ranking (across Expense+Bill+Debt+Savings,
  not Income), driven by a non-CSE array-formula engine on the hidden
  Lists sheet, feeding its own table and (top-4-plus-Other) the doughnut
  chart's legend.
- A Goal Tracker: 8 goals (life area, goal, reward, deadline, status,
  steps-done/steps-total progress), a life-area roll-up, and a native
  doughnut ring for overall completion.

## Deliberately NOT carried over (and why)

- Shop branding, external hyperlinks (Etsy shop, YouTube tutorial, Google
  Drive links), decorative lifestyle photography — governance rule, never
  in scope regardless of the "exactly" instruction.
- The reference's live `"$"`-symbol-fanout currency mechanism (splitting
  every amount into a symbol cell + value cell so the symbol can be
  retyped) — this shop is GBP-hard by house convention (Product #001 and
  #005 are both GBP-hard too); a plain `£#,##0.00` NumberFormat carries
  the same information with none of the fragility.
- The reference's full ~500-row Transactions List and 30-row-per-table
  blank padding — reduced to smaller but still generous capacities (100
  transaction rows; 12–20 rows per zone table depending on its category
  count) — same categories, same mechanics, meaningfully less file bloat
  and faster preview rendering.
- The reference's literal 3×3 merged-cell goal-card grid — adapted to a
  flowing 8-row table with the same fields (Goal/Reward/Deadline/Status/
  Steps/Progress) plus the Areas-of-Life roll-up and doughnut ring kept
  intact. The one deliberate fidelity trade-off in this revision, made for
  engineering time rather than necessity.
- The reference's legacy CSE (`Ctrl+Shift+Enter`) array formulas for its
  ranking engine — ExcelJS cannot write a cell marked as a true array
  formula, so the equivalent non-CSE `INDEX(range,0)` technique is used
  instead, producing identical results, portable to any modern Excel.

## Revision history

1. **v1** — Product #001's *old* terracotta editorial-hairline register (a
   mismatch, since corrected), functionality spread across 9 sheets rather
   than the reference's dense workspace shape.
2. **v2** (owner, 2026-09-13): Product #001's *current* card-based "Digital
   Stationery" system (ADR-018), sage-green theme, should be the design
   direction — not the terracotta register.
3. **v3** (owner, 2026-09-13): recreate the reference's literal 3-sheet
   structure (Instructions / Budget / BONUS) with Budget as one dense
   workspace, not spread across many sheets. Design stayed the sage-green
   card adaptation from v2 (ADR-020).
4. **v4** (owner, 2026-09-14): having reviewed the
   reference file's actual Budget Planner Dashboard directly, the owner
   instructed **"make it exactly like this,"** and — asked specifically how
   to handle the reference's native charts, the one genuine technical
   blocker — chose to have real native-chart-writing built rather than
   fall back to an approximation. This revision replaces v3's sage-green
   card design with the reference's own rose/sage two-tone palette, rebuilds
   Budget's structure to the reference's real three-column-zone shape with
   Transactions-List-driven Actuals, adds the ranking engine, and ships 5
   native Excel charts. See ADR-021 for the full technical account.
5. **v5** (owner, 2026-09-15) — this revision: having reviewed a
   LumiumX-branded reference mockup (the same "Monthly Budget" dashboard
   Product #001's own visual-polish pass targeted), the owner asked for that
   design as the standard, with #006's existing functionality preserved.
   This revision reskins Budget and Goal Tracker to the LumiumX house
   register (Product #001's palette/typography, ADR-022) — replacing v4's
   rose/sage recreation — regrids Budget into a KPI band + 2 charts +
   Available to Spend + a 3x2 table grid (from v4's three-column-zone
   stack), and drops 2 of v4's 4 Budget charts as redundant with tables
   already on the page. Structure/formulas/categories/data model are
   otherwise unchanged from v4. See ADR-022 for the full technical account,
   including two real bugs this pass found and fixed in the shared chart
   engine and in this product's own column layout.

This document, `product-spec.json`, and `xlsx-design-spec.json` describe
the current (v5) state only.

## Format

Excel `.xlsx` only (no Google Sheets variant, no print PDF). GBP hard.
