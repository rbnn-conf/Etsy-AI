# Layout & composition

How to arrange a page so it reads as *designed*, not *assembled*. The recurring
failure in this factory is the cookie-cutter stack:
`kicker → big heading → grid of identical cards → footer`, repeated on every
asset. This file exists to break that.

---

## 1. Start from a grid, then break it on purpose

- Etsy listing image: a **12-column grid**, margin ~140px, gutter ~40px, on the
  2000×2000 canvas. Also keep a **baseline rhythm** (~8px) — round spacing to it.
- Not every element spans all 12. A hero mockup might be columns 4–12
  (asymmetric); the title columns 1–7. Asymmetry creates energy; dead-centred
  everything creates a template.
- The workbook uses a real column grid too — see `SPREADSHEET_UX.md`.

## 2. Every asset needs ONE focal point

Decide the single thing the eye lands on first (usually: the product title, or
the product mockup). Make it unambiguously dominant via size + contrast +
isolation. Everything else is clearly secondary. If two elements compete, the
composition has no anchor and reads as generic.

## 3. Proximity & grouping (Gestalt)

- Related things sit close; unrelated things get a full gap.
- A label belongs to its value — 8–16px apart, not 40.
- Groups are separated by whitespace or a hairline rule, **not** by wrapping
  each group in a bordered card.

## 4. Alignment

- Pick a small number of alignment edges (a left margin, one indent, a
  right-align for figures) and hold them ruthlessly. One stray centre-aligned
  element breaks the whole page.
- Optical alignment beats mathematical: a large quote mark or a round bullet may
  need to hang slightly into the margin to *look* aligned.

## 5. Rhythm & variation across a set

A listing set of 5–6 images must feel like one system **and** not be monotonous:

- Vary the composition per image: hero = title-left / mockup-right; what's-inside
  = a numbered vertical list; benefits = sparse, big type, lots of ivory;
  lifestyle = full-bleed scene; how-it-works = a horizontal 4-step band.
- Keep constant: margins, type scale, palette, the kicker motif, the brand mark
  position, the mockup lighting/shadow style.
- Alternate density: a dense "what's inside" image should be followed by a sparse
  "benefits" image. Same density five times = fatigue.

## 6. Whitespace

- Macro whitespace (page margins, the gap between the title block and the
  mockup) = generous and consistent.
- Micro whitespace (label→value, line→line) = tight and rhythmic.
- **Do not** leave a large *undesigned* void between a heading and its content
  because a short block got vertically centred in a tall region. Either anchor
  the content near the heading and let the whitespace fall at the page edges, or
  make the content genuinely fill the space (bigger cards, a taller mockup, a
  supporting element). See `examples/EXAMPLES.md` — the WEAK "what's inside" and
  "how it works" renders both have this dead gap.

## 7. Visual anchors & entry points

Give the eye a way in: a kicker at top-left, an oversized numeral, a rule that
leads toward the mockup. One entry point, then a clear path
(title → value prop → proof → detail).

## 8. Editorial composition patterns to reach for

- **Masthead + column** — a tracked-caps kicker across the top, then an
  asymmetric two-column body. (Newspaper / journal.)
- **Full-bleed subject + caption** — the mockup fills the frame, a small
  caption block sits in one corner. (Magazine.)
- **Numbered index** — `01 … 02 … 03 …` down the left, content to the right,
  hairline between rows. (Contents page. Use for "what's inside".)
- **Statement page** — one short line of large serif, huge margins, a single
  accent mark. (Use for "benefits".)

## 9. Stationery / product-image composition (LUMIUMX §7–§8)

For a product card / hero:

```
PRODUCT TITLE            (Spectral, 2–3 lines, top-left or centred)

    [ realistic product mockup — the visual focus ]

Short descriptor         (Plan · Track · Review)

A4 + US Letter · 8 Pages (Inter 600, tracked, one line)
```

Constant across the catalogue: background treatment, camera-angle style,
lighting, product placement, shadow style, margins, label treatment. Variable:
product name, the preview itself, the family accent, the category line.

---

## Anti-patterns (these are the "generic" markers)

| Anti-pattern | Fix |
|---|---|
| `heading → card → card → card` on every asset | One composition per asset from §8; vary across the set |
| Everything centred | Use an asymmetric grid; left-align the title block |
| A grid of 6 identical cards | An index list, or 3 varied panels, or one big preview + supporting text |
| Content vertically centred with dead space above | Anchor content under the heading; whitespace goes to the margins |
| Icon-in-a-rounded-square, ×6 | Drop the icons; use a numeral or a hairline + a strong label |
| Fake browser bar with 3 dots around the screenshot | An editorial frame (thin Stone border, soft shadow, no chrome) or a believable desk scene |
| Same density on all 5 listing images | Alternate dense / sparse |
| Elements touching the canvas edge | Hold the 140px margin; only a deliberate full-bleed image breaks it |
