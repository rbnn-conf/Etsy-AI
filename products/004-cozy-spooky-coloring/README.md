# Product #004 — Cozy Spooky Halloween Coloring Book

The revised specification is **20 source illustrations, 20 pages per format,
P001–P020**: one collection of connected cozy Halloween adventures. There are
no duplicated illustrations or blank backs. `story-order.json` maps original
source IDs to the final story sequence and titles; source filenames never change.

## Repository inspection and isolation

- Product #003 already uses `sharp` and `pdf-lib`. Reuse these library choices,
  pinned in this product's own package, without importing its renderer or QC.
- Its PDF preview utility also requires canvas/PDF.js, font analysis and product
  resource plumbing; that is unnecessary for direct raster placement here.
- Planner/stationery layouts, browser editors, marketing composition, database
  workflows and n8n are not dependencies of this product.
- The existing standalone `services/src/telegram/telegram-client.ts` is reused
  only by the optional preview sender. No shared service is modified.
- Root npm scripts are new dispatchers. Products #001 and #003 are unchanged.

## Use

Requires Node 24+. From the repository root:

```sh
npm ci --prefix products/004-cozy-spooky-coloring
npm --prefix products/004-cozy-spooky-coloring run build
npm --prefix products/004-cozy-spooky-coloring test
```

On Windows PowerShell with script execution disabled, use `npm.cmd`.

Put exactly 20 approved PNGs in `source/`, named `1.png` through `20.png` or
`P001.png` through `P020.png`. These are original source IDs, not final story
positions. Longer names containing one separated source ID are accepted, e.g.
`approved-P001-pumpkin.png`. Unexpected files, extra pages and duplicate IDs
fail validation. The pipeline never changes these files.

Sources must be portrait, single-frame PNGs. The approved 1055 x 1491 images
are accepted with an internal **PASS WITH NOTICE**: native 300-DPI source NO;
approximately 144 DPI if enlarged to the A4 area inside 12 mm margins. They
are placed slightly smaller at approximately 150 DPI, preserving native pixels.
Resolution is a notice, not a rejection. No AI enlargement or detail synthesis
is used. Do not advertise 300 DPI or infer source quality from canvas metadata.

White-pixel coverage and edge ink remain measured. The exact approved images
have reviewed scene compositions that extend to their boundaries and contain
dense linework; their hashes and review rationale are in `story-order.json`.
Those measured conditions are reported, not treated as production cropping.
Unreviewed files still require at least 70% near-white pixels and a 0.5% source
edge guard (minimum 3 pixels). Changed files cannot inherit a prior hash-bound
review. Blank images, rotated orientation, duplicates and corrupt files fail.

## Outputs

- `output/deliverables/`: the five requested canonical PDF/ZIP files.
- `output/png/A4/` and `output/png/US-Letter/`: individual P001–P020 PNGs.
- **`output/etsy/`: upload only these files**, after the current report passes.
- `qc/contact-sheet.png`: all 20 pages labelled by ID.
- `qc/build-report.txt` and `.json`: status, failures, checks, placements,
  source hashes, output hashes and exact attachment byte sizes.
- `listing/source-previews/pages/`: clean A4 previews for every page.
- `listing/source-previews/heroes/`: P001, P007, P014, P020, selected by ID only.
- `listing/source-previews/contact-sheet.png`: labelled overview.

PNG canvases are A4 1240 x 1754 and US Letter 1275 x 1650, tagged 150 PPI for
paper sizing. Both centre the approved 1055 x 1491 artwork without resampling.
QC compares every placed source pixel with the original decoded RGB values.
PDFs use exact paper sizes and embed native-size images, with proportional
placement and at least 12 mm margins. No trim, crop, threshold, redraw or
generated artwork is applied. Transparent sources are composited onto white.
PNG encoding is lossless; indexed encoding is accepted only after an exact
decoded comparison. The guide and listing copy describe home printing, not DPI.

All five canonical files are copied to the Etsy folder when each fits the
conservative 20,000,000-byte limit. Otherwise the PDFs, guide and individual
PNGs are losslessly grouped into at most five ZIP bundles. Each bundle retains
the original filenames and format folders. Customers download/extract all
bundles; the canonical five deliverables remain available internally. If this
cannot fit with lossless PDFs, PDF embedding is tried at JPEG 98, 95, 92, 90,
88, then 85, always native-size with 4:4:4 chroma. The highest fitting setting is recorded
in QC; PNGs stay pixel-exact. If none fits, the build fails without further
quality reduction or exceeding the attachment limit. It does not publish an
Etsy listing. `listing/description.md` supplies grounded storybook-style copy.

Source-edge checks detect likely clipping; they cannot establish whether the
approved image was already cropped elsewhere. Inspect the contact sheet and
full-size pages before Etsy approval. `READY FOR ETSY REVIEW` means automated
checks pass, not that a person has approved the artwork.

Builds stage generated files and publish after QC passes. Each attempt
invalidates the old readiness report first. A failed run can leave previous
output files on disk: **they are not approved by the failed report**. Preview
directories are generated and replaced on successful builds; put future
creative marketing images elsewhere. Interrupted runs may leave a lock and
staging directory; confirm no build is running before removing those files.

## Telegram

```sh
npm --prefix products/004-cozy-spooky-coloring run review
```

Uses the existing `.env` keys `TELEGRAM_NOTIFICATIONS_ENABLED=true`,
`TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`. A passing build sends its QC status,
contact sheet and four selected PNG previews. A failed build sends only its
failure status. No PDFs or ZIPs are sent. This is a separate explicit command,
so repeated local builds do not spam review chat. Creative listing images do
not yet exist and are not generated or sent by this pipeline.

Tests use temporary geometric diagnostic images only. They cover failure
gates, ZIP integrity, fallback packaging and a complete 20-page build. Test
fixtures never enter `source/` or the customer output directories.
