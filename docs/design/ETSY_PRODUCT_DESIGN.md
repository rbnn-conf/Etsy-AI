# Etsy product design — method & reference

Deep reference for the `etsy-product-design` skill. The skill is the operating
layer; this is the method, the templates, and the libraries.

Read alongside: `../LUMIUMX_ETSY_DESIGN_SYSTEM.md` (brand foundation),
`DESIGN_PRINCIPLES.md`, `ETSY_MARKETING.md` (listing-image craft),
`SPREADSHEET_UX.md` (workbook craft), `VISUAL_QA.md` (the gate).

---

## 1. The design chain (why nothing is designed in isolation)

```
MARKET       what sells in the category, what's saturated, where the gap is
   │
CUSTOMER     who they are, what they already tried, what they fear, what they want
   │
PRODUCT      what it actually is and does (the Spec — the source of truth)
   │
POSITIONING  the one sentence: "the premium X for people who Y"
   │
VISUAL       the deliberate identity that makes that sentence visible
 IDENTITY
   │
PRODUCT      the artifact itself designed to that identity (workbook / PDF)
 DESIGN
   │
LISTING      the sales sequence of images (select the right slots)
 IMAGES
   │
MARKETING    hero, ads, social — same language, different job
 CREATIVE
   │
THUMBNAIL    the 170px test — most buyers decide here
   │
DECISION     buy / skip
```

Every step constrains the next. If you skip **MARKET → CUSTOMER → POSITIONING**
and jump to VISUAL IDENTITY, you get a nice-looking product that doesn't sell —
which is the failure mode this skill exists to prevent.

Design decisions must connect to: **target customer · product category · product
promise · customer problem · customer desired outcome · competitors · market
expectations · brand positioning.** If a colour, a typeface, a layout, or a
mockup can't be justified against one of those, cut it.

---

## 2. Market-aware design (per category)

Use `docs/MARKET_RESEARCH.md` (§6 opportunity score, §7 competitor references)
plus a quick scan of the niche. For any category, answer:

- **Expectations** — what does a category buyer assume a good product looks
  like? (e.g. budget planners: clean tables, month grid, "undated", A4/Letter.)
- **Competitor styles** — the 2–3 dominant visual templates in the category.
- **Overused patterns** — name them so you can avoid them.
- **Colour / type / imagery conventions** — what's standard, what signals cheap,
  what signals premium.
- **Listing-image conventions** — do top sellers lead with a flat-lay? a
  bordered grid of pages? a lifestyle shot? a bold text hero?
- **The differentiation opening** — the one move that makes ours instantly
  recognisable as *not* the template, while still reading as "a good <category>".

> **Do not copy competitors.** Market patterns tell you what to *avoid* and
> where the gap is. Differentiate on the axis the category under-serves
> (usually: restraint, editorial typography, real previews, catalogue
> consistency).

### Common category conventions & openings (starting points, verify per niche)

