# Prompt 2 visual revision 01

Prompt 2 visual revision completed; eight prompts remain. This is a correction candidate awaiting visual approval, not Prompt 3. The user approved the technical foundation, palette, ivory treatment and general typography direction, and rejected the original sparse compositions. Original review PDFs/PNGs/manifests remain unchanged under `storage/products/003/prompt-02-review/` and commit `5eff44d`, as superseded evidence.

## Revised compositions

- Layered stationary frames: 0.6pt outer gold keyline, 1pt oxblood inner rule, 0.6pt tertiary gold line; star corner anchors, diamond top/bottom beads and deliberate side breaks. Economy retains two fine outlined rules and motifs on white. Activity uses a lighter two-rule version, without side interruptions.
- Invitation: stronger 31pt oxblood summons, 30x18mm development moth hero, intentional moon-phase band, 28pt event title, double-rule division before event information, four botanical corner zones, increased 9–10.5pt details and balanced footer. Long text uses a 27pt summons, compact hero and narrower lower decorative rails to keep permitted values printable.
- Welcome: larger crescent/diamond upper anchor, 60pt event identity, separate central host grouping, ruled closing phrase panel, botanical lower rails and lower seal slot. It retains its own vertical composition instead of enlarging the invitation.
- Word search/answer: plum collection label, oxblood title block, clearer instructions, double-framed unchanged grid, enlarged checklist within a ruled panel, restrained botanical header rail and footer seal slot. Answer uses the same styling with underlined/tinted solution cells. Essential text retains approved contrast; economy uses white paper and no large solid fills.

The labelled contact sheet was inspected at reduced page size for page-purpose and event-name hierarchy. It is an internal proof review, not Etsy marketing imagery. Final engraved complexity and rose/lace/apothecary atmosphere still depend on the final Prompt 3 library; development stems and moth are intentionally simple compositional studies.

## Outputs and validation

`storage/products/003/prompt-02-revision-01/` contains exactly eight single-page PDFs and eight actual PDF-derived 300dpi previews: invitation colour/economy 5×7, welcome colour/economy 8×10, activity and answer colour/economy A4. Also: useful-size eight-page contact sheet, annotated artwork-placement map with numbered slots, before/after sheet, offline editor, immutable proof manifest and QC/inspection records. No additional customer formats or page inventory were introduced.

Product tests: 9 passed. Artifact QC: 113 passed. Renderer stress preflight: 76 size/theme/content combinations passed, covering A4/Letter/native dimensions, default/maximum/maximum-wide/special/optional-empty/US content and both game pages. Editor: 17 cases each in Chromium and Edge passed, including default UK and US examples, JSON regeneration, optional omissions, glyph/limit handling and overflow rejection, with no network requests or JS errors. Services regressions: 170 passed and clean typecheck. Product-owned changes leave every existing product and shared file unchanged; preserved original puzzle JSON is compared against the revision solution.

All eight final actual PDF previews were visually opened, along with all three review sheets. No remaining clipping, overlap, unreadable grid or broken glyph was observed. Physical printing remains unclaimed. An initial maximum-width invitation exceeded the bottom safe bound; compact long-title styling corrected it. New transformed motifs exposed a PDF rasterization binding mismatch; a product-owned canvas factory now ensures PDF transparency-group canvases and paths use the same native binding. The placement-map overlay includes A4 carrier offsets so annotations match actual art positions.

## Source and next approval

Changed Product 3 source: `src/components/index.mjs`, `src/layouts/pages.mjs`, `src/design-system/styles.mjs`, `src/render/preflight.mjs`, `src/render/pdf-preview.mjs`, `src/paths.mjs`, `src/cli.mjs`, `src/qc.mjs`, `design/layout-rules.json`, `design/DESIGN_SYSTEM.md`, `README.md`; new `tools/revision-sheets.mjs`. Revised docs: this report, implementation-plan correction record and `PROMPT_03.md`. Original review files are preserved.

Rebuild in PowerShell from the Product 3 directory: `$env:MIDNIGHT_REVIEW_REVISION='1'`, `npm.cmd run proof`, `node tools/revision-sheets.mjs`, `npm.cmd run qc`. Unset that environment variable for the original full proof matrix; use a fresh output location when archiving a further approved revision. The current source hash binds the new revision; historical manifest hashes correctly belong to their original source commit.

Prompt 3 instructions **were amended**, keeping the original 18 masters and milestone budget: use the latest approved compositions and placement map, replace all development motifs, preserve compact text behavior, avoid stretching final assets and require owner approval before starting. A raven is an approval-dependent alternative, not an added master.

Approve the revised compositions and decorative density before **Prompt 3 of 10 — Original artwork library**. The technical approvals persist; this candidate is not yet visually approved. Remaining prompt budget: **8**.
