# ADR-061: Specification canvas contract follows the format rules

- **Status:** Accepted (owner request, 2026-10-06).
- **Extends:** ADR-041 (crochet in Stage 1), ADR-045 (per-request model
  schema), ADR-043 (lossless normalisation).

## Context

#020 (Concept A, "Falling Leaves Crochet Table Set") failed at the
specification with `$.canvas.edge: crochet-pattern-bundle requires
safe-margin, got full-bleed`.

ADR-041 added `crochet-pattern-bundle: {edge: ['safe-margin']}` to
`FORMAT_CANVAS` (`automation/src/orchestrator/canvas.mjs`). The rest of the
contract was not updated:

- **Schema sent to the model.** `specification.schema.json` offers
  `edge: safe-margin | full-bleed` for every format. Its description named
  only colouring books and cards.
- **System prompt.** The `canvas` rules in `product-specification.md` listed
  books, planners, cards and invitations, but not crochet.

#020's direction is "editorial fibre-craft product photography". With both
values offered, the model chose full-bleed, and `canvasProblems` rejected
it. Colouring books, activity books, planners and worksheets had the same
gap, and so did `orientation`, which must equal the concept's.

## Decision

- **Model schema.** `specificationSchemaFor(schema, format, orientation)`
  narrows `canvas.background`, `canvas.edge` and `canvas.orientation` to the
  values `FORMAT_CANVAS` and the chosen concept allow. OpenAI strict mode
  enforces enums, so a forbidden value is never offered. If narrowing would
  leave an enum empty, the field is left as it is.
- **Normalisation.** `normaliseCanvas(format, data)` runs before validation.
  If a format allows exactly one `edge`, it sets that edge and records the
  change. Edge is a print-layout property fixed by the format.
  `background` is not repaired, because a coloured colouring page is an
  artwork-content error and is still rejected.
- **Prompt and schema description.** Both state the crochet safe-margin
  rule.
- **Validation is unchanged.** It still uses the committed schema and
  `canvasProblems`.

## Alternatives considered

- **Accept full-bleed for crochet.** Rejected. The artwork sits inside a
  printable pattern document.
- **Prompt-only fix.** Rejected. The model could still choose the value.
- **Normalise every fixed field, including background.** Rejected. That
  would silently repaint content errors.

## Consequences

A model offered only allowed values cannot fail `canvasProblems`. A test
checks this for every format in `PAGE_RULES`, so a future `FORMAT_CANVAS`
rule cannot drift from the contract again. #020 can Retry from
`specification`.
