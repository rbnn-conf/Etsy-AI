# Etsy marketing creative

The listing images do the selling. A buyer scrolls a grid of thumbnails, taps
one, swipes ~5 images, and decides in seconds. Every image must earn its place
by answering one question well.

The full brand spec is `../LUMIUMX_ETSY_DESIGN_SYSTEM.md` §9 (the image system)
and §11 (mockup photography). This file is the working brief.

---

## The job of the set (in order)

| # | File | Question it answers | Register |
|---|---|---|---|
| 01 | `01-hero.png` | **What is it?** | Title + mockup, confident, uncluttered |
| 02 | `02-whats-inside.png` | **What do I actually get?** | Numbered index of real page/sheet previews |
| 03 | `03-benefits.png` | **Why do I want it?** | Sparse. Big type. 4–5 ticks. Lots of ivory |
| 04 | `04-lifestyle.png` | **Can I picture using it?** | A believable desk scene — warm light, real materials |
| 05 | `05-how-it-works.png` | **How does it work?** | 4 steps, horizontal band, simple type (no big icons) |
| 06 | `06-download-info.png` | **What will I receive / any risk?** | Format, sizes, "instant download, nothing shipped" |

The current pipeline ships 5 (`hero, whats-included, features, how-it-works,
inside`) — `features` and `inside` overlap, and `benefits`, `lifestyle`,
`download-info` are missing. Target the LUMIUMX six.

Across the whole set the buyer must come away knowing:
**WHAT IT IS · WHY THEY WANT IT · WHAT THEY GET · HOW IT WORKS.**

---

## Per-image briefs

### 01 — Hero
- Product title in Spectral, 2–3 lines, dominant. A short descriptor
  (`Plan · Track · Review`). One spec line (`A4 + US Letter · 8 Pages`) in
  tracked Inter 600.
- **The product mockup is the focal point** — a real sheet/page render, framed
  as premium stationery (thin Stone border + soft directional shadow), *not* a
  browser window with three dots. Optionally angled slightly, one soft shadow.
- Background warm ivory. **One** terracotta mark (a rule under the title, or a
  small circle by the kicker). Nothing else coloured.
- No feature list on the hero. It has one job: recognition.

### 02 — What's inside
- Editorial **numbered index**: `01 Monthly Overview … 06 Month-End Review`,
  hairline between rows, real thumbnail crops of the dense part of each sheet on
  the right.
- Crop thumbnails to the *content* region — never show a sheet that is 60% blank.
- Heading `WHAT'S INSIDE` as a tracked kicker or a small Spectral title.

### 03 — Key benefits
- A **statement page**. One short serif line up top
  (`Designed for real life.`), then 4–5 short ticks:
  `Undated · Automatic totals · Print at home · A4 + US Letter · Instant download`.
- Huge margins, ivory dominant, type does everything. This is the *sparse* image
  in the set — do not fill it with cards.
- Ticks are a hairline check or a small terracotta tick used **once as a set**,
  not one accent mark per line.

### 04 — Lifestyle mockup
- A believable scene: warm desk, natural light, soft directional shadow,
  ivory/stone/wood surface, sparse neutral props (notebook, pen, coffee, small
  plant, tablet or printed pages). The product is the hero of the scene.
- Avoid AI-hands, busy desks, glossy backgrounds, excessive props, obvious
  stock-photo look.
- If a photoreal scene isn't achievable in the HTML/CSS pipeline: a large,
  well-shadowed mockup on a subtle paper-texture field with one prop silhouette
  is acceptable — but never a flat screenshot.

### 05 — How it works
- Horizontal 4-step band: `01 Purchase · 02 Download · 03 Print · 04 Start
  planning`. Big numerals (Spectral), short labels, a hairline or a thin
  connecting rule. **No large decorative icons** (LUMIUMX §9 Image 05).

### 06 — Download / format info
- Removes buyer uncertainty: `INSTANT DIGITAL DOWNLOAD` · file types · `A4 + US
  Letter` · `Print at home or use digitally` · `No physical product will be
  shipped`. Calm, plain, reassuring. Minimal decoration.

---

## Claims discipline (already enforced in code — keep it)

Every factual claim on an asset ("8 worksheets", "automatic calculations",
"GBP formatting") must be traceable to the verified product metadata
(`@dpf/marketing` `deriveMarketingData` + `xlsx-qc-report.json`). Marketing-Claim
QC re-checks each `data-claim` span. Never state a capability the workbook does
not have. Benefit / tone copy is the writer's, but it must be *true*.

---

## Mockup / framing rules

- **No fake browser chrome.** No traffic-light dots, no address bar.
- A stationery frame = a thin `#E6E1D9` border, `border-radius` ~12–16px, one
  soft shadow (`0 40px 90px -40px rgba(31,31,31,0.22)`), maybe a 1–3° tilt.
- Shadow direction and softness identical across every asset and every product —
  "same photography studio" (LUMIUMX Rule 8).
- Crop the sheet to its dense region; add a hair of bleed so it reads as a real
  object, not a pasted rectangle.

---

## Brand DNA on every asset

- The wordmark or the `LX —` monogram appears once, small, consistent position
  (a bottom corner). An asset should read as this shop **without** the logo
  (LUMIUMX Rule 1) — from palette, type, spacing, the kicker motif.
- Constant across the catalogue: margins, type scale, palette, kicker motif,
  mockup lighting, brand-mark position. Variable: title, preview, family accent,
  category line.

---

## GOOD vs BAD

| BAD (current output) | GOOD |
|---|---|
| Hero mockup in a browser frame w/ 3 dots | Sheet render framed as stationery, soft shadow, slight tilt |
| Hero carries a stats row + badges + brand line + subtitle | Hero: title, descriptor, one spec line, mockup, one accent mark |
| `features` = 6 identical icon cards; `inside` = 6 thumbs — overlapping | One `02 what's inside` numbered index; drop the icon-card grid |
| Same card-grid density on all 5 images | Alternate: dense index → sparse benefits statement → lifestyle scene |
| Sage accent on every badge/tick | Terracotta, 3–5 placements per image |
| `04` lifestyle and `06` download-info missing | Full LUMIUMX six-image sequence |
| Body = pasted 40-word spec sentence | Written headline + tight supporting line |

See `examples/EXAMPLES.md` for the WEAK hero and features renders annotated.
