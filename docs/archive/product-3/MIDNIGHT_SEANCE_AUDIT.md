# Midnight Séance — repository audit

Prompt 1 of 10. Audit date: 2026-09-17. Status: planning only; no Product 3 implementation or final artwork.

## Repository baseline and scope

The requested GitHub source is `https://github.com/rbnn-conf/digital-product-factory.git`. Local `main` began at `c01b4d9`, clean, 19 commits behind remote HEAD with zero divergent commits. The explicitly requested pull was performed with `git pull --ff-only origin main`, reaching `66ae23f19d958c615c348a3845239f8cc16f621b`. This incorporated existing upstream removals of #001/#005; no independent deletion, merge commit, commit, refactor or redesign was performed. The branch `feature/product-3-midnight-seance` was created from that baseline.

The current tracked product is **#006**, an XLSX budget planner in TEST/REVIEW. The user’s “Products 1 and 2” do not correspond to two tracked current product folders. Preserve every existing product, including #006, and any local remnants; do not infer authority to recreate or remove earlier products. Reserve `003-midnight-seance` / storage ID `003` for this commission, subject to owner confirmation of numbering.

All 238 tracked files were enumerated and read as bytes for coverage; relevant source, tests, manifests, migrations, workflows and operational documentation were inspected for behavior. Binary artwork/font files were inventoried, not used as creative references. Ignored dependency trees, private `.env` contents, OAuth token stores and generated legacy output were not treated as source or visual references. No AGENTS.md was found. Hidden `.claude/` instructions and CLAUDE.md were identified. Legacy house-style mandates are superseded for this commission by the explicit fresh-design instruction; no legacy visual skill or token system was adopted.

The referenced Midnight Séance concept image is not attached in this conversation or identifiable among repository image files. A `midnight-dark` legacy token file is **not** that reference. The written direction can support planning, but visual approval in Prompt 2 needs the actual image or an explicit waiver. No visual claims about an unseen image are made.

## Actual architecture

| Area | Current implementation | Implication for Product 3 |
|---|---|---|
| Root documentation | README and some phase statements are stale; HANDOVER.md describes the newer cleanup | Source and package scripts take precedence over historical examples |
| Docker Compose | PostgreSQL 16 Alpine and n8n, localhost ports, persistent volumes, shared DB | Optional operations infrastructure, unnecessary for local stationery builds |
| database/ | Five SQL migrations: migration ledger, products, versions, designs, pages | Do not run migrations or change DB during this commission without need |
| infrastructure/ | Bash migration, backup, health and Etsy research scripts | Inspectable utilities, not a PDF/build engine |
| services/ | Node/TypeScript contracts, configuration, storage, Etsy OAuth/HTTP/draft upload, review state machine and Telegram long polling | Reuse narrow non-visual modules through product-owned adapters |
| services/src/design/ | ProductSpec validation/mapping, design validators and fixed orchestration | Full pipeline is unsuitable; local provider generate/export methods throw |
| spreadsheet/ | ExcelJS, JSZip, chart injection, workbook QC and LibreOffice/Poppler preview path | Out of scope; no need to ship an XLSX party planner |
| marketing/ | HTML-to-PNG transport plus finance/planner compositions, fonts and styles | Only transport concepts are candidates; reject all visual layers |
| products/006-*/xlsx/ | Product-owned build, preview, QC and CLI | Preserve; a structural example of isolation only |
| design/, docs/design/, .claude/skills/ | LumiumX visual canon, theme tokens, design schemas and legacy references | Not creative input for Product 3 |
| n8n/ | Inactive exported workflow shells into services pipeline; default product 001 | Do not activate or reuse unchanged |
| templates/, workers/ | Readme-only scaffolding | No ready template or worker service |
| storage/ | Generated output ignored by Git except README | Product-owned output under storage/products/003 |
| .github/ | No tracked workflows found | No existing CI workflow can be claimed as verified/reused |

Tracked coverage: services 72 files; docs 38; marketing 30; design 23; spreadsheet 22; products 11; .claude 11; database 6; infrastructure 5; n8n 3; remaining root/scaffolding files complete the 238-file inventory.

## Existing commands (not all were executed)

Run commands from the stated directory. Bash scripts need Git Bash/WSL on Windows; npm.cmd avoids PowerShell shim issues.

