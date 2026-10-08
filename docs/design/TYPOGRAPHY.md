# Typography

Type is the primary carrier of personality and hierarchy in this factory (see
`DESIGN_PRINCIPLES.md` §1, §3, §4). Treat it as a designed system, not a default.

Canonical pairing (from `../LUMIUMX_ETSY_DESIGN_SYSTEM.md` §3):

| Role | Family | Why |
|---|---|---|
| Display / editorial | **Spectral** (fallback: Playfair Display) | Designed by Production Type for Google's News Initiative for long-form editorial reading — a "financial journal" register, and *not* the Playfair/Lora look that reads as a generic Canva-template serif. |
| Body / functional / UI / numbers | **Inter** | Neutral, excellent at small sizes, tabular-friendly. |

**Do not default to Inter/Roboto/system fonts for display without justification.**
Inter is the body face here *by decision*, paired with a serif that does the
expressive work. A display line set in Inter Bold is the #1 tell of AI/template
design in this category.

Vendored files live in `marketing/assets/fonts/` and
`products/001-*/render/fonts/` (Inter 400/600, Spectral SemiBold + Italic,
SIL OFL 1.1). No variable fonts, no extra weights without a reason.

---

## Scale

Use a **modular scale**, not arbitrary sizes. Ratio ~1.25–1.333. Pick sizes off
the scale; never nudge to "make it fit".

**Etsy listing image (2000×2000 canvas):**

| Role | Face / weight | ~Size (px) | Case / tracking |
|---|---|---|---|
| Product title (hero) | Spectral 600 | 108–140 | Title Case, tracking `-0.01em` |
| Section heading | Spectral 600 | 56–72 | Title Case |
| Kicker / eyebrow | Inter 600 | 24–30 | UPPERCASE, tracking `0.16–0.22em` |
| Lead / value prop | Inter 400 | 34–40 | sentence case, `line-height 1.4` |
| Body | Inter 400 | 28–34 | sentence case, `line-height 1.5` |
| Label / meta | Inter 600 | 22–26 | UPPERCASE, tracking `0.10em` |
| Big figure (KPI) | Inter 600 or Spectral 600 | 72–110 | tabular digits |
| Footnote / brand line | Inter 400 | 20–24 | as needed |

**Spreadsheet (points, print-first):** title 16–20pt Spectral · section label
10–12pt Inter 600 UPPERCASE tracked · body 10pt Inter · label 8–9pt Inter 600
UPPERCASE tracked · footer 8pt Inter. Row-height floors and the print-safe
minimums in `SPREADSHEET_UX.md` override any aesthetic preference.

---

## Hierarchy — build it with 4 levers, in this order

1. **Size** — a real jump (≥1.5×) between levels. Two headings one notch apart in
   size look like a mistake.
2. **Weight** — 400 vs 600. Avoid 700+ heavy bold (LUMIUMX §3: "Avoid overly
   heavy bold typography").
3. **Case + tracking** — small UPPERCASE + wide tracking = a *label* register.
   Use it consistently for every kicker/eyebrow so the eye learns the pattern
   once (a recurring "kicker" motif ties a page together).
4. **Space** — the most important thing has the most room around it.

Colour is **not** a hierarchy lever here (§4). Do not make a heading terracotta
to make it "pop".

---

## Line-height, measure, tracking

- Display / titles: `line-height 1.05–1.15` (tight, headline-like).
- Body: `line-height 1.45–1.55`. Lead paragraphs `1.4`.
- **Measure**: 45–75 characters per line for body. If a paragraph runs the full
  2000px width, constrain it (`max-width` ~1400–1600px).
- Tracking: **negative** (`-0.005 to -0.02em`) on large display; **positive**
  (`0.08–0.22em`) on small UPPERCASE labels; **zero** on body.
- Never letter-space lowercase body text.

---

## Numeric typography

Numbers in a finance product are content, not decoration.

- KPI figures: large, tabular, aligned on the decimal. Currency symbol smaller
  than the digits or set as a prefix in the same weight — decide once, keep it.
- In tables: right-align currency, use a real Excel number format
  (`£#,##0.00`), not typed strings.
- Do not enable OpenType numeral features in the print pipeline — QA found
  `font-variant-numeric: tabular-nums` breaks ToUnicode text extraction in
  Chromium's PDF export (`products/001-*/test/QA.md`). Plain digits only there.

---

## Copywriting for type (marketing assets)

- Headlines are **written**, not pasted from the spec. Tight, concrete, 2–5
  words on the hero. "Minimalist Monthly Budget Planner" — yes. A 40-word
  sentence with " - without an app" mid-line — no.
- One idea per line on kickers and step titles.
- Sentence case for reading text; UPPERCASE only for short labels, kickers, and
  the wordmark. Use uppercase sparingly (LUMIUMX §3).

---

## GOOD vs BAD

| BAD | GOOD |
|---|---|
| Hero title in Inter Bold 700 | Hero title in Spectral 600 with `-0.01em` tracking |
| Two headings at 82px and 76px | 104px and 58px — a real jump |
| Kicker in sentence case, same size as body | `INSTANT DIGITAL DOWNLOAD` · Inter 600 · 26px · `0.18em` |
| Body paragraph spanning 1800px, 12 words wide | Body at `max-width 1440px`, ~60 chars/line |
| Accent-coloured subhead "to make it pop" | Subhead distinguished by size + weight + space |
| Raw spec sentence with mid-word breaks | Rewritten: "Plan the month. Track every day. Reconcile at month end." |

See `examples/EXAMPLES.md` — the WEAK hero uses the right faces but a pasted
40-word spec sentence and no tracking discipline; the GOOD prototype shows the
kicker motif and the size jump.
