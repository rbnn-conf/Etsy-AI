# Colour

The palette is fixed by `../LUMIUMX_ETSY_DESIGN_SYSTEM.md` §2 and §10. This file
is how to *use* it. The core rule: **a restrained palette, one accent per asset,
used scarcely.**

---

## The palette

| Token | Hex | Role |
|---|---|---|
| Ink | `#1F1F1F` | Text, headings, wordmark, strong rules. **Never `#000000`.** |
| Warm Ivory | `#FAF7F2` | Default canvas / background. |
| Paper White | `#FFFFFF` | Cards, product backgrounds, a lighter panel. |
| Stone | `#E6E1D9` | Borders, dividers, subtle surfaces. A hairline, not a hard grey. |
| Terracotta | `#C4644A` | **Primary accent** — Finance, Planning, Bundles. |
| Sage | `#7E8A7B` | **Secondary accent** — Productivity, Wellness. |
| (support) Secondary text | `#3A3A3A` | Supporting copy under a heading. |

The current pipeline drifted to an off-brand palette (background `#FAF8F4`,
accent sage `#6F8174` as the *only* accent). Correct to LUMIUMX values.
Product #001 is a **Finance** product → its accent is **Terracotta `#C4644A`**,
with Sage available as an optional secondary for one element at most.

---

## Colour ratio (target for any composed asset)

```
60%  Warm Ivory      background / field
20%  Paper White     one panel or the mockup surface
15%  Ink             all text + rules
 5%  Accent          3–5 deliberate marks
```

If white is the dominant surface (e.g. a grid of white cards on ivory), the
ratio is inverted and the asset will look like a template. Reduce cards; let
ivory dominate.

---

## Colour hierarchy — the four roles

1. **Dominant** — Warm Ivory. Sets the mood before anything is read.
2. **Supporting** — Paper White + Stone. Quiet structure: one panel, hairline
   dividers. Not a second colour, a second *value*.
3. **Accent** — one of Terracotta / Sage. The signature. See below.
4. **Neutral text** — Ink for primary, `#3A3A3A` for supporting.

There is no "brand blue", no gradient, no secondary bright. Semantic colours
(a positive green, a warning) exist **only inside the workbook** for
conditional formatting and are muted (`#2F7A3F`, `#B23B3B`), never in marketing.

---

## Using the accent (the hardest discipline)

**Allowed accent placements** (pick 3–5 total per asset):

- a kicker mark (a short rule or a dot before an eyebrow label)
- the rule under a title / above a feature block
- one emphasised figure or word
- a thin border on the single most important box
- a small editorial marker (a 24px circle, a 2px line)

**Forbidden** (this is where "generic" comes from):

- accent on every badge, every list tick, every icon container
- accent fills behind section headings (a solid terracotta bar per section)
- accent as body text or as a currency-value colour
- accent gradients, accent glows, large accent fills
- distributing the accent evenly across all components "for consistency"

> Rule of thumb: after building the asset, **count** the accent-coloured pixels'
> *locations*. 3–5 spots → good. 8+ → delete until it is scarce.

Greyscale check: turn the asset to greyscale. The hierarchy must be unchanged.
If removing colour flattens it, the design was leaning on colour instead of
scale/weight/space (`DESIGN_PRINCIPLES.md` §4).

---

## Contrast & accessibility

- Ink `#1F1F1F` on Ivory `#FAF7F2` ≈ 15:1 — excellent.
- `#3A3A3A` on Ivory ≈ 10:1 — fine for supporting copy.
- Terracotta `#C4644A` on Ivory ≈ 3.6:1 — **large text / graphic marks only**,
  never body copy, never a 24px label.
- Sage `#7E8A7B` on Ivory ≈ 2.7:1 — decorative marks only.
- Any text under ~24px must be Ink or `#3A3A3A`.
- Input-cell fill in the workbook (`#FFFDF4`) must stay light enough that black
  ink on it still clears 12:1.

---

## Emotional associations (why this palette)

- Warm ivory + charcoal = *editorial, considered, calm, premium* — a printed
  journal, not a screen.
- Terracotta = *warm, human, crafted, grounded* — not corporate, not neon.
- Sage = *quiet, natural, focused* — for calmer product families.
- The absence of bright colour is the point: it signals restraint and taste,
  which is what a buyer pays a premium for.

---

## Product-family accents (LUMIUMX §10)

| Family | Accent |
|---|---|
| Finance | Terracotta `#C4644A` |
| Planning | Terracotta `#C4644A` |
| Productivity | Sage `#7E8A7B` |
| Wellness | Sage `#7E8A7B` |
| Bundles | Ink + Terracotta |
| Seasonal | one controlled seasonal accent, background/type unchanged |

Background, typography, spacing and layout stay identical across families — only
the accent changes. This is what stops the catalogue looking visually random.

---

## GOOD vs BAD

| BAD | GOOD |
|---|---|
| Sage on every badge, tick, icon box, KPI value | Terracotta on: kicker dot, title rule, one figure |
| Solid coloured section-heading bars | Section headings in tracked caps, hairline rule under |
| Background `#FAF8F4`, accent invented | LUMIUMX `#FAF7F2` + `#C4644A` verbatim |
| White cards dominate the canvas | Ivory dominates; one white panel max |
| Heading coloured terracotta to "pop" | Heading is Ink; it pops by being 2× the size |
| Positive-green used in a marketing asset | Semantic colours confined to the workbook |
