# ADR-011 — Marketing asset engine: composed Etsy graphics, distinct from the workbook preview

Status: Accepted (2026-08-31). Refines ADR-010's "Telegram review flow" point.

## Context

ADR-010 gave XLSX products a **workbook preview**: LibreOffice renders the real
`.xlsx` to a PNG per sheet, and Telegram showed those. That conflates two
different artifacts:

- **A) the customer deliverable** — the functional `.xlsx` itself.
- **B) the visual / marketing output** — what the owner approves for Etsy
  listing images and advertising.

A raw screenshot of a spreadsheet is not a good Etsy listing image. But a
marketing image must never claim functionality the workbook does not have
("automatic calculations", "8 worksheets") — claims have to be traceable to the
product spec or verified workbook metadata.

## Decision

1. **Two preview concepts, both produced, stored separately.**
   - **Workbook preview** (`storage/products/<id>/workbook-preview/sheet-NN.png`):
     faithful LibreOffice render of the real file. Internal QA + **source
     imagery** for marketing. Built by `products/<id>/xlsx/preview.mjs`.
   - **Etsy marketing package** (`storage/products/<id>/marketing/0N-*.png`):
     professionally composed 2000×2000 PNGs. This is what Telegram shows and
     what becomes the Etsy listing images. Built by `products/<id>/marketing/`.

2. **New reusable package `@dpf/marketing` (`marketing/`)** — HTML/CSS
   components → **Playwright/Chromium** (every `http(s)` request aborted, same
   rule as the print renderer) → PNG. Its own npm package (`playwright` dep;
   Chromium is already cached by the print pipeline). No Canva.
   - `design-system/` — marketing tokens (a display serif + Inter, warm paper,
     shadows, mockup framing, image ratios; sage accent kept on-brand) + one
     generated stylesheet. A product Design Spec may override the palette.
   - `components/` — `hero`, `mockup` (workbook shot in a device frame),
     `whatsIncluded`, `features`, `howItWorks`, `sheetPreview` (contact sheet),
     plus `kpiStrip`, `benefitCard`, `comparison`, `testimonialPlaceholder`
     (a *placeholder* — never a fabricated review), `productDetails`,
     `brandingFooter`. Product-agnostic; per-product layouts compose them in
     `products/<id>/marketing/build.mjs`.
   - `product-metadata.mjs` — `deriveMarketingData({ productSpec, xlsxDesignSpec,
     buildReport, qcReport })`. **Every capability claim is gated on a passing
     check in the workbook QC report**; worksheet count comes from the actual
     build report and must equal the design spec or it throws; it refuses to run
     on a failing workbook QC.
   - `claims.mjs` — every factual span is stamped `data-claim="<key>"`; QC
     re-reads them from the rendered DOM and verifies each against the metadata's
     `claimIndex`. An unrecognised key or a mismatched value fails.
   - `qc.mjs` — **Visual QC** (PNG exists, 2000×2000, nothing clipped past the
     canvas, branding present, product title present, text readable, no external
     requests) + **Marketing-Claim QC** (the above).

3. **QC is now three separate gates**, reported separately, approved together:
   Workbook QC · Visual QC · Marketing-Claim QC. `assembleSubmission` ANDs the
   workbook QC report and the marketing QC report — the product is "ready" only
   when **both** pass; either failing blocks it. Approval stays human; nothing
   auto-publishes.

4. **Telegram shows the marketing package.** `assembleSubmission` gains
   `marketingAssetsDir` (the album becomes the composed PNGs — page/workbook
   previews and the old listing images are skipped) and `marketingQcReportPath`.
   The headline gains `Visual assets: N`, `Workbook QC: …`, `Marketing QC: …`.
   `telegram:submit-review` switches to this mode automatically for `xlsx` /
   `hybrid` products (`--workbook-preview` forces the old faithful-render album).
   Still PNG-only, still GBP, fake + real modes unchanged.

5. **Full Product #001 pipeline** = `products/001-*/marketing/ → npm run pipeline`:
   spec → functional XLSX → workbook QC → workbook previews → marketing
   compositions → marketing QC → `READY FOR ETSY REVIEW` → (human)
   `telegram:submit-review`.

## Alternatives considered

- **Keep Telegram showing the raw workbook render** — rejected: not a
  commercial listing image; the owner is approving what goes in front of
  customers.
- **Canva / an external design tool** — explicitly out (ADR-007, ADR-010).
- **Free-text marketing copy from the model** — rejected: unverifiable. Claims
  are data-bound and re-verified from the DOM against gated metadata.
- **One combined QC report** — rejected: the deliverable and the marketing
  package fail for different reasons and are owned by different steps; they are
  ANDed at the review gate instead.
- **Marketing engine inside `@dpf/spreadsheet`** — different concern (HTML/CSS +
  Playwright vs ExcelJS); its own package.

## Consequences

- New package `marketing/` (`@dpf/marketing`), one dependency (`playwright`),
  fully tested (13 tests incl. a Chromium render + QC, which skips cleanly if no
  browser). Vendors Inter + Spectral (OFL 1.1) as inline `@font-face`.
- New per-product dir `products/001-*/marketing/` (`build` / `qc` / `pipeline`).
- `products/001-*/xlsx/preview.mjs` now writes `workbook-preview/sheet-NN.png`
  (was `preview/page-xlsx-NN.png`). `xlsx/cli.mjs` is workbook-only; the full
  pipeline moved to `marketing/cli.mjs`.
- `storage/products/001/` gains `workbook-preview/`, `marketing/`,
  `marketing-build-report.json`, `marketing-qc-report.json`.
- Prerequisites unchanged for build; preview/QC need LibreOffice + poppler
  (workbook) and a Playwright Chromium (marketing — already cached).
- The Etsy integration is untouched; wiring the approved marketing PNGs into
  `listing.json` as the listing images is a follow-up.
- The print PDF pipeline and its 226-check QC are untouched and still pass.
