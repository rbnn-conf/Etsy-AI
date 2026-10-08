# Prompt 4 — invitations, signs and editable stationery

Prompt 4 completed. Six prompts remain. This is a finished implementation candidate awaiting owner visual approval; approval has not been inferred from automated QC or the agent's inspections. Prompt 5 has not begun.

Branch: `feature/product-3-midnight-seance`. Approved Prompt 3 baseline: `3941235f7b386702de1c86825cd4a1088e28ee28`. The dedicated Prompt 4 commit is identified by this report and commit message; obtain its exact hash with `git log -1 --format=%H` after the milestone commit. No merge, Etsy action or external message was performed.

## Exact inventory and reconciliation

The authoritative 48-master specification assigns 18 stationery masters to this milestone. `products/003-midnight-seance/content/prompt-04-inventory.json` was created before building. Mobile/digital invitation is an S01 export, not an extra master. Costume voting is G13 and remains Prompt 5. A photo-booth sign is absent from the authoritative inventory and is excluded. Food-label cards are S14 folded table tents. No inventory expansion or silent omission occurred.

| ID | Completed item | Finished size / treatment |
|---|---|---|
| S01 | Main invitation + digital export | 5×7; approved moth/rose composition |
| S02 | Details and dress-code card | 4×6; antique key and structured event details |
| S03 | Welcome sign | 8×10; approved moon/raven composition |
| S04 | Apothecary drinks sign | 8×10; snake/rose upper anchor |
| S05 | Feast and food-table sign | 8×10; candle pair |
| S06 | Sweet temptations sign | 8×10; engraved rose |
| S07 | Guestbook sign | 8×10; antique key |
| S08 | Favors sign | 8×10; celestial wax seal |
| S09 | Reserved-table sign | 5×7; paired ravens |
| S10 | Enter-after-dark sign | 5×7; candles and moon phases |
| S11 | Dinner menu | 5×7; crescent, three structured courses |
| S12 | Drinks menu | 5×7; apothecary hero, six drinks including alcohol-free samples |
| S13 | Flat place cards | 3.5×2; six accented/hyphenated sample names |
| S14 | Folded food-label table tents | 3.5×4 flat, 3.5×2 folded; six food/drink samples |
| S15 | Potion labels | 3×2; six original bottle designs and editable names |
| S16 | Favor tags | 2×3.5; seal and small closing emblem |
| S17 | Guestbook message sheet | A4/Letter; eleven writing lines, editable heading/instructions |
| S18 | Thank-you card | 4×6; seal, moon phases and original personalisable message |

All printable masters have Signature Ivory and independently drawn Economy White editions. Economy uses white paper, charcoal wording and purpose-drawn Prompt 3 economy assets; no global grayscale conversion creates the pages. Full-colour preserves oxblood headlines, plum details, muted-gold rules and antique ivory. Layout archetypes distinguish invitation/signage, structured menus, writing-led stationery and small labels. The slender sixth bottle is intentionally horizontal on its 3×2 label to preserve its minimum approved width and aspect ratio; this is a designed orientation, not stretched art.

Twenty-six accepted artwork designs are used in their two treatments (52 assets). Botanical corners/dividers, moth, raven pair, candle pair, key, wax seal, moons/stars, six bottles, snake/rose and small closing emblems are placed by purpose. No artwork was regenerated or rejected in Prompt 4. The entire approved 35-pair Prompt 3 library remains unchanged; unused designs stay available for later assigned pages. `reports/artwork-usage.json` records the exact IDs per master.

## Formats and review matrix

Output root: `storage/products/003/prompt-04-review/`.

106 default PDFs contain 140 pages: 53 format selections in two treatments. Eighteen maximum-content PDFs contain 45 additional pages. Four edited editor-export PDFs contain four pages. **128 PDFs and 189 actual PDF-derived 300 dpi PNG pages** were produced and individually visually inspected. Maximum-content repetition and partial synthetic words are explicitly labelled stress fixtures, not customer sample copy. All 140 default previews have distinct hashes; no accidental duplicate default page was found.

S01–S16 and S18 have native, A4 and US Letter selections. S17 has A4/Letter only. S03–S08 reflow to the usable A4/Letter area; they are not stretched copies. Other stationery preserves its physical finished size on carrier sheets. Six names/food labels/potion designs produce separate native pages where applicable. S01 additionally has full-colour/economy PNG and JPEG digital exports at 1500×2100 pixels; these are exports of the same master.

