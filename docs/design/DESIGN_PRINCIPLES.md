# Design principles

The decision rules for every visual artifact in this factory — workbook sheets,
Etsy listing images, mockups, the shop. When a choice is unclear, these win.

Grounded in `../LUMIUMX_ETSY_DESIGN_SYSTEM.md` (§16 Brand Consistency Rules) and
the hand-authored prototype in
`products/001-minimalist-monthly-budget-planner/test/DESIGN_SYSTEM.md`.

---

## 1. Ink does the work, not paper

Warmth and personality come from **ink hue** (a warm charcoal `#1F1F1F`, never
pure black) and from **typography** — not from coloured page fills, gradients, or
tinted cards. Backgrounds stay in `#FAF7F2` (warm ivory) / `#FFFFFF` (paper).

- GOOD: a page that is 80% ivory + charcoal type, with structure from hairline
  rules and spacing.
- BAD: white cards with pastel tints and soft shadows floating on a coloured
  field (Canva default).

## 2. The accent is a signature, not a decoration

**One accent per asset.** It appears **3–5 times, deliberately placed** — a
kicker mark, one rule, one emphasised figure. Nowhere else. Scarcity is what
makes it read as intentional.

- Finance / Planning products → **Terracotta `#C4644A`**.
- Productivity / Wellness products → **Sage `#7E8A7B`**.
- Never both accents heavily in one asset.

Count the accent uses before shipping. More than ~6 = the accent has become
wallpaper. Remove until it is scarce again.

## 3. Two typefaces, two jobs, never mixed

**Spectral** (serif display) sets: brand wordmark, page/product titles,
editorial statements, one emphasised label. **Inter** (sans) sets everything
else: body, labels, meta, numbers, UI-style text. A reader should be able to
name the register from the typeface alone. Max two families. (`TYPOGRAPHY.md`.)

## 4. Hierarchy from scale and weight, not colour

The most important element is biggest and/or heaviest and has the most room
around it. This must survive a greyscale print. If two things look equally
important, one of them is wrong — fix with size, weight, and whitespace, not by
colouring one of them.

## 5. No boxes

Structure comes from **hairline rules and generous spacing**, which reads as a
ledger / editorial page. A grid of bordered cards reads as a template. Use a
card only when genuinely grouping a distinct object, and then keep the border a
`#E6E1D9` hairline with no drop shadow (or a very soft one).

## 6. Whitespace is deliberate, never dead

Never fill space because it is available (LUMIUMX Rule 6). Equally: never leave a
large *undesigned* void between a heading and its content because the layout
centred a short block in a tall region. Whitespace should frame a focal point or
separate groups — with intent, not by accident.

## 7. Real product previews

Show the actual `.xlsx` sheet render, the actual PDF page — not a generic
representation, not a stock screenshot, not an invented UI. Crop to the dense,
meaningful region of the sheet, not its empty lower half.

## 8. Recognisable without the logo

A finished asset should read as *this shop* from its palette, type, spacing and
rhythm alone. If you removed every label, could a stranger tell two of our
listings belong to the same shop? If not, the brand system is not being applied.

## 9. Restraint over trend

Do not adopt a visual trend (blobs, gradient meshes, oversized emoji, 3D icons,
neubrutalism, glassmorphism) because it is current. The brand is *timeless*.
When a trend conflicts with §1–§8, the trend loses.

---

## The anti-generic test (run before every render is accepted)

Answer honestly. Any "yes" in the left column is a failure.

| Generic / AI-looking | Premium / on-brand |
|---|---|
| Same block repeated (`heading→card→card→card`) | Composition varies per asset; a clear focal point |
| Accent on every component | Accent 3–5 times, placed |
| Icon glyphs in tinted rounded squares | No icon boxes; type + rules carry meaning |
| Fake browser chrome around a screenshot | Editorial frame or a believable stationery scene |
| Heading, then dead gap, then centred content | Heading and content spatially related; asymmetry used |
| Everything the same size/weight | Deliberate scale jumps; one thing dominates |
| Raw spec sentence as body copy | Copy written for the reader, tight lines |
| Soft-shadow pastel cards on colour | Ivory field, charcoal type, hairline rules |
| Could be any Etsy shop | Unmistakably this shop |

If the render fails two or more, it does not ship — it goes back for a redesign,
not a tweak. See `VISUAL_QA.md` for the scored version.
