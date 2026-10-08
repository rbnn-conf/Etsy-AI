---
name: colour-system
description: "Create and enforce a sophisticated, restrained colour system for the Etsy factory — dominant/supporting/accent/neutral roles, colour hierarchy, contrast, accessibility, emotional association, product-family accents. Use whenever choosing or reviewing colours for any artifact (listing images, mockups, workbook cells, shop assets), setting design tokens, or fixing output where 'the accent is everywhere', 'the palette looks off', 'it looks childish/rainbow', 'colours look random', or 'it doesn't look premium'. Do NOT distribute the accent equally across every component."
metadata:
  version: 1.0.0
---

# Colour System

The palette is fixed. The craft is *restraint*: one accent per asset, used
scarcely, with ivory dominant.

## Read first

- `docs/design/COLOUR.md` — the full spec (palette, ratio, the four roles, how
  to use the accent, contrast, family accents, GOOD vs BAD).
- `docs/LUMIUMX_ETSY_DESIGN_SYSTEM.md` §2 (palette), §10 (family accents), §16
  Rule 4 ("one accent per asset").

## The palette (use these hexes verbatim)

| Token | Hex | Role |
|---|---|---|
| Ink | `#1F1F1F` | text, headings, rules. **Never `#000000`.** |
| Warm Ivory | `#FAF7F2` | default canvas |
| Paper White | `#FFFFFF` | one panel / mockup surface |
| Stone | `#E6E1D9` | borders, dividers — a hairline, not a hard grey |
| Terracotta | `#C4644A` | primary accent — Finance, Planning, Bundles |
| Sage | `#7E8A7B` | secondary accent — Productivity, Wellness |
| Secondary text | `#3A3A3A` | supporting copy |

Do not invent values. The pipeline drifted to `#FAF8F4` / sage-`#6F8174` — that
is wrong. Product #001 is Finance → **Terracotta `#C4644A`**.

## Colour ratio target

`60% Warm Ivory · 20% Paper White · 15% Ink · 5% accent`. If white cards
dominate the canvas the ratio is inverted — reduce cards, let ivory lead.

## The four roles

1. **Dominant** — Warm Ivory (mood before reading).
2. **Supporting** — Paper White + Stone (a second *value*, not a second colour):
   one panel, hairline dividers.
3. **Accent** — one family colour, 3–5 deliberate marks.
4. **Neutral text** — Ink primary, `#3A3A3A` supporting.

No brand blue, no gradient, no second bright. Semantic green/red exist **only**
inside the workbook (conditional formatting), muted, never in marketing.

## Using the accent (the discipline)

Allowed (pick 3–5 total per asset): a kicker mark · the rule under a title ·
one emphasised figure/word · a thin border on the single most important box · a
small editorial marker (24px circle, 2px line).

Forbidden: accent on every badge/tick/icon box · solid accent bars behind
section headings · accent as body text or currency-value colour · accent
gradients/glows/large fills · spreading the accent evenly "for consistency".

> After building: **count the accent placements**. 3–5 → good. 8+ → delete until
> scarce.

## Contrast / accessibility

- Ink on ivory ≈ 15:1 ✔. `#3A3A3A` on ivory ≈ 10:1 ✔ (supporting copy).
- Terracotta on ivory ≈ 3.6:1 → large text / graphic marks only. Never body,
  never a 24px label.
- Sage on ivory ≈ 2.7:1 → decorative marks only.
- Any text < ~24px must be Ink or `#3A3A3A`.

## Greyscale check

Convert the asset to greyscale. Hierarchy must be unchanged. If it flattens, the
design was leaning on colour — fix with scale/weight/space
(`docs/design/DESIGN_PRINCIPLES.md` §4).

## Product-family accents (LUMIUMX §10)

Finance / Planning / Bundles → Terracotta. Productivity / Wellness → Sage.
Background, type, spacing, layout identical across families — only the accent
changes.

## Anti-patterns

- Accent on every component.
- Solid coloured section-heading bars.
- Invented off-brand hex values.
- White cards dominating the canvas.
- Heading coloured to "pop".
- Positive-green in a marketing asset.
- Terracotta + Sage both used loudly in one asset.

## Examples

- **BAD**: `docs/design/examples/WEAK-workbook-sheet-2026-08-31.png` (solid sage
  bar, wrong family colour) and `WEAK-marketing-hero-2026-08-31.png` (sage on
  every badge/glyph).
- **GOOD**: `docs/design/examples/GOOD-editorial-finance-prototype.png` —
  terracotta in ~4 places, ivory+ink everywhere else.

## Quality criteria

- LUMIUMX hexes verbatim; correct family accent?
- Accent in 3–5 spots (count them)?
- Ivory dominant, not a card field?
- Greyscale: hierarchy unchanged?
- All body text ≥ ~7:1; accent only on large/graphic elements?
- One accent, not two loud ones?
