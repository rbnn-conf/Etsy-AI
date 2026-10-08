# ADR-056: Moonlit Meadow document design for crochet pattern bundles

- **Status:** Accepted. The owner approved the prototype direction on
  2026-10-05 and the full #016 scratch render on 2026-10-06. The live
  registry now uses `crochetPatternBundleMoonlit` (v2).
- **Amends:** ADR-041 (crochet document templates), ADR-024 (Stage 2 adapters).

## Context

The Stage 2 crochet PDFs were correct but utilitarian. The owner approved a
premium editorial direction, "Moonlit Meadow", from a prototype (cover,
index, Garden Rose, materials), with three final adjustments:

- instruction lines of about 82–88 characters;
- an accurate cover descriptor;
- a fix for "1.5 mm (US US 8 steel)".

Presentation only: pattern generation, wording, validation and QC are
unchanged.

## Decision

- **Design system:** `production/src/crochet/moonlit/` (theme, ornaments,
  components, templates, draw), described in
  `docs/design/CROCHET_MOONLIT_MEADOW.md`.
  - **Pagination:** `MoonlitFlow` extends the existing `Flow`, so wrapping,
    keep-together and line-boundary splits are unchanged.
  - **QC:** the existing text QC is reused unchanged.
  - **Documents:** the full set is covered: bundle, standalone index,
    materials and abbreviations, each pattern alone, and the guide.
- **Adapter variants:** `crochetAdapter({design})` builds
  `crochetPatternBundle` (classic, v1) and `crochetPatternBundleMoonlit`
  (moonlit, v2).
  - **Live registry:** `moonlit` since 2026-10-06 (`adapters/index.mjs`).
    `classic` stays available as `crochetPatternBundle`, and its tests pass it
    explicitly.
  - **Clean rebuilds:** the new version forces a clean build, so the two
    designs never mix in one package.
  - **Scratch builds:** `buildProduction` and `runQc` accept an `adapter`
    override of the same format, used by
    `production/scripts/moonlit-scratch-build.mjs`.
- **Reading measure: 130 mm** for instruction, assembly, finishing and notes
  text, on both papers. On #016 that is 84.8 characters per full line on
  average, against 95.6 at the previous full width. Text is wrapped at word
  boundaries only; the source is never hard-wrapped. Each paper paginates
  independently.
- **Cover descriptor:** "N crochet bouquet patterns • US terms". #016
  contains flowers, foliage, a stem, a wrap and a vase. "Flower & foliage"
  would misdescribe the last three; "bouquet" is true of all 33. This is PDF
  copy only, not Etsy listing wording.
- **Hook text:** one rule in `production/src/crochet/hook.mjs`. The approved
  US value is printed as written, and "US" is added only when the value does
  not already start with it. The classic and Moonlit documents, the
  materials QC and the Telegram pattern review all use it.
  - **The old bug:** three copies of a formula that always prefixed "US",
    including the QC itself, which therefore expected the doubled string.
- **Images:** approved handoff assets only, by asset id. The theme's display
  crops choose what a frame shows, so the proofs' baked-in lettering is not
  repeated; files are never altered.
  - **Recorded:** placements record the whole placed image (aspect checked)
    and its visible frame. The aspect QC reports display crops honestly.
  - **Pattern image:** an approved detail render whose visual spec depicts
    exactly one pattern becomes that pattern's image, captioned from its
    fingerprint's `motif_type`.
  - **Diagrams:** shown whole.

## Alternatives considered

- **Replace the classic templates in place:** rejected. A Rebuild of #016
  would have replaced its outputs before the owner reviewed the result.
- **Narrow the measure only on A4:** rejected. Both papers share one reading
  measure, and the page counts differ only by paper height.

## Consequences

- **More pages:** about 10% more instruction lines. The #016 complete
  bundle is 98 pages in A4 and 105 in US Letter, against 78 in the classic
  design.
- **More fonts:** Bodoni Moda and Spectral are embedded as well. The
  printable-character gate checks the approved text against these fonts too.
- **Existing classic packages:** a product built in the classic design keeps
  those files until a REBUILD. The new version starts a clean Moonlit build.
- **Approving an old package:** a classic package awaiting approval is
  refused (ADR-057) until it is rebuilt.
