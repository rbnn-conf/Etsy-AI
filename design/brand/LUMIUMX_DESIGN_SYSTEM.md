# LumiumX Design System — canonical consolidation

**Version:** 1.0.0
**Status:** canonical source of truth for the design-intelligence layer
**Machine-readable form:** [`lumiumx.tokens.json`](lumiumx.tokens.json)

This document does **not** replace the existing design knowledge. It
**consolidates** it and resolves the few places the earlier files disagreed,
so the LumiumX Creative Director (and anything downstream) has one place to
inherit from.

| Layer | Where it lives | Role |
|---|---|---|
| **The brand** | [`docs/LUMIUMX_ETSY_DESIGN_SYSTEM.md`](../../docs/LUMIUMX_ETSY_DESIGN_SYSTEM.md) | Non-negotiable brand spec: positioning, palette, type, the "Avoid" list, the 6-image Etsy sequence, brand consistency rules §16. **Still authoritative for everything it covers.** |
| **The craft** | [`docs/design/`](../../docs/design/) | How to execute: `DESIGN_PRINCIPLES`, `TYPOGRAPHY`, `COLOUR`, `LAYOUT`, `SPREADSHEET_UX`, `ETSY_MARKETING`, `ETSY_PRODUCT_DESIGN`, `VISUAL_QA`, `examples/`. |
| **This file** | `design/brand/` | The consolidated canon + resolved conflicts + the machine-readable token library the Creative Director emits specs against. |

