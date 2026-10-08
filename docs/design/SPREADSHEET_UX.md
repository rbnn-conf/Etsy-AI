# Spreadsheet UX / UI

**A spreadsheet is an interface, not a stack of tables.** The customer opens it,
scans for where to type, enters numbers, and reads results. Design for that loop.

Applies to `@dpf/spreadsheet` (`spreadsheet/src/design-system/`) and every
`products/<id>/xlsx/build.mjs`. Functional requirements in the product
`PRODUCT_SPEC.md` and `xlsx-design-spec.json` always win over aesthetics; this
file governs *how* those requirements look and feel.

---

## 1. The workbook is a product with a front door

- **Sheet 1 is onboarding**, not data: what this is, the 3-step loop, the legend
  (yellow = type here, grey = calculated, ✓ = done), one worked example, print
  tips. Tab order = the workflow order.
- **Tab names** are short and in workflow order. Colour the active-family tab
  (one Terracotta tab) if it helps navigation; do not rainbow the tabs.
- **Freeze panes** on every data sheet (header row; key label column). The user
  should never lose the header while scrolling.
- **Print area + one-page-wide fit** on every sheet (`fitToWidth: 1`). Each
  sheet prints clean on A4 and US Letter.

## 2. Every sheet has its own composition — do NOT template them

The current build renders all 8 sheets identically (title → solid accent bar →
table → total). That is the spreadsheet version of the cookie-cutter layout.

| Sheet kind | Composition |
|---|---|
| **Dashboard / Overview** | Not a table. A *statement*: 3–4 KPI figures across the top (Income · Expenses · Savings · **Leftover**), Leftover clearly dominant; a savings-rate line with an in-cell bar; a short "priority / notes" block. Reads like the front page of a financial journal. |
| **Ledger (Income, Bills)** | A real table: two-tier header if there are column groups, hairline row rules, a heavier rule above the TOTAL, generous row height. |
| **Budget vs actual (Variable)** | Table + a computed **Difference** column with conditional formatting (red when over). The comparison *is* the point — give Difference visual priority. |
| **Log (Daily)** | 31 tight pre-numbered rows. Minimal chrome — it is a capture surface. Day numbers pre-printed, muted. |
| **Two-block sheet (Savings & Debt)** | Two visually distinct sub-tables separated by a full-width hairline and independent headers — never one merged grid. Progress via a native data bar. |
| **Review** | A compact comparison table + prompt lines. The Leftover/Shortfall row gets the same emphasis treatment as the dashboard's Leftover figure. |

## 3. Section headings — no solid colour bars

Replace the full-width solid Sage/Terracotta section bar with: **tracked
UPPERCASE Inter 600 + a hairline rule underneath**. The accent appears at most
once per sheet (the rule under the sheet title, or the emphasised figure).

## 4. Formula cells vs input cells — one clear convention, applied once

- **Input** (customer types here): a *very* faint warm fill `#FFFDF4` + a warm
  hairline. That's it. Keep it subtle — black ink on it must stay ~12:1.
- **Calculated** (locked): plain, no fill, right-aligned for numbers, slightly
  muted label. A grey fill is optional but adds noise — prefer *no* fill and let
  "no yellow" mean "don't type here".
- **Total / subtotal**: heavier top rule + bold, no coloured fill.
- Do not stack four competing fills (band + section + input + calc). Pick two at
  most per sheet. Alternating row bands are optional and, if used, must be
  barely-there (`#F7F6F3`).

## 5. Protection

Lock every formula, heading and static cell. Leave only input cells editable
(`protection.locked = false`). The customer can type in the yellow cells and
cannot delete the maths by accident. Allow column/row resize and sort.

## 6. KPI cards & dashboards

- A KPI is a **label + a large figure**, aligned, with room around it — not a
  bordered tinted box per metric.
- Group 3–4 KPIs on one row with only whitespace between them; one hairline
  under the row.
- The single most important figure (Leftover) is larger and/or gets the one
  accent mark. The others are equal to each other.
- Big figures: Inter 600 tabular, decimal-aligned, `£#,##0.00` number format
  (real Excel format, never a text string). Negative in the muted red via the
  number format's negative section, not a font colour.

## 7. Progress indicators

- Use a **native conditional-formatting data bar** for "% of goal" / "budget
  used" — it recalculates, prints, and survives edits.
- Fallback: a `REPT("│", …)` in-cell bar in a mono font. Never a static
  hand-drawn bar graphic.
- Bar colour = the family accent, one instance.

## 8. Tables — visual spec

- Header: Inter 600, centred, `#F5F7F6` or ivory band, a **medium** bottom rule.
- Body rows: hairline bottom rule only (`#E6E1D9`). No vertical gridlines except
  between genuinely distinct column groups.
- Row height: ≥ the `PRODUCT_SPEC.md` floor (e.g. ≥7mm print). Generous for
  ledgers, tight for logs.
- TOTAL row: **double or medium top rule**, bold label right-aligned, formula
  cell. Never a fill.
- Currency columns: right-aligned, min width from the spec (≥20mm print).
- Checkboxes: a centred data-validation dropdown of `"" / "✓"`. Prints. No form
  controls (ExcelJS can't write them reliably).

## 9. Data entry ergonomics

- Left-to-right = the order a person fills a row (name → amount → date → done).
- Dropdowns for any categorical field (categories, status) sourced from a
  `veryHidden` `Lists` sheet + a named range. Consistency beats free text.
- Error-safe formulas: wrap division in `IFERROR(…,0)`. A `#DIV/0!` on a blank
  template is a QC failure.
- Pre-seed real content (preset category names, day numbers 1–31) so the sheet
  is not an empty grid on open.

## 10. Printability

- Portrait, `fitToWidth: 1`, `fitToHeight: 0`. Margins ~0.4–0.55in.
- Header/footer: product name centred, `Page &P of &N` right. Small, muted.
- Everything greyscale-safe: never rely on colour alone to distinguish a row
  type — pair it with weight or a rule (LUMIUMX grayscale rule).

---

## GOOD vs BAD

| BAD (current build) | GOOD |
|---|---|
| All 8 sheets: title → solid Sage bar → table → total | Dashboard is a KPI statement; ledgers are tables; log is tight — each sheet composed for its job |
| Solid accent bar on every section | Tracked-caps heading + one hairline; accent once per sheet |
| 4 fills competing (band, section, input, calc) | Input = faint yellow + hairline; calc = no fill; that's it |
| KPI = tinted bordered box per metric | KPI = label + big tabular figure, whitespace between, one hairline under |
| Sage as the accent on a Finance product | Terracotta `#C4644A`, used once |
| Emphasis border on Leftover barely visible | Leftover figure 1.4× the others + the single accent mark |

See `examples/EXAMPLES.md` (`WEAK-workbook-sheet-*`) and the hand-authored
`products/001-*/test/DESIGN_SYSTEM.md` for the target register.
