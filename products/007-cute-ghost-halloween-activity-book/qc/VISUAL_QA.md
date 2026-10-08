# Visual QA — Product #007 Cute Ghost Halloween Activity Book

Inspected 2026-09-27 by the production assistant. Preparation for owner review,
not owner approval. (Handoff called this Product #006; renumbered to #007 by the
owner because `006-minimalist-budget-and-goals-planner` already exists.)

## Blockers

- BLOCKER: P002 source is a presentation mockup, not a print page (portrait maze on a light-grey #F7F7F5 landscape backdrop with a drop shadow; repeats P003's title). It prints as a small maze on a grey sheet. Owner to choose: supply a clean replacement, approve a lossless crop to the inner page, drop it (29 pages), or accept as-is.

## Source artwork (all 30 inspected at full size or zoomed)

- 30/30 decode; no alpha; no blank pages; no exact or near-identical duplicates.
  P001 is a full-colour cover; P002–P030 are black line art.
- Content checked: word search (all 8 words present), word scramble (8/8 solvable),
  counting pages P009/P016/P021/P024 (correct answer present in every row),
  spot the difference (at least 5 clear differences), shadow/pair/pumpkin matching,
  patterns, biggest pumpkin. No typo that breaks an activity.
- NOTICE: mazes P002, P003, P029 are loose path illustrations. An automated
  flood test could not prove solvability (P029's outer border has gaps).
  Owner test-solve recommended.
- NOTICE: the cover art says "30 FUN ACTIVITIES"; the book is 30 pages
  (cover + 28 activities + certificate). All listing copy and images say
  "30 printable pages"; the cover text is supplied artwork and was not altered.
- Artwork uses US spelling ("Color the …"); not treated as a typo.

## Print output

- A4 and US Letter PDFs: all 60 pages rendered (pdf.js) and inspected on contact
  sheets. Pages centred, aspect preserved, white 12 mm margins, nothing clipped.
  Order matches source (per-page PSNR ≥ 39 dB vs its own source).
- Resolution: PASS WITH NOTICE. ~152 PPI on paper, no upscaling; wording is
  "high-quality printable digital files", no 300-DPI claim.
- Printing guide: rendered and read. Correct title, contents, sizes, 100%
  printing, digital-only wording, P002 landscape note.

## Marketing (10 × 2000 px, each opened individually + contact sheet)

- Palette: midnight navy / cream with pumpkin accent, gold stars, plum only as a
  low-opacity background tone. Real supplied pages only; cover is the anchor.
- Fixed during review: 07 headline ran behind the cover (now a cover-interior
  crop with clear text); 03 grid too small (now 8 columns, all 30 pages
  visible); 06 and 08 had empty lower halves; 08 duplicated 09's page.
  Layout QC now also fails text overlapping artwork.
- Hero thumbnail (qc/hero-thumbnail.png, 170 px): cover and title still read.
- Remaining weakness: pumpkin/gold "leaf" marks read as starbursts; decorative
  only. The set is typographically restrained for a kids' product; the colour
  cover and bold page art carry the playfulness.

Score: PASS for owner review, subject to the P002 blocker.