If this file and an older file disagree on an **exact value**, this file wins
and the disagreement is recorded under [Resolved conflicts](#resolved-conflicts).
For anything not a value — method, rationale, examples — the `docs/` files are
the deeper reference and are not duplicated here.

---

## 1. Brand

**LumiumX** — a premium digital-product brand: useful, beautifully designed
tools for planning, organisation, finance and everyday life.

> Beautifully designed tools for a more organized life.
> Designed to be useful. Made to be beautiful.

**Personality:** minimal · warm · editorial · premium · calm · intelligent ·
purposeful · timeless · practical.

## 2. Design category

**Premium Editorial Finance** (a.k.a. Soft Editorial Finance).

Secondary descriptors: soft editorial · warm neutral · premium minimalist ·
financial stationery · sophisticated digital planner · modern paper journal ·
understated luxury · functional editorial design.

The target is **a premium financial journal that happens to be a
digital/printable planner** — *not* a spreadsheet made prettier.

This is the house **foundation**. Each product gets a product-specific art
direction *on top of* it (see `docs/design/ETSY_PRODUCT_DESIGN.md` §3 — the
archetype → art-direction library). Editorial Finance is the archetype for
budget / savings / debt products; it is Product #001's archetype.

## 3. Typography

| Role | Family | Notes |
|---|---|---|
| Display / editorial | **Spectral** (fallback: Playfair Display) | Product/page titles, brand wordmark, editorial statements, the one emphasised feature figure. |
| Body / functional / UI / numbers | **Inter** | Everything else. Regular 400 + SemiBold 600. |

- Two families, maximum. Name the register from the typeface alone.
- **No display line in Inter Bold** — the #1 template tell in this category.
- Hierarchy is built from **size → weight → case+tracking → space**, in that
  order. Colour is not a hierarchy lever.
- Avoid weights above 600. Never letter-space lowercase body text.
- Full scale (listing px and print pt): `lumiumx.tokens.json` → `typography`,
  and `docs/design/TYPOGRAPHY.md`.

Vendored faces: `marketing/assets/fonts/`, `products/001-*/render/fonts/`
(Inter 400/600, Spectral SemiBold + Italic, SIL OFL 1.1). No variable fonts.

## 4. Palette (canonical)

| Token | Hex | Role |
|---|---|---|
| Background (Warm Ivory) | `#FAF7F2` | Default canvas. ~60% of any composed asset. |
| Background alt | `#F2ECE1` | One deeper-ivory alternating panel, sparing. |
| Surface (Paper White) | `#FFFFFF` | Cards, product backgrounds, the mockup surface. ~20%. |
| Primary ink | `#1F1F1F` | Text, headings, wordmark, strong rules. **Never `#000000`.** |
| Secondary ink | `#3A3A3A` | Supporting copy under a heading. |
| Border (Stone) | `#E6E1D9` | Hairlines, dividers, subtle surfaces. Not a hard grey. |
| Accent — Terracotta | `#C4644A` | **Finance / Planning / Bundles.** 3–5 placements per asset. |
| Accent — Sage | `#7E8A7B` | **Productivity / Wellness.** |

Semantic colours — positive `#2F7A3F`, warning `#B23B3B` — exist **only inside
the functional workbook** for conditional formatting. Never in marketing or
print.

**Accent discipline** (the hardest rule): one accent per asset, 3–5 deliberate
placements (a kicker mark, the rule under a title, one emphasised figure, a
thin border on the single most important element, a small editorial marker).
Count before shipping. More than ~6 → the accent is wallpaper; remove until
scarce. Accent is never body text, never a currency value, never a grid line,
never a large fill. Full guidance: `docs/design/COLOUR.md`.

## 5. Layout

- **Listing image:** 2000×2000, 12-column grid, ~140px margin, ~40px gutter,
  ~8px baseline. Not every element spans 12 columns — asymmetry is deliberate.
- **Print:** A4 (210×297mm) and US Letter (215.9×279.4mm), laid out
  independently — never one file scaled to the other. Margin floor 10mm.
  Grayscale-safe: no information by colour alone.
- **Spacing:** pick from the scale `[2, 4, 8, 12, 16]`mm — never nudge to fit.
- Structure from **hairline rules and generous whitespace**, not bordered
  cards. One focal point per asset. Hold a few alignment edges ruthlessly.
- Vary composition and density across a listing set; keep margins, type scale,
  palette, the kicker motif and mockup lighting constant across it.
- Full guidance: `docs/design/LAYOUT.md`.

## 6. Component language

The reusable pieces every LumiumX product draws from — `kicker`,
`section_divider`, `hairline_table`, `kpi_figure`, `feature_panel`,
`input_cell`, `checkbox`, `progress_strip`, `brand_mark`, `mockup_frame`.
Definitions: `lumiumx.tokens.json` → `components`, and
`products/001-*/test/DESIGN_SYSTEM.md` for the worked Editorial-Finance set.

A DESIGN_SPEC's `components` block selects and parameterises these; it does not
invent a parallel component vocabulary.

## 7. Marketing language

Marketing visuals share the identity but do a different job (sell, not
operate). They should feel **premium · clear · trustworthy · sophisticated ·
commercially attractive**. Bigger type, product screenshots, benefit-led
messaging, a believable stationery mockup. Same palette, same faces, same
kicker motif — never an identical layout to the product. Full guidance:
`docs/design/ETSY_MARKETING.md`, `docs/LUMIUMX_ETSY_DESIGN_SYSTEM.md` §9.

## 8. Anti-patterns

The named failure modes live in [`ANTI_PATTERNS.md`](ANTI_PATTERNS.md). The
visual critic (and the Creative Director's self-critique step) must score
against that file.

## 9. Quality gate

- **Design-direction quality** (a DESIGN_SPEC / MARKETING_DESIGN_SPEC + its
  rationale, *before* anything renders): [`VISUAL_QA.md`](VISUAL_QA.md) in this
  folder — the 12-criterion 0–10 scorecard.
- **Rendered-pixel quality** (the actual PNG/PDF): `docs/design/VISUAL_QA.md` —
  the 0–2 / 46-point art-director gate, run by the `visual-qa` skill.

Both must pass. They are complementary, not competing: the first stops a bad
*direction* before it costs a render; the second stops a bad *execution* of a
good direction.

---

## Resolved conflicts

The design work landed in three passes and left three near-identical
"editorial finance" palettes in the tree. The Creative Director consolidates
on the **`docs/LUMIUMX_ETSY_DESIGN_SYSTEM.md` values**, which is also what the
shipped `marketing/` and `spreadsheet/` implementations already use.

| Value | Canonical (here) | Also seen as | In | Disposition |
|---|---|---|---|---|
| Accent (Finance) | `#C4644A` | `#6F8174` (sage) | `products/001-*/product-spec.json` `style` / `designSystem` | **Stale.** The spec's own `metadata.designDirectionNote` says the sage direction is superseded but "intentionally NOT reflected here" pending visual approval. Reconcile when #001's visual redesign is approved through the Human Review Gate — not before, and not by this branch. |
| Accent (Finance) | `#C4644A` | `#B5633F` | `products/001-*/test/DESIGN_SYSTEM.md` | Prototype value from the single hand-authored page. Superseded by the LUMIUMX value; the prototype's *method* (kicker motif, no boxes, scale-not-colour hierarchy) is retained. |
| Primary ink | `#1F1F1F` | `#1A1A1A` / `#2B2521` | old `DESIGN_SPEC.md` / `test/DESIGN_SYSTEM.md` | Canonical `#1F1F1F` (LUMIUMX Ink). `#2B2521` was the prototype's "warmer charcoal" experiment. |
| Secondary ink | `#3A3A3A` | `#5C5C5C` / `#6E655C` / `#5C574E` | various | Canonical `#3A3A3A`. Marketing tokens' `subtleInk: #5C574E` is close enough to leave until the next marketing pass; not load-bearing. |
| Background | `#FAF7F2` | `#FFFFFF` / `#FAF8F4` / `#FFFEFB` | old specs / drift | Canonical `#FAF7F2` (Warm Ivory). Pure-white backgrounds are a template tell (`docs/design/COLOUR.md`). |

Nothing in this table is changed by the branch that introduced this file — it
records the target state so the reconciliation, when it happens, is a
one-line decision, not an archaeology exercise.

## Change control

- A change to a **canonical value** here must also update
  `lumiumx.tokens.json`, and be reflected back into
  `docs/LUMIUMX_ETSY_DESIGN_SYSTEM.md` in the same change.
- A new product **may not** introduce a second design system. It inherits this
  one and states, per override, why (`docs/design/ETSY_PRODUCT_DESIGN.md` §6).
