# XLSX pipeline — functional spreadsheet products + Etsy marketing package

Decision + rationale: **ADR-010** (XLSX engine) and **ADR-011** (marketing
asset engine). This document is the how-to.

The XLSX pipeline sits **alongside** the print PDF pipeline
(`products/<id>/render/`), not in place of it. A product declares which
one is primary via `primaryExport` in its `product-spec.json`.

There are **two distinct artifact types** from the same spec:

| | A) Customer deliverable | B) Visual / marketing output |
|---|---|---|
| what | the functional `.xlsx` | composed 2000×2000 Etsy PNGs |
| built by | `products/<id>/xlsx/` (`@dpf/spreadsheet`, ExcelJS) | `products/<id>/marketing/` (`@dpf/marketing`, HTML/CSS + Playwright) |
| preview | **workbook preview** — LibreOffice render of the real file, for QA + as source imagery | **the deliverable** — what Telegram shows and what goes on Etsy |
| QC | Workbook QC (+ recalculation scenario) | Visual QC + Marketing-Claim QC |

> **Canva is NOT a required dependency for product generation.** No
> pipeline — PDF, XLSX, or marketing — uses Canva or any Canva API.

---

## 1. Architecture

```
products/<id>/product-spec.json          (source of truth for intent/content)
products/<id>/xlsx-design-spec.json       (spreadsheet Design Spec)
        │
        ▼
@dpf/spreadsheet  (spreadsheet/)                @dpf/marketing  (marketing/)
  engine/  ExcelJS wrapper — WorkbookBuilder      design-system/ marketing tokens + 1 stylesheet
  design-system/ "Etsy Spreadsheet DS v1"         components/    hero, mockup, whatsIncluded,
  preview/ LibreOffice → pdftoppm → PNG                          features, howItWorks, sheetPreview …
  qc/      workbook + recalcWorkbook() scenario   product-metadata.mjs  VERIFIED claims (gated on
  spec/    SpreadsheetDesignSpec + validator                            workbook QC + build report)
        │                                         claims.mjs / qc.mjs  Visual + Marketing-Claim QC
        ▼                                         render.mjs  HTML → Playwright/Chromium (net blocked)
products/<id>/xlsx/  (mirrors render/)                  ▲
  build.mjs   spec → storage/<id>/final/*.xlsx          │ workbook-preview PNGs = source imagery
  preview.mjs workbook → storage/<id>/workbook-preview/sheet-NN.png
  qc.mjs      workbook + recalculation QC               │
  cli.mjs     build → QC → workbook preview → preview QC │
        │                                               │
        └───────────────►  products/<id>/marketing/  ◄──┘
                             build.mjs    → storage/<id>/marketing/0N-*.png
                             qc.mjs       → marketing-qc-report.json
                             cli.mjs      THE FULL PIPELINE (npm run pipeline)
        │
        ▼
services/src/review + services/src/telegram
  headline: Format: XLSX · Visual assets: N · Workbook QC · Marketing QC
  album: the composed marketing PNGs (PNG-only; no PDF/XLSX ever sent)
```

Nothing above imports Etsy code. The Etsy integration is untouched.

---

## 2. The engine — `@dpf/spreadsheet`

`WorkbookBuilder` (`spreadsheet/src/engine/workbook-builder.mjs`) is a
documented wrapper over [ExcelJS]. Every method maps closely onto one
ExcelJS operation; `builder.wb` and the raw worksheet objects are always
reachable.

Supported: worksheets (incl. `veryHidden` helper sheets), values &
formulas, themed styles by semantic KIND (`title` / `sectionHeading` /
`tableHeading` / `body` / `label` / `input` / `calc` / `total` /
`footnote`), merges, row heights, column widths, number / currency / % /
date formats, data validation (list dropdowns, numeric bounds),
conditional formatting, **data bars** (the progress-bar primitive),
freeze panes, print area, page orientation, margins, print scaling
(`fitToWidth`), headers/footers, named ranges, and sheet protection that
**locks formula cells and leaves input cells editable**.

**Input vs formula cells are visually distinct**: KIND `input` →
faint-warm fill + warm border + `locked:false`; KIND `calc` → cool tint +
bold + `locked:true`. After `protectFormulas(ws)` a customer can type in
the yellow cells but cannot delete a formula.

**Charts**: ExcelJS cannot *write* embedded charts. Progress / "mini
chart" needs are met with conditional-formatting data bars and REPT()
in-cell bars — both recalculate, print, and survive edits. This is a
documented limitation, not a bug.

## 3. The design system — "Etsy Spreadsheet Design System v1"

`spreadsheet/src/design-system/`.

- `tokens.mjs` — `DEFAULT_THEME` (restrained sage-accent palette matching
  Product #001, a small type scale, spacing, borders, number formats,
  A4 print defaults) + `resolveTheme(overrides)`. A product Design Spec's
  `theme` block is deep-merged over the default; `{ currency: "GBP" }`
  rewrites the currency number formats.
