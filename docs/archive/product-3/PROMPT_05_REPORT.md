# Prompt 5 — Printable party games

Status: production candidate complete; owner visual approval pending. Branch: `feature/product-3-midnight-seance`.

## Delivered inventory

The approved collection inventory remains 48 logical masters: 18 stationery, G01–G16 games and 14 later host/instruction masters. Prompt 5 supplies exactly G01–G16. G07 contains twelve deterministic 5×5 boards from 36 prompts with one free centre; G12 contains nine 2.25 × 3-inch cards on two cutting sheets. These are variants/pages, not new masters. G13 supplies four 3 × 4-inch ballots per carrier sheet.

Every master has Signature Ivory and Economy White output in A4 and US Letter: 64 PDFs and 112 rendered pages. The matrix includes participant pages, coordinated answer sheets, host lists, scoring/tie rules, timing, supplies, opt-outs and reveal records. Accepted Prompt 3 artwork only is used; no artwork was regenerated and no legacy, stock or placeholder asset was introduced.

## Content and mechanical verification

- Fifteen original trivia questions have concise answer notes and question-to-source records against Library of Congress and NASA Science pages in `content/prompt-05-trivia-sources.json`.
- The approved 18-word puzzle and verified coordinates remain unchanged.
- Fifteen scrambles preserve exact letter multisets and have unique, non-identical outputs aligned to the answer key.
- All twelve bingo boards are distinct, have 25 cells and one free centre, use 24 unique members of the approved 36-prompt pool, and require no random caller.
- Nine conversation prompts, three ballot categories, twelve safe indoor omen clues, twelve consent-friendly nominations and eight predictions align with their host/reveal pages.
- Card and ballot geometry is native-size on both carriers; all other PDFs were independently checked to A4 or US Letter dimensions.

## Validation and visual review

Product 3 test suite: 24/24 passed, including existing artwork, word-search, editor and Prompt 4 regressions. Matrix QC: 64/64 PDFs and 112/112 pages passed physical-size, page-count and treatment checks. PDF inspection verified selectable text, embedded fonts, nonblank content and 300 dpi previews.

Every rendered page was inspected through 28 labelled reading-scale inspection sheets; representative pages and every corrected G08 variant were opened individually. Two defects were corrected: an unsupported decorative PDF gradient that independently rasterized magenta, and doubled G08 prompt numbering. The complete matrix and review evidence were regenerated after each applicable correction. No remaining clipping, overflow, answer leakage, writing-zone collision, cut-line collision, unreadable puzzle text or excessive Economy White ink area was observed. Physical printing remains the planned Prompt 8 owner/printer check.

Review root: `storage/products/003/prompt-05-review/`. Key files are `page-format-manifest.json`, `reports/automated-qc.json`, `reports/matrix-qc.json`, `reports/visual-inspection.json`, `contact-sheets/full-colour-01.jpg`, `contact-sheets/economy-01.jpg`, `contact-sheets/all-bingo-boards.jpg`, `contact-sheets/cutting-sheet-comparison.jpg` and `contact-sheets/player-host-answer-comparison.jpg`.

Telegram status: no package was sent. Prompt 5 has no approved Product 3 recipient/path and local review evidence is sufficient for the requested approval gate.

## Approval gate and next prompt

Owner decision required: approve the Prompt 5 game compositions, playability and answer/host pages, or request a correction within Prompt 5. No inventory or implementation decision blocks Prompt 6. The exact next numbered prompt is in `PROMPT_06.md`. Five prompts remain after Prompt 5 completion.

Correction 01 replaces the ambiguous Bodoni Moda bingo identifier with a Source Sans 3 semibold identifier and adds metadata/PDF/manifest sequence validation. See `PROMPT_05_CORRECTION_01.md`. Prompt 5 remains at its final visual-approval gate.