Small carrier sheets use 10 mm paper margins, 4 mm gaps and outside-corner crop marks. Place-card capacities are ten on A4/eight on Letter; the six-name sample fits one sheet. Table tents hold four on either paper; six samples use two sheets. All six potion designs fit one A4/Letter sheet. Tags repeat nine-up on A4/six-up on Letter. The default multi-up review therefore contains 16 PDFs/20 pages across four small masters, two treatments and two papers. Native files omit cutting/hole guides. Table tents print on one side, have a near-white back with an inverted star, and fold at 50.8 mm; no duplex output is specified or claimed. Carrier fold dashes lie outside the cut area. Tag hole circles are optional and clear of essential wording.

## Editor and content limits

Every S01–S18 item supports appropriate text personalisation; S17 edits heading/instructions, preserving handwriting space. Customer labels, saved version-4 JSON, live regenerated preview, reset, optional fields, theme/paper selection and printable iframe output require no API, developer tools, asset folder or network. The HTML embeds the four approved font faces and only the artwork actually used, as lossless transparent WebP derivatives prepared at approximately 600 ppi for the largest intended placements. Original Prompt 3 PNGs remain unchanged and are retained in production PDFs. Derivative provenance, pixel dimensions, transparent perimeter and placed resolution are recorded separately. No clip-art source library is packaged for customers.

Field limits and defaults are recorded in `editor-field-manifest.json`. Character limits are an upper bound alongside a physical fit check: very wide lettering can be rejected below the character limit. No critical wording is shrunk below readable limits. Utility copy is at least 8.5 pt; body text is generally larger. Menus support multiline descriptions; place/food fields support up to twelve non-empty entries with per-entry bounds. Names with accents, curly apostrophes, ampersands and hyphens round-trip intact. Regional fixtures use consistent UK/US copy and long addresses. Printable output targets the preview, with matching paper, 100% scale, no margins/headers and full-colour background graphics documented in the UI. Finished-size output requires matching custom paper; home printers can use A4/Letter carriers.

## Validation and corrections

- Product 3 targeted suite: 18 tests, all passed, including existing artwork, editing and verified word-search tests plus six new inventory/imposition/content tests.
- Production validation: correct physical dimensions/page counts, embedded font streams, text extraction, artwork existence/treatment/minimum size, alpha integrity and placed raster resolution; every generated page has a 300 dpi actual-PDF PNG.
- Ninety text scenarios cover optional-empty, accented/special input, UK/US fixtures and typical maximum-length content across all 18 masters.
- Another 108 geometry/alpha-clearance checks cover both treatments and default, maximum and maximum-width lettering. Every default/typical maximum passes. Unreadable or colliding wide strings are blocked; no automatic shrinking masks these failures.
- Thirty-six offline browser checks cover all 18 items in bundled Chromium and installed Microsoft Edge: keyboard access, save/load/reset, economy/Letter regional fixtures, character overflow, unsupported input, malformed saved files and no network requests. Exact browser versions are recorded in `reports/editor-browser-qc.json`.
- Two additional browser checks verify wide host wording touching botanical decoration is blocked with clear customer-facing labels, followed by accented-name recovery. Production artwork is at least 746.56 ppi at its placed footprint; the 52 embedded editor derivatives are at least 599.69 ppi. The editor is approximately 23.9 MB. Maximum economy average raster coverage proxy is 7.56%.
- Four edited exports exercise long UK address/accented hosts, multiline menu, reduced food-label list and six economy bottles. Print-button targeting is tested with the dialog intercepted; the iframe's exact printable HTML is exported using Chromium's PDF engine, then independently rasterised and inspected. A physical print dialog, paper output and macOS browser session were not manually exercised.
- Existing repository regressions: services 170 passed and TypeScript typecheck passed; marketing 27 passed; spreadsheet 37 passed/two skipped (39 total). The skipped checks require unavailable LibreOffice/pdftoppm tooling; they are not reported as passes.

Defects corrected during this milestone: sign title leading/size that exceeded its field box; menu-bottle placement below minimum safe width; crowded maximum thank-you wording; stale preview validation enabling printing after invalid input; wide welcome host lettering touching a botanical corner; unnecessary print-sheet footer near the paper edge; resampling alpha leaking into a clear editor-asset perimeter; developer field/art IDs in fit errors. The corrected current PDFs were re-rendered and reviewed. Source artwork, accepted S01/S03 default compositions, existing puzzle logic and Products 1/2 remain preserved.

