# Midnight Séance — exactly ten production prompts

Prompt 1 of 10. This plan contains all design, artwork, engineering, corrections, testing, marketing, packaging and release handover. No additional implementation phases or prompt 11. Iterations and unblock questions belong to the active milestone.

## Milestones and acceptance

| Prompt | Milestone | Deliverables and validation | Gate / budget after completion |
|---|---|---|---|
| 1 | Audit, fresh architecture and product specification | Pull requested source; create isolated feature branch; repository/infrastructure audit; these three documents; 48-master inventory, formats, artwork and QC strategy; Claude-independence finding | Owner scope/reference/editor decisions; 9 prompts remain |
| 2 | Design system and three visual proof pages | Product-owned package/lock, tokens, licensed typography, primitive components, manifest/schema, deterministic renderer; invitation, welcome sign and word-search proofs; economy and size-fit samples; constrained editor/export feasibility proof | Inspect actual PDF/PNG proofs, confirm palette/fonts/layouts/editor; 8 remain |
| 3 | Original artwork library | Eighteen isolated original master motifs; transparency/edge/resolution inspection; provenance/licenses/hashes; approved print/web derivatives; integrate artwork into the three proofs | Owner accepts artwork and updated proofs before dependent pages; 7 remain |
| 4 | Invitations, signs and editable stationery | All S01–S18, text-field schemas, finished-size and imposed layouts, native/digital invitation; long-field tests, cut/fold and print-size checks | Review all stationery including artwork; 6 remain |
| 5 | Printable party games | G01–G16, nine activities, 12 distinct bingo boards; original content and independently verified solutions; host instructions/tally; mechanical tests and readable PDF previews | Review playability, keys and rules; 5 remain |
| 6 | Host-planning pages | H01–H10 in both paper sizes; writing space, checklist and row-fit inspection; menu/drinks/allergy planning and currency-neutral budget | Review actual planning PDFs; 4 remain |
| 7 | Customer formats, editable files and instructions | Complete print matrix, text-only offline editor and tested fillable PDFs, I01–I04, digital exports; licenses/notices; first candidate five-file package; official platform constraints verified; new-buyer edit/save/print trials | Confirm actual supported formats/reader limitations; 3 remain |
| 8 | Full QC, visual inspection and corrections | Full 48-master/59-expanded-page matrix; every PDF rasterized and reviewed; automated geometry/assets/games/editor/package checks; physical representative prints where available; all corrections and regression checks | No unresolved blocker hidden behind automated PASS; owner approves corrected collection; 2 remain |
| 9 | Etsy marketing images and listing copy | Independent Product 3 marketing tokens/compositions; eight proposed images: hero, inventory, stationery detail, games, host planning, editing, formats/printing, delivery/use; real product renders; title, description, tags and FAQ; official current Etsy rules checked; factual claims and thumbnail/crop QC | Approve listing claims, price and all marketing visuals; 1 remains |
| 10 | Final packaging, Telegram approval and release handover | Frozen versioned customer ZIP/PDF files, clean extraction and buyer walkthrough, checksums; final console review then authorized Telegram delivery with product preview/marketing albums; build-bound approval and optional approved Etsy draft; handover paths and limitations | Remains open until actual approval/handover, or explicit owner revision of required delivery; 0 remain when complete |

## Execution rules

- Keep work on `feature/product-3-midnight-seance`. No commit/push/merge/delete or existing-file refactor is authorized by Prompt 1. Later authorization must be explicit where needed.
- Product 3 owns source, design, assets, fonts, content, tests, QC, build, output manifest and marketing. No new shared module is necessary at present. If a shared change becomes necessary, explain it, preserve compatibility and test every actual consumer before accepting it.
- Verify any reused narrow utility in Product 3 context before adoption; service mocked tests do not prove live credentials or product integration. Add product-specific tests for genuinely risky behavior, not tests that simply mirror styling constants.
- Use real local fonts and frozen assets; reject missing files. AI tools may author isolated art in Prompt 3; production builds contain no runtime AI calls or Claude dependency.
- No final labels on artwork-free proofs. Dependent artwork/page production follows the owner’s visual gate. Do useful independent checks while waiting; never turn elapsed time into approval.
- Release adapter validates frozen hashes/QC before sending review and again before any draft upload. Approval of one build must not approve modified files. Existing callback nonces are useful but do not themselves prove filesystem immutability.
- Normal test/build commands are offline and have no Telegram/Etsy side effects. The user’s planned Prompt 10 Telegram task supplies delivery intent, but recipient/credentials are unresolved now; do not send anything during the audit.
- Live publication, merge, GitHub release or account changes are separate approval actions inside Prompt 10 if requested, not new implementation milestones. Default handover stops at approved package and optional approved Etsy draft.
- Each milestone report contains prompt number completed, completed deliverables, tests/visual checks with failures/skips, decisions before the next prompt, exact next numbered prompt and remaining budget. A blocked approval keeps its current milestone open.

## Decision register

