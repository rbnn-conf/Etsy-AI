# Annotated examples — GOOD vs WEAK

Real renders from this project. Look at the images while reading the notes — the
point is visual decision rules, not theory. WEAK captures are dated; regenerate
the current output and compare.

| File | Verdict | What it is |
|---|---|---|
| `GOOD-editorial-finance-prototype.png` | **GOOD** | Hand-authored "Premium Editorial Finance" Monthly Overview (`products/001-*/test/`) — the target register |
| `GOOD-grayscale-safe-hierarchy.png` | **GOOD** | A row from the same prototype, greyscale — hierarchy survives without colour |
| `WEAK-marketing-hero-2026-08-31.png` | WEAK | `@dpf/marketing` hero asset as of 2026-08-31 |
| `WEAK-marketing-features-2026-08-31.png` | WEAK | Same run, "features" asset |
| `WEAK-workbook-sheet-2026-08-31.png` | WEAK | `@dpf/spreadsheet` Income Tracker sheet render, same date |

---

## GOOD — `GOOD-editorial-finance-prototype.png`

Why it works, element by element:

- **Kicker motif.** `■ MINIMALIST MONTHLY BUDGET PLANNER` — a small terracotta
  square + tracked UPPERCASE Inter. The same motif repeats at `■ PRIORITY THIS
  MONTH`. The eye learns it once. (`DESIGN_PRINCIPLES.md` §2, `TYPOGRAPHY.md`
  "label system".)
- **One serif voice.** "Monthly Overview" and "Leftover" are Spectral; every
  label is Inter. You can name the register from the face alone. (§3.)
- **Accent is scarce.** Terracotta appears ~4 times: the kicker square (×2), the
  short rule under the title, the heavier rule above "Leftover". Nowhere on the
  Income/Expenses/Savings items. That scarcity is what makes it read as
  intentional. (`COLOUR.md` "using the accent".)
- **No boxes.** Structure is hairline rules + whitespace. Income / Expenses /
  Savings are separated by thin vertical rules, not bordered cards. Reads as a
  statement, not a form. (§5.)
- **Hierarchy from scale + weight + space.** "Leftover" is bigger serif, has a
  heavier rule above it and far more room around it than the three ledger
  items — so it is obviously the bottom line. Remove colour (see the greyscale
  file) and the hierarchy is identical. (§4.)
- **Deliberate whitespace.** The generous gaps under "Leftover" and around
  "Notes" are writing space with intent — not a layout accident.
- **Ink on ivory.** No tinted fills anywhere. Warmth comes from the charcoal ink
  hue and the type. (§1.)

---

## WEAK — `WEAK-marketing-hero-2026-08-31.png`

Right ingredients, wrong cooking. Fails `VISUAL_QA.md` A1, A3, D2.

| Problem | Rule broken | Fix |
|---|---|---|
| Mockup sits in a **fake browser frame** — grey bar, three coloured dots | `LAYOUT.md` anti-patterns; `ETSY_MARKETING.md` framing | Frame the sheet as stationery: thin `#E6E1D9` border, one soft directional shadow, slight tilt, no chrome |
| Hero is **overloaded** — subtitle (a pasted 40-word spec sentence with " - without an app" mid-line), a 3-badge row, a stats row, a brand line | `DESIGN_PRINCIPLES.md` §6; `ETSY_MARKETING.md` "01 Hero" | Hero has ONE job: recognition. Title + `Plan · Track · Review` + `A4 + US Letter · 8 Pages` + mockup. Move badges/stats to `03 benefits` |
| **Sage** accent on a Finance product; also used on every badge dot + the stat glyphs | `COLOUR.md` D1, D2, D5 | Terracotta `#C4644A`, used once (a rule under the title) |
| Big serif title is flush-left with **no tracking treatment**, and the ivory is barely warm (`#FAF8F4` not `#FAF7F2`) | `TYPOGRAPHY.md` tracking; `COLOUR.md` D1 | `-0.01em` tracking on the title; LUMIUMX hexes verbatim |
| No brand DNA — remove the words and it is a generic AI hero | `DESIGN_PRINCIPLES.md` §8 | Add the `LX —` monogram bottom-corner; commit to the kicker motif |

---

## WEAK — `WEAK-marketing-features-2026-08-31.png`

The cookie-cutter the brief calls out. Fails A1, A3, B1, D2.

- **Six identical cards in a 3×2 grid**, each: grey rounded square + a `▸` glyph
  + a bold label + grey caption. This is `heading → card → card → card`.
  (`LAYOUT.md` anti-patterns.)
- **Icon-in-rounded-square ×6** — the single strongest "AI template" tell.
  (`VISUAL_QA.md` A3.)
- **No focal point** — every card is equal weight; the eye has nowhere to land.
  (B2.)
- Redundant with the "inside" asset (also a 6-up grid).
- **Fix:** replace with `ETSY_MARKETING.md` `02 what's inside` — an editorial
  **numbered index** (`01 Monthly Overview … 06 Month-End Review`), hairline
  between rows, real cropped thumbnails on the right. Drop the icons entirely.

---

## WEAK — `WEAK-workbook-sheet-2026-08-31.png`

Fails `SPREADSHEET_UX.md` §2, §3; `COLOUR.md` D2.

- **Solid Sage bar** across the full width for the section heading — the accent
  as wallpaper. Every sheet in the workbook has one. (§3.)
- Sage on a **Finance** product (should be Terracotta), and used as a large fill
  (should be one hairline).
- **Every sheet has the same composition** — title → accent bar → table → total.
  The Overview "dashboard" looks structurally identical to this ledger.
  (§2 — the dashboard should be a KPI *statement*, not a table.)
- Table itself is close to right (hairline rows, TOTAL rule) — the chrome around
  it is the problem.
- **Fix:** section heading = tracked UPPERCASE Inter 600 + a single hairline
  rule; accent (terracotta) once per sheet; give each sheet-kind its own layout
  per the table in `SPREADSHEET_UX.md` §2.

---

## The one comparison to remember

**Generic AI spreadsheet render:** coloured section bars, four competing cell
fills, an icon or a badge for everything, identical layout on every sheet, a
browser-frame mockup, a 6-up card grid for "features". Looks free.

**Premium Etsy spreadsheet render:** ivory + charcoal, structure from hairline
rules and space, ONE accent mark per sheet/asset, each sheet composed for its
job, real cropped previews framed as stationery, an editorial index instead of a
card grid. Looks like something you'd pay for.
