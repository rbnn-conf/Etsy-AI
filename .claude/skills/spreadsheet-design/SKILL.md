---
name: spreadsheet-design
description: "Design functional spreadsheets (Excel/.xlsx) that are also visually premium. Use whenever working on the @dpf/spreadsheet engine (spreadsheet/src/design-system/), any products/<id>/xlsx/build.mjs, xlsx-design-spec.json, sheet layout, KPI/dashboard design, table styling, conditional formatting, progress indicators, input-vs-formula cell treatment, freeze panes, print setup, or workbook navigation. Also use when a workbook render 'looks like a generic template', has 'the same layout on every sheet', 'coloured bars everywhere', or 'doesn't look premium'. A spreadsheet is an interface, not a stack of tables."
metadata:
  version: 1.0.0
---

# Spreadsheet Design

You design workbooks as **interfaces**. The customer opens the file, scans for
where to type, enters numbers, reads results, and prints. Every visual decision
serves that loop.

## Read first

- `docs/design/SPREADSHEET_UX.md` — the full spec (sheet-by-sheet composition,
  cell conventions, table spec, KPI rules, print rules, GOOD vs BAD).
- `docs/design/COLOUR.md` + `docs/design/TYPOGRAPHY.md` — palette + type.
- `docs/LUMIUMX_ETSY_DESIGN_SYSTEM.md` — brand (accent per product family).
- `products/006-*/xlsx-design-spec.json` + `docs/adr/ADR-022-product-006-lumiumx-house-register.md`
  — the current live workbook implementing this register.
- Functional constraints in the product `PRODUCT_SPEC.md` +
  `xlsx-design-spec.json` **always win** over aesthetics.

## Domain knowledge

- **Excel UX**: tab order = workflow order; sheet 1 is onboarding (what this is,
  the loop, the legend, a worked example, print tips); freeze panes on every
  data sheet; print area + `fitToWidth:1` everywhere.
- **Information hierarchy**: the bottom-line figure (Leftover / Net) dominates;
  supporting figures are equal to each other; labels sit tight to their values.
- **Data-entry ergonomics**: left-to-right = fill order; dropdowns for every
  categorical field (from a `veryHidden` Lists sheet + named range); error-safe
  formulas (`IFERROR(…,0)`); pre-seed real content so it is never an empty grid.
- **Dashboards**: a KPI is *label + big tabular figure + whitespace*, not a
  bordered tinted box per metric. Group 3–4 on a row, one hairline under.
- **Formulas vs inputs**: input = faint warm `#FFFDF4` fill + warm hairline,
  unlocked. Calculated = plain, locked, no fill (let "no yellow" mean "don't
  type here"). Total = heavier top rule + bold, no fill.
- **Conditional formatting**: native, muted (`#2F7A3F` / `#B23B3B`), paired with
  a non-colour signal for greyscale printing.
- **Progress indicators**: native data-bar; fallback `REPT("│",…)`; never a
  static graphic. Bar = the family accent, one instance.
- **Printability**: portrait, one page wide, greyscale-safe, small muted
  header/footer.
- **Navigation**: short tab names in workflow order; optionally one accent-tab.

## Concrete rules

1. **Each sheet gets its own composition** — do NOT template all sheets the
   same. Dashboard = KPI statement; ledger = table; log = tight capture surface;
   two-block sheet = two separated sub-tables; review = comparison + prompts.
   (`SPREADSHEET_UX.md` §2 table.)
2. **No solid coloured section bars.** Section heading = tracked UPPERCASE
   Inter 600 + one hairline rule.
3. **Accent once per sheet** (rule under the title, or the emphasised figure) —
   Terracotta `#C4644A` for Finance/Planning, Sage `#7E8A7B` for
   Productivity/Wellness.
4. **At most two cell fills per sheet.** Never stack band + section + input +
   calc fills.
5. Tables: hairline row rules, medium header rule, double/medium TOTAL rule, no
   vertical gridlines except between distinct column groups, no fills on totals.
6. Row heights ≥ the `PRODUCT_SPEC.md` floor. Currency columns right-aligned,
   real number format `£#,##0.00` (never a text string).
7. Lock all formulas/headings/static cells; only input cells editable.
8. Freeze header + key label column on every data sheet.

## Anti-patterns

- Same layout on all 8 sheets (title → coloured bar → table → total).
- Solid Sage/Terracotta section bars on every section.
- Four competing cell fills.
- KPI = a bordered tinted box per metric.
- Sage accent on a Finance product; accent used as a large fill.
- `#DIV/0!` on a blank template; typed-string "currency".
- A "dashboard" sheet that is structurally identical to a ledger sheet.

## Examples

- **BAD**: `docs/design/examples/WEAK-workbook-sheet-2026-08-31.png` — solid
  sage section bar, wrong family accent, templated layout.
- **GOOD register**: `docs/design/examples/GOOD-editorial-finance-prototype.png`
  and Product #006's Budget sheet (ADR-022) — hairline rules, scarce accent,
  a dominant serif figure, no boxes.

## Quality criteria

- Open each sheet render: can you tell in 2 seconds where to type?
- Does the dashboard read as a *statement*, distinct from the ledgers?
- Count accent marks per sheet: ≤ ~2.
- Greyscale it: row-type and hierarchy still clear?
- Prints one page wide, nothing clipped, header/footer correct?
- Does it look like a £6+ product or a free template?
