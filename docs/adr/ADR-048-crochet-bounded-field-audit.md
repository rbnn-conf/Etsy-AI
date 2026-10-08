# ADR-048: Crochet pattern bounded-field audit

- **Status:** Accepted (owner request, 2026-10-02).
- **Extends:** ADR-043 (lossless split), ADR-045 (plan count).

## Context

Paid crochet-pattern calls kept failing on one bound at a time:

- `finishing[]`, then step text, then the plan count;
- now `abbreviations[].meaning` longer than 80.

Every limit was already in the schema description sent to the model
(`strictSchema` writes "Maximum N characters." into each field). The model
still overshot, so wording alone cannot remove these failures.

## Decision

Every bound is read from `automation/schemas/crochet-pattern.schema.json`
(`fieldLimits`). The schema limits are unchanged.

| Field | Max | Class | Over the limit |
|---|---|---|---|
| finishing[] | 300 | A, split | split at sentence, clause, then word boundaries; every word kept |
| assembly[] | 400 | A, split | as above |
| notes[] | 300 | A, split | as above |
| abbreviations[].meaning | 80 | B, canonicalise | full wording moved verbatim into `notes` as "abbr: text"; the table keeps the fixed standard meaning (US/UK dictionary in `crochet-terms.mjs`) or "special stitch (full method in Notes)"; rejected if notes would exceed 5 items |
| category | 40 | B, canonicalise | the planned category (owner-approved plan) |
| hook_size.us | 10 | B, canonicalise | the one unambiguous US hook code it contains, else rejected |
| stitches_used[] | 12 | B, canonicalise | the pattern's own abbreviation when the item equals one of its meanings, else rejected |
| finished_size | 80 | C/D, prompt only | rejected |
| gauge | 200 | C/D | rejected |
| yarn[].description, colour, amount | 80, 40, 40 | C/D | rejected |
| additional_materials[] | 80 | C/D | rejected (splitting at commas could change a material) |
| abbreviations[].abbr | 12 | D | rejected |
| instructions[].heading | 60 | B, positional (ADR-049) | `Section N`; the steps beneath unchanged |
| instructions[].steps[].label | 16 | B, positional (ADR-049) | `Step N` (position in its section); step text never touched |
| instructions[].steps[].text | 600 | C/D | rejected (never split) |

- **Item counts** (yarn 1–6, materials 1–10, stitches 1–20, abbreviations
  1–30, sections 1–8, steps 1–40, assembly ≤12, finishing 1–8, notes ≤5),
  hook mm (0.5–30) and stitch_count (1–2000) are prompt-constrained and
  hard-fail.
- **Difficulty** is now a one-value enum in the model schema (`patternSchemaFor`).
  Strict mode enforces enums, so the "difficulty X, planned Y" failure
  cannot happen.
- **The request** ends with a LENGTH AND COUNT LIMITS block generated from
  the schema (`patternLimitsBlock`). The prompt no longer hardcodes numbers,
  and gives concrete abbreviation-meaning guidance.

## Consequences

- C/D fields can still fail a paid call. That is by design: rewriting them
  could change crochet meaning.
- Moved meanings add notes. The production PDF shows the full method under
  Notes instead of in the abbreviations table.
