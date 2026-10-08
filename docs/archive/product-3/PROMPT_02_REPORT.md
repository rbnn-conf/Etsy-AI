# Prompt 2 completion and approval record

Prompt 2 completed. Eight prompts remain. Creative approval is pending; dependent production stops here.

## Deliverables

Product-owned foundation under `products/003-midnight-seance/`: locked Node package; fresh design tokens, typography and physical layout rules; local licensed fonts; independent page shell, headings, fields, geometric/celestial frames and activity grid; deterministic PDF renderer and proof command; content/editing schemas; self-contained offline editor; puzzle generator; tests and isolated QC configuration. There are no shared-code changes or legacy visual imports, AI runtime, Claude dependency, Telegram sends or live Etsy actions.

Design: antique ivory `#F4EBDD`, near-black `#171315`, oxblood `#701F2A`, plum `#342434`, decorative gold `#A98A5B`. Bodoni Moda supplies high-contrast editorial titles and occasional italic atmosphere; Source Sans 3 supplies body, form and game clarity. Both are distributed with original SIL OFL 1.1 licence evidence and source links in `products/003-midnight-seance/fonts/FONT_RECORD.md`. Fonts are locally bundled and explicitly loaded. Chromium emits embedded Type3 glyph streams with Unicode maps; independent PDF inspection confirms their presence and selectable text. Additional reader coverage belongs to final QC.

Review directory: `storage/products/003/prompt-02-review/`. It contains 36 PDFs, 40 actual PDF-derived 300 dpi PNG pages, labelled contact sheet, review HTML, offline editor, machine-readable manifest, solution coordinates, automated QC, editing-feasibility and visual-inspection reports. Three proof types are invitation, welcome and word search, plus its answer; additional PDFs are treatment/size/editing scenarios, not inventory expansion. Invitation native 5×7 and A4/Letter carriers; welcome 8×10, A4 and Letter; game/answer A4 and Letter; both full-colour and economy.

New files are confined to this product source, this review directory, this report and `PROMPT_03.md`. Modified existing file: `MIDNIGHT_SEANCE_SPEC.md`, recording the user's approved decisions and supplied reference. Prompt 1 documentation was committed separately as `a100883`; Prompt 2 implementation and reviewed artifacts are committed separately after validation. Unrelated local Product 001 remnants are preserved and excluded.

## Validation

- Product 3: 9 unit tests passed; 489 automated artifact checks passed; dependency audit reports zero vulnerabilities.
- Offline editor: 17 scenarios per browser in Chromium 151 and Edge 153, with zero network requests/errors. Exact-limit, maximum-width, optional-empty, accents/currency, UK/US, JSON save/load and print-target checks passed. Oversized text, geometric overflow, required omissions, unsupported glyphs and malformed import block printing or loading visibly.
- Word search: deterministic 16×16, 18 unique terms, verified coordinates, exactly one occurrence per target, matching answer grid; finite blocked-string screening in eight directions passed.
- Every one of the 40 actual PDF-page previews and the contact sheet was visually inspected. No remaining clipping, overlap or broken glyphs was found. Digital dimensions, safe bounds, hash binding, embedded font evidence, 300 dpi metadata and essential-text contrast passed.
- Existing regressions after implementation: services 170 passed plus clean TypeScript typecheck; marketing 27 passed including browser rendering; spreadsheet 37 passed with 2 native-tool skips because LibreOffice/Poppler are unavailable. Existing products and shared code are unchanged. No existing-product output rebuild was needed.

Corrections and remaining inspection limits are detailed in the review reports. Physical printing and actual browser print-dialog settings are not claimed as tested. Prompt 2 proves the primary offline HTML editing approach; approved fillable PDF support is still due in Prompts 4/7.

## Approval before Prompt 3

Approve Bodoni Moda / Source Sans 3, the palette/ivory and white economy treatments, the three compositions, long-text behavior and sparse activity decoration. Final botanical/engraved/lace assets are provisional only in the sense that their slots are reserved; their original production belongs to Prompt 3. Do not interpret these proofs as final customer packaging.

Next numbered milestone: **Prompt 3 of 10 — Original artwork library**. Exact copyable text is in `docs/product-3/PROMPT_03.md`; it is conditional on this approval and includes all 18 masters, transparency/provenance/resolution checks, integration into existing proofs and an approval stop. No extra milestone is proposed. Remaining budget: **8 of 10 prompts**.
