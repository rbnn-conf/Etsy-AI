# Midnight Séance — product specification

Prompt 1 specification, updated with the owner's Prompt 2 approvals on 2026-09-17. The 48-master inventory, nine activities, 12 bingo boards, internal ID `003`, isolated architecture, offline text editor, specified fillable-PDF support, A4/Letter and full-colour/economy treatments are approved. Product: **Midnight Séance — Vamp Romantic Halloween Party Collection**; slug: `midnight-seance`. This is a fresh commission, not a LumiumX finance-product adaptation. Visual approval of Prompt 2 proofs remains pending.

## Product and creative intent

For adults hosting an intimate Halloween dinner, drinks evening or gothic gathering: an elegant coordinated stationery, entertainment and planning collection. “Séance” describes atmosphere; games are fictional social entertainment, not instructions for spiritual practice. Use composed botanical engraving, restrained lace and celestial/apothecary accents. No bright orange, cartoons, gore, copyrighted characters or borrowed legacy assets.

The owner supplied `midnight-seance-concept-reference.png` during the open Prompt 2 milestone. It is retained internally under `products/003-midnight-seance/design/reference/`, with independent art-direction analysis. Match mood and craft, not literal illustration content, generated text artefacts or its wordmark. No customer redistribution of the concept is implied.

Palette roles: antique ivory for reading/writing grounds; near-black for typography; oxblood for romantic focal detail; plum noir for secondary depth; muted antique gold for small ornament. Prompt 2 approved hues replace the initial proposals: near-black #171315, oxblood #701F2A, plum #342434, gold #A98A5B; the independent ivory selection is #F4EBDD for proof approval. Gold is printed flat colour, never advertised as metallic foil.

Typography direction: a refined, high-contrast editorial serif with usable small capitals/italics, paired with a quiet sans-serif. Evaluate **Bodoni Moda + Source Sans 3** as first candidates; verify actual downloaded licenses and print performance before adoption. Use locally bundled static font files and appropriate embedding licenses. Do not copy legacy font binaries or typography ratios. Target readable body type 10–12 pt, instructions 11–12 pt, cut-item secondary text at least 8.5 pt after physical print testing. Display hairlines must survive ordinary printers.

Composition language: invitations use a deliberate title axis with asymmetric botanical framing; signs use generous open fields and one distinctive engraved accent; games use calm headings and spacious playable content; planning sheets use light rules and writing areas. No legacy cards, finance tables, coloured spreadsheet tabs, warm-desk marketing scenes or inherited brand layouts.

## Isolated source and outputs (proposed, not created yet)

```text
docs/product-3/
  MIDNIGHT_SEANCE_AUDIT.md
  MIDNIGHT_SEANCE_SPEC.md
  IMPLEMENTATION_PLAN.md
products/003-midnight-seance/
  README.md
  package.json / package-lock.json
  product-spec.json
  design/
    tokens.json / typography.json / layout-rules.json
    reference/                 # supplied concept + provenance, subject to rights
    proof-manifest.json
  artwork/
    briefs/ / masters/ / approved/ / print/ / web/
    asset-manifest.json / provenance.json
  fonts/                      # new licensed selections + licenses
  content/
    stationery.json / games.json / answers.json
    host-planning.json / instructions.json
    pages.json / editable-fields.json
  src/
    paths.mjs / cli.mjs
    components/ / layouts/ / render/ / edit/ / package/ / review/
  editable/                   # customer editor source and offline UI
  marketing/
    tokens.json / compositions/ / content.json / listing.json / cli.mjs
  tests/                      # independent product-specific meaningful checks
  qc/
    config.json / schema/ / fixtures/ / visual-checklist.md
storage/products/003/
  builds/<build-id>/
    html/ / pdf/ / preview/ / editable/ / marketing/ / reports/ / customer/
  release/<version>/          # frozen ZIPs, manifest and approval record
  review-state.json
```

Fixed ID, paths resolved from module location, writes checked inside storage/products/003. No import of legacy design tokens/styles/components/artwork/marketing compositions. Product-specific entry point proposed: `npm.cmd --prefix products/003-midnight-seance run build`. Planned scripts: `proof`, `build`, `test`, `qc`, `marketing`, `package`, `review:console`, `review:telegram`. Not existing commands yet. Normal builds never send messages or create listings. No new shared framework, service, DB migration or n8n workflow is required.

Renderer: content manifest → product-owned HTML/CSS components with physical dimensions → pinned Chromium PDF → PDF forms/imposition where needed → previews rasterized from the **actual deliverable PDFs** → manifest/QC. Screen screenshots alone do not verify printed output. Fonts/artwork local and preflighted; block network, reject missing assets and unresolved content. Stable semantic output and artifact hashes; freeze release outputs even if PDF metadata prevents byte-identical rebuilds.

