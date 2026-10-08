# Prompt 4 final polish report

**Prompt 4 final polish completed; six prompts remain.**

- Branch: `feature/product-3-midnight-seance`
- Baseline correction candidate: `7cf316e78435d4e9969046b842f161b10bf4fc1f`
- Polish commit: recorded in the milestone handover after this report is committed
- Status: automated and individual visual QC passed; owner visual approval pending

## Delivered refinements

| Master | Final refinement |
|---|---|
| S01 | Joined summons, moth, moon phases and event title into one identity group; separated event details; strengthened corner asymmetry, dividers, body scale and lower balance. |
| S02 | Retained the compact details hierarchy while aligning its corner, frame and economy treatment with S01. |
| S03 | Promoted the raven pair to a secondary focal point; integrated moon, title, ravens, host line and close; limited frame breaks to the lower botanical corners. |
| S04–S08 | Varied hero motifs and retained strong purpose recognition; normalized lower botanical anchors and simplified the repeated frame ornaments. |
| S09–S10 | Preserved immediate sign recognition while strengthening the raven/candle focal art and lower botanical finish. |
| S11 | Standardized the title as “Dinner Menu”; strengthened moon/title hierarchy, course spacing, 14.5 pt dish names, 10.5 pt details, 9.5 pt allergen note and lower emblem. |
| S12 | Preserved a readable drinks list with 13 pt names and 9.5 pt details; kept decorative art outside the text column. |
| S13 | Retained six individual name cards and A4/Letter impositions; increased name prominence and protected trim geometry. |
| S14 | Retained six folded food tents and two-sheet A4/Letter impositions; raised notes to 9 pt and kept fold/cut whitespace clear. |
| S15 | Retained six distinct apothecary labels; normalized bottle colour, contrast and line density; raised descriptive copy to 9 pt. |
| S16 | Kept the optional hole, nine-up A4 and six-up Letter geometry; strengthened 9.5 pt host copy and balanced seal/crescent motifs. |
| S17 | Preserved eleven usable writing lines; refined title hierarchy and moved the botanical frame break to the illustrated upper corner. |
| S18 | Strengthened the seal, phase divider, message and signoff; improved lower flower weight and corner/frame integration. |

The frame system now uses two purposeful rules, restrained celestial anchors and page-specific botanical masks. Botanical art overlaps the rules where the composition calls for it; unillustrated edges remain continuous. Economy pages use white, no texture, neutral line art and the same recognizable frame logic. Paper grain and simulated depth were deliberately omitted because the clean antique-ivory field remained sharper at 300 dpi and economy pages must minimize ink.

## Artwork normalization

The 70 accepted Prompt 3 originals remain byte-identical. Fifty-two artwork treatments actually used by Prompt 4 received non-destructive production variants: restrained family-specific saturation/contrast grading for Signature Ivory and independently prepared neutral Economy White variants. Canvas ratio, transparent perimeter, subject bounds and source hashes are recorded in `artwork/prompt-04-polish/manifest.json`. No asset was regenerated, cropped, sharpened into false engraving or replaced. All 52 variants passed individual original/production comparison and transparent-edge inspection. Very small celestial ornaments appear soft only when the comparison sheet enlarges them far beyond their intended size; their placed resolution is at least 657 ppi.

## Typography and editing

Customer PDFs use Bodoni Moda and Source Sans 3 with category-specific minimums rather than global shrinking. Minimum production body type is 9 pt. The actual-size vector specimen covers invitation metadata, hosts, menu names/details/footer, drink details, card names, food-tent notes, potion details, tag hosts and thank-you copy. Six browser mutation/recovery checks proved that sub-minimum changes are rejected and valid values recover. Maximum fixtures, accented names, UK/US addresses, punctuation and explicit menu line breaks remain editable. Oversized fields receive a customer-facing rejection instead of truncation.

## Validation

- 124 production/stress PDFs, 185 pages: 106 default PDFs/140 pages and 18 maximum-content PDFs/45 pages.
- Four additional offline edited exports/four pages individually inspected.
- Two-page actual-size typography PDF individually inspected at 300 dpi.
- All 189 customer, stress and edited-export pages received page-level visual inspection; both technical typography pages were separately inspected.
- 36 offline editor browser/export checks passed in installed Chromium and Edge.
- 90 maximum-field preflight checks and 108 additional browser stress checks passed; 24 deliberately over-wide mutations were correctly rejected.
- Product 3 tests: 18 passed, 0 failed.
- Repository regressions already run for this candidate: services 170 passed; marketing 27 passed; spreadsheet 37 passed and 2 skipped because the optional local converters were absent; typecheck passed.
- Minimum placed artwork resolution: 657.0 ppi in PDFs and 599.0 ppi in the offline editor.
- Maximum economy average ink fraction: 0.0867.
- Fonts, physical dimensions, page counts, cut geometry, transparent edges, safe zones, text/art collisions, puzzle preservation and deterministic hashes passed automated QC.

The inspection corrected an overly mechanical third frame, repeated side ornaments, weak S01 grouping, inactive S03 space, undersized S11 hierarchy, low caption sizes, S11 maximum-content overflow, one undersized menu motif, and a CSS-specificity error that initially opened the wrong welcome-sign corners. The affected 47 PDFs were re-rendered and re-inspected after that frame fix.

## Review set

- [Review index](../../storage/products/003/prompt-04-polish-review/REVIEW.html)
- [Focused ten-item review](../../storage/products/003/prompt-04-polish-review/focused/index.html)
- [Focused contact sheet](../../storage/products/003/prompt-04-polish-review/FOCUSED-POLISH-REVIEW.png)
- [Before/after comparison](../../storage/products/003/prompt-04-polish-review/BEFORE-AND-AFTER.png)
- [Concept comparison](../../storage/products/003/prompt-04-polish-review/CONCEPT-COMPARISON.png)
- [Artwork consistency index](../../storage/products/003/prompt-04-polish-review/contacts/ARTWORK-CONSISTENCY.html)
- [Actual-size typography PDF](../../storage/products/003/prompt-04-polish-review/contacts/ACTUAL-SIZE-TYPOGRAPHY.pdf)
- [Visual-QA report](../../storage/products/003/prompt-04-polish-review/VISUAL_QA.md)
- [Automated QC report](../../storage/products/003/prompt-04-polish-review/reports/qc-report.json)

The focused review has the requested ten items and eleven pages because S14 needs two A4 sheets to show all six folded cards. The original Prompt 4 review directory remains preserved as the before-state evidence.

## Limits and decision gate

No physical printer proof or macOS browser run has been performed. PDF/X, CMYK/foil claims, customer ZIP packaging, Etsy imagery and release delivery remain outside Prompt 4. Telegram was not used in this correction pass. The only decision required is owner approval of the focused visual set before Prompt 5 begins.

## Exact next numbered prompt

Use [PROMPT_05.md](PROMPT_05.md) verbatim. It begins **“PROMPT 5 OF 10 — PRINTABLE PARTY GAMES”** and is the complete exact next prompt. Do not begin it until Prompt 4 receives visual approval.
