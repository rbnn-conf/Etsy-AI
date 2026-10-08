# `design/` — LumiumX design canon

The brand canon, token library and curated market references that the design
skills (`.claude/skills/`) and the owner's design reviews work from.
`docs/design/` is the craft knowledge base (typography, colour, layout,
listing-image craft, the rendered-pixel QA rubric); `design/` is the canon and
references layer on top of it.

Product visuals themselves are produced by the pipeline: Stage 1 artwork
(owner-approved), Stage 2 deterministic documents (`production/`) and Stage 3
listing images (`marketing/src/stage3/`).

## Layout

| Path | What |
|---|---|
| `design/brand/LUMIUMX_DESIGN_SYSTEM.md` | canonical consolidation of the design system + resolved value conflicts |
| `design/brand/lumiumx.tokens.json` | the machine-readable canonical token library |
| `design/brand/ANTI_PATTERNS.md` | named failure modes the design system rules out |
| `design/brand/VISUAL_QA.md` | the 12-criterion 0–10 design scorecard (human rubric) |
| `design/tokens/` | base tokens and five colour themes (the sage-green theme is the source of Product #006's palette, ADR-020) |
| `design/references/reference-00{1,2,3}/` | curated Etsy market references — category design-language analysis |

The `DESIGN_SPEC` / `MARKETING_DESIGN_SPEC` schemas and their validator served
the Product #001 `design:pipeline` and were retired with it in ADR-069
(kept in the archived original repository; decision context in ADR-012/ADR-013).
