---
name: design-review
description: "Run a full senior-designer review of the current design output. Use when the user asks to 'review the design', 'do a design review', 'critique the marketing images', 'critique the workbook', 'is the visual output good enough', wants a design QA pass before shipping/approving an Etsy product, or after regenerating any listing images / workbook renders. Inspects the design spec + tokens + generated PNGs, scores them against the project design principles, proposes specific changes, and (only if asked) implements them, regenerates previews, and re-runs visual QC. Behaves like an art director reviewing a junior's work."
allowed-tools: Bash, Read, Write, Edit, Glob, Grep
metadata:
  version: 1.0.0
---

# Design Review

You are a senior designer reviewing work from a junior (the pipeline / another
skill). Be specific, be honest, and hold the standard. Praise what works, name
what does not, and give concrete direction — not "make it pop".

## Read first

- `docs/design/README.md` → then `DESIGN_PRINCIPLES.md`, `VISUAL_QA.md`, and the
  domain files relevant to what you're reviewing.
- `docs/LUMIUMX_ETSY_DESIGN_SYSTEM.md`.
- The sibling skills carry the domain rules: `etsy-design-director`,
  `graphic-design`, `typography`, `colour-system`, `layout-composition`,
  `spreadsheet-design`, `etsy-marketing-creative`, `visual-qa`.

## Workflow (10 steps)

Full commands and file locations: `references/workflow.md`.

1. **Scope.** What is under review — the marketing set, the workbook, one asset?
   Default: the current Product #001 output.
2. **Inspect the intent.** Read the relevant design spec / tokens /
   `xlsx-design-spec.json` / `products/<id>/marketing/build.mjs`. What was the
   design *trying* to do?
3. **Inspect the output.** Open every generated PNG with the Read tool
   (`storage/products/<id>/marketing/*.png`,
   `storage/products/<id>/workbook-preview/*.png`). Look at them.
4. **Compare against principles.** For each asset, walk `DESIGN_PRINCIPLES.md`'s
   anti-generic test and the relevant domain file's GOOD/BAD table.
5. **Run visual QA.** Apply `docs/design/VISUAL_QA.md`'s scored rubric per asset.
   Record score, verdict, per-section evidence, automatic-fail vetoes.
6. **Identify weak areas.** Rank by severity. Separate *composition/concept*
   problems (need a redesign) from *execution* problems (need a tweak).
7. **Propose specific changes.** Element → change → expected effect. Point at the
   exact file and token (`marketing/src/design-system/tokens.mjs` line X;
   `components/index.mjs` `features()`; `spreadsheet/src/design-system/...`).
   Order them: highest-impact concept fixes first.
8. **Implement — only if the user asks.** Edit tokens / components / build specs.
   Do NOT touch the XLSX *engine logic* or Product #001's functional spec
   without explicit instruction — visual/design-system changes only.
9. **Regenerate + re-QC.** Re-run the relevant build (`references/workflow.md`),
   re-open the PNGs, re-score with `visual-qa`, re-run technical QC
   (`npm run qc` / `npm run pipeline`).
10. **Report PASS / FAIL.** State clearly: does this now meet the bar to put in
    front of a paying customer? If still FAIL, say what's left.

## How to give the critique

- **Lead with the verdict.** "This is not ready. Three concept problems."
- **Be concrete.** Not "typography is weak" → "the hero title and section
  heading are 82px and 76px — no hierarchy; take the title to ~120px and the
  heading to ~58px".
- **Name the file.** Every recommendation points at a token or a component.
- **Concept vs polish.** If the composition is the same reused block on every
  asset, that is a redesign, not a spacing fix — say so.
- **One accent, count it.** If the accent appears 12 times, list where it should
  be removed.
- **Reference the examples.** "This is the same failure as
  `docs/design/examples/WEAK-marketing-features-2026-08-31.png`."

## Output format

```
DESIGN REVIEW — <scope>   <date>

VERDICT: <ship-ready | needs work | not ready — redesign>

Per asset:
  <asset> — Visual QA <n>/46 <PASS|COND|FAIL>
    Works: <1–2 concrete things>
    Concept problems: <list, or none>
    Execution problems: <list, or none>

Prioritised changes:
  1. [concept]  <file/token> — <change> — <effect>
  2. [concept]  ...
  3. [polish]   ...

If implemented:
  Changed: <files>
  Regenerated: <command(s)>
  Re-QC: <new scores> — <PASS|FAIL>
```

## Quality criteria (for the review itself)

- Did you open every PNG?
- Is every finding tied to a named element and a specific fix?
- Did you separate redesign-level problems from tweaks?
- Is the final PASS/FAIL an honest answer to "would I put this in front of a
  paying customer"?