All 185 matrix pages were viewed individually in labelled two-page inspection images, with current PNG hashes recorded in `inspection/index.json`. All four edited exports were viewed separately. Contact sheets provide collection-level review and are supplementary to individual inspection. Checks covered hierarchy, density, wording, crop/fold alignment, text/art clearance, actual small-card proportions, edition consistency and transparent edges. No unresolved screen-visible defect remains. Agent inspection is not owner approval. Home-printer economy quality, fine serif reproduction and paper/ink behaviour remain physical Prompt 8 checks.

See `reports/automated-qc.json` for exact minimum PPI, typography, economy raster coverage proxy, hash validation and counts. Raster coverage estimates are not measurements of ink consumption. Final source validation is recorded separately from the historical build hash so later validation/UI tooling changes do not falsely claim that every unchanged PDF was rebuilt.

## Files and review links

New Product 3 files: `content/prompt-04-inventory.json`, `qc/prompt-04.json`, `tests/stationery-inventory.test.mjs`, `tests/stationery-editing.test.mjs`, and the isolated `src/stationery/` inventory/content/renderer/styles/imposition/offline-editor/render-server/preflight/build/QC/review/inspection/test modules. Modified Product 3 files: `package.json` (additive stationery commands only) and `README.md` (current status and workflow). New documentation: this report and `PROMPT_05.md`. New isolated output files include the PDFs, native previews, digital invitation exports, editor/derivative manifest, seven required review sheets, review index, field/format manifests, QC/source/regression/visual evidence and unsent Telegram review selection. `reports/committed-files.json` records the exact milestone file list. Unrelated untracked Product 1 files are preserved and excluded from the commit. Earlier Prompt 2/3 evidence is untouched.

The dedicated candidate contains 444 files: 442 added and two modified. Internal review evidence retains full-resolution originals in each individual PDF and totals approximately 934 MiB. This is not a customer ZIP. Customer compilation, image/resource optimisation and download-size validation belong to the already allocated Prompt 7/10 work; do not ship the internal review tree as the customer package.

- [Complete review index](../../storage/products/003/prompt-04-review/REVIEW.html)
- [Full-colour collection](../../storage/products/003/prompt-04-review/FULL-COLOUR-CONTACT-SHEET.png)
- [Economy collection](../../storage/products/003/prompt-04-review/ECONOMY-CONTACT-SHEET.png)
- [Editable items](../../storage/products/003/prompt-04-review/EDITABLE-ITEMS-CONTACT-SHEET.png)
- [Small-format relative scale](../../storage/products/003/prompt-04-review/SMALL-FORMAT-RELATIVE-SCALE.png)
- [Multi-up sheets](../../storage/products/003/prompt-04-review/MULTI-UP-CONTACT-SHEET.png)
- [Maximum-content review](../../storage/products/003/prompt-04-review/MAXIMUM-CONTENT-CONTACT-SHEET.png)
- [Concept comparison](../../storage/products/003/prompt-04-review/CONCEPT-COMPARISON.png)
- [Offline editor](../../storage/products/003/prompt-04-review/editable/midnight-seance-stationery-editor.html)
- [Automated QC](../../storage/products/003/prompt-04-review/reports/automated-qc.json)
- [Visual QA](../../storage/products/003/prompt-04-review/reports/VISUAL_QA.md)
- [All page/format/PDF/PNG links](../../storage/products/003/prompt-04-review/page-format-manifest.json)

Telegram status: **PREPARED_NOT_SENT**. The Product 3 recipient/delivery path is not approved in the preserved documentation; recipient approval remains a Prompt 10 decision. Representative full/economy pages, food/potion sheets, editor screenshot and QC summary are prepared under `telegram-review/`. No customer ZIP or Etsy action is included.

## Approval and next prompt

The required decision is owner visual approval of the complete Prompt 4 candidate, including economy small items and the horizontal sixth potion-label composition. No scope, font or artwork-generation decision is needed before the next milestone. macOS editor/printer behaviour remains a documented validation limitation, not an invented pass.

Exact next numbered prompt: [PROMPT 5 OF 10 — PRINTABLE PARTY GAMES](PROMPT_05.md). Use its complete verbatim text only after Prompt 4 visual approval. Six prompts remain: 5 games, 6 host planning, 7 customer formats/instructions, 8 full QC, 9 Etsy marketing, 10 packaging/Telegram approval/release handover. Stop here; no additional production milestone is proposed.
