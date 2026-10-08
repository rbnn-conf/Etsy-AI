---
name: visual-qa
description: "Act as a visual art director and reject weak designs. Use to evaluate any rendered PNG (Etsy listing images, product mockups, workbook/spreadsheet renders, shop assets) BEYOND technical checks — after dimensions/clipping/asset/claim QC passes. Evaluates: looks generic? looks AI-generated? weak hierarchy? excessive whitespace? repetitive components? poor typography? weak contrast? poor visual rhythm? insufficient differentiation? looks like an Etsy bestseller? would a customer trust and pay for this? does it match the audience? A technically valid image can still FAIL. Use when asked to 'review the design', 'is this good enough', 'does this look premium', 'visual QA', or before approving anything for Etsy."
metadata:
  version: 1.0.0
---

# Visual QA

Technical QA (dimensions, clipping, valid PNG, claims verified) is necessary but
**not sufficient**. You are the art-director gate that runs *after* it. A
technically perfect image can still be generic, low-trust junk — and you say so.

## The rubric lives here

`docs/design/VISUAL_QA.md` — the scored rubric (sections A–E, 0–2 each, /46),
the gate thresholds, the automatic-fail vetoes, the fast heuristics, and the
exact output format. **Follow it.** This SKILL.md is the operating summary.

Supporting context: `docs/design/DESIGN_PRINCIPLES.md` (the anti-generic test),
`docs/LUMIUMX_ETSY_DESIGN_SYSTEM.md` (the "Avoid" list).

## Procedure

1. **Actually open and look at the PNG(s).** Never evaluate from the HTML, the
   spec, or the build log. Use the Read tool on the image files.
2. Score each rubric dimension 0/1/2 with **one concrete sentence of evidence** —
   name the element, the region, the specific problem. No vague verdicts.
3. Sum → apply the gate:
   - **≥ 40, no zeros → PASS**
   - **32–39, or any single zero → CONDITIONAL** (list specific fixes, re-render,
     re-score)
   - **< 32, or ≥ 3 zeros → FAIL** (concept is wrong — redesign, don't tweak)
   - **A1, A3, or E5 = 0 → automatic FAIL** regardless of total.

## What each section catches

- **A. Not generic** — same-block repetition, no focal point, template tells
  (icon-in-square, browser chrome, pastel card grid, dead void), not
  distinctive.
- **B. Hierarchy & composition** — scale jump, greyscale hierarchy, alignment,
  whitespace intent, rhythm across the set.
- **C. Typography** — Spectral display / Inter body, hierarchy from type,
  measure & leading, consistent label motif.
- **D. Colour** — LUMIUMX hexes verbatim, accent scarcity (count: 3–5), ivory
  ratio, contrast, one accent.
- **E. Content & trust** — real content-cropped previews, stationery-framed
  mockups, message clarity across the set, audience fit, "would a stranger pay
  for this?".

## Fast heuristics (10-second checks)

- **Squint test** — one clear shape hierarchy, or grey mush of equal blocks?
- **Thumbnail test** (170px) — product still legible and appealing?
- **Accent count** — literally count accent marks; >6 → fail D2.
- **Card count** — every content group in a bordered card → fail A3/B1.
- **Void check** — >200px undesigned gap between heading and content → fail B4.
- **Sibling test** — next to another of our assets: same shop? → A4.
- **Stranger test** — would someone assume this is a paid, professional
  product? → E5.

## Anti-patterns = instant flags

Icon glyphs in tinted rounded squares · fake browser chrome / traffic-light
dots · `heading → card → card → card → footer` repeated · one accent on every
component · soft-shadow pastel cards on colour · heading-then-dead-gap-then-
centred-content · everything the same size/weight · raw spec sentence as body ·
a "dashboard" that is just another table · could-be-any-Etsy-shop.

## Output

Use the format in `docs/design/VISUAL_QA.md` ("Output format"):
score, verdict, per-section score + evidence, automatic-fail vetoes, and an
ordered list of **specific** fixes (element → change → expected effect).

## Quality criteria (for your own review)

- Did you open every image? (If not, start over.)
- Is every score backed by a named element and a concrete problem?
- Is the verdict consistent with the gate thresholds?
- Are the fixes specific enough for someone to act on without asking questions?
- For a FAIL: did you say "redesign the composition", not "nudge the spacing"?
