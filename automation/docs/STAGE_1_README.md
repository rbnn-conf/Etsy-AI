# Stage 1 Creative Orchestrator

Telegram → new product request → optional reference images → OpenAI reference
analysis and creative direction → **3 structured concepts** → **1 quick preview
image per concept** → owner chooses A/B/C by looking (gate 1: "which idea?") →
structured `product.json` specification → **3 creative proofs** → owner
approves, regenerates, changes direction or rejects (gate 2: "is this design
good enough to build?"). **It stops there.** No full artwork, no production build,
no Etsy, no marketing. Decision record: `docs/adr/ADR-023-stage-1-creative-orchestrator.md`.
Audit (archived): `docs/archive/STAGE_1_AUDIT.md`.

## Setup

1. Create a **second** Telegram bot with @BotFather. It must not be the review
   bot: Telegram allows one poller per token.
2. Add these to the **repo-root** `.env` (git-ignored). The names are listed in
   `automation/.env.example`:

| Variable | Required | Meaning |
|---|---|---|
| `AUTOMATION_TELEGRAM_BOT_TOKEN` | yes | Token of the second bot. |
| `AUTOMATION_TELEGRAM_CHAT_ID` | no | Chat to use. Defaults to `TELEGRAM_CHAT_ID`. |
| `AUTOMATION_TELEGRAM_ALLOWED_USER_IDS` | no | Comma-separated user IDs allowed to act. Defaults to `TELEGRAM_ALLOWED_USER_IDS`. |
| `AUTOMATION_ALLOW_SHARED_TOKEN` | no | `true` only if you deliberately reuse `TELEGRAM_BOT_TOKEN`. Then never run another poller on it. |
| `OPENAI_API_KEY` | yes | OpenAI key. It is never logged; `sk-…` and bot-token shapes are redacted. |
| `OPENAI_TEXT_MODEL` | yes | A model that supports image input and structured (json_schema) output on the Responses API. |
| `OPENAI_IMAGE_MODEL` | yes | An Images API model that returns base64 PNG. Its name must start with a family listed in `IMAGE_SIZES` (`src/orchestrator/canvas.mjs`): `gpt-image` or `dall-e-3`. `check-config` refuses anything else. |
| `OPENAI_IMAGE_SIZE` | no | **Ignored** (a startup warning says so). The proof size now follows each product's orientation; see below. |
| `OPENAI_IMAGE_QUALITY` | no | Creative proofs. Default: `medium` for `gpt-image*`, `standard` for `dall-e-3`. Checked against the model's documented values. |
| `AUTOMATION_PREVIEW_QUALITY` | no | Concept previews. Default: the cheapest documented value (`low` for `gpt-image*`, `standard` for `dall-e-3`). |
| `AUTOMATION_MARKETING_SCENES` | no | Stage 3 AI environment images per run, 0–4 (default `4`): tabletop, gift, print, inside, in that priority. `0` means coded environments only, with no image cost. |
| `AUTOMATION_MAX_CONCEPT_BATCHES` | no | Default `3` (1–10), including the first. Each batch is 1 text call and 3 preview images. |
| `AUTOMATION_MAX_REFERENCES` | no | Default `6`. |

Model names are deliberately not hard-coded: choose current ones from your
OpenAI account. A wrong name fails with a clear error and does not corrupt state.

## Run

```powershell
npm.cmd --prefix automation run check-config   # validate configuration, exits
npm.cmd --prefix automation start              # long-poll until Ctrl-C
npm.cmd --prefix automation test               # offline tests (OpenAI and Telegram mocked)
```

The older ADR-009 review bot (`services` `telegram:review-bot`) was retired in
ADR-069; this bot is the only Telegram poller. Keep `TELEGRAM_BOT_TOKEN`
different from `AUTOMATION_TELEGRAM_BOT_TOKEN` unless you set
`AUTOMATION_ALLOW_SHARED_TOKEN=true`.

## Telegram usage

```
/newproduct christmas greeting card for adults
/newproduct birthday party invitation
/newproduct minimalist weekly planner
/newproduct halloween kids activity book
(optionally send 1–6 reference images, as photos or image files; an image
 can also carry the /newproduct command as its caption)
/go
→ short header, then 3 captioned preview photos (A, B, C)
→ A · B · C · REGENERATE CONCEPTS · CANCEL
→ specification + 3 creative proofs: APPROVE STYLE · REGENERATE PROOFS · CHANGE DIRECTION · REJECT PRODUCT
/previews   make the previews for a product at IDEAS_READY, or re-send finished ones (never regenerates)
/produce 009   Stage 2: build the customer files for a CREATIVE_APPROVED product (no AI calls)
/market 009    Stage 3: Etsy listing + listing images for a PRODUCTION_APPROVED product (no publishing)
/etsy 009      Stage 4: create and verify an Etsy DRAFT for a MARKETING_APPROVED product (never publishes)
/etsy 009 section  retry only the Etsy shop-section step for an existing draft (free)
/status   /cancel   /help
```

CHANGE DIRECTION asks for a short message (e.g. "Make the characters rounder
and backgrounds simpler."). The next text message becomes the feedback.

### Owner status while a step runs (ADR-062)

A long step (concepts, previews, specification, proofs, patterns, full book,
production, marketing, Etsy) shows ONE status message. The bot edits that
message in place:

```
🟢 #020 — WORKING
🧶 Drafting crochet patterns
█████░░░░░ Patterns 3 / 6
✅ Last: 03 Beech Leaf Coaster
⏱ 4m 12s

No action needed. I'll message you when it's ready.
```

When the step ends, the same message becomes one of these:

- 🟠 ACTION REQUIRED, with "Pipeline paused until you respond."
- 🔴 FAILED, with the stage and a short error.
- ✅ DONE.

Each review with buttons, and each failure with Retry, also starts with the
🟠 or 🔴 header.

Counters (`n / total`) appear only where the total is known. Production
files show a count only. The elapsed time is not a countdown. A step whose
model call is slow stays 🟢; it is never marked stalled.

A product waiting at a review (`AWAITING_*`) or in FAILED for 10 minutes
gets one 🔔 reminder. It gets no further reminders, including after a
restart. Responding clears the reminder. A later review can get its own
single reminder.

Bookkeeping is kept in `automation/state/owner-status.json`. After a
restart, a status message left 🟢 is closed from the product's persisted
state, and nothing is re-run.

## Control panel and costs (ADR-027)

Send `/start` (or `/menu`) for the LumiumX Factory dashboard. It shows:
- factory health;
- active products and Etsy drafts;
- tracked API spend.

Its buttons:
- **✨ Create Product:** press ✏️ Describe a product, then send one message
  with your idea. It is free; nothing is generated until you confirm Generate
  Concepts.
- **📦 My Products:** newest first, with the stage and cost of each product,
  and only the buttons valid for its current state.
- **🏪 Etsy Drafts**
- **💰 Costs:**
  - today, the last 7 days, this month, all tracked, and the average per
    product;
  - by product and by model;
  - **🌐 OpenAI Usage / Billing**, a link to
    `https://platform.openai.com/usage`. OpenAI's dashboard is the source of
    truth for account billing and remaining credit. The bot never reads or
    claims it.
- **📊 Factory:**
  - Telegram, OpenAI, Production, Marketing, Etsy and Publishing (🔒 Manual);
  - the registered production adapters (Greeting card, Colouring book);
  - product counts.

  It uses local state only; Refresh makes no API calls.
- **⚙️ Tools:** the full command list, the OpenAI billing link and the server
  check command.
- **❓ Help**

**Typing `/`** shows Telegram's native command menu. The bot registers it at
startup:
- `start`, `newproduct`, `products`;
- `status [n]` (a product, or the factory);
- `produce`, `market`;
- `etsy` (with no number: the Etsy drafts);
- `costs`, `help`.

The other commands still work. Plain text that is not a command gets a short
hint.

**Guided next steps:**
- Every review message (concepts, proofs, production, marketing, Etsy draft)
  ends with **❓ What can I do here?** and **🏠 Home**.
- **❓ What can I do here?** lists only the actions and commands for that
  screen or product state.
- The Etsy draft review adds **🔗 Open Etsy Editor** (live drafts),
  **💰 Product Cost** and **🧾 Product Summary**.
- After each approval, the message offers the next stage:
  - **🏭 Build Production Files** (free, runs directly);
  - **🛍 Create Listing & Marketing** or **🏪 Create Etsy Draft**, each
    through its confirmation screen.

**Failures:** "⚠️ Product #N needs attention", the short error, then:
- **🔄 Retry Safe Step:** shown only when the recorded state proves a retry is
  safe. A free step (production, Etsy draft, refresh, publish-reconcile)
  retries directly.
- **🔄 Retry (API cost):** a step that may call OpenAI; asks for confirmation
  first.
- No retry button when:
  - an Etsy draft creation was uncertain: check Etsy and send
    `/etsy <n> confirm-no-draft`, after which Retry is offered;
  - a listing is unexpectedly active.
- **📋 Details:** the full error, step and resume state.
- **📦 Product:** from there you can cancel the stage, with confirmation.

How it behaves:
- Buttons run the same actions as the commands, which stay available.
- Navigation needs no confirmation. Paid, destructive and Etsy-draft actions
  ask first.
- Product buttons are one-time (nonce), so old buttons are refused. Old
  navigation buttons only re-render a screen.
- No button ever publishes an Etsy listing: you publish drafts on Etsy
  yourself.

**Estimated API cost:**
- Every OpenAI call is priced from the usage OpenAI reports, using
  `automation/config/openai-pricing.json`: a versioned table plus a USD→GBP
  rate, which `AUTOMATION_FX_USD_GBP` overrides.
- Each call is logged to `automation/state/costs/ledger.jsonl`.
- Costs are "tracked since" the bot first ran with this feature; earlier calls
  are listed as not included.
- To change prices, add a new `version`; old events keep theirs.

## Page counts depend on the product format

`page_count` is the number of distinct designed printable pages or panels,
each with its own artwork. It is not the number of files or deliverable
components. Each concept also lists `deliverable_components`, everything the
customer receives. A folded Christmas card delivers front, inside and back
designs plus a printing guide, and that is 3 pages.

Each concept must pick a `product_format`, and `src/orchestrator/page-rules.mjs`
enforces that format's range at the ideas step and again at the specification
step:

| product_format | pages |
|---|---|
| `greeting-card`, `invitation` | 1–4 |
| `single-printable` | 1–2 |
| `printable-set` | 2–30 |
| `worksheet-bundle`, `planner`, `party-kit` | 5–60 |
| `activity-book`, `colouring-book` | 10–60 |

A product whose type or name says it is a book ("colouring book", "activity
book", "workbook" and so on) needs at least 10 pages, whatever format it picks.
The schemas only set the absolute range 1–60. A product with fewer than 3
pages still gets 3 proofs: each page once, then the main page again as a style
variation.

## Concept previews (gate 1)

After ideation, the bot makes exactly one preview image per concept, using
the configured image model at preview quality. The prompt
(`prompts/concept-preview.md`, built by `src/openai/concept-preview.mjs`)
combines:

- the owner's request;
- general reference characteristics (palette, linework, texture, composition
  density, background, mood). `do_not_copy` items never enter an image prompt;
- the creative direction's shared style and `avoid` list;
- the concept's `preview_brief`, product format and `orientation`;
- the names of the other two concepts, so each preview differs from them.

### Style vs content, and diversity

The creative direction is **shared style only**: medium, texture, linework,
palette family, lighting feel, mood and print feel. It never names a subject,
character, object, pose or scene unless the owner's request requires it.
When references show different subjects, the direction describes their shared
visual system instead of merging them into one scene. New directions are
stamped `"scope": "shared-style"`.

Each concept owns its content in `visual_route`: primary_subject, scene,
focal_object, composition, lighting, palette_emphasis, emotional_tone,
typography_approach and distinguishing_visual_hook.

Before any preview is paid for, `src/orchestrator/diversity.mjs` checks the
three routes deterministically. Words from the owner's request are ignored,
and each pair of concepts is compared on five dimensions:

| dimension | counts as "same" when |
|---|---|
| subject, focal object | the main (last) noun is the same |
| scene, composition, lighting | word overlap (Jaccard) is at least 0.5 |

Every pair must differ on at least 3 of the 5. Otherwise the batch is
rejected as "not visually distinct" (retryable, no image made). A subject
the owner asked for counts as shared, so the other dimensions must carry the
difference.

Two guards keep the shared style from overriding a concept:

- **Leak guard:** a direction field that names any concept's subject or focal
  object (and the owner didn't ask for it) is left out of the preview
  prompts, and a log line says so.
- **Legacy rebuild:** a reference-based direction without the scope stamp
  (e.g. Product #009 v1) is rebuilt once from the saved reference analysis
  (1 text call, no image) before new concepts. The old one is archived as
  `creative-direction.vNN.json`.

Each preview prompt lists that concept's own route and ends with "This
preview must be visually distinct from concepts B and C. Avoid resembling:",
followed by one-line summaries of the other routes.

Concepts carry three preview-specific fields: `tagline` (the caption), `orientation`
and `preview_brief` (the single key image: subject, composition, focal
placement, typography placement). Concepts saved before these existed fall
back to their description and look.

Telegram shows a short header, then each preview as its own photo captioned
`A — name / tagline / N designed pages`, then the buttons. The full concept
text stays in `product.json`. The later specification must keep the chosen
concept's orientation.

Cost controls:

- Each image is recorded in `product.json` as soon as it exists.
- A failed or interrupted batch resumes with only its missing images (RETRY).
- A PNG written just before a crash is reused, not regenerated.
- Restart recovery never generates anything.
- `/previews` on a finished batch only re-sends it.
- Old buttons are refused by the nonce, and a running step holds a lock.
- Every image call is logged with model, size and quality.

REGENERATE CONCEPTS runs a new ideation (1 text call) and makes
`batch-NN+1`, keeping earlier batches. It stops at
`AUTOMATION_MAX_CONCEPT_BATCHES`: the button disappears and a crafted press
is refused.

## Canvas, image size and creative proofs

The specification includes a `canvas` for the product: `orientation`
(portrait, landscape or square), `background` (white, coloured or
illustrated), `edge` (safe-margin or full-bleed) and one sentence of
`format_notes`. It is stored in `product.json` from `SPEC_READY` onwards.
Colouring and activity books must be white with safe margins; planners and
worksheets must have safe margins; crochet pattern bundles must have safe
margins. The code checks this in `src/orchestrator/canvas.mjs`. The model is
offered only the values the format allows: the canvas enums are narrowed per
format and to the concept's orientation. A format-fixed `edge` is set before
validation (ADR-061). Cards, invitations and other printables may
use colour and full bleed. Line art or colour comes from the creative
direction's `colour_mode`.

The image prompt adds a deterministic CANVAS paragraph built from those
values, plus a one-line hint for the format, so a card never looks like a
colouring page. Creative-direction fields that don't apply (for example
`character_language: "not applicable"`) are left out of the prompt.

The image size is chosen from the model family and the orientation, using
documented sizes only:

| family | portrait | landscape | square |
|---|---|---|---|
| `gpt-image*` | 1024x1536 | 1536x1024 | 1024x1024 |
| `dall-e-3` | 1024x1792 | 1792x1024 | 1024x1024 |

Each proof records the size it used in `product.json`.

Every proof attempt has 3 proofs. A product with 3 or more pages shows 3 of
its pages. A 1-page product shows a primary design, a composition variation
and a treatment variation of that page. A 2-page product shows both pages
plus a composition variation of the first. Variations are labelled as
variations in Telegram and in the prompt ("not an additional page"), and
`page_count` is never changed.

## Stage 2: production (ADR-024)

After APPROVE STYLE, send `/produce <number>`. The bot then runs the
deterministic `production/` package, which makes no OpenAI calls:

1. **Handoff:** writes `production/handoff.json` and moves the product to `PRODUCTION_READY`.
2. **Build:** `PRODUCTION_BUILDING`.
3. **QC:** `PRODUCTION_QC`.
4. **Review:** only after a QC pass does the bot send a short summary, PNG
   renders of the printed sheets (no PDFs) and the buttons **APPROVE
   PRODUCTION · REBUILD · CANCEL**.

- APPROVE PRODUCTION moves the product to `PRODUCTION_APPROVED`, which is final.
- REBUILD rebuilds every file; the output is identical.
- CANCEL returns the product to `CREATIVE_APPROVED` and keeps all files.
- A QC failure parks the product in FAILED (resume `PRODUCTION_READY`). The
  failure message offers 🔄 Retry Safe Step; the product screen offers Cancel,
  with confirmation. Nothing from Stage 1 is touched.
- Adapters: `greeting-card` and `colouring-book` (ADR-028). A colouring book
  needs its FULL book approved first (next section); `/produce` before that
  shows the book status. Stage 2 never generates artwork.
- A crash mid-build: recovery marks it FAILED, and RETRY rebuilds only the
  missing outputs.
- `/produce` on a product already awaiting production approval re-sends the
  review.

Which approved image becomes which part of the card (for example, two card
designs sharing one inside) comes from the specification by default. An
owner-authored `products/<id>/production-plan.json` can override it.
Details: `production/README.md`.

## Colouring books: the full book (ADR-030)

The 3 style proofs approve a colouring book's STYLE, not the book. After
APPROVE STYLE, the bot offers **🎨 Generate Full Colouring Book**, or
**🎨 Generate Remaining N Pages** when approved proofs are reusable.

1. **Plan (free, nothing written):** the confirmation screen shows:
   - pages required;
   - approved style pages reusable;
   - pages to generate;
   - estimated image calls and £ (the cost ledger's recent proof/page image
     average);
   - the pixel size.

   A proof is reused only if it is that page itself (not a variation), made
   from the current page text and direction version, the book's exact size,
   and passes the page checks. Any proof that is not reused is listed with
   the reason.
2. **Generate (paid, after confirmation):**
   - `book/manifest.json` (P001..PNNN) is written first.
   - Reused proofs are copied to `book/pages/`; the proofs are untouched.
   - Then one image call per missing page, in order, with the approved
     proofs' exact style prompt plus the page detail and a book-consistency
     paragraph.
   - After each page, before the next call, the bot saves: the artwork, its
     checksum and dimensions, its status, the prompt (`book/prompts/`) and
     the cost event.
3. **Failure / restart:**
   - FAILED at step `book`. **🔄 Retry (API cost)** shows only the pages still
     missing, then resumes there.
   - Finished pages are never regenerated or paid twice. A page written just
     before a crash is adopted.
   - `/cancel`, or ✖️ Cancel, stops the book and keeps every page.
4. **Creative QC (free, deterministic, shared with Stage 2):**
   - page count and P001..PNNN sequence;
   - files and checksums, valid PNG, size and orientation;
   - blank pages, exact duplicates;
   - black-and-white line art;
   - edge clipping;
   - warnings for shading, crowded margins and density drift from the proofs.
5. **Review:**
   - One album of contact sheets (8 pages each), then the summary: pages,
     QC PASS/FAIL, generation cost, product total.
   - Buttons: **👀 View Pages 1–8 …**, **🔎 Inspect Individual Page**,
     **✏️ Regenerate Page**, **✅ Approve Full Book** (only on a QC pass),
     **❌ Reject / Change Direction**.
   - Per page: **👀 View Full Size**, **✨ Regenerate** (1 image call), and
     **✏️ Change Direction** (reply with an instruction; 1 image call; the
     book style is kept).
   - Replaced pages go to `book/history/`.
   - **Change Book Direction** archives the generated pages and shows the new
     plan; nothing is generated until you confirm.
6. **✅ Approve Full Book** records `book.approval`, bound to the manifest, the
   page checksums and the QC report. Then **🏭 Build Production Files** or
   `/produce <n>`.

## Crochet pattern bundles: the pattern content (ADR-041)

APPROVE STYLE approves the look only: the cover, illustrations, palette and
typography, as 1–3 artwork pages. It never approves a crochet instruction.
The patterns have their own gate:

1. **🧶 Set Pattern Count & Terms:** reply `33`, `33 US` or `12 UK`. US terms
   are used unless you ask for UK. This is free; nothing is generated.
   Optional collection guidance can follow a colon or go on the next lines
   (`33 US: roses, daisies, tulips, fillers, leaves and stems`). It is
   creative direction for the plan, not a checklist (ADR-042).
   - The plan defines every pattern first. It is rejected before any
     drafting on near-duplicates, an incomplete arrangement or an unbalanced
     difficulty mix.
2. Either:
   - **🧶 Draft N Candidate Patterns (AI)** (paid, confirmed first; estimate
     shown). This makes 1 plan call, then 1 text call per pattern, each saved
     before the next, so a failure resumes. The drafts are
     `ai-assisted-draft`, `unverified`.
   - **📂 Validate Supplied patterns.json (free)**: your own source in
     `products/<id>/crochet/patterns.json` (format:
     `production/schemas/crochet-pattern-bundle.schema.json`). No model call.
3. **Review:**
   - The validator (the same one Stage 2 uses) runs.
   - You receive the full text as `…-crochet-patterns-review.txt`, a
     per-pattern ✅/❌ list and the problems.
   - Buttons:
     - **✅ Approve Patterns** (only when valid);
     - **🔁 Redraft Invalid Patterns (AI)**: the validator's errors are passed
       back;
     - **✏️ Revise a Pattern (AI)**: reply `7: <change>`;
     - **🔄 Re-validate patterns.json (free)**: after editing the file by
       hand;
     - **❌ Reject Patterns**: every file is archived to
       `crochet/history/rejected-<time>/`.
4. **✅ Approve Patterns** records `crochet.approval`: the source SHA-256, the
   pattern count, the origin and the verification counts. It approves the
   patterns for production only; they are **not** tested. If
   `crochet/patterns.json` changes afterwards, `/produce` refuses it until it
   is re-validated and approved again.
5. Then **🏭 Build Production Files** or `/produce <n>` (Stage 2, no API cost).

### Crochet visual set: collection hero + per-pattern previews (ADR-063)

After ✅ Approve Patterns, the product screen offers **🖼 Generate Crochet
Visual Set**. A product that is already production-approved (e.g. #020) offers
it too; its production approval is then cleared, and you rebuild the package
for free afterwards.

- **Confirmation:**

  ```text
  🎨 Product #020 — Crochet Visual Set

  Generate:
  • 1 collection hero
  • 6 pattern preview images

  Total: 7 image generations
  ⚠️ This will incur image API cost.
  Estimated: 7 image calls ≈ £… (recent average per call).
  ```

  The estimate's £ figure appears only when the cost ledger has history.
  Nothing is planned or generated before **Generate Visuals**.
- **Briefs:** they are built by code from the approved patterns and their
  fingerprints. There is no text-model call. Every crochet object is an
  approved pattern. Props are concrete and never crochet. Each preview shows
  exactly one product.
- **Generation:** one image at a time, each saved before the next. The status
  message lists `Collection hero ✅`, then each `NN Name ✅/🔄/⏳`, then
  `Progress: 3 / 7 visuals`.
- **Retry** pays only for the missing images. An image written just before a
  crash is adopted.
- **Review:** you receive every image, plus the deterministic QC (mapping,
  fingerprints, files, resolution, crop). Code cannot see what an image
  shows: check for wrong or extra crochet items yourself. Buttons:
  - **✅ Approve Visual Set**: binds the manifest and every file SHA-256;
  - **🔁 Restyle Hero**, **🔁 Restyle a Preview** or **🔁 Restyle All
    Visuals**: only those images are archived (kept) and regenerated;
    patterns, fingerprints and briefs never change;
  - **✖️ Stop**: keeps every image.
- **Once a set exists, Stage 2 requires it to be approved.** Each preview is
  placed in its pattern page's fixed top-right slot, captioned "Illustrative
  finished-item preview". Products without a set build as before.

- **Marketing (ADR-042):** `/market` builds the crochet campaign from the
  real customer PDFs. It enforces the integrity rules and uses your approved
  SEO keywords, if any.
- **Etsy (ADR-059):** the format resolves to the fixed owner-approved category
  6343 (Craft Supplies & Tools > Patterns & How To > Patterns & Blueprints) in
  `automation/config/etsy-taxonomy-map.json` `format_mappings`. The listing's
  free-text category is never consulted, and the ID is re-checked against
  Etsy's live taxonomy every run (a mismatch stops before any Etsy write). A
  product's `etsy/settings.json` `taxonomy_id` still takes precedence.

## Stage 3: listing and marketing (ADR-025)

After APPROVE PRODUCTION, press **🛍 Create Listing & Marketing** and choose
a marketing style (ADR-029). Or send `/market <number>`, which runs Factory,
exactly as before.

Stage 3 supports `greeting-card` and `colouring-book` (adapter registry,
ADR-037). For a **colouring book**:
- **Images (up to 10):** hero (cover + a page), an interior page, a collage,
  a coloured example, before/after, what's included, printable/download
  information, features, a lifestyle image and a closing summary. They are
  built from the approved book pages that Stage 2 recorded
  (`stage3_handoff`).
- **AI calls:** besides the listing and scene briefs, OpenAI makes ONE
  **coloured example** (`marketing/examples/`). It is an image edit of a real
  page, always labelled "Coloured example" and shown beside the real
  line-art page. QC checks it is never counted as product artwork.
- **Factory cost:** 2 text + 3 image calls (2 environments + 1 example).
- **Page counts:** the model is told the authoritative counts: colouring
  pages, total pages, and what every other page is (for example the cover).
  Code rejects any copy with a wrong count, or that calls the book "one
  page". A rejected listing is not saved, so a retry makes one new listing
  call.
- **Missing pages:** if an approved page is missing or changed, Stage 3 stops
  before any AI call and names the page. Stage 2 files are never touched.

- **✨ AI Creative:** AI-directed compositions with wider layout freedom
  (archetype, scale up to 70%, angle, décor). Code rebuilds each one with the
  real artwork and code-rendered text.
- **🎨 Hybrid** (recommended, never automatic): 1 art-direction call (it sees
  the real artwork for colour and mood), then 1 AI environment per
  art-directed image, built around an empty product area. Code composites
  the REAL Stage 2 artwork into it, whole, with perspective and shadow.
- **🧱 Factory:** the existing templates described below.
- **🆚 Generate Hero Comparison:** only 01-hero in all three styles (about 2
  text + 3 image calls), sent labelled, then "Which direction should I use?".
  The paid hero direction and environment are reused by the chosen engine.
- **Confirmations** show the estimated calls (and £ at your recent average).
  The review shows the style, "Marketing generation" and "Product total".
- **🧩 Edit Individual Images** (on the review), for each image:
  - 👀 View;
  - ✨ Regenerate Scene: 1 image call, confirmed;
  - 🎨 Change Direction: reply with an instruction; 1 text + 1 image call;
  - 🧱 Rebuild Composite: re-renders from the existing assets, £0.00, no
    confirmation.

  Replaced scenes are archived in `marketing/history/assets/`. The whole
  campaign is QC'd again before the review is re-sent.
- **QC:** engine runs pass the same Stage 3 QC plus the engine checks:
  - the region is covered by the real artwork;
  - the visibility floor (hero/design ≥ 45%);
  - the engine is recorded.

  Paper-like shapes in an AI environment show as ⚠️ on that image.
- **Creative cards (crochet, ADR-058):** with Hybrid or AI Creative, a crochet
  campaign is eight creative cards, one buyer job each:
  - stop the scroll;
  - what you get;
  - quality;
  - variety;
  - why it is useful;
  - how it works;
  - desire;
  - remove doubts.

  The cards use the approved renders (bouquet, 9-flower overview, detail),
  always cropped below their lettering and tied to approved pattern IDs.
  - **Calls:** 1 text call directs every card (prompt
    `marketing-creative-director.md`), then 1 image call per AI-scene card. The
    model can move the scene, never add one (crochet: 1 image call).
  - **Direction:** each card's direction is stored in `plan.json`
    `directions`. Invalid choices fall back to the code baseline, recorded.
  - **QC:** QC adds the variety checks (composition, background, headline
    placement, floating pages, a lifestyle card, product presence) and the
    render truth checks.
  - **Hero comparison:** its paid hero is not reused by a crochet campaign.
  - **Free preview:** `node marketing/scripts/creative-preview.mjs <product dir>
    <out dir>` renders the code baseline with no calls, on a labelled
    placeholder scene.

The Factory steps:

1. **Facts:** Stage 3 reads only the approved Stage 2 package, re-verified by
   SHA-256 (`marketing/facts.json`), and builds a claim allow-list from it.
2. **Listing:** 1 OpenAI text call writes `marketing/listing.json`: title,
   description, 13 tags, materials, advisory GBP price, category, occasion,
   colours, and a claim list.
   - The price follows one contract, `marketing/src/stage3/price.mjs`: a JSON
     **number** of pounds from 0.50 to 100.00 with at most 2 decimals.
   - Precision is checked in whole pence, so 8.95 is valid. A third decimal
     (7.495) is rejected, never rounded.
   - Strings, ranges and null never pass.
   - The rejection message shows the value received.
   - Stage 4's Etsy payload uses the same rule.
3. **Scene briefs:** 1 text call writes the environment briefs and the one
   supporting line on the gifting slide (`marketing/plan.json`). Headlines
   are art-directed campaign copy, rendered by code.
4. **Environments:** up to `AUTOMATION_MARKETING_SCENES` (default 4) AI
   *environment* images, reused across slides. They never contain a card,
   text or the artwork's subject.
5. **Images:** code renders up to 10 listing images (`marketing/images/`)
   with the **real** Stage 2 artwork, plus 300 px thumbnails and a contact
   sheet (`marketing/images/thumbs/`). All text is rendered by code.
6. **QC:** `marketing/qc.json`. Only a pass sends the review: summary,
   description, the thumbnail contact sheet, the images, then **APPROVE MARKETING · REGENERATE LISTING
   COPY · REGENERATE MARKETING · REGENERATE ALL · CANCEL**. The regenerate
   buttons state their AI cost.

- **Regenerating** archives only that scope to `marketing/history/vNN/`.
  "Copy" never touches images; "marketing" never touches the listing.
- **Unsupported claims** (editable, Canva, physical or shipped, DPI,
  unproduced sizes, extras) are rejected before any image is made.
- **Nothing is ever published.** APPROVE MARKETING moves the product to
  `MARKETING_APPROVED`; Stage 4 handles Etsy.
- **Output limits:** every limit enforced locally (lengths, item counts such
  as at most 12 listing claims, number ranges) is also written into the
  schema text the model sees. Output that breaks one is rejected, never
  trimmed. After a schema or prompt change, restart the bot.
- **Marketing strategy:** `marketing/strategy.json` is worked out from the
  product's metadata with no AI call: product type, season and mood. It sets
  how the listing and the images present the product: tone, order, emotion,
  search focus and emoji. It never adds a fact. Descriptions open with why
  someone wants the product; file details come later, and the digital
  disclosure is last.
- **Design descriptions:** the listing describes each design from verified
  metadata only. To describe a design the metadata can't (for example a page
  reused as a second front), add `products/<id>/marketing/creative-notes.json`
  such as `{"designs":{"B":"A robin on a snowy gate post beside a glowing
  lantern"}}`, then press REGENERATE LISTING COPY. "Handmade"-style wording is
  never allowed unless production proves it, and the internal product name
  never goes in the Etsy title.
- **Regeneration cost:** buttons and the "This regeneration will use
  approximately…" message use the current `AUTOMATION_MARKETING_SCENES`.
  REGENERATE LISTING COPY is 1 text call and never touches images; it is
  refused, at no cost, if the images were made with the previous visual
  system.
- **Etsy tags:** the model suggests 18–20 search phrases and code picks 13
  valid tags. Too-long phrases are shortened only by a few safe word swaps
  (christmas → xmas) or dropped, never cut off mid-word. The choices are
  logged in `marketing/tag-selection.json`.
- **Cost accounting:** every OpenAI attempt, including failed and rejected
  ones, is recorded in `api_usage` (`outcome`: ok / api_error / rejected).

## Stage 4: Etsy draft, then an explicit publish (ADR-026)

After APPROVE MARKETING, send `/etsy <number>`. It **only ever creates a draft**.

1. **Checks:** the approved Stage 2 files and the approved Stage 3 listing and
   images, re-hashed from disk. Then the Etsy connection: stored token,
   scopes, token owner owns `ETSY_SHOP_ID`, shop currency GBP.
2. **Customer download (ADR-038):** `etsy/delivery/` holds the delivery
   set, before any Etsy call. It is one deterministic ZIP when the product
   fits, else up to 5 customer-named ZIPs (for example
   `…-US-Letter-Pages-01-10.zip`, `…-PNG-Pages-07-12.zip`) for the ONE
   product and ONE listing. The ZIPs hold exactly the files the Stage 2 build
   record lists. Each is reopened and compared file by file with the
   approved sources. Together they must hold every approved file exactly
   once. Each must stay under the 19 MB planning limit (Etsy's cap is 20 MB).
   A file that is too big on its own stops Stage 4 with nothing sent to
   Etsy.
3. **Payload:** `etsy/payload.json` holds the approved title, description,
   13 tags, materials and price, plus the seller declarations,
   `type=download`, and a category verified against Etsy's own taxonomy. The
   category is resolved in this order (ADR-039): `etsy/settings.json`
   `taxonomy_id`, then an owner-approved mapping in
   `automation/config/etsy-taxonomy-map.json` (colouring books → 339), then
   an exact Etsy path. No guessing: an unknown category stops with
   candidates.
4. **Draft:** created once (`etsy/draft.json`), then the 10 approved PNGs in
   order and every delivery ZIP (in rank order) are uploaded (`etsy/uploads.json`).
5. **Shop section (ADR-054):** the draft is put in ONE shop section from
   `automation/config/etsy-sections.json`, using only structured metadata:
   the product format, `season` and `product_type`, never the listing copy.
   - A seasonal or topic section wins over the format section (Halloween
     colouring book → Halloween; crochet bundle → Crochet Patterns).
   - An existing Etsy section (same title, ignoring case, spacing and "&"
     vs "and") is reused. A missing one is created only when the shop is
     authorised with `shops_w`; otherwise the review says to create it on
     Etsy.
   - A listing already in its section is left alone.
   - No mapping means no section and a warning, never a guess.
   - A section problem never fails the draft. `/etsy <number> section`
     retries only this step (`etsy/section.json`).
6. **Verification:** the draft is read back from Etsy and checked
   (`etsy/verification.json`). Only a pass sends
   "🏪 PRODUCT #… — ETSY DRAFT READY". Etsy's HTML-encoded text (`&#39;`) is
   decoded before comparing; nothing else is normalised. A failure lists every
   mismatching field in Telegram ("Mismatch: • …"), and Retry reuses the same draft.

- **Buttons:** REFRESH DRAFT (re-reads Etsy; manual Etsy edits show as drift
  and block publishing) and LEAVE AS DRAFT.
- **PUBLISH** appears only when `ETSY_PUBLISH_ENABLED=true`. It asks again
  (CONFIRM PUBLISH / KEEP AS DRAFT, with an Etsy-fees note).
- **CONFIRM PUBLISH** re-checks everything, publishes once, and marks
  `PUBLISHED` only after Etsy reads the listing back as active
  (`etsy/publish-record.json`).
- **Restarts and RETRY** never create a second listing or upload anything
  twice: Etsy is read first. If a draft creation had no confirmed outcome and
  Etsy shows no draft, check Etsy, then send `/etsy <number> confirm-no-draft`
  and RETRY.
- **Records:** `etsy/api-activity.json` logs every Etsy operation (never
  headers or tokens). Zero OpenAI calls.

| Variable | Default | Meaning |
|---|---|---|
| `ETSY_STAGE4_DRY_RUN` | `true` | Simulated Etsy (records in `etsy/dry-run/`), zero requests, never publishes |
| `ETSY_DRAFT_WRITES_ENABLED` | `false` | With dry run off, allows real drafts |
| `ETSY_PUBLISH_ENABLED` | `false` | Server gate for publishing (also enforced inside the Etsy client) |
| `ETSY_SHOP_ID` | none | Numeric shop ID (live) |
| `ETSY_SELLER_WHO_MADE` / `ETSY_SELLER_WHEN_MADE` | none | Your declarations to Etsy (required) |
| `ETSY_DIGITAL_QUANTITY` | `999` | Listing quantity |

The one-time shop connection is in `docs/ETSY_CONNECTION.md`. A dry-run
record is replaced automatically the first time `/etsy` runs live.

## SEO & market research (ADR-036)

🔎 SEO on the home screen, or `/seo`: the owner interface over the SEO engine
(`seo/`). It never changes Etsy, never publishes and makes no OpenAI call.

- **🏪 Audit Existing Product:** products with a local listing file.
  - Research attached: the current SEO beside the engine's recommendation
    (primary, secondary, supporting, confidence).
  - Actions: 📝 Generate SEO Revision, which is deterministic and free: title,
    tags keep/add/remove, and a new opening line. Also 📊 View Evidence and
    ✅ Keep Current SEO.
  - Approving a revision saves it only. A listing that is (or may be) on Etsy
    shows the manual path: copy the text, or open the Etsy editor.
- **🆕 Research New Product:** describe it, or choose an existing factory idea.
  Confirm format, themes, audience, delivery and style (nothing is guessed), and
  the research plan is created.
- **Marketplace Insights capture:** one query at a time. 📝 Enter Results asks for
  searches (exact, or Etsy's rounded "4.3k" plus optional 30 daily counts),
  results, conversion (buttons), trend (or Skip) and related terms (discovery
  only). Nothing is saved before ✅ Save Observation. 🚫 Etsy Has No Data records
  the query as unknown, not zero.
- **Expansion:** the engine recommends a round; you can start it, or
  ⏹ Finish With Current Evidence (FINISH_WITH_CURRENT_EVIDENCE: unresearched terms
  stay unknown). 🎯 Score gives the result.
- **🧠 Insights Library:** every captured observation, never overwritten; search,
  keyword history and recent research. A query you captured before is offered
  for ♻️ reuse, with its original capture date and source, instead of a new lookup.
- **📊 Active Research:** resume any unfinished session.
- **State:** `automation/state/seo/` (git-ignored). Stale or repeated buttons are
  refused, and input survives a restart.
- **Loading an existing completed cycle** (for example the real #005 research):

  ```
  npm --prefix automation run seo:import-cycle -- --product 005 --name "Cozy Autumn Adventures" \
    --idea ../seo/fixtures/ideas/cozy-autumn-colouring-adults-structured.json \
    --profile ../seo/fixtures/profiles/cozy-autumn-colouring-adults-structured.json \
    --capture ../seo/fixtures/research-cycle/cozy-autumn-real/capture-1.json \
    --capture ../seo/fixtures/research-cycle/cozy-autumn-real/capture-2.json \
    --finish ../seo/fixtures/research-cycle/cozy-autumn-real/owner-finish.json
  ```

## Where things are stored

New products take the next free number under `products/`: the highest existing
`NNN-*` folder or reserved ID (`automation/reserved-product-ids.json`), plus one.
007 (the hand-built Cute Ghost activity book) is reserved, so the first live run
is **Product #008** even on a checkout where the 007 folder is absent. `check-config`
and startup both log the next ID. Add a number to the reserve list whenever a
product is hand-built outside the automation.

`docs/example-product.SYNTHETIC-FIXTURE.json` is **synthetic test data** (mocked
models, empty temp folder, hence numbered 001). It is not a real product.

```
products/008-halloween-kids-activity-book/
  product.json                      primary machine-readable source of truth
  references/reference-01.png       downloaded from Telegram (never Telegram URLs)
  creative/reference-analysis.json  only when references were supplied
  creative/creative-direction.json  current direction (drives every image prompt)
  creative/creative-direction.v01.json   previous versions after CHANGE DIRECTION
  concept-previews/batch-01/concept-a..c.png + metadata.json (gate 1; never overwritten)
  concept-previews/batch-02/…       REGENERATE CONCEPTS
  proofs/attempt-01/proof-01..03.png + metadata.json (the exact prompts)
  proofs/attempt-02/…               REGENERATE / CHANGE DIRECTION: never overwrites
  book/                             colouring books (ADR-030): manifest.json, pages/P001..PNNN.png, prompts/, qc.json, review/ sheets, history/
  visuals/crochet/                  crochet visual set (ADR-063): briefs.json, hero/hero.png, previews/NN-<pattern_id>.png, prompts/, history/, visual-manifest.json
  production/                       Stage 2 (handoff, build record, QC, previews, deliverables, package ZIP)
  marketing/                        Stage 3 (facts, listing, plan, scenes, images, qc, work/, history/)
  etsy/                             Stage 4 (payload, delivery/ ZIP, draft, uploads, section, verification, publish-record, api-activity; dry-run/)
```

The workspace folder name comes from the request text; `product.json` `slug`
and `name` come from the specification. Runtime state (Telegram offset, which
product is active per chat) lives in `automation/state/registry.json`, which is
git-ignored. The bot only reads and writes products whose `product.json` has
`"managed_by": "automation-stage-1"`, so hand-built products are never touched.

## States

`DRAFT → REFERENCES_RECEIVED → IDEAS_READY → CONCEPT_PREVIEWS_GENERATING →
AWAITING_CONCEPT_SELECTION → CONCEPT_SELECTED → SPEC_READY →
PROOFS_GENERATING → AWAITING_CREATIVE_APPROVAL → CREATIVE_APPROVED → [colouring books:
BOOK_GENERATING → AWAITING_BOOK_APPROVAL → CREATIVE_APPROVED + book.approval] → [crochet pattern bundles:
PATTERNS_GENERATING → AWAITING_PATTERN_APPROVAL → CREATIVE_APPROVED + crochet.approval → optional
VISUALS_GENERATING → AWAITING_VISUALS_APPROVAL → CREATIVE_APPROVED + crochet_visuals.approval] → (Stage 2)
PRODUCTION_READY → PRODUCTION_BUILDING → PRODUCTION_QC → AWAITING_PRODUCTION_APPROVAL →
PRODUCTION_APPROVED → (Stage 3) MARKETING_PLANNING → MARKETING_GENERATING →
MARKETING_QC → AWAITING_MARKETING_APPROVAL → MARKETING_APPROVED → (Stage 4)
ETSY_PREPARING → ETSY_DRAFT_CREATED → ETSY_ASSETS_UPLOADING → ETSY_DRAFT_VERIFYING →
AWAITING_ETSY_PUBLISH_APPROVAL → PUBLISHING → PUBLISHED`, plus
`REJECTED` (from Stage 1 states only; never at or after marketing approval) and `FAILED`, which records `resume_state`;
RETRY returns there. Transitions live in `src/orchestrator/state.mjs`, and each
one is appended to `status_history`. State is never inferred from files.

## Safety and cost controls

- Exactly 3 preview images per concept batch (at most `AUTOMATION_MAX_CONCEPT_BATCHES`
  batches) and exactly 3 images per proof attempt. The only path that generates a whole product is the
  colouring-book full book (ADR-030) and the crochet visual set (ADR-063, 1 + one per pattern): explicitly confirmed, with
  the image count and estimated cost shown first.
- Every state change rotates a button nonce, so a repeated or old button press
  is answered "already handled" and does nothing. A persisted per-product lock
  refuses presses while a step runs.
- A failed OpenAI call leaves `product.json` valid. The product moves to FAILED
  with the error and a RETRY button, and completed work is kept. RETRY for
  proofs generates only the missing images of the failed attempt.
- `product.json` is schema-validated on every save; invalid model output is
  rejected rather than stored.
- On start, `recover()` moves any interrupted step to FAILED (retryable) and
  releases its lock.
- Usage figures returned by OpenAI are recorded in `product.json` `api_usage`.

## What remains manual

- Creating the second bot and adding the credentials; choosing model names.
- Judging the proofs. Automated checks cannot tell whether a style is good,
  original enough, or free of misspelled lettering.
- Confirming that no reference-specific character or text leaked into a proof.
- Starting Stage 2 (`/produce <number>`). `CREATIVE_APPROVED` triggers nothing by itself.
- Costs: usage is recorded, but there is no spend cap. Watch your OpenAI dashboard.