| Directory | Command | Purpose / caveat |
|---|---|---|
| Root | `docker compose up -d` | Starts DB/n8n; not needed for audit or offline rendering |
| Root | `bash infrastructure/scripts/migrate.sh` | Writes shared DB; not run |
| Root | `bash infrastructure/scripts/health-check.sh` | Runtime/environment checks; reads shell env; not run |
| Root | `bash infrastructure/scripts/backup-postgres.sh` | Shared DB backup; not run |
| Root | `bash tests/verify-foundation.sh` | Foundation/config checks; not comprehensive secret scanning |
| services | `npm.cmd ci --ignore-scripts` | Install locked development dependencies |
| services | `npm.cmd run typecheck` / `npm.cmd test` | Typecheck / 170-test service baseline |
| services | `npm.cmd run design:validate -- --product ID` | Expects legacy design schema/files |
| services | `npm.cmd run design:pipeline -- --product ID --console` | Fixed PDF/XLSX/marketing shape; not suitable for 003 |
| services | `npm.cmd run design:preview -- --product ID --paths-only` | Path report only; other modes use fixed manifest |
| services | `npm.cmd run telegram:submit-review -- --product ID --console` | Review assembly; not a verified Product 3 integration |
| services | `npm.cmd run telegram:review-bot` | External long-poll transport; approval can create Etsy draft |
| services | `npm.cmd run telegram:submit-006-review` | Product-specific script, must not repurpose |
| services | `npm.cmd run etsy:authorize-url`, `etsy:exchange-code`, `etsy:smoke`, `etsy:create-draft` | Auth/read/write paths; external calls not performed |
| marketing / spreadsheet | `npm.cmd ci --ignore-scripts`; `npm.cmd test` | Package baseline tests |
| spreadsheet | `npm.cmd run demo` | Generates demonstration workbook; not run |
| products/006-minimalist-budget-and-goals-planner/xlsx | `npm.cmd run all` / `node cli.mjs` | Build, QC, previews; writes existing product outputs, not run |
| same | `node example.mjs` | Seeded example previews; not run |

The earlier #001 PDF renderer is removed from tracked source. There is **no current shared print-PDF utility to reuse**. Product 3 will implement an isolated deterministic renderer in Prompt 2, using pinned Playwright/Chromium and PDF manipulation libraries where needed.

## Reuse decisions and evidence

| Candidate | Decision | Verification / remaining condition |
|---|---|---|
| services config parsing | Reuse targeted Telegram/Etsy loaders, not a broad env dependency | Service tests cover missing/optional configuration; rendering must need no secrets |
| ProductStorage | Reuse explicit root and safe filename helpers where compatible | Storage tests pass; configured relative roots resolve against CWD, so use absolute roots |
| product-paths path helpers | Selectively reuse or keep equivalent product-owned helpers | `productStorageDir` lacks ID validation; callers must fix ID to 003 and check containment |
| review state/store/callback transport | Reuse through product-owned adapter | Mocked authorization, nonce/idempotence and QC tests pass; live delivery not tested |
| Etsy draft core | Reuse only if draft handover is approved | Mocked upload/OAuth/retry tests pass; live credentials/shop/draft not verified |
| marketing/src/render.mjs | Conditional narrow transport reuse | Network routes, font wait, screenshot and geometry probes inspected; browser smoke remains required |
| marketing QC / claims | Do not trust unchanged as release gate | Expected dimensions default to actual reported values; substring/numeric claim matching is permissive; use exact Product 3 manifest and claims |
| Generic failure-before-review pattern | Reimplement in Product 3 CLI | Existing pipeline abort logic is sound in concept; concrete shape is wrong |
| PDF utilities | New product-owned code | Removed legacy renderer is not resurrected or copied for its layouts |
| Image processing / ZIP packaging | New product-owned configuration and scripts | No verified general transparent-asset/print ZIP pipeline found |
| n8n / Docker / migrations | Leave unchanged | Container lacks a proven mounted repo/Node/browser production execution path; no need to involve it |
| Shared spreadsheet components, marketing styles/fonts/compositions, design validators | Reject for Product 3 | Visual and semantic finance coupling; passing tests cannot authorize visual reuse |

## Coupling and risks

