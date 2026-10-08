---
name: graphic-design
description: "General graphic design and art direction for the Etsy factory — hierarchy, composition, contrast, alignment, proximity, repetition, rhythm, balance, scale, whitespace, visual anchors, grid systems, editorial and stationery design. Use whenever laying out or critiquing any visual artifact (listing images, mockups, shop assets, workbook pages) and the question is 'is this composed well?' rather than a narrow typography/colour question. Also use when output 'feels flat', 'has no focal point', 'looks unbalanced', 'everything is the same size', or 'looks assembled not designed'."
metadata:
  version: 1.0.0
---

# Graphic Design

Art direction for a premium editorial stationery brand. Your job: make a page
read as *designed* — one clear idea, one focal point, deliberate rhythm — not
*assembled* from repeated blocks.

## Read first

- `docs/design/DESIGN_PRINCIPLES.md` — the decision rules.
- `docs/design/LAYOUT.md` — grids, composition patterns, anti-patterns.
- `docs/design/examples/EXAMPLES.md` — GOOD vs WEAK.
- `docs/LUMIUMX_ETSY_DESIGN_SYSTEM.md` §16 brand consistency rules.

## The design principles (apply in order)

1. **Hierarchy** — decide the single most important element. Make it
   unambiguously dominant (size ≥1.5× the next level, most whitespace, most
   contrast). Everything else is clearly secondary.
2. **Contrast** — big/small, heavy/light, dense/sparse, serif/sans. Weak
   contrast reads as generic. Contrast in *scale and space*, not colour.
3. **Alignment** — pick a few edges (one left margin, one indent, one
   right-align) and hold them. One stray centred element breaks the page.
   Optical > mathematical.
4. **Proximity** — related things close, unrelated things a full gap apart.
   Group with whitespace or a hairline, not a bordered card.
5. **Repetition** — repeat a motif (the kicker: mark + tracked caps) so the eye
   learns the system once. Repetition of a *motif* is good; repetition of a
   whole *block* is the cookie-cutter failure.
6. **Rhythm & balance** — vary density across a set (dense → sparse → dense).
   Asymmetric balance (title-left / subject-right) has more energy than
   dead-centre symmetry.
7. **Scale** — real jumps between levels. A hero figure can be 3–4× body.
8. **Whitespace** — macro (margins, section gaps) generous and consistent;
   micro (label→value, line→line) tight. Never an undesigned void.
9. **Visual anchor & path** — one entry point (top-left kicker, oversized
   numeral), then a clear route: title → value → proof → detail.

## Grid systems

- Listing image: 12-col grid, ~140px margin, ~40px gutter on 2000×2000; ~8px
  baseline — round spacing to it.
- Break the grid on purpose: not everything spans 12; asymmetric spans create
  interest.
- Hold the margin; only a deliberate full-bleed image touches the edge.

## Editorial / stationery patterns to reach for

(from `docs/design/LAYOUT.md` §8) — masthead + asymmetric column · full-bleed
subject + corner caption · numbered index · statement page. Pick ONE per asset;
vary across the set.

## Anti-patterns → fix

- `heading → card → card → card → footer` on every asset → one composition per
  asset; vary the set.
- Everything centred → asymmetric grid, left-align the title block.
- 6 identical cards → an index list, or 3 varied panels, or one big preview +
  supporting text.
- Content vertically centred with dead space above → anchor under the heading;
  whitespace to the margins.
- Icon-in-rounded-square ×6 → drop icons; numeral + hairline + strong label.
- No focal point / everything equal weight → pick one, make it 1.5–3× bigger.
- Soft-shadow card grid on colour → ivory field, hairline structure.

## Examples

- **GOOD**: `docs/design/examples/GOOD-editorial-finance-prototype.png` — one
  serif voice, scarce accent, hairline structure, "Leftover" as the anchor,
  deliberate whitespace.
- **WEAK**: `docs/design/examples/WEAK-marketing-features-2026-08-31.png` — 3×2
  identical cards, icon boxes, no focal point.

## Quality criteria

- **Squint test**: one clear shape hierarchy, or grey mush of equal blocks?
- **Thumbnail test** (170px): still legible and appealing?
- One focal point, obvious in <2 seconds?
- Hierarchy survives greyscale?
- Alignment edges few and held?
- Composition specific to this asset, not a reused block?
- Density varies across the set?
