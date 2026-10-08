# Product 016: Stage 2 layout and PDF QC investigation

Baseline before repository edits: automation **294/294**, marketing **66/66**, production **93/93**. All had zero failures, skips and cancellations. Commands: `npm.cmd test` in each package. Durations: 501319.9496 ms, 24652.5316 ms, 161936.6821 ms respectively.

The repository already contained extensive uncommitted work. Existing Stage 1/2/3 adapters, approval gates and integrity checks match the handoff. Some introductory README/CLAUDE.md prose is historical; the implemented packages and later crochet ADRs are authoritative for this task.

## Root cause established before code changes

No approved instruction was lost in the four reported patterns. `Flow.text` placed the complete source in ordered lines, splitting at page boundaries. `drawPages` drew every line. The PDF extractor returned that text, but adapter QC joined whole pages and searched for one contiguous step/assembly substring. A first-page step label, footer, folio and next-page continuation header interrupted that substring. Safe wrapping on one page was already normalized; cross-page furniture was not.

Waxflower was an assembly failure, not a missing `step.text`: all Waxflower step texts were found.

## Exact source-to-PDF traces

Source file: `products/016-crochet-flower-bouquet-pattern-bundle-33/crochet/patterns.json`. Source paths below are zero-based. In the handoff, prepend `$.crochet.bundle` in place of `$`. The current affected values are identical to those in the saved handoff; its approval checksum is stale only because of the separate Sleeping Rosebud correction. The diagnostic used a memory-only current-bundle copy; no real handoff was written.

Page numbers below are in the individual pattern PDFs. The final PDF text and layout agree exactly on these lines. Raw extraction records, including the interrupting page furniture, are retained in `%TEMP%/dpf-016-layout/trace-before.json` and `waxflower-before.json`.

### Heirloom Dahlia — A4

`$.patterns[2].instructions[0].steps[9].text`

Approved source and handoff text (identical):

> Working in the FLO of each Rnd 9 st, make 40 petals: sl st in FLO, ch 12, sl st in second ch from hook, sc in next 2 ch, hdc in next 3 ch, dc in next 3 ch, tr in next 2 ch, then sl st in the same FLO.

Renderer blocks (`src.field` is the suffix beginning `instructions`; coordinates are PDF points):

- Page 1, baseline (107.72, 67.26): Working in the FLO of each Rnd 9 st, make 40 petals: sl st in FLO, ch 12, sl st in second ch from hook,
- Page 2, baseline (107.72, 755.14): sc in next 2 ch, hdc in next 3 ch, dc in next 3 ch, tr in next 2 ch, then sl st in the same FLO.

Discrepancy occurs only in the old adapter QC contiguous-string comparison after page extraction; the PDF contains every quoted line.

### Starlit Anemone — A4

`$.patterns[4].instructions[1].steps[7].text`

Approved source and handoff text (identical):

> Ch 2, hdc dec over first 2 stitches, hdc in each of the next 3 stitches, hdc dec over last 2 stitches. Turn.

Renderer blocks (`src.field` is the suffix beginning `instructions`; coordinates are PDF points):

- Page 1, baseline (107.72, 69.96): Ch 2, hdc dec over first 2 stitches, hdc in each of the next 3 stitches, hdc dec over last 2 stitches.
- Page 2, baseline (107.72, 755.14): Turn.

Discrepancy occurs only in the old adapter QC contiguous-string comparison after page extraction; the PDF contains every quoted line.

### Woodland Fern — A4

`$.patterns[26].instructions[0].steps[11].text`

Approved source and handoff text (identical):

> Rep 8 times: In the next unworked back bump, sl st, ch 9, sc in 2nd ch from hook, hdc in next ch, dc in next ch, tr in each of the next 2 ch, dc in next ch, hdc in next ch, sc in next ch, sl st in the same back bump.

Renderer blocks (`src.field` is the suffix beginning `instructions`; coordinates are PDF points):

- Page 1, baseline (107.72, 65.96): Rep 8 times: In the next unworked back bump, sl st, ch 9, sc in 2nd ch from hook, hdc in next ch, dc
- Page 2, baseline (107.72, 755.14): in next ch, tr in each of the next 2 ch, dc in next ch, hdc in next ch, sc in next ch, sl st in the same back
- Page 2, baseline (107.72, 739.94): bump.

Discrepancy occurs only in the old adapter QC contiguous-string comparison after page extraction; the PDF contains every quoted line.

### Heirloom Dahlia — US-Letter

`$.patterns[2].instructions[0].steps[8].text`

Approved source and handoff text (identical):

> Ch 1, working in the BLO of Rnd 7, work sc in each of next 3 sts, inc in next st 8 times; join with sl st in first sc. The ch 1 does not count as a st.

Renderer blocks (`src.field` is the suffix beginning `instructions`; coordinates are PDF points):

- Page 1, baseline (107.72, 63.27): Ch 1, working in the BLO of Rnd 7, work sc in each of next 3 sts, inc in next st 8 times; join with sl st in first
- Page 2, baseline (107.72, 705.25): sc. The ch 1 does not count as a st.