| Category | Convention / saturation | Cheap tells | Premium opening |
|---|---|---|---|
| Budget / finance planner | month grid, pastel headers, "cute" money icons, rainbow category tags | clip-art coins, 6+ bright colours, Comic-ish rounded fonts | editorial finance: ink-on-ivory, one warm accent, hairline rules, real page previews (**this is #001**) |
| Wedding planner | script fonts, blush/gold, floral frames, watercolour | over-ornate scripts, gradient gold, stock florals | refined stationery: one elegant serif, generous margins, a single botanical line motif, letterpress feel |
| Kids activity pack | primary colours, cartoon mascots, bubble fonts | garish gradients, 3D shiny stickers, mismatched clip-art | friendly-but-crafted: a limited bright palette (3–4), one hand-drawn character style used consistently, lots of white |
| Business / project planner | corporate blue, grids, "productivity" icons, dark UI screenshots | SaaS-dashboard aesthetic, neon accents, stock office photos | sophisticated stationery: charcoal + one deep accent, structured grid, restrained, no icons |
| Meal / grocery planner | fresh green, veg icons, chalkboard, kraft paper | cluttered fridge photos, 10 food emoji, script + sans mix | fresh + organised: off-white, one green, a clean weekly grid, one produce line-drawing motif |
| Digital journal / reflection | moody photos, handwritten fonts, quotes over images | inspirational-poster look, low-contrast text on photo | editorial + emotional: warm neutral, one humanist serif, wide measure, a single tactile texture |

Pick the archetype from §3, then set the *opening* against the category's
saturation.

---

## 3. Product-archetype → art-direction library

The house brand (LumiumX) is a **foundation**: warm ivory + charcoal, Spectral
display + Inter body, hairline structure, one family accent, real previews,
editorial restraint. Each product gets a **product-specific art direction** on
top of that foundation — same bones, different register.

| Archetype | Register | Palette move | Type move | Imagery |
|---|---|---|---|---|
| **Editorial finance** (budget, savings, debt) | premium financial journal | ivory + charcoal + **terracotta** `#C4644A`, scarce | Spectral titles + a "Leftover"-style serif feature figure; Inter tabular numbers | real cropped sheet previews; stationery-framed mockup |
| **Refined stationery** (wedding, events, keepsakes) | elegant, calm, romantic-adjacent | ivory + charcoal + a muted **rose/stone** or **deep sage**; one only | a higher-contrast serif for titles, wide tracking on labels; more air | one fine botanical/line motif, letterpress-style rule work |
| **Structured professional** (business, project, goals) | sophisticated, engineered | paper white + charcoal + **deep ink-blue or oxblood**; one only | Inter throughout at tighter scale, Spectral for the one statement; strict grid | schematic/diagrammatic previews; clean device mockup, no chrome |
| **Fresh practical** (meal, cleaning, home) | organised, light, useful | off-white + charcoal + **one green** `~#5F7A5A`; one only | clean sans grid, small serif accents | one produce/home line-drawing; a bright, airy flat-lay feel |
| **Reflective editorial** (journal, gratitude, planner-diary) | warm, personal, unhurried | warm neutral + charcoal + a soft **clay or ochre** | humanist serif at a wide measure; generous leading | tactile paper texture (low opacity); a hand, a pen — believable, sparse |
| **Friendly crafted** (kids, teachers, family) | playful but not cheap | white + a **tight 3–4 bright palette**, used with discipline | one rounded-but-designed display face + a clean sans; big scale jumps | ONE consistent hand-drawn character/illustration style; heavy white space |

Rules:
- One archetype per product. Don't blend "refined stationery" with "friendly
  crafted".
- The accent is still **one colour, 3–5 placements** regardless of archetype.
- "Friendly crafted" is the only archetype that may use more than ~2 colours,
  and even then a *disciplined* limited palette — never rainbow.
- If the customer is money-serious / time-poor / adult-professional, do **not**
  pick a playful register even if the category tolerates it.

---

## 4. The DESIGN DIRECTION template

Produce this **before** any build. Save to `products/<id>/DESIGN_DIRECTION.md`.

```markdown
# DESIGN DIRECTION — <Product name>

## Market
- Category: <niche>
- What top sellers look like: <2–3 dominant templates>
- Overused patterns: <named>
- Price band & positioning: <budget | mid | premium>, <£ range>
- Differentiation opening: <the one move>

## Customer
- Who: <from PRODUCT_SPEC targetCustomer>
- Already tried: <apps / other printables / nothing>
- Fear / friction: <overwhelm, cost, complexity, guilt…>
- Desired outcome: <the after-state they're buying>

## Positioning (one line)
> The <premium/…> <category> for <customer> who want <outcome> without <pain>.
- WHAT IS THIS: …
- WHO FOR: …
- PROBLEM: …
- OUTCOME PROMISED: …
- WHY THIS ONE: …
- WHAT MAKES IT DIFFERENT: …

## Visual direction
- Archetype: <from §3> — rationale: <ties to customer + opening>
- Mood words (3–5): …

## Palette
| Role | Hex | Use |
|---|---|---|
| Dominant | #FAF7F2 | canvas |
| Ink | #1F1F1F | text, rules |
| Supporting | #FFFFFF / #E6E1D9 | one panel / hairlines |
| Accent (family) | #… | 3–5 placements only: <where> |

## Typography
- Display: <face> — <roles>
- Body: <face> — <roles>
- Scale: <title / section / kicker / body / label / figure sizes>
- Numerals: <tabular? decimal-aligned? currency treatment>
- Label motif: <the recurring kicker: mark + tracked caps>

## Grid & layout
- Canvas(es): <2000×2000 listing; A4/Letter workbook>
- Columns / margin / gutter / baseline
- Composition principle: <editorial pattern per asset — not one repeated block>

## Components (the product's visual language)
- <e.g. hairline table, KPI figure, input-cell treatment, kicker, brand mark>
- Deliberately NOT using: <icons? cards? shadows?>

## Imagery / mockups
- Product previews: <what, cropped how>
- Mockup style: <framed page / desk scene / device>, lighting + shadow spec
- Motifs allowed: <thin rule, small circle, one line-drawing…>

## Hero concept
- One sentence: <what the thumbnail communicates in 170px>
- Layout: <title placement, mockup as focal point, the single accent mark>

## Listing-image sequence (select — don't force all 8)
1. Hero — <concept>
2. <slot> — <why this product needs it>
…
- Slots deliberately skipped: <which, why>

## Catalogue fit
- Shared with LumiumX: <foundation elements kept>
- Product-specific: <archetype elements added>
- A stranger seeing this + another LumiumX product would see: <the through-line>

## Avoid (product-specific)
- <named anti-patterns for THIS product and category>
```

---

## 5. Listing-image sequence — the 8-slot menu

A sales sequence, not a gallery. Select slots by product; order them so the
buyer learns **WHAT IT IS → WHY THEY WANT IT → WHAT THEY GET → HOW IT WORKS**.

| # | Slot | Job | Include when | Craft notes |
|---|---|---|---|---|
| 1 | **Hero / instant understanding** | thumbnail-legible: what + identity + main benefit | always | product is the focus; title in the display face; ONE accent mark; passes the 170px test |
| 2 | **What's included** | the tangible deliverable ("1 workbook · 8 sheets · A4+Letter") | multi-part / bundle products | numbered index or a clean manifest; no icon soup |
| 3 | **Key features / benefits** | why care | always | a **sparse statement page** — big type, 4–5 lines, lots of ivory; not a card grid |
| 4 | **Inside the product** | build trust with real content | products with rich internals (workbooks, multi-page PDFs) | real previews cropped to the dense region; editorial index; never a 60%-blank sheet |
| 5 | **How it works** | reduce "will I understand this?" | process/system products | 3–4 steps, big numerals, thin connecting rule, **no large icons** |
| 6 | **Use case / lifestyle** | emotional appeal; "I can picture this" | most products | believable desk scene, warm light, sparse props, consistent shadow; no AI hands, no stock look |
| 7 | **Formats / compatibility** | remove format uncertainty | all digital downloads | file types, sizes, apps (Excel / Sheets / LibreOffice / print); calm and plain |
| 8 | **Final reassurance / CTA** | close | most listings | "instant download · nothing shipped · undated · lifetime use"; quiet, confident |

- **Default LumiumX set = 6** (`LUMIUMX_ETSY_DESIGN_SYSTEM.md §9`):
  1 hero, 2 what's-inside, 3 benefits, 6 lifestyle, 5 how-it-works, 7 format.
- Add slot 4 for content-rich products; add slot 8 for higher-priced or
  higher-risk listings; drop slot 2 for single-file products.
- **Vary composition and density across the set** (dense index → sparse
  statement → lifestyle scene). Never the same block eight times.

---

## 6. Brand foundation vs product art direction

```
LumiumX foundation (constant across the catalogue)
├── warm ivory #FAF7F2 + charcoal #1F1F1F ground
├── Spectral display + Inter body
├── hairline-and-whitespace structure (no boxes)
├── one family accent, 3–5 placements
├── the kicker motif (mark + tracked caps)
├── brand mark position (small, one corner)
├── mockup lighting + shadow ("same studio")
└── real product previews, cropped to content

Product art direction (varies by archetype — §3)
├── which family accent (terracotta / sage / archetype colour)
├── display-serif register + scale
├── one product motif (botanical line / produce drawing / none)
├── composition patterns chosen per asset
└── category-specific "avoid" list
```

A LumiumX product should look like LumiumX **without the logo** (LUMIUMX Rule 1),
and two products in different categories should still read as the same shop —
via the foundation, not by forcing identical layouts.

---

## 7. Worked example — DESIGN DIRECTION format applied to Product #001

**This is a demonstration of the template, not an instruction to redesign #001.**
It reflects the direction already established in
`products/001-*/test/DESIGN_SYSTEM.md` + `docs/LUMIUMX_ETSY_DESIGN_SYSTEM.md`.

```
DESIGN DIRECTION — Minimalist Monthly Budget Planner

Market
- Category: monthly budget planner / printable finance
- Top sellers: (a) pastel month-grid printables with cute money icons;
  (b) iPad/GoodNotes hyperlinked digital planners with bold covers
- Overused: rainbow category tags, coin clip-art, 6+ colours, rounded "friendly" fonts
- Positioning: premium (£5.99+), above the £2–3 generics, below bundle pricing
- Differentiation opening: treat it as a financial *journal*, not a spreadsheet
  utility — editorial ink-on-ivory, one warm accent, real page previews

Customer
- Budget-conscious adults ~22–45 who prefer a visual, low-overwhelm system;
  a deliberate break from banking apps
- Already tried: apps (felt surveilled / fiddly), other printables (felt cheap)
- Fear: overwhelm, judgement, "another thing I won't keep up"
- Desired outcome: calm monthly control; a habit that sticks

Positioning (one line)
> The premium budget planner for people who want a calm monthly money habit
> without an app or a subscription.

Visual direction
- Archetype: Editorial finance / premium stationery
- Mood: calm, considered, warm, editorial, adult

Palette
- Warm Ivory #FAF7F2 (dominant) · Ink #1F1F1F · Stone #E6E1D9 (hairlines)
- Accent: Terracotta #C4644A — kicker mark, rule under the title,
  the "Leftover" feature figure. Nowhere else.

Typography
- Display: Spectral 600 — page/product titles, the one feature figure
- Body/UI/numbers: Inter 400/600 — labels (tracked caps), tables, footer
- Numerals: plain digits (no OT features — PDF-extraction constraint),
  right-aligned currency, £#,##0.00

Grid & layout
- Workbook: A4/Letter, one-page-wide, hairline tables, per-sheet composition
  (dashboard = KPI statement, not a table)
- Listing images: 2000×2000, 12-col, ~140px margin; one editorial pattern per asset

Components
- Hairline rules (no boxes) · KPI figure · faint-yellow input cell · kicker
  (terracotta square + tracked caps) · small brand mark bottom-corner
- NOT using: icons, coloured section bars, card grids, drop shadows

Imagery / mockups
- Real cropped sheet previews (dense region only)
- Mockup: the page framed as stationery — thin Stone border, one soft
  directional shadow, slight tilt. No browser chrome.

Hero concept
- 170px-legible: "premium monthly budget planner". Title left, the Monthly
  Overview sheet as a stationery mockup right, one terracotta rule.

Listing sequence (6)
1 Hero · 2 What's inside (numbered index of the 8 sheets) · 3 Benefits
(sparse statement) · 6 Lifestyle (warm desk) · 5 How it works (Plan/Track/
Review) · 7 Formats (XLSX + PDF, A4+Letter, Excel/Sheets/print)

Catalogue fit
- Shared: ivory+charcoal, Spectral+Inter, hairline structure, kicker motif
- Product-specific: terracotta accent, the "Leftover" serif figure, finance register

Avoid
- coin/money icons · pastel headers · rainbow tags · rounded friendly fonts ·
  coloured section bars · card grids · browser-frame mockups · blank-sheet previews
```

---

## 8. Interaction with the other skills

| Skill | Relationship |
|---|---|
| `etsy-product-design` (this) | **Upstream.** Produces the DESIGN DIRECTION. Runs once per product / repositioning. |
| `etsy-design-director` | **Enforces** the direction + brand standard; veto on output. |
| `spreadsheet-design` | **Executes** the product design for `.xlsx` products, to the DESIGN DIRECTION's palette / type / per-sheet composition. |
| `etsy-marketing-creative` | **Executes** the listing-image sequence chosen in the DESIGN DIRECTION. |
| `typography` / `colour-system` / `layout-composition` / `graphic-design` | **Craft execution** of the systems the DESIGN DIRECTION specifies. |
| `visual-qa` | **Gate.** Scores the rendered result against `VISUAL_QA.md`. |
| `design-review` | **Loop.** Inspect → QA → propose → (implement) → regenerate → re-QC → PASS/FAIL. |
