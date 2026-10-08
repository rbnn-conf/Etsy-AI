# Midnight Séance — Product 003

Prompt 3 artwork is approved for Prompt 4. Prompt 4 delivers all 18 stationery masters and an offline text editor; owner visual approval of this milestone is pending. The remaining collection is reserved for Prompts 5–10. Builds are deterministic and offline; artwork generation is a separate authoring step using the built-in image generator. No Claude API or runtime AI is required.

From the repository root:

```powershell
npm.cmd --prefix products/003-midnight-seance ci --ignore-scripts
npm.cmd --prefix products/003-midnight-seance exec playwright install chromium
npm.cmd --prefix products/003-midnight-seance run proof
npm.cmd --prefix products/003-midnight-seance test
npm.cmd --prefix products/003-midnight-seance run qc
```

Node 24+, pinned dependencies, Playwright Chromium and installed Edge are required for the complete review. Missing fonts, artwork, browser support or native canvas packages stop the build. Rendering uses real embedded fonts, PDF.js/native canvas for PDF-derived 300 dpi PNGs, and Sharp for technical artwork preparation/contact sheets.

Current output: storage/products/003/prompt-03-review/. REVIEW.html indexes eight PDFs, eight PDF-derived PNGs, a self-contained offline editor and frozen build manifest. Prompt 2 snapshots remain preserved at their existing output roots and earlier commits; the old revision environment variable does not select an earlier renderer. Ordinary builds have no Telegram/Etsy/API side effects.

The artwork directory owns 35 original designs and 35 independently generated economy variants, raw and production PNGs, native-resolution ivory/white inspection images, contact sheets, exact prompt records and 19 rejected candidates. Run node tools/artwork-qc.mjs to recheck source transparency and bounds. Matching source/production hashes retain prior inspection; changed art requires fresh individual review. The finalize-artwork script records completed human review and must only run after every current candidate has been visually inspected. It does not automate visual acceptance.

The editor opens locally without a server and saves/loads JSON text/theme/paper. It bundles artwork and fonts; printing is disabled during validation and image decoding. Preview renders coalesce typing bursts to avoid repeatedly decoding artwork. Chrome/Edge save, load and print behavior is regression-tested. Full fillable-PDF production and buyer reader checks remain Prompt 7 work. Physical printing remains a Prompt 8 check; no CMYK, PDF/X or foil claims are made.

Prompt 4 has its own entry point and output root, preserving the earlier proofs:

```powershell
npm.cmd --prefix products/003-midnight-seance run stationery
npm.cmd --prefix products/003-midnight-seance run stationery:editor-qc
npm.cmd --prefix products/003-midnight-seance run stationery:clearance-qc
npm.cmd --prefix products/003-midnight-seance run stationery:export-qc
npm.cmd --prefix products/003-midnight-seance run stationery:stress
npm.cmd --prefix products/003-midnight-seance run stationery:qc
npm.cmd --prefix products/003-midnight-seance run stationery:review
```

Open `storage/products/003/prompt-04-review/REVIEW.html` for the complete review. The stationery editor embeds its fonts and lossless transparent artwork derivatives (600 ppi at the largest intended placement). No asset folder or server is required for customer editing. Production PDFs retain the approved original PNGs. Saved wording is version 4; earlier proof-editor JSON is a separate format. Use finished-size PDFs with matching custom paper, or choose A4/US Letter print sheets at 100% for home printing. Table tents are one-sided; fold at the midpoint. Native small items omit cutting/hole guides. A4/Letter carrier sheets include them outside cutting boundaries, with optional hole circles on tags.

The build temporarily serves a fixed allowlist of Product 3 fonts/artwork on an ephemeral loopback port for rendering; it never exposes arbitrary repository files. Ordinary builds do not send Telegram messages, publish or modify Products 1/2. After rebuilding PDFs, regenerate the inspection views and actually inspect every changed page before recording acceptance. Automated QC cannot confer owner visual approval.

See `docs/archive/product-3/PROMPT_04_REPORT.md` for evidence and `docs/archive/product-3/PROMPT_05.md` for the exact next milestone, conditional on owner visual approval.

## Prompt 4 final polish

The current stationery build writes to `storage/products/003/prompt-04-polish-review/`. The previous `prompt-04-review/` directory and report remain preserved historical review evidence. The current PDF renderer and offline editor use asset-specific, non-destructive production variants in `artwork/prompt-04-polish/`; original Prompt 3 source and production files remain unchanged. Only the 52 assets actually used by stationery receive variants. There is no new artwork generation or complete-page rasterisation.

`stationery:artwork-prepare` recreates production variants from SHA-256-verified originals. `stationery:typography-qc` checks category minimums by deliberately reducing text and confirming rejection/recovery. After building and completing editor/QC inspections, run `stationery:review` followed by `stationery:polish-review` to create the full collection review, ten-item focused review, before/after comparison, artwork-consistency comparisons and a vector typography inspection PDF at actual print size. Manual acceptance scripts must only run after actually viewing the current images. Typography sheets carry a 100 mm calibration line; screen display does not establish physical print quality.

See `docs/archive/product-3/PROMPT_04_POLISH_REPORT.md` for the final refinement candidate. Prompt 5 remains conditional on visual approval; six numbered prompts remain.