Discrepancy occurs only in the old adapter QC contiguous-string comparison after page extraction; the PDF contains every quoted line.

### Woodland Fern — US-Letter

`$.patterns[26].instructions[0].steps[10].text`

Approved source and handoff text (identical):

> Rep 7 times: In the next unworked back bump, sl st, ch 5, sc in 2nd ch from hook, hdc in next ch, dc in next ch, hdc in next ch, sl st in the same back bump.

Renderer blocks (`src.field` is the suffix beginning `instructions`; coordinates are PDF points):

- Page 1, baseline (107.72, 64.67): Rep 7 times: In the next unworked back bump, sl st, ch 5, sc in 2nd ch from hook, hdc in next ch, dc in
- Page 2, baseline (107.72, 705.25): next ch, hdc in next ch, sl st in the same back bump.

Discrepancy occurs only in the old adapter QC contiguous-string comparison after page extraction; the PDF contains every quoted line.

### Waxflower Spray — A4

`$.patterns[18].assembly[2]`

Approved source and handoff text (identical):

> Wrap floral tape from the base to the tip of the main wire, overlapping each wrap slightly. Wrap each branch from its join to its tip, covering all exposed wire.

Page 1 ends the assembly block with “Wrap each branch”; page 2 continues “from its join to its tip, covering all exposed wire.” The inserted list marker `3.`, bundle footer, folio and “Waxflower Spray (continued)” break the flat substring. All instruction steps pass the original extraction check.

## Label overflow

`templates.mjs` used `mark()` plus `Flow.marker()` to draw a label as one line, with no wrapping or vertical height reservation. Its nominal column was 20 mm with 2 mm deducted, leaving 18 mm. Measured at the actual 10.5 pt semibold font:

| Label | Actual width | Original allowance |
|---|---:|---:|
| Preparation | 18.8875 mm | 18 mm |
| Foundation | 18.3541 mm | 18 mm |
| Each stamen | 20.1914 mm | 18 mm |
| Prepare wire | 20.2618 mm | 18 mm |

There is no PDF clipping mask on these draw operations. This is column overflow (and possible encroachment on the instruction column), reported by the strict clipping/overflow check. It is not missing source wording. Both paper sizes used this same label component.

## Changes

- `production/src/crochet/layout.mjs`: wrapped 26 mm label column with 2 mm gap; label/body share row height. Whole steps and their stitch counts move to a new page where they fit; oversized blocks split at complete line boundaries.
- `production/src/crochet/templates.mjs`: step template uses the shared instruction-row layout; source metadata also identifies composed material/hook rows.
- `production/src/crochet/text-qc.mjs` (new): compares approved fields with ordered layout lines, verifies material/hook coverage, reconciles lines against actual positioned PDF text, and checks instruction bounds and text collisions.
- `production/src/adapters/crochet-pattern-bundle.mjs`: uses the new checks for individual PDFs and both complete bundles, retaining existing approval, fingerprint, asset, claim and packaging checks.
- `production/src/qc.mjs`: carries positioned extraction records to adapter QC.
- `products/003-midnight-seance/src/render/pdf-preview.mjs`: adds text positions to the existing shared PDF extraction result; retains its original flat text and raster rendering.
- `production/test/crochet-layout-qc.test.mjs` (new): four A4/Letter regression tests covering the four labels, growing/wrapped labels, near-bottom relocation, long multi-page steps, cross-page assembly, exact source reconstruction, order checking, actual PDF extraction, missing/changed/displaced text, overflow and collision rejection.
- This report.

No source instructions or paid content were edited. No approval gate was weakened; code never promotes a visual to physically verified. No network/model/image generation call was made. Existing tests use fake model clients and locally rendered fixture images. No commit or push was made.

## Final verification

- Initial suites before edits: automation 294/294, marketing 66/66, production 93/93; zero failures, skips or cancellations.
- New regression suite: 4/4 (A4 and US Letter layout plus actual-PDF integrity cases).
- Final suites: automation 294/294, marketing 66/66, production 97/97; zero failures, skips or cancellations.
- Product #016 scratch simulation: current source validated as 33/33; checksum `4ef6040aa99f76fd1606f4425726ed7177ae7fa2551238d79c44e78f2429de69`; visual specs re-bound successfully; stale handoff archived inside the temporary copy; no real product state changed.
- Scratch Stage 2 build: 75 PDF outputs; 78-page A4 bundle; 78-page US Letter bundle; 33 individual pattern PDFs per paper; two ZIP parts.
- Scratch Stage 2 QC: passed every check. Exact positioned text matching includes every step and label in individual PDFs and both bundles. A4 and US Letter overflow/collision checks pass.
- Visual inspection: the bundle pages containing `Preparation`, `Foundation`, `Each stamen`, `Prepare wire`, and wrapped `Second Side 8-14` are clean in both papers.
- Real product preservation: all 59 files below `products/016-crochet-flower-bouquet-pattern-bundle-33` match their pre-work SHA-256 values.