## Complete inventory

**48 logical master pages**, including 4 customer instruction pages. Nine activities, one with 12 unique bingo boards. The additional 11 bingo boards make **59 physical pages in one complete paper-size set**: 18 stationery + 27 games/host game sheets + 10 planning + 4 instructions. Paper-size, ink variants, imposition sheets and export formats must not be marketed as additional designs. Each master gets a stable ID, title, layout, content, artwork references and expected output entries.

| ID | Master page | Finished size / behavior |
|---|---|---|
| S01 | Main invitation | 5 × 7 in, portrait; editable host, date, time, venue, RSVP |
| S02 | Details / dress-code card | 4 × 6 in; editable arrival, dress and contact text |
| S03 | Welcome to Midnight Séance | 8 × 10 in; editable host/event subtitle |
| S04 | Apothecary drinks sign | 8 × 10 in; editable heading/subtitle |
| S05 | Feast / food-table sign | 8 × 10 in; editable text |
| S06 | Sweet temptations sign | 8 × 10 in; editable text |
| S07 | Guestbook sign | 8 × 10 in; editable text |
| S08 | Favors sign | 8 × 10 in; editable text |
| S09 | Reserved table sign | 5 × 7 in; editable table/party name |
| S10 | Enter after dark sign | 5 × 7 in; playful fictional event copy, editable |
| S11 | Dinner menu | 5 × 7 in; editable courses and dietary notes |
| S12 | Drinks menu | 5 × 7 in; editable six drinks, alcohol-free options and descriptions |
| S13 | Flat place cards | 3.5 × 2 in; editable guest names; repeated multi-up |
| S14 | Folded table tents | 3.5 × 4 in flat, 3.5 × 2 in folded; food/drink/table labels |
| S15 | Potion bottle labels | 3 × 2 in; editable name/details; no hazardous ingredient claims |
| S16 | Favor tags | 2 × 3.5 in; editable short message; optional hole guide |
| S17 | Guestbook message sheet | A4 / Letter, writing-led; editable header only |
| S18 | Thank-you card | 4 × 6 in flat; editable message/sign-off |
| G01 | Gothic Halloween trivia | A4 / Letter; 15 fact-checked original questions |
| G02 | Trivia answer key | A4 / Letter; numbered answers and host notes |
| G03 | Midnight word search | A4 / Letter; 18 words, readable grid |
| G04 | Word search solution | A4 / Letter; highlighted verified coordinates |
| G05 | Apothecary word scramble | A4 / Letter; 15 unique entries |
| G06 | Word scramble answer key | A4 / Letter; exact spellings |
| G07 | Midnight mingle bingo | A4 / Letter; 5 × 5, free center; 12 distinct boards from 36 original social prompts |
| G08 | Bingo prompt / host list | A4 / Letter; all prompts and clear mingle rules; no random calling dependency |
| G09 | Predictions after dark | A4 / Letter; playful predictions for the evening and reveal lines |
| G10 | Who among us? | A4 / Letter; 12 light social nominations, consent-friendly |
| G11 | The hidden omen scavenger hunt | A4 / Letter; 12 host-placeable objects/clues, no unsafe outdoor tasks |
| G12 | Conversation cards | Nine original conversation prompts on cut cards, 2.25 × 3 in |
| G13 | Costume awards ballots | Four ballots per page, 3 × 4 in; three clear categories |
| G14 | Awards tally / scoreboard | A4 / Letter; tied votes and transparent scoring |
| G15 | Games host guide | A4 / Letter; timing, supplies, player counts, setup and opt-out |
| G16 | Host results / reveal sheet | A4 / Letter; trivia scores, scavenger results and prediction reveal |
| H01 | Party overview and priorities | A4 / Letter; event brief, guest count and decisions |
| H02 | Four-week preparation checklist | A4 / Letter; dated/undated blank checklists |
| H03 | Budget and payment tracker | A4 / Letter; currency-neutral handwritten amounts, no spreadsheet dependency |
| H04 | Guest list / RSVP tracker | A4 / Letter; 20 rows, dietary/access notes |
| H05 | Menu and dietary planning | A4 / Letter; courses and clearly marked needs |
| H06 | Drinks / apothecary bar plan | A4 / Letter; quantities, ingredients, alcohol-free choices |
| H07 | Shopping and supplies | A4 / Letter; grouped roomy checklists |
| H08 | Décor, lighting and table plan | A4 / Letter; sketch zone, placement and safe setup reminders |
| H09 | Evening timeline | A4 / Letter; preparation through cleanup, time and owner columns |
| H10 | Day-of setup and cleanup checklist | A4 / Letter; delegations and return/pack-away notes |
| I01 | Start here / file map | A4 / Letter; logical contents and package map |
| I02 | Print, trim and fold guide | A4 / Letter; scale, paper, margins, cut/fold diagrams |
| I03 | Editing and saving guide | A4 / Letter; editor steps, fonts, limits, export and fallback |
| I04 | Troubleshooting and permitted use | A4 / Letter; tested software, personal-use terms, support route |

