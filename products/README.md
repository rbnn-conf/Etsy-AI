# products/

One directory per product, numbered by launch order
(`NNN-product-slug/`). Each starts as a `PRODUCT_SPEC.md` (prose) and a
`DESIGN_SPEC.md` (machine-readable design intent), then gains:

- `product-spec.json` — the validated, provider-agnostic `ProductSpec`
  (the contract in `services/src/design/product-spec.ts`; schema and DB
  mapping in `docs/archive/PRODUCT_MODEL.md`). Reconciles `PRODUCT_SPEC.md` +
  `DESIGN_SPEC.md` into one object the pipeline consumes. Its optional
  `primaryExport` (`pdf` | `xlsx` | `hybrid`) says which pipeline is primary.
- `xlsx-design-spec.json` — for `xlsx` / `hybrid` products only: the
  machine-readable **spreadsheet Design Spec** (theme, sheets, tables,
  formulas, print, preview), consumed by `<id>/xlsx/`. Contract +
  validator in `@dpf/spreadsheet`. See `docs/XLSX_PIPELINE.md`.
- `<id>/render/` (PDF) and/or `<id>/xlsx/` (functional workbook) —
  product-specific build pipelines. Rendered output lands under
  `storage/products/<id>/` (git-ignored).