- `components.mjs` — `titleBlock`, `sectionHeading`, `table`
  (header / body / input / total rows, alternating bands, per-row
  formulas, SUM totals), `kpiCard`, `callout`, `progressBar`,
  `checkboxColumn`, `statusColumn`. Each returns the addresses / ranges it
  occupied so callers can wire formulas and QC.

Palette is deliberately professional — no icon-heavy or childish styling.

## 4. Product Spec → XLSX

`product-spec.json` gains (both optional, backward-compatible):

```jsonc
"exportFormats": ["pdf", "zip", "xlsx"],
"primaryExport": { "type": "hybrid" },     // "pdf" | "xlsx" | "hybrid"; absent ⇒ "pdf"
"spreadsheet": {                           // opaque here; full contract in @dpf/spreadsheet
  "specRef": "products/<id>/xlsx-design-spec.json"
}
```

When `primaryExport.type` is `xlsx` or `hybrid`, `exportFormats` must
include `"xlsx"` (enforced by `validateProductSpec`).

### The spreadsheet Design Spec (`xlsx-design-spec.json`)

Validated by `validateSpreadsheetSpec` (`@dpf/spreadsheet/spec`). It
defines: `theme` overrides, `print`, `preview` requirements, and a
`sheets[]` array — each sheet has `name` (≤31 chars, no `\ / ? * [ ] :`),
`title`, `order`, `kind`, and an opaque `sections` tree that the product
`build.mjs` interprets (exactly as the print pipeline treats
`pages[].sections`). The generator interprets the spec; design logic is
not buried in one script.

## 5. Two previews

### 5a. Workbook preview (faithful render, internal + source imagery)

`renderXlsxPreview(xlsxPath, opts)`:

1. strip `veryHidden` / excluded sheets into a throwaway copy (LibreOffice
   headless renders hidden sheets otherwise),
2. `soffice --headless --convert-to pdf` — opens the real file,
   recalculates formulas on load, lays out every sheet,
3. `pdftoppm -png -r <dpi>` — one PNG per page,
4. `products/<id>/xlsx/preview.mjs` writes
   `storage/products/<id>/workbook-preview/sheet-NN.png` (+ `primary.png`).

The PNG is a render of the file the customer downloads — **not** a
re-created HTML mock. Used for QA and as **source material** for the
marketing package. `recalcWorkbook(xlsxPath)` returns every sheet's
computed values (LibreOffice → multi-sheet CSV) for scenario QC.

### 5b. Etsy marketing package (composed, customer-facing) — `@dpf/marketing`

`products/<id>/marketing/build.mjs`:

1. `deriveMarketingData({ productSpec, xlsxDesignSpec, buildReport, qcReport })`
   — **the only things the assets may assert**. Worksheet count comes from
   the build report; every capability claim is **gated on a passing check
   in `xlsx-qc-report.json`**; it throws on a count mismatch and refuses a
   failing workbook QC.
2. compose 5 assets from `@dpf/marketing` components, embedding the
   workbook-preview PNGs as `data:` URIs and stamping every factual span
   `data-claim="<key>"`.
3. `renderAssets()` → Playwright/Chromium (every `http(s)` request
   aborted) → `storage/products/<id>/marketing/0N-*.png` (2000×2000).

**Prerequisites**: workbook preview needs `libreoffice` + `poppler`
(`brew install --cask libreoffice` + `brew install poppler`, or
`SOFFICE_BIN` / `PDFTOPPM_BIN`); marketing needs a Playwright Chromium
(already cached by `render/`). The workbook *build* needs none of them.

## 6. Telegram review flow

ADR-009 behaviour preserved; the album is now the **marketing package**:

- headline gains `Format: XLSX · Currency: GBP`, `Visual assets: N`,
  `Workbook QC: PASS/FAIL`, `Marketing QC: PASS/FAIL`;
- `assembleSubmission({ marketingAssetsDir, marketingQcReportPath })` —
  the album is the composed `0N-*.png`; page/workbook previews and the old
  `listing.json` images are **not** attached. The QC gate ANDs the
  workbook QC report and the marketing QC report — ready only when **both**
  pass, either failing blocks it;
- `telegram:submit-review` switches to this mode automatically for
  `xlsx` / `hybrid` products; `--workbook-preview` forces the faithful
  workbook render album instead (`preferVariant: "xlsx"`);
- still **PNG only** — no PDF, no XLSX file is sent. Fake
  (`--console` / `telegram:review-demo`) and real modes unchanged. GBP.

## 7. QC — three gates, reported separately, approved together

**Workbook QC** (`@dpf/spreadsheet/qc` + `products/<id>/xlsx/qc.mjs`):