| Decision | Recommendation | Needed by |
|---|---|---|
| Missing concept image | Supply the intended image before visual approval, or explicitly waive it | Prompt 2 |
| Product naming/numbering mismatch | Product 3 uses internal 003; preserve #006 and all older local remnants | Prompt 2 |
| Scope | Approve 48 masters, 59 physical pages per full set, nine activities / 12 bingo boards | Prompt 2 |
| Editable promise | Text-only offline desktop browser editor, tested fillable PDF fallback; no Canva promise | Prompt 2 feasibility approval |
| Print variants | Signature Ivory + Economy White, A4 + Letter; fixed-size items imposed separately | Prompt 2 |
| Exact fonts/palette | Approve from real proofs with verified licensing and print legibility | End of Prompt 2 |
| Original motif library | 35 specified designs with independent signature/economy treatments (70 PNGs), superseding the original eighteen-master proposal; no borrowed legacy art | Prompt 3 |
| Buyer terms/support | Personal use proposal; confirm shop name and actual support contact | Prompt 7 |
| Physical printer access | Owner prints supplied representative proofs and reports fit/legibility if unavailable locally | Prompt 8 |
| Price/currency/shop taxonomy | Decide from current listing context and customer offer; no inherited GBP price | Prompt 9 |
| External approvals | Confirm Telegram destination, credential rotation status, draft-on-approval behavior and retained release location | Prompt 10 |

## Risk controls within the ten prompts

Missing concept resolved in Prompt 2; font/editor feasibility tested in Prompt 2 before format promises; original transparent art completed in Prompt 3; stationary field overflow corrected in Prompt 4 and Prompt 7; game answer verification in Prompt 5; size/ink usability checked throughout and consolidated in Prompt 8; platform package constraints checked in Prompt 7 and rechecked before Prompt 10; marketing claims validated in Prompt 9; artifact immutability and delivery/approval evidence handled in Prompt 10. No new build phase is needed to address these risks.

If optional extras threaten the budget, remove unapproved extras rather than weaken required QC or defer corrections beyond Prompt 10. Any approved inventory reduction must update the spec, manifest, customer guide and listing together within its active milestone.

## Exact next numbered Codex prompt

> **Prompt 2 of 10 — Design system and three visual proof pages.** Continue on `feature/product-3-midnight-seance`. Read the three documents in `docs/product-3/` and incorporate my Prompt 1 decisions. Use the supplied Midnight Séance concept image as the primary reference; if it is still unavailable, request it and continue only independent technical checks until I supply it or explicitly waive it. Treat Product 3 as a fresh commission and preserve every existing product and shared file. Create Product 3’s isolated package, design tokens, newly licensed typography, components, manifest/schema and deterministic PDF proof renderer. Produce an invitation, an 8 × 10 welcome sign and an A4 word-search proof, with US Letter fit checks and Economy White samples. Prove the proposed text-only offline editor/export route using the invitation before promising editable formats. Do not generate final artwork or AI page images; identify artwork-free proofs clearly and reserve original assets for Prompt 3. Show actual PDFs and rasterized previews, run physical-size, font-loading, overflow, network-isolation and existing-file-preservation checks, and stop at visual approval before dependent production. Do not commit, merge, delete or refactor existing files without authorization. Finish with the required milestone report, exact Prompt 3 and eight prompts remaining when Prompt 2 is complete.

## Prompt 1 completion record

Deliverables: requested upstream fast-forward and feature branch; audit/spec/plan documents. Validation: Git ancestry/status and 238-file tracked inventory; services 170/170 and clean typecheck; spreadsheet 37 passed / 2 native-tool skips; marketing 25 pure tests passed with the stalled Chromium test excluded; document inventory and ten-milestone counts; tracked-file preservation check. Initial dependency failures, successful locked installs and browser limitation recorded in audit. No concept-image or customer-page visual checks claimed. Decisions before Prompt 2: image, ID, inventory, editable approach, print treatments. Remaining budget on completion: **9 of 10 prompts**.

## Prompt 2 completion record

**Composition status corrected by the owner's revision request:** original proof compositions were not visually approved. The technical implementation, palette, ivory treatment and general typography direction were approved. A separate Prompt 2 revision candidate is documented in `PROMPT_02_REVISION_01.md`, with eight focused pages, placement map and before/after comparison. Original evidence is retained. Approval is pending; Prompt 3 has not begun and eight prompts still remain.

The user approved the inventory, ID, isolation, offline text editing, specified fillable PDFs, sizes/treatments and no-Claude architecture, and supplied the missing primary concept image. The isolated foundation, three proof types, 36 PDFs / 40 PDF-derived previews, offline editor, licensed font record and QC/review reports are complete. Product tests 9/9; artifact checks 489/489; both-browser editor suites 17/17; existing services 170, marketing 27 and spreadsheet 37 passed with 2 native-tool skips. All 40 rendered pages and the contact sheet were visually inspected. Physical printing remains a Prompt 8 check. Details and pending creative approval are in `PROMPT_02_REPORT.md`. Exact next numbered prompt is `PROMPT_03.md`, **Prompt 3 of 10 — Original artwork library**, conditional on visual approval. Remaining budget: **8 of 10 prompts**.


## Prompt 3 production record

Prompt 2 was approved by the owner before the supplied Prompt 3 instructions. The supplied Prompt 3 explicitly authorizes 35 original designs across five families, with 35 independently generated economy treatments. This replaces the former eighteen-master artwork proposal only; the approved page inventory remains 48 masters / 59 expanded pages, nine activities and 12 bingo boards. All 70 artwork files and eight integrated proof pages are recorded in PROMPT_03_REPORT.md. Owner visual approval is required before Prompt 4. The exact next prompt is PROMPT_04.md. Seven prompts remain after Prompt 3 completion; no additional milestone is introduced.
