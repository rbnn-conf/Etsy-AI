# design-review — commands & file map

Concrete locations and commands for the 10-step workflow in `../SKILL.md`.

## What to inspect (step 2 — intent)

| Concern | Files |
|---|---|
| Marketing design system | `marketing/src/design-system/tokens.mjs`, `marketing/src/design-system/css.mjs`, `marketing/src/components/index.mjs` |
| Marketing per-product layout | `products/001-minimalist-monthly-budget-planner/marketing/build.mjs` |
| Marketing metadata / claims | `marketing/src/product-metadata.mjs`, `marketing/src/claims.mjs` |
| Spreadsheet design system | `spreadsheet/src/design-system/tokens.mjs`, `spreadsheet/src/design-system/components.mjs` |
| Spreadsheet per-product build | `products/001-minimalist-monthly-budget-planner/xlsx/build.mjs` |
| Spreadsheet design spec | `products/001-minimalist-monthly-budget-planner/xlsx-design-spec.json` |
| Product intent (source of truth) | `products/001-minimalist-monthly-budget-planner/PRODUCT_SPEC.md`, `DESIGN_SPEC.md`, `test/DESIGN_SYSTEM.md` |
| Brand | `docs/LUMIUMX_ETSY_DESIGN_SYSTEM.md` |
| Design knowledge base | `docs/design/*` |

## What to open and look at (step 3 — output)

```bash
# marketing set
open storage/products/001/marketing/*.png
# faithful workbook renders (source imagery + internal QA)
open storage/products/001/workbook-preview/sheet-*.png
```

Use the **Read tool** on each PNG (it renders images) — do not judge from HTML.

## Reports produced by the pipeline (context, not a substitute for looking)

- `storage/products/001/marketing-build-report.json` — assets, claim tokens, verified metadata
- `storage/products/001/marketing-qc-report.json` — technical Visual + Marketing-Claim QC
- `storage/products/001/xlsx-build-report.json`, `xlsx-qc-report.json`

## Regenerate (step 9)

```bash
# marketing only (needs a prior workbook build; Chromium cached)
cd products/001-minimalist-monthly-budget-planner/marketing
npm install            # first time
npm run build          # -> storage/products/001/marketing/*.png
npm run qc             # technical Visual + Claim QC

# workbook only
cd ../xlsx && npm run all      # build -> QC -> workbook preview -> preview QC

# the whole chain
cd ../marketing && npm run pipeline
```

Needs LibreOffice + poppler (workbook stages) and a Playwright Chromium
(marketing). See `docs/XLSX_PIPELINE.md`.

## Re-run technical QC (step 9)

```bash
cd marketing   && npm test      # @dpf/marketing unit tests
cd spreadsheet && npm test      # @dpf/spreadsheet unit tests
cd services    && npm test      # review/telegram wiring
```

## Scope of changes allowed when implementing (step 8)

**Allowed** (visual / design-system): `marketing/src/design-system/*`,
`marketing/src/components/*`, `products/001-*/marketing/build.mjs`,
`spreadsheet/src/design-system/*`, `products/001-*/xlsx-design-spec.json`
visual fields, `spreadsheet/src/design-system/components.mjs` styling.

**Not without explicit instruction**: the XLSX engine logic
(`spreadsheet/src/engine/*`), formula/QC behaviour, Product #001's functional
`PRODUCT_SPEC.md` scope, the Telegram/Etsy wiring, the render/QC pipelines'
control flow.