Games require exact original text and mechanically verified keys; factual trivia references kept in internal provenance. No questions that depend on protected film/character brands. Do not reuse an inherited game list or claim random boards guarantee unique winners.

## Print and customer formats

- A4 (210 × 297 mm) and US Letter (8.5 × 11 in) print PDFs, laid out separately with 10 mm safe margins for home sheets. Finished-size stationery retains the same physical dimensions across carriers, with trim/fold marks outside finished content.
- Two print treatments: **Signature Ivory** (ivory-led romantic ornament) and **Economy White** (white ground, reduced ornament/ink, same hierarchy). These are usability treatments within one design, not additional themes. Instructions use one plain readable treatment.
- Small stationery: finished-size individual PDF plus imposed home-print sheet for both paper sizes. Use no-bleed home layouts; artwork ends inside trim. Any later commercial-bleed export must be explicitly added to the manifest and tested within the ten prompts; no automatic CMYK/PDF-X claims.
- Native 5 × 7 invitation PNG at 1500 × 2100 px (300 ppi), plus digital-share JPEG at 1500 × 2100. Sanitized editable sample details; marketing uses clearly fictitious example data. No baked-in typography in artwork.
- Printable PDF is the authoritative output. Include fillable PDF copies for stationery text fields where geometry and font appearance can be validated. Editable scope is **text only**, not artwork placement, full layout, games, theme changes or arbitrary font changes.
- Primary proposed editable source: a bundled offline HTML editor, opened locally in current desktop Chrome/Edge, with embedded fonts/assets, constrained fields, multi-name/place-card input, preview, reset and JSON save/load. No API or account. Provide deterministic browser print/export guidance, disable headers/footers, lock physical sizing and document tested versions. Requires a Prompt 2 editor proof before commitment; fillable PDF is the fallback in the same milestone if browser export is unreliable.
- Canva links are not promised. PPTX/DOCX/XLSX/SVG source are not proposed customer formats; avoid untested editable promises. Source code remains internal unless expressly approved.
- Provide licensed font notices as required, but include only fonts whose redistribution licenses permit it. Original standalone artwork masters remain internal; customers receive embedded collection artwork, not a clip-art resale library.

Proposed delivery files, subject to current Etsy limits being checked against official sources in Prompts 7/9/10:

```text
01-START-HERE.pdf             # four-page instruction guide, primary size confirmed
02-PRINT-A4.zip               # Stationery, Games, Host Planning; both ink treatments
03-PRINT-US-LETTER.zip        # matching organized contents
04-EDITABLE-STATIONERY.zip    # offline editor, fillable PDFs, sample content and notices
05-DIGITAL-INVITATION.zip     # native PDF, PNG/JPEG examples, export instructions
```

Include both guide sizes within print ZIPs. Customer folders and filenames use unambiguous ASCII while rendered titles preserve the accent in Séance. No blank “edit me” placeholder in fixed print deliverables; intentionally writable areas are distinct from sample invitation details. Candidate budget: each upload at most 18 MB to leave headroom; this is an internal target, **not a statement of current Etsy limits**. Compress/partition within the five-file candidate scheme after verifying actual platform limits. Never degrade decorative assets below effective 300 ppi to meet a budget. Internal release manifest carries versions, hashes, page and variant counts, fonts, provenance and approvals; no secrets or internal QC debris in customer ZIPs.

## Original artwork workflow

Prompt 2 uses honest code-only typography/layout proofs with artwork exclusion explicitly labelled; they are not final product pages. Prompt 3 produces approved original assets; no asset stand-ins in anything described as final.

1. Analyze the supplied concept independently and write an asset brief for each motif with role, palette, aspect ratio and maximum printed footprint.
2. Create isolated motifs only: four botanical stems/sprigs (rose, thorn, dark foliage, night bloom); two paired floral corner compositions; one bouquet; crescent/stars group; engraved moon disc; moth; ornate key; candle/candelabrum; two apothecary bottles; oval engraving frame; lace edge master; lace corner master; small botanical divider. **18 master assets**, with derived crops/colour variants tracked separately.
3. Generate transparent-background original raster assets with an image tool, or author original vectors manually. Do not generate entire invitations, signs, grids or fake text. Lace, rules and celestial geometry may be original deterministic vector assets for crisp print detail. No copied reference illustration or legacy SVG.
4. Inspect at original resolution on checkerboard, white, ivory and near-black: real alpha, no white halo, no baked checkerboard, clean crop/padding, coherent linework, no accidental glyphs, anatomy errors or logos. Regenerate/correct within Prompt 3.
5. Retain raw master, approved RGBA PNG and original SVG when applicable; artwork at least 300 effective ppi at its largest placed size (600 ppi preferred for fine line art). Record pixel size, alpha range, placement size, license/tool provenance, prompt and hash.
6. Produce print and web derivatives through deterministic processing, without indiscriminate recolouring or flattening onto an opaque background. Visual-check derivatives again. Freeze accepted assets; code build never regenerates them.
7. Maintain a manifest of required asset IDs. Missing/unapproved assets fail the final build. Prompt 8 validates every actual PDF placement and colour treatment.

