---
name: layout-composition
description: "Create deliberate page composition for the Etsy factory — grids, asymmetric layouts, focal points, visual rhythm, density, whitespace, grouping, editorial composition, page balance. Use whenever arranging elements on a canvas (listing images, mockups, workbook pages, shop assets) or fixing output that is a 'cookie-cutter layout', 'heading then card then table then card', 'everything centred', 'no focal point', 'has a big empty gap', 'same layout on every image', or 'looks assembled'. Prevents the repeated-block failure."
metadata:
  version: 1.0.0
---

# Layout & Composition

Break the cookie-cutter. The recurring failure here is the same stack on every
asset: `kicker → big heading → grid of identical cards → footer`. Every asset
gets its own composition.

## Read first

- `docs/design/LAYOUT.md` — the full spec (grid, focal point, Gestalt,
  alignment, rhythm across a set, editorial patterns, product-image
  composition, anti-patterns).
- `docs/design/DESIGN_PRINCIPLES.md` §6 (whitespace), §9 (restraint).
- `docs/design/examples/EXAMPLES.md`.

## The moves

1. **Grid, then break it.** 12-col, ~140px margin, ~40px gutter, ~8px baseline
   on 2000×2000. Not everything spans 12 — asymmetric spans (title cols 1–7,
   mockup cols 4–12) create energy.
2. **One focal point per asset.** Decide it (product mockup, or the title). Make
   it dominant via size + contrast + isolation. If two elements compete, there
   is no anchor.
3. **Proximity.** Related close, unrelated a full gap. Group with whitespace or a
   hairline — not a bordered card.
4. **Alignment.** Few edges, held ruthlessly. Optical over mathematical.
5. **Rhythm across a set.** Vary composition per image; alternate density
   (dense index → sparse statement → lifestyle scene). Keep constant: margins,
   type scale, palette, kicker motif, brand-mark position, mockup lighting.
6. **Whitespace.** Macro generous + consistent; micro tight. **No undesigned
   void** between a heading and centred content — anchor the content under the
   heading and let whitespace fall at the margins, or make the content genuinely
   fill the space.

## Editorial patterns — pick ONE per asset

- **Masthead + asymmetric column** — tracked-caps kicker across the top, then a
  two-column body. (Journal.)
- **Full-bleed subject + corner caption** — mockup fills the frame, small caption
  block in a corner. (Magazine.)
- **Numbered index** — `01 … 02 … 03 …` down the left, content right, hairline
  between rows. (Contents page — use for "what's inside".)
- **Statement page** — one short line of large serif, huge margins, one accent
  mark. (Use for "benefits".)

## Product-image composition (LUMIUMX §7–§8)

```
PRODUCT TITLE            (Spectral, 2–3 lines)
    [ realistic product mockup — the focal point ]
Short descriptor         (Plan · Track · Review)
A4 + US Letter · N Pages (Inter 600, tracked, one line)
```
Constant across catalogue: background, camera angle, lighting, placement,
shadow, margins, label treatment. Variable: name, preview, family accent,
category line.

## Anti-patterns → fix

| Anti-pattern | Fix |
|---|---|
| `heading → card → card → card` on every asset | one composition per asset (patterns above); vary the set |
| everything centred | asymmetric grid; left-align the title block |
| grid of 6 identical cards | an index list, or 3 varied panels, or one big preview + text |
| content centred with dead space above | anchor under the heading; whitespace to the margins |
| icon-in-rounded-square ×6 | drop icons; numeral + hairline + strong label |
| fake browser bar + 3 dots around the screenshot | editorial frame (thin Stone border, soft shadow, no chrome) or a desk scene |
| same density on all 5 listing images | alternate dense / sparse |
| elements touching the canvas edge | hold the 140px margin |

## Examples

- **WEAK**: `docs/design/examples/WEAK-marketing-features-2026-08-31.png` (3×2
  identical cards, no focal point), `WEAK-marketing-hero-2026-08-31.png`
  (overloaded, browser-frame mockup, centred).
- **GOOD**: `docs/design/examples/GOOD-editorial-finance-prototype.png`
  (asymmetric masthead, "Leftover" as the anchor, hairline structure,
  deliberate whitespace).

## Quality criteria

- Squint test: one clear hierarchy, not equal blocks?
- One focal point, obvious in <2s?
- Alignment edges few and held?
- Composition specific to this asset (not a reused block)?
- Density varies across the set?
- No >200px undesigned gap between a heading and its content?
- Margins held; only deliberate full-bleeds touch the edge?
