# ADR-049: Crochet section headings and step labels are repairable

- **Status:** Accepted (owner request, 2026-10-02).
- **Amends:** ADR-048 (bounded-field audit).

## Context

#016 failed a paid pattern call on `instructions[0].steps[1..3].label`
longer than 16 ("Work second petal layer"). ADR-048 had classed step labels
and section headings as hard-fail. They are presentation and navigation
metadata: the crochet instruction is held in `steps[].text`.

## Decision

`normalizePatternDraft` (`automation/src/openai/crochet.mjs`) repairs both
before schema validation, which still decides:

- `instructions[i].heading` longer than 60 becomes `Section i+1`.
- `instructions[i].steps[j].label` longer than 16 becomes `Step j+1`
  (1-based within its section).
- Values within the limit (and null labels) are unchanged.
- `steps[].text` and `stitch_count` are never touched. Nothing is truncated or
  rewritten semantically. The original wording is recorded in the change log
  (`from`/`to`), which goes into the pattern log line.
- The prompt says that labels name the round/row and that over-long ones
  are replaced, so the model keeps them short.

Limits are unchanged (heading 60, label 16).

## Alternatives considered

- Truncate: forbidden (it cuts words).
- Derive a label from the text ("Rnd 3"): semantic guessing; rejected.
- Move the wording into the text: changes the instruction; rejected.

## Consequences

- Neither field can fail a paid call on length any more.
- A replaced heading loses its descriptive wording in the PDF. Fingerprints
  that read headings (petal layers, leaves, stem, centre) then fall back to
  the text or stay unknown; they never become wrong.
- Fields still hard-fail by design: step text, gauge, finished_size, yarn
  fields, materials items, `abbr`, and unmappable hook/stitch values.
