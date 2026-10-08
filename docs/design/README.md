# Design knowledge base

The permanent design knowledge for the Faceless Etsy product factory. The
`.claude/skills/*` design skills are the *operating instructions*; these files
are the *reference material* they point into.

> **See also `design/` (repo root)** — the design-*intelligence* layer added
> in ADR-013: the deterministic design-config contracts (ADR-013), the versioned
> `DESIGN_SPEC` / `MARKETING_DESIGN_SPEC` / `CREATIVE_BRIEF` JSON schemas, the
> curated market-reference library, and `design/brand/` (the canonical
> consolidation of *this* knowledge base + a machine-readable token library).
> `docs/design/` stays the craft/method layer; `design/` is direction +
> contracts + references on top of it. `design/README.md` maps the two.

Read order for a design task:

1. **`../LUMIUMX_ETSY_DESIGN_SYSTEM.md`** — the brand. Non-negotiable. Palette,
   typography, the "Avoid" list, the 6-image Etsy listing sequence, the brand
   consistency rules. Everything else serves this.
2. **`ETSY_PRODUCT_DESIGN.md`** — for a NEW product / repositioning: the
   market→customer→positioning→identity chain, the DESIGN DIRECTION template,
   the product-archetype → art-direction library, category conventions, the
   8-slot listing sequence. Produce a DESIGN DIRECTION before building.
3. `DESIGN_PRINCIPLES.md` — how we decide. The anti-generic checklist.
4. The domain file for the task: `TYPOGRAPHY.md`, `COLOUR.md`, `LAYOUT.md`,
   `SPREADSHEET_UX.md`, `ETSY_MARKETING.md`.
5. `VISUAL_QA.md` — the rubric every rendered PNG must pass before it counts as
   done. A technically valid image can still FAIL.
6. `examples/EXAMPLES.md` — annotated GOOD vs WEAK, with real project renders.

## The one-line brief

> **Premium editorial stationery brand meets modern digital productivity tools.**
> Minimal + Warm + Editorial + Functional + Premium.
> **Not** Colourful + Cluttered + Generic + Over-designed.

## What "generic AI design" looks like here (reject on sight)

- The same block repeated down the page: `heading → card → card → card → footer`.
- One accent colour sprinkled on every component (every badge, tick, icon box).
- Icon glyphs (`▸ ∑ ▾ ★`) sitting in tinted rounded squares.
- A fake browser chrome / "device frame" with three coloured dots around a screenshot.
- A big heading at the top, then a large dead vertical gap, then centred content.
- Equal-weight everything — no single focal point, no size jump, no asymmetry.
- Body copy that is a raw spec sentence with awkward mid-word line breaks.
- Pastel-on-white cards with soft drop shadows everywhere (Canva default).

See `examples/EXAMPLES.md` for these failures in the project's own output.

## Design skills that use this base

| Skill | Reads |
|---|---|
| `etsy-product-design` | `ETSY_PRODUCT_DESIGN`, `../LUMIUMX_ETSY_DESIGN_SYSTEM.md`, `DESIGN_PRINCIPLES` — the upstream skill; produces the prose DESIGN DIRECTION |
| `etsy-design-director` | all of it — it owns the standard |
| `graphic-design` | `DESIGN_PRINCIPLES`, `LAYOUT` |
| `typography` | `TYPOGRAPHY` |
| `colour-system` | `COLOUR` |
| `layout-composition` | `LAYOUT` |
| `spreadsheet-design` | `SPREADSHEET_UX`, `TYPOGRAPHY`, `COLOUR` |
| `etsy-marketing-creative` | `ETSY_MARKETING`, `LAYOUT`, `../LUMIUMX_ETSY_DESIGN_SYSTEM.md` |
| `visual-qa` | `VISUAL_QA`, `DESIGN_PRINCIPLES` |
| `design-review` | all of it, as a workflow |
