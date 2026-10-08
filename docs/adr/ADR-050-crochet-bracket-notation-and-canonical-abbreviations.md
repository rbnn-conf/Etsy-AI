# ADR-050: Crochet bracket notation and canonical missing abbreviations

- **Status:** Accepted (owner request, 2026-10-02).
- **Amends:** ADR-040 (validator), ADR-048 (`crochet-terms.mjs`).

## Context

#016's review failed 5 of 33 patterns with 11 errors. Re-reading them showed
that 10 were validator false positives:

- 9 × "placeholder text": the placeholder rule rejected every `[...]`.
  Square brackets are standard crochet notation for a repeated or grouped
  stitch sequence, for example `[Sc in next st, inc in next st] rep 6 times`.
- 1 × `abbreviation "dec" … not defined`: "dec" appeared only inside the
  pattern's own defined abbreviation "hdc dec". The validator tokenised it as
  "hdc" + "dec".

The 11th, Lavender Sprig's "assembly required (2 pieces are made)", comes from
the separate rule that counts sections as pieces. It is out of scope here.

## Decision

Production validator (`production/src/crochet/bundle.mjs`):

- **Placeholders.** The bare-word rule is unchanged (TODO, TBD, TBC, lorem
  ipsum, "placeholder", "fill me in", "instructions go here", filler lines).
- **Brackets** are checked per group, nested groups included
  (`isPlaceholderText`). A group is crochet when it contains:
  - a standard abbreviation, or a word of one of the pattern's own defined
    abbreviations (e.g. "puff");
  - and no editorial marker (here, TBD, TODO, placeholder, lorem, fill in,
    as needed, description, pattern text, xxx, etc).

  Anything else is still a placeholder: `[insert instructions here]`, `[TBD]`,
  `[add stitch count]`, `[pattern text]`.
- **Multi-word abbreviations.** A defined multi-word abbreviation ("hdc dec")
  counts as one abbreviation (`usedAbbreviations`). A bare "dec" elsewhere
  still has to be defined. The terminology check still sees the words inside
  it.
- The validator still never repairs anything.

Stage 1 assembly (`automation/src/orchestrator/crochet.mjs`,
`completeCanonicalAbbreviations`):

- When AI drafts are assembled into `crochet/patterns.json`, a standard
  abbreviation that is used in the instructions but missing from the table gets
  its fixed meaning in the brief's terminology (`crochet-terms.mjs`).
- `inc` and `dec` were added there as "increase" and "decrease" (the Craft
  Yarn Council meanings; the method stays the pattern's own).
- Pattern-defined or unknown stitches (puff, bobble, fpdc, custom) are never
  defined by code, so validation still fails for them.
- The draft files are never modified; a complete draft passes through as the
  same object. Owner-authored sources (Re-validate) are never completed.

## Alternatives considered

- Drop the bracket rule: it would let real template brackets through.
- Define "dec" for #016: not needed, because it was not an undefined use.

## Consequences

- The free 🔄 Re-validate now passes 32 of #016's 33 patterns. No pattern
  was changed and no model call was made.
- A bracket containing only plain English ("[Fasten off, weave in ends]") is
  still rejected; write it without brackets.
