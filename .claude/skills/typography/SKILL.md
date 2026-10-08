---
name: typography
description: "Control typography as a deliberate design system for the Etsy factory — type pairing, modular scale, hierarchy, line-height, tracking, measure, display vs body, numerical typography, editorial typography, readability. Use whenever choosing fonts, setting a type scale, sizing headings, spacing labels, or fixing text that 'looks like a template', 'uses the wrong font', 'headline looks weak', 'body copy is hard to read', or 'the hierarchy is unclear'. Do NOT default to Inter/Roboto/system fonts for display without justification."
metadata:
  version: 1.0.0
---

# Typography

Type carries the personality and most of the hierarchy in this brand. Treat it
as a designed system, never a default.

## Read first

- `docs/design/TYPOGRAPHY.md` — the full spec (scale tables, line-height,
  tracking, numeric typography, copywriting-for-type, GOOD vs BAD).
- `docs/LUMIUMX_ETSY_DESIGN_SYSTEM.md` §3.
- No live product currently uses the Spectral+Inter marketing/print register
  described below (Product #001, which did, was removed 2026-09-15 — see
  `CLAUDE.md`); Product #006 is XLSX-only and uses Georgia/Calibri (Excel-safe
  stand-ins for the same brand faces, per ADR-021/022) instead. Treat this
  section as the standing brand rule for the next product that needs it.

## The pairing (fixed)

| Role | Family | Notes |
|---|---|---|
| Display / editorial | **Spectral** (fallback Playfair Display) | Editorial serif designed for reading — *not* the Playfair/Lora "Canva serif" look. Sets: wordmark, titles, editorial statements, one emphasised label. |
| Body / UI / numbers | **Inter** | 400 / 600 only. Sets everything else. |

Vendored: `marketing/assets/fonts/` (OFL 1.1). The print-pipeline copy of
these fonts lived in `products/001-*/render/fonts/`, removed with Product
#001 (2026-09-15) — re-vendor from `marketing/assets/fonts/` if a future
print pipeline needs them. No variable fonts, no extra weights without a
reason.

**A display line set in Inter Bold is the #1 tell of AI/template design in this
category. Do not do it.** Inter is the body face here by decision; the serif
does the expressive work.

## Build hierarchy with 4 levers, in order

1. **Size** — real jump (≥1.5×) between levels. Two headings one notch apart look
   like a bug.
2. **Weight** — 400 vs 600. Avoid 700+ (LUMIUMX: no heavy bold).
3. **Case + tracking** — small UPPERCASE + `0.10–0.22em` tracking = a *label*
   register. Use it for every kicker/eyebrow so it becomes a motif.
4. **Space** — the important thing has the most room.

**Colour is not a hierarchy lever.** Never colour a heading to make it pop.

## Numbers

Modular scale, ratio ~1.25–1.333. Pick sizes off the scale; never nudge to fit.
Listing image (2000px): hero title 108–140 Spectral 600 · section 56–72 · kicker
24–30 Inter 600 caps · lead 34–40 · body 28–34 · label 22–26 caps · KPI figure
72–110 tabular. Full tables in `docs/design/TYPOGRAPHY.md`.

- Line-height: display 1.05–1.15; body 1.45–1.55; lead 1.4.
- Measure: 45–75 chars/line for body; constrain wide paragraphs
  (`max-width` ~1400–1600px).
- Tracking: negative (`-0.005…-0.02em`) on large display; positive
  (`0.08–0.22em`) on small caps labels; zero on body. Never track lowercase
  body.

## Numeric typography

- KPI figures: large, tabular, decimal-aligned. Currency symbol decided once
  (prefix, same or smaller weight) and kept.
- Tables: right-align currency, real Excel number format.
- **Print pipeline**: no OpenType numeral features — `tabular-nums` broke PDF
  text extraction in Chromium (discovered on Product #001's print pipeline,
  since removed — the lesson still applies to any future print PDF work).
  Plain digits.

## Copywriting for type (marketing)

- Headlines are **written**, not pasted from the spec. 2–5 words on the hero.
- One idea per line on kickers / step titles.
- Sentence case for reading; UPPERCASE only for short labels, kickers, wordmark.
- No mid-word line breaks in headings; no 40-word "subtitle".

## Anti-patterns

- Inter/Roboto/system font for a display line.
- Two headings 82px and 76px (no real jump).
- Kicker same size/case as body.
- Body paragraph spanning 1800px.
- Accent-coloured subhead "to pop".
- Letter-spaced lowercase body.
- Pasted spec sentence as body copy.

## Examples

- **BAD**: `docs/design/examples/WEAK-marketing-hero-2026-08-31.png` — right
  faces, but no tracking discipline and a pasted 40-word spec sentence with
  " - without an app" mid-line.
- **GOOD**: `docs/design/examples/GOOD-editorial-finance-prototype.png` — one
  serif voice (title + "Leftover"), Inter labels, the recurring tracked-caps
  kicker motif, a real size jump to the anchor.

## Quality criteria

- Can you name the register (display vs body) from the face alone?
- Real ≥1.5× jump between hierarchy levels?
- Kickers/labels a consistent tracked-caps motif?
- Body 45–75 chars/line, sane leading, no mid-word breaks?
- Zero headings coloured for emphasis?
- Numbers tabular and aligned where they matter?
