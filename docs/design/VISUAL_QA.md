# Visual QA

Technical QA (dimensions, no clipping, PNG valid, claims verified) is necessary
but **not sufficient**. A technically perfect image can still be generic,
low-trust junk. This rubric is the art-director gate that runs *after* technical
QA passes.

Used by the `visual-qa` skill and step 9 of `design-review`.

---

## How to run it

1. **Actually look at the rendered PNG(s).** Open them. Do not evaluate from the
   HTML or the spec.
2. Score each dimension below 0–2. Write one concrete sentence of evidence per
   score (name the element, the pixel region, the specific problem).
3. Sum. Apply the gate.
4. If FAIL, the output is **redesigned** (composition / hierarchy changes), not
   nudged.

---

## The rubric (0 = fail, 1 = weak, 2 = good)

### A. Not generic / not AI-looking
- **A1 Composition variety** — does this asset have its own composition, or is it
  the same `heading → cards → footer` as the others?
- **A2 Focal point** — is there one clear thing the eye lands on first?
- **A3 No template tells** — no icon-in-rounded-square rows, no fake browser
  chrome, no soft-shadow pastel card grid, no dead centred void.
- **A4 Distinctive** — could this be any Etsy shop, or is it unmistakably *this*
  shop (palette, type, kicker motif, mockup style)?

### B. Hierarchy & composition
- **B1 Scale jump** — is the primary element ≥1.5× the secondary? Or does
  everything look the same size?
- **B2 Greyscale hierarchy** — convert to greyscale mentally/actually: does the
  hierarchy survive, or was it leaning on colour?
- **B3 Alignment discipline** — few alignment edges, held; no stray centred
  element.
- **B4 Whitespace intent** — is empty space framing something, or is it an
  undesigned gap between a heading and centred content?
- **B5 Rhythm across the set** — do the 5–6 images alternate density, or is it
  the same beat five times?

### C. Typography
- **C1 Right faces** — Spectral display, Inter body. No Inter-Bold display line.
- **C2 Hierarchy from type** — size/weight/case/tracking doing the work, not
  colour.
- **C3 Measure & line-height** — body 45–75 chars/line, sensible leading; no
  paragraph spanning the full width; no mid-word line breaks in headings.
- **C4 Label system** — kickers/labels are a consistent tracked-caps motif.

### D. Colour
- **D1 Palette fidelity** — LUMIUMX hexes verbatim (`#FAF7F2`, `#1F1F1F`,
  `#C4644A` / `#7E8A7B`). No invented off-brand values.
- **D2 Accent scarcity** — accent in 3–5 deliberate spots, not on every
  component. Count them.
- **D3 Ratio** — ivory dominant (~60%), not a field of white cards.
- **D4 Contrast** — all body text ≥ ~7:1; accent only on large/graphic elements.
- **D5 One accent** — a single family accent per asset, not terracotta + sage
  both loud.

### E. Content & trust (would a buyer pay a premium?)
- **E1 Real previews** — actual sheet/page renders, cropped to content, not
  blank grids or invented UI.
- **E2 Mockup quality** — framed as stationery with consistent lighting/shadow,
  not a flat screenshot or browser window.
- **E3 Message clarity** — across the set: WHAT IT IS · WHY · WHAT YOU GET · HOW.
- **E4 Audience fit** — does the design match the stated `targetCustomer`
  (calm, considered, adult, money-serious — not childish, not corporate-SaaS)?
- **E5 Trust** — does it look like something a stranger would pay £5.99+ for and
  expect to be good? Or does it look free/AI/template?

---

## Scoring gate

Per-section maxima: **A = 8, B = 10, C = 8, D = 10, E = 10 → total 46.**

- **≥ 40 and no zeros → PASS.**
- **32–39, or any single zero → CONDITIONAL** — list the specific fixes; re-render;
  re-score.
- **< 32, or ≥3 zeros → FAIL** — the concept is wrong. Redesign the composition,
  don't tweak.
- **A1, A3, or E5 scored 0 → automatic FAIL** regardless of total. Those three
  are the "looks generic / AI / untrustworthy" veto.

---

## Fast heuristics (the 10-second checks)

- **Squint test** — blur your eyes. Do you see one clear shape hierarchy, or
  grey mush of equal blocks?
- **Thumbnail test** — shrink to 170px (Etsy grid size). Is the product still
  legible and appealing, or is it unreadable clutter?
- **Accent count** — literally count accent-coloured marks. >6 → fail D2.
- **Card count** — count bordered cards. If every content group is a card → fail
  A3 / B1.
- **Void check** — is there a >200px undesigned gap between a heading and its
  content? → fail B4.
- **Sibling test** — put it next to another of our assets. Same shop? → A4.
- **Stranger test** — would someone who doesn't know us assume this is a paid,
  professionally-designed product? → E5.

---

## Output format (what the skill returns)

```
VISUAL QA — <asset(s)>

Score: <n>/46   Verdict: PASS | CONDITIONAL | FAIL

A. Not generic      x/8   — <evidence>
B. Hierarchy        x/10  — <evidence>
C. Typography       x/8   — <evidence>
D. Colour           x/10  — <evidence>
E. Content & trust  x/10  — <evidence>

Automatic-fail vetoes (A1 / A3 / E5): <none | which, why>

Top fixes (specific, ordered):
1. <element> — <change> — <expected effect>
2. …
```