1. `services/src/design/scripts/pipeline.ts` assumes render/build.mjs, render/render.mjs, marketing/cli.mjs and legacy theme flags; default ID is 001. `expectedOutputs()` assumes an XLSX, eight workbook and eight seeded previews, two PDFs and six fixed PNGs. Bypass both.
2. Legacy shared design schemas/validators encode palette, typography, compositions and brand assumptions. Product 3 needs its own schema/QC config, rather than conforming fresh work to inherited constraints.
3. Marketing barrel imports expose visual modules; import a narrow transport module only after verification, or use a product-owned renderer. No legacy CSS/components/fonts/mockup scenes.
4. Review APPROVE calls the configured draft creator. Telegram review is not approval to publish. Decide whether approval should trigger a draft; bind approval to frozen artifact hashes and fail if files change.
5. Notifier delivery is best-effort; AWAITING_REVIEW does not prove the owner received the previews. Capture delivery evidence or verified manual handover.
6. Product directory lookup uses first matching numeric prefix. Fixed 003 paths, unique-ID checks and path containment must avoid ambiguity and traversal.
7. `storage/**` is ignored, so generated deliverables have no Git backup. Release archives and checksum manifest need a confirmed retained location.
8. Upstream pull exposed local untracked/ignored #001 remnants (lockfile, generated HTML and dependency/output folders). Preserve them; exclude them from source/reference discovery. Do not run the historical renderer by mistake.
9. The old baseline `.env.example` contained a credential-like Telegram token. The pulled version has no nonempty token assignment, but historical exposure remains a rotation question. Do not reproduce it or alter credentials during audit. Foundation tests inspect secret filenames, not arbitrary inline secret values.
10. Font license/embedding permissions, alpha edges, fine lace disappearing in print, ink-heavy dark pages, edited text overflow and package size are release risks addressed in the spec.
11. Node v24.15.0 is present; npm dependency installation, browser binaries and native PDF/image tools require separate verification. No claim of Linux/macOS parity follows from this Windows audit.
12. When a requested marketing QC report is missing, `assembleSubmission` can fall back to passing primary QC (`marketingOk ?? true`). Product 3's adapter must require every named report, nonzero checks, complete output coverage and matching build hashes; do not use assembler success alone as package approval.
13. The spreadsheet dependency audit reports two moderate findings (ExcelJS via UUID). No automatic fix/downgrade was performed; Product 3 does not need these dependencies. This is an existing infrastructure concern, not a reason to change #006 during audit.

## Verification record

- Git source, clean pre-pull tree, fast-forward ancestry, branch and 238-file tracked coverage checked.
- `node --test "test/**/*.test.ts"` in services: **170 passed, 0 failed**, including no-runtime-LLM checks. Live Etsy and Telegram were not contacted.
- Initial marketing suite: 8 passing tests and 2 test-file failures due to missing Playwright. Initial spreadsheet suite: 10 passing tests and 4 test-file failures due to missing ExcelJS/JSZip. These were environment failures. Locked `npm.cmd ci --ignore-scripts` installs succeeded in services, marketing and spreadsheet, touching only ignored dependencies, not tracked manifests/locks.
- Services `npm.cmd run typecheck`: passed. Spreadsheet rerun: **37 passed, 0 failed, 2 skipped** out of 39; real preview/recalculation checks require unavailable LibreOffice/Poppler tools. No Product #006 build was run.
- The full marketing rerun stalled at the Chromium availability/render check and was stopped. Browser files are present locally, but launch/render success is unverified. `node --test --test-skip-pattern=Chromium "test/**/*.test.mjs"` then passed **25 tests, 0 failed**, with the single Chromium render test deliberately excluded by the name filter (not counted in Node's skipped total). A passing pure suite does not verify transport reuse.
- Specification inventory checked mechanically: S=18, G=16, H=10, I=4, total 48. Plan table checked: exactly 10 numbered milestones. `git diff --check` and tracked-file comparison against 66ae23f passed.
- No current-product builds, migrations, approvals, packaging, artwork generation or customer visual renders performed. No visual inspection of the missing concept image or legacy product imagery performed.
- Existing products/shared tracked files remain unchanged relative to pulled baseline; only these three audit/spec/plan documents are authorized additions.

## Claude independence

**Yes: Product 3 can be built without Claude, Claude Code, Anthropic credentials or any Claude API.** Current service tests explicitly reject runtime LLM dependencies. Author isolated assets offline during Prompt 3 using available image generation or original hand-drawn/vector sources; freeze approved transparent assets. Code renders text, tables, forms, cuts and layouts locally from committed content. AI artwork creation is an authoring step, never a customer build/runtime dependency. Canva, n8n and PostgreSQL are also unnecessary for local generation. Telegram/Etsy are optional external release integrations with separate credentials, not design engines.
