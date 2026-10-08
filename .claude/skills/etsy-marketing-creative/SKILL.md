---
name: etsy-marketing-creative
description: "Design the Etsy listing image set that sells a digital product — hero, what's inside, key benefits, lifestyle mockup, how it works, download/format info. Use whenever working on @dpf/marketing (marketing/src/), any products/<id>/marketing/build.mjs, listing-image composition, product mockups, feature/benefit imagery, or visual storytelling for an Etsy listing. Also use when the marketing PNGs 'look generic', 'don't sell the product', 'look like a template', 'the hero is cluttered', or 'a customer wouldn't understand what this is'. The set must convey WHAT IT IS, WHY THEY WANT IT, WHAT THEY GET, HOW IT WORKS."
metadata:
  version: 1.0.0
---

# Etsy Marketing Creative

The listing images do the selling. A buyer swipes ~5–6 images and decides in
seconds. Each image answers exactly one question well.

## Read first

- `docs/design/ETSY_MARKETING.md` — the working brief (per-image specs, mockup
  rules, claims discipline, GOOD vs BAD).
- `docs/LUMIUMX_ETSY_DESIGN_SYSTEM.md` §9 (image system), §11 (mockup style).
- `docs/design/LAYOUT.md` §8 (editorial patterns), `docs/design/TYPOGRAPHY.md`
  (copywriting for type).

## The set (LUMIUMX six — in order)

| # | File | Question | Register |
|---|---|---|---|
| 01 | `01-hero.png` | **What is it?** | title + mockup, uncluttered, ONE job: recognition |
| 02 | `02-whats-inside.png` | **What do I get?** | numbered index of real cropped sheet previews |
| 03 | `03-benefits.png` | **Why do I want it?** | statement page — sparse, big type, 4–5 ticks, ivory |
| 04 | `04-lifestyle.png` | **Can I picture using it?** | believable desk scene, warm light, real materials |
| 05 | `05-how-it-works.png` | **How does it work?** | 4-step horizontal band, big numerals, no big icons |
| 06 | `06-download-info.png` | **What will I receive / risk?** | format, sizes, "instant download, nothing shipped" |

Current pipeline ships 5 (`hero, whats-included, features, how-it-works, inside`)
— `features`+`inside` overlap; `benefits`, `lifestyle`, `download-info` missing.
Target the six.

## Per-image rules (short form — full detail in `docs/design/ETSY_MARKETING.md`)

- **Hero**: title (Spectral, dominant) + `Plan · Track · Review` +
  `A4 + US Letter · N Pages` (tracked Inter 600) + the mockup as focal point.
  **One** terracotta mark. No feature list, no stats row, no 40-word subtitle.
- **What's inside**: editorial numbered index (`01 … 06`), hairline between rows,
  real thumbnails cropped to the *content* region (never a 60%-blank sheet).
- **Benefits**: one short serif line + 4–5 short ticks
  (`Undated · Automatic totals · Print at home · A4 + US Letter · Instant
  download`). Huge margins, ivory dominant, no cards. This is the *sparse* image.
- **Lifestyle**: warm desk, natural light, soft directional shadow,
  ivory/stone/wood surface, sparse props (notebook, pen, coffee, plant, tablet).
  No AI hands, no busy desk, no stock-photo look. If a photoreal scene is not
  achievable in HTML/CSS: a large well-shadowed mockup on subtle paper texture
  with one prop silhouette — never a flat screenshot.
- **How it works**: `01 Purchase · 02 Download · 03 Print · 04 Start planning`,
  big Spectral numerals, thin connecting rule, NO large decorative icons.
- **Download info**: `INSTANT DIGITAL DOWNLOAD` · file types · sizes · `Print at
  home or use digitally` · `No physical product will be shipped`. Calm, plain.

## Mockup / framing

- **No fake browser chrome. No traffic-light dots.**
- Stationery frame: thin `#E6E1D9` border, radius ~12–16px, one soft shadow
  (`0 40px 90px -40px rgba(31,31,31,0.22)`), optional 1–3° tilt.
- Shadow direction/softness identical across every asset and product ("same
  studio", LUMIUMX Rule 8).
- Crop the sheet to its dense region, hair of bleed so it reads as an object.

## Claims discipline (enforced in code — keep it)

Every factual claim must be traceable to `deriveMarketingData` +
`xlsx-qc-report.json`; Marketing-Claim QC re-checks each `data-claim` span.
Never state a capability the workbook lacks. Benefit/tone copy is the writer's,
but must be true.

## Brand DNA on every asset

Wordmark or `LX —` monogram once, small, consistent corner. Recognisable as this
shop with the logo removed (palette, type, kicker motif). Constant: margins,
scale, palette, motif, mockup lighting, mark position. Variable: title, preview,
family accent, category line.

## Anti-patterns

- Hero carrying subtitle + badges + stats + brand line all at once.
- Browser-frame mockup.
- `features` grid + `inside` grid (redundant card grids).
- Same card-grid density on all images.
- Sage accent on a Finance product; accent on every tick/badge.
- Missing `04 lifestyle` / `06 download-info`.
- Body = pasted spec sentence.

## Examples

- **WEAK**: `docs/design/examples/WEAK-marketing-hero-2026-08-31.png`,
  `WEAK-marketing-features-2026-08-31.png` — annotated in
  `docs/design/examples/EXAMPLES.md`.
- **GOOD register**: `docs/design/examples/GOOD-editorial-finance-prototype.png`.

## Quality criteria

- Across the set: does the buyer learn WHAT IT IS · WHY · WHAT YOU GET · HOW?
- Hero has one job and does it (title + mockup + spec line, nothing else)?
- Real cropped previews (no blank grids), stationery-framed mockups?
- Density alternates (dense index → sparse benefits → lifestyle)?
- Accent scarce (3–5), correct family colour, LUMIUMX hexes?
- Brand-recognisable with the logo removed?
- Thumbnail test at 170px — product still reads?
