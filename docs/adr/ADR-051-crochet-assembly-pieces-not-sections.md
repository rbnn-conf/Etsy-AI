# ADR-051: Crochet assembly follows pieces, not sections

- **Status:** Accepted (owner request, 2026-10-02).
- **Amends:** ADR-040 (validator), ADR-041 (`fromModelPattern`).

## Context

#016 pattern 17, Lavender Sprig, failed with "assembly: required (2 pieces
are made)". Its plan says `assembly_required: false`, and its buds are worked
directly onto the covered stem: one piece, two instruction sections.

There were two causes:

- The validator counted every instruction section as a piece.
- `fromModelPattern` copied the plan's `assembly_required` only when it was
  `true`, so the plan's `false` never reached the source.

## Decision

`production/src/crochet/bundle.mjs` decides whether assembly is required. It
reads only the first step of each section, and only explicit wording:

- **`assembly_required: true`:** always required.
- **`assembly_required: false`:** required only when the pattern clearly makes
  detached pieces (`detachedPieces`). That means either:
  - two or more sections that each start new work (foundation chain, magic
    ring or slip knot) without joining existing work; or
  - a "make N" section with N of 2 or more, as in "Petals (make 6)".
    "Make 6 sc in a MR" is a stitch count, not a piece count.
- **Not declared:** required when there are several sections, unless every
  later section clearly continues the work (`continuesWork`). Continuing means
  it starts with join/rejoin, "attach … yarn", "working into/along/around …",
  "continue", "do not fasten off", or "pick up".

The new rules never require assembly where the old rule did not, so a
previously valid pattern cannot newly fail. The validator still never writes
assembly text.

`fromModelPattern` now records the plan's `assembly_required` whether it is
true or false, for new drafts. Saved drafts are never edited.

## Consequences

- #016's unchanged `patterns.json` validates 33/33. Lavender Sprig passes
  because its buds section starts by joining yarn into the stem.
- A truly multi-piece pattern without assembly still fails, even when its plan
  says false.
