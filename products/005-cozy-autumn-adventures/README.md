# Product #005 — Cozy Autumn Adventures

20 approved square illustrations, in P001–P020 numerical order. Originals are
never overwritten. `story-order.json` binds the approved edge compositions to
their SHA-256 hashes. All scenes were inspected in the source contact sheet.

## Production

This product calls the existing Product #004 builder, with explicit configuration
for square sources, branding, sequence, 180-PPI canvases and a 19,000,000-byte
attachment ceiling. Product #004's defaults and outputs remain unchanged.
The three small compatibility extensions live in its existing `src/` modules;
there is no parallel PDF/PNG/ZIP engine or new dependency installation.

From the repository root (Node 24+):

```powershell
node products/005-cozy-autumn-adventures/src/build.mjs
node products/005-cozy-autumn-adventures/src/marketing.mjs
node products/005-cozy-autumn-adventures/src/marketing-layout.mjs
node products/005-cozy-autumn-adventures/src/qc.mjs
npm.cmd --prefix products/004-cozy-spooky-coloring test
npm.cmd --prefix products/005-cozy-autumn-adventures test
```

Dependencies use the installed Product #004 libraries, shared marketing renderer,
and Product #003 PDF.js renderer. On Windows, the sandbox may require permission
for Chromium, test child processes and final staging-directory renames.

## Customer files and review

- `output/deliverables/`: canonical A4/US Letter PDFs, PNG ZIPs and printing guide.
- `output/png/`: 20 PNGs per format; original pixels retained exactly.
- `output/etsy/`: **upload only these customer ZIPs**, after final QC passes.
- `output/marketing/`: ten 2000 × 2000 Etsy listing images, numbered 01–10.
- `listing/LISTING.md`: final title, description, tags and upload instructions.
- `qc/`: source audit, PDF renders/contact sheets, marketing overview, numerical
  compression comparison and production report. `VISUAL_QA.md` records inspection.

Each 1254 × 1254 illustration occupies a 176.95 mm square on portrait paper.
PNG canvases are 1488 × 2105 (A4) and 1530 × 1980 (US Letter), tagged 180 PPI.
The tag describes the real placement, not invented detail. **PASS WITH NOTICE**:
these are not native 300-DPI illustrations. No enlargement or AI alteration.

The baseline tries lossless PDF embedding, then quality 98 downward only as needed
to fit at most five attachments. PNG delivery stays lossless. QC compares every
PNG illustration with decoded source pixels and every JPEG PDF image with its
source, then renders all 40 PDF pages. Larger white top/bottom margins preserve
the square composition; they are intentional.

Marketing uses the existing network-blocked HTML/Chromium renderer, vendored
Spectral/Inter and the LumiumX ivory, ink and terracotta palette. No colored
customer artwork, image-generation service, new artwork or licensing claims.
Product #004 has no finished marketing set; the requested ten-image sequence uses
the shared 2000-square convention. The user-specified ten-image brief takes
precedence over the design skill's six-image default.

The print builder's readiness status covers print production only. Overall
readiness additionally requires `qc/production-report.json`, passing regression
tests, and current `qc/VISUAL_QA.md`. A rebuild invalidates downstream approval.
This is preparation for owner review, not publication or owner approval.

Telegram review uses `npm.cmd --prefix products/005-cozy-autumn-adventures run review`.
It sends PNG previews and a brief status only, through the existing client.
Nothing is uploaded to Etsy, merged, pushed or committed by these commands.
