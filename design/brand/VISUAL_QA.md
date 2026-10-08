# Visual QA — design-direction scorecard

Scores a **design direction** — a `DESIGN_SPEC.json` + `MARKETING_DESIGN_SPEC.json`
plus their `DESIGN_RATIONALE` — *before* anything is rendered. It is the
LumiumX Creative Director's own gate (step 17, self-critique) and the review
gate for a proposed direction.

**This is not the rendered-pixel gate.** Once PNGs/PDFs exist, they are scored
by `docs/design/VISUAL_QA.md` (the 0–2 / 46-point art-director rubric, run by
the `visual-qa` skill). A direction can pass here and still fail there on
execution; both must pass.

---

## How to run it

1. Read the `DESIGN_SPEC` + `MARKETING_DESIGN_SPEC` + `DESIGN_RATIONALE`.
2. Score each of the 12 criteria **0–10** (anchors below).
3. Write one concrete sentence of evidence per score — name the field, the
   value, the specific strength or gap.
4. Average the 12 scores. Apply the band.
5. Run the anti-pattern veto (`design/brand/ANTI_PATTERNS.md`).

"Looks good" is not a permitted justification. Every score cites a spec value.

---

## The 12 criteria

| # | Criterion | What a 10 looks like | What a 0–4 looks like |
|---|---|---|---|
| 1 | **LumiumX brand consistency** | Inherits `lumiumx.tokens.json` verbatim; every override has a stated reason tied to the customer | Invents hexes/fonts; a second design system; no inheritance |
| 2 | **Premium editorial quality** | Reads as a financial journal — ivory field, restraint, editorial composition named per page | "Spreadsheet made prettier"; SaaS or Canva register |
| 3 | **Typography** | Spectral display + Inter body; ≥1.5× scale jumps; tracked-caps kicker motif; no Inter-Bold display | One family doing everything; flat scale; colour used for hierarchy |
| 4 | **Layout** | Grid stated; asymmetry deliberate; spacing from the scale; one composition pattern per asset | Everything centred; repeated block; spacing "to fit"; dead voids |
| 5 | **Hierarchy** | One focal point per page/asset, dominant by size + space; survives greyscale | Equal-weight everything; hierarchy leans on the accent |
| 6 | **Usability / readability** | Writing-space floors respected; contrast ≥7:1 for body; labels plain | Rows below floor; low-contrast "aesthetic" text; jargon labels |
| 7 | **Print suitability** | A4 + Letter laid out independently; grayscale-safe; ink-economy respected; margin ≥10mm | One file scaled; colour-only distinctions; full-bleed fills |
| 8 | **Visual consistency across the set** | Constant margins/type/palette/kicker/mockup; density alternates across the listing set | Each asset its own system; same density five times |
| 9 | **Market competitiveness** | Credible next to top sellers in the three references; clear price-band signal | Below the £2–3 generics in perceived quality |
| 10 | **Commercial presentation** | Marketing spec sells (benefit-led, big type, real previews, believable mockup) while the product spec stays functional | Product and marketing specs identical; or marketing makes unbacked claims |
| 11 | **Differentiation** | The one differentiation opening is named and made visible | Competent but interchangeable with the references |
| 12 | **Absence of anti-patterns** | Nothing from `ANTI_PATTERNS.md`; self-critique lists what was considered and cut | Multiple anti-patterns present or unaddressed |

### Score anchors (apply to every criterion)

- **9–10** — production quality. Specific, justified, nothing to fix.
- **7–8** — sound, with 1–2 named gaps to close.
- **5–6** — the intent is right but under-specified or partly generic.
- **3–4** — a real weakness in the direction.
- **0–2** — this criterion is failing; the direction is wrong here.

---

## Bands (average of the 12)

| Average | Verdict | Action |
|---|---|---|
| **9.0–10** | production quality | proceed to render |
| **8.0–8.9** | minor revision | fix the named gaps, re-score the affected criteria only |
| **7.0–7.9** | significant revision | revise the direction, re-score all 12 |
| **< 7.0** | reject | the concept is wrong — redesign the direction, do not tweak |

**Vetoes (force reject regardless of average):**

- Criterion 1, 2, or 12 scored **≤ 3**.
- Any `ANTI_PATTERNS.md` item present and unaddressed in the rationale.
- The marketing spec and the product spec are the same design.
- A design-system value is invented instead of inherited, without a reason.

---

## Output format

```
DESIGN-DIRECTION QA — <product>

Scores (0–10):
 1 Brand consistency      x  — <evidence: field + value>
 2 Premium editorial      x  — …
 3 Typography             x  — …
 4 Layout                 x  — …
 5 Hierarchy              x  — …
 6 Usability              x  — …
 7 Print suitability      x  — …
 8 Visual consistency     x  — …
 9 Market competitiveness x  — …
10 Commercial presentation x — …
11 Differentiation        x  — …
12 Absence of anti-patterns x — …

Average: x.x   Verdict: PRODUCTION | MINOR | SIGNIFICANT | REJECT
Vetoes: <none | which, why>

Top fixes (specific, ordered):
1. <field> — <change> — <expected effect>
2. …
```