- **Structure** — expected sheets exist, in order, none blank; named ranges.
- **Functionality** — formulas exist where expected; every formula is
  syntactically valid (balanced parens, no spilled `#REF!`); formulas
  reference the right ranges; dropdowns + conditional formatting present.
- **Formatting** — currency (`£…`) and `%` number formats; titles; total
  rows are formulas; column widths sane.
- **Print** — print area set, orientation, `fitToWidth` scaling.
- **Preview** — PNG exists, non-empty, sensible dimensions, page count.
- **Scenario** — known inputs → LibreOffice recalculation → asserted
  dashboard maths (Income Σ, Expenses, Leftover = Income − Expenses −
  Savings, savings rate). Proven by *recalculation*, never formula strings.

**Visual QC** (`@dpf/marketing/qc`): each PNG exists, is 2000×2000,
nothing clipped past the canvas, branding present, product title present,
text readable (min font ≥ 20px on the 2000 canvas), no external requests,
expected asset count.

**Marketing-Claim QC**: every `data-claim` span, re-read from the rendered
DOM, must match the verified `claimIndex` — an unrecognised key or a
mismatched value (incl. wrong numbers) fails.

## 8. Creating a new spreadsheet product

1. Write `products/<id>/PRODUCT_SPEC.md` + `product-spec.json`; add
   `"xlsx"` to `exportFormats` and set `"primaryExport": { "type": "xlsx" }`
   (or `"hybrid"`).
2. Write `products/<id>/xlsx-design-spec.json` — see #4 and Product #001's
   file as the worked example.
3. Copy `products/001-*/xlsx/` and `products/001-*/marketing/` as starting
   points; adapt `build.mjs` in each. Keep product logic there, not in the
   `@dpf/*` packages. Add feature labels for new sheet slugs in
   `@dpf/marketing`'s `FEATURE_LABELS`.
4. `cd products/<id>/marketing && npm install && npm run pipeline`.
5. Review `storage/products/<id>/marketing/*.png` (Human Review Gate),
   then `telegram:submit-review -- --product <id>`.

## 9. How Claude generates the specs

### Spreadsheet Design Spec (`xlsx-design-spec.json`)

- Start from the print `PRODUCT_SPEC.md` / `product-spec.json` — it stays
  the source of truth for scope and content. Do not drop functionality:
  an 8-page print product maps to 8 worksheets.
- One sheet per logical page. Give each `name` (≤31 chars, safe chars),
  `title`, `order`, `kind`, `slug`.
- Prefer real formulas over static numbers everywhere a number is
  derived. Wrap division in `IFERROR(...,0)`.
- Mark editable cells as inputs and derived cells as calc.
- Use the restrained default palette; only override `theme.color` when the
  product's Design Spec calls for it (6-digit hex, no `#`).
- Declare `preview` (`dpi`, `sheets`) and `print` (orientation, `fitToWidth`).

### Marketing assets (`products/<id>/marketing/build.mjs`)

- **Never invent product functionality.** Everything an asset asserts must
  come from `deriveMarketingData()` — the worksheet count from the build
  report, capabilities gated on the workbook QC report. If the workbook
  doesn't do it (and QC didn't confirm it), don't claim it.
- Pass structured data to components, not free sentences. Tone / benefit
  copy is fine but is the author's, never a factual claim.
- Stamp every factual span with `claimKey` (a `claimIndex` key); Marketing-
  Claim QC will reject anything unrecognised or mismatched.
- Keep it on-brand: the marketing palette shares the sage accent and Inter
  body with the workbook; a product Design Spec may override the palette.

## 10. Commands & inspection

```bash
# reusable-engine tests / demo
cd spreadsheet && npm install && npm run demo && npm test
cd marketing   && npm install && npm test

# Product #001 — THE FULL PIPELINE
cd products/001-minimalist-monthly-budget-planner/xlsx      && npm install && cd -
cd products/001-minimalist-monthly-budget-planner/marketing && npm install
npm run pipeline       # XLSX -> workbook QC -> workbook previews
                       #      -> marketing compositions -> marketing QC
                       #      -> READY FOR ETSY REVIEW
# workbook-only stages:
cd ../xlsx && npm run all      # build -> workbook QC -> workbook preview -> preview QC

# then the phone review (composed marketing PNGs, split QC, GBP):
cd ../../../services && npm run telegram:submit-review -- --product 001   # add --console to preview

# inspect
open storage/products/001/final/minimalist-monthly-budget-planner.xlsx    # the deliverable
open storage/products/001/workbook-preview/sheet-01.png                    # …-08 faithful renders
open storage/products/001/marketing/01-hero.png                           # …-05 Etsy assets
cat  storage/products/001/xlsx-qc-report.json  storage/products/001/marketing-qc-report.json
```

Everything under `storage/` is git-ignored.

[ExcelJS]: https://github.com/exceljs/exceljs