## Automated and visual QC requirements

Automated checks must fail loudly before review/package handover:

- Isolation: no legacy visual imports; writes only inside 003; existing tracked products/shared files unchanged; no secrets/private paths in outputs; builds do not send messages.
- Manifest/schema: exact page IDs/order, 48 masters, 12 distinct bingo boards, expected size/mode/export matrix, no unknown variants, no zero-byte/missing files or unresolved content markers.
- Assets/fonts: all assets approved, local, hashed; real alpha and effective resolution; licenses present; fonts loaded and embedded as appropriate; accent, currency, apostrophe and long-name glyphs tested.
- Layout: physical PDF page/trim sizes within 0.5 mm, carrier safe margins, no unexpected blank pages, missing images, clipped text or intersection of critical text with decoration/cut lines. Constrained edited fields tested at documented limits, long names, multiline menus and non-ASCII text.
- Games: every word occurs in the stated grid coordinates; answer sets agree with prompts; scrambles have exact letter multisets; bingo boards unique with one free center and prompt membership; tally/rules consistent; host keys not mixed into participant files.
- PDF/editor: selectable text; no links to missing resources; expected form names and appearance streams, save/reopen/export checks in supported readers; flatten/export retains typography; unsupported reader caveats documented from actual tests.
- Preview/QC: rasterize each delivered PDF page, not only screen HTML. Compare exact expected dimensions against decoded image dimensions, check every page rather than representative samples only. Reports identify build ID and hashes.
- Package: clean extraction, relative-path safety, actual platform size/count constraints, no OS junk/sample host private data/raw artwork/internal tests; filenames/file-map match contents; checksums and reproducible manifest counts.
- Marketing: factual claims equal verified manifest values; no permissive substring/numeric equivalence; actual product renders; no illustrated editable capabilities that do not exist; all claimed formats tested; crops checked at listing thumbnail size.

Visual inspection is separate from automated pass counts. In Prompt 2 show invitation, 8 × 10 welcome sign and A4 word-search sheet as the three proofs, with both size fit and economy treatment samples. In Prompt 3 inspect all 18 assets. In Prompt 8 review every PDF page at reading scale and full resolution, all ink treatments and carrier sizes, edited exports and solution sheets; contact sheets provide navigation, not a substitute for individual checks. Inspect artwork halos, glyphs, lace/hairlines, whitespace, writing room, cut/fold geometry and printed contrast. Perform physical 100% scale print tests on a representative invitation, folded tent, tag, game and planner in colour and monochrome. Record printer/paper/settings; if a printer is unavailable, physical proof remains an explicit open release check, not a claimed pass.

Prompt 9 checks all marketing images at full size and thumbnail crops. Prompt 10 opens/extracts each frozen customer ZIP, tests instructions as a new buyer and binds Telegram approval to the same hashes. Owner approval is required at visual dependency gates; corrections fit the active numbered milestone and do not create an eleventh prompt.

## Decisions and scope boundaries

Before Prompt 2: supply/identify concept image or waive it; approve the 48-master scope and 12-board expansion; approve ID 003; approve text-only offline editor/fillable PDF approach; approve both print treatments and target customer. Font/palette approval follows actual proofs in Prompt 2. No commission-wide inherited brand requirement applies.

Before release: confirm shop/support identity, price/currency, customer-use terms, font/artwork rights, print proof availability, Telegram recipient and whether approval should create an Etsy draft. A live Etsy publication is not authorized by this audit. Packaging/approval/handover remain Prompt 10; if approval is pending, that same milestone remains open.


## Prompt 3 artwork specification amendment

The owner-supplied Prompt 3 supersedes the initial eighteen-master artwork estimate: 35 original designs A01–E05, each with a signature and purpose-drawn economy treatment (70 raster assets). See products/003-midnight-seance/artwork/records/catalogue.json and measured-assets.json for subjects, safe dimensions, native resolution, alpha bounds, file hashes and placement guidance. The page inventory and customer-format scope are unchanged. Paired ravens are permitted as the optional welcome focal treatment by the supplied Prompt 3. Production typography, forms and layouts remain deterministic; no full-page AI raster, procedural replacement or legacy visual asset is used. Owner approval of the integrated artwork proofs remains pending.
