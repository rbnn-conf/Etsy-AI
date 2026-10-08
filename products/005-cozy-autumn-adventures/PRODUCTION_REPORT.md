# Product #005 — Cozy Autumn Adventures

Completed 2026-09-26. Prepared for owner Etsy review; not published.

## Source

- Directory: `products/005-cozy-autumn-adventures/source/`.
- 20/20 valid PNGs, exactly P001.png–P020.png, each **1254 × 1254**.
- Numerical page order retained. No exact decoded duplicates, blank or corrupt
  files; all 20 scenes visually reviewed. Original hashes unchanged by production.
- **PASS WITH NOTICE:** original detail is below 300 DPI at the intended size.
  Artwork is placed at 180 PPI without upscaling; no 300-DPI marketing claim.
- Approved edge compositions and tonal texture are retained. No art regeneration.

## Build

- `output/deliverables/LumiumX-Cozy-Autumn-Adventures-A4.pdf`: 20 pages, A4.
- `output/deliverables/LumiumX-Cozy-Autumn-Adventures-US-Letter.pdf`: 20 pages, US Letter.
- `output/png/A4/`: 20 PNGs, 1488 × 2105, native artwork pixels preserved.
- `output/png/US-Letter/`: 20 PNGs, 1530 × 1980, native artwork pixels preserved.
- `output/deliverables/LumiumX-Printing-Guide.pdf`: one-page guide.
- Canonical PNG ZIPs are retained in `output/deliverables/`; Etsy uploads are
  the split bundles below, not those oversized internal archives.
- All 40 PDF pages rendered. Contact sheets, individual PDF renders and a native
  compression comparison are available in `qc/`; page previews in
  `listing/source-previews/`.

## Marketing

- **10/10 PASS**, 2000 × 2000 PNGs in `output/marketing/`, numbered 01–10.
- `qc/marketing-contact-sheet.png` shows the full set.
- All ten images inspected individually; final visual rubric **43/46 PASS**.
- Actual artwork and print previews, Spectral/Inter, ivory/ink/terracotta.
- Two initial text/footer overlaps corrected. Final browser overlap, font,
  image loading and canvas checks pass. Hero checked at 170 pixels and greyscale.

## Etsy listing

**Title:** Cozy Autumn Coloring Book Printable, 20 Fall Coloring Pages, Cute
Autumn Activity, A4 & US Letter Digital Download

Warm description and 13 unique tags generated in `listing/LISTING.md` and
`listing/listing.json`. Title: 114 characters. Every tag: 20 characters or fewer.
No new personal-use/legal terms invented; no health or 300-DPI claims.

## Packaging

Upload all five files from **`output/etsy/`**. Sizes use decimal MB.

| Filename | Bytes | MB | Contents |
|---|---:|---:|---|
| LumiumX-Cozy-Autumn-Adventures-Bundle-1-of-5.zip | 18,644,801 | 18.64 | A4 PDF, printing guide, 3 PNG pages |
| LumiumX-Cozy-Autumn-Adventures-Bundle-2-of-5.zip | 18,455,724 | 18.46 | US Letter PDF, 3 PNG pages |
| LumiumX-Cozy-Autumn-Adventures-Bundle-3-of-5.zip | 18,417,535 | 18.42 | 11 PNG pages |
| LumiumX-Cozy-Autumn-Adventures-Bundle-4-of-5.zip | 18,867,228 | 18.87 | 12 PNG pages |
| LumiumX-Cozy-Autumn-Adventures-Bundle-5-of-5.zip | 14,955,977 | 14.96 | 11 PNG pages |

All ZIPs open and recover exactly the intended 43 customer files: two books,
one guide and 40 PNG pages. Exact entry names and SHA-256 evidence are in
`qc/production-report.json` and `qc/build-report.json`.
The 89.34 MB payload requires five attachments at the conservative 19 MB target.

Etsy's [digital-file limits](https://help.etsy.com/hc/en-us/articles/115015628347-How-to-Manage-Your-Digital-Listings)
and [tag limits](https://help.etsy.com/hc/en-us/articles/360000336307-How-to-Use-Tags-to-Get-Found-in-Search)
were checked on 2026-09-26. Each upload has more than 1 MB headroom below 20 MB.

## QC

- **13/13 tests passed:** 9 existing Product #004 regressions, 4 Product #005 tests.
- **11/11 automated requirement groups passed.**
- Source, page order, PDF render, PNG pixel equality, guide, marketing, listing,
  ZIP integrity and size validation pass.
- PDF embedding: native-size JPEG quality 98, 4:4:4, using the existing pipeline
  fallback. Minimum source/PDF PSNR: **45.21 dB**; mean near-white error at most
  **0.404/255**. Native crop inspected without visible block artifacts or loss of
  thin outlines. PNG delivery remains pixel-exact.
- Final visual inspection: **PASS**, recorded in `qc/VISUAL_QA.md`.
- Telegram workflow attempted: existing notifications are **disabled**. Nothing
  sent; local PNG previews are available. Credentials/configuration unchanged.

## Git

- Branch: `feature/product-3-midnight-seance` (the existing checkout).
- Added Product #005 configuration, build wrapper, listing/marketing assembly,
  QC, review script, tests and documentation; used the supplied 20 source files.
- Three existing modules changed: Product #004 `src/build.mjs`, `src/core.mjs`,
  `src/documents.mjs`. Changes add optional parameters with original defaults,
  plus a Windows rename fallback that verifies every copied file before readiness.
- Existing Product #004 artwork and outputs were not rebuilt or overwritten.
- Two previously staged Product #001 files remain untouched.
- No staging, commit, merge or push performed. Commit hash: none.

## Final status

READY FOR ETSY REVIEW: YES
