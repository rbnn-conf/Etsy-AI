# Moonlit Meadow: crochet document design system

**Status:** live (ADR-056). The owner approved the direction on 2026-10-05
and the full #016 scratch render on 2026-10-06.

- **Live design:** `production/src/adapters/index.mjs` registers
  `crochetPatternBundleMoonlit` (v2) for `crochet-pattern-bundle`.
- **Classic:** the classic design (v1, `crochetPatternBundle`) stays
  available but is not registered.
- **Existing classic packages:** a product built in the classic design needs a
  REBUILD. Version 2 starts a clean build; don't approve a classic package.
- **Unchanged:** nothing here changes pattern generation, wording, validation
  or QC.

## What it is

A premium editorial theme for crochet pattern PDFs, implemented as a design
system under `production/src/crochet/moonlit/`, for A4 and US Letter. It
covers the full Stage 2 document set:

- **Bundle:** cover, welcome, pattern index, materials & tools,
  abbreviations, every pattern, combinations and the back page.
- **Standalone:** the index, materials and abbreviations.
- **Individual:** each pattern as its own PDF.
- **Guide:** the START-HERE guide (A4).

The fixed generic sentences are the classic templates' wording, word for
word.

| Module | Role |
|---|---|
| `theme.mjs` | Design as data: palette roles, type roles, geometry, page tints, fonts, the theme object (brand, cover wording, asset overrides) |
| `ornaments.mjs` | Reusable vector assets (moon, corner, sprig, leaf, flower, yarn, hook, scissors, ruler, dot), stored once; `ornamentSvg()` exports any of them as SVG |
| `components.mjs` | MoonlitFlow (MoonlitPage), MoonlitHeader, MoonlitFooter, TitleBlock, MoonlitSection, ImageFrame, InfoCard, AbbreviationTable, InstructionSection, InstructionRow, NumberedList, TipsCard, PatternIndexRow, MaterialsCard |
| `templates.mjs` | Composition only: `cover`, `index`, `pattern`, `materials` |
| `draw.mjs` | pdf-lib drawing: real text with letter-spacing, clipped image frames, vectors, rounded cards |
| `index.mjs` | `layoutMoonlit()` and `moonlitLayoutProblems()` |
| `production/scripts/moonlit-preview.mjs` | Prototype previews from a real product, read-only, written to `--out` |
| `production/scripts/moonlit-scratch-build.mjs` | Full scratch build: copies a product's sources to `--out`, then runs the real Stage 2 build and QC with the Moonlit adapter, previews and contact sheets |
| `adapters/crochet-pattern-bundle.mjs` | `crochetAdapter({design})`, `moonlitSlots(h)` (approved assets by id, theme crops) |

## Typography and colour

- **Typefaces:** Bodoni Moda for display (high contrast), Spectral SemiBold
  for section headings and Spectral Italic for subtitles. Source Sans 3 sets
  instructions (10.5/15.5 pt, humanist, very legible) and the small caps
  labels.
- **Brand difference:** this is the owner's Moonlit Meadow direction, not the
  LumiumX listing-image house style of Spectral and Inter.
- **Palette roles:** ivory dominates; rose marks labels, badges and numerals;
  gold is used for hairlines and the moon only; sage draws botanicals and
  icons.
- **Instruction pages stay white** (light on ink); the reference pages are
  ivory.
- **Reading measure:** 130 mm for instructions, assembly, finishing and notes,
  on both papers. That is about 85 characters per line (84.8 on average on
  #016; owner target 82–88). Lines wrap at word boundaries only.
- **Letter-spacing stays at or below about 0.09 em.** Wider spacing makes PDF
  readers extract "C O N T E N T S", which breaks copy, search and screen
  readers. Positioned-text QC catches this.

## Text integrity

- **Same pagination, wrapping and tagging:** `MoonlitFlow` extends the
  existing `Flow`. Text wraps at word boundaries only, a step moves whole when
  it fits and splits only at line boundaries, and every approved field keeps
  its `src` tag.
- **QC reused unchanged:** `sourceTextProblems`, `instructionBoundsProblems`
  and `renderedTextProblems` (`text-qc.mjs`). On top of those, every text op
  must sit inside its box and the page, and every glyph must be printable in
  the font that draws it.
- **Cover title:** the bundle title is split, never reworded. The part matching
  the theme brand becomes the wordmark, set in capitals; the rest is the
  subtitle.
- **Notes & tips** come only from the approved `notes`. A pattern without
  notes gets no card.
- **Materials values** are computed from the approved patterns and shown
  verbatim. Near-duplicate source strings are not merged.

## Image slots

All slots are optional and receive file paths only. Stage 2 never generates
images.

- **The slots:** `bundleHeroImage`, `materialsLifestyleImage`, and per
  pattern `patternHeroImage` and `finishedResultImage`.
- **Display crop:** each slot may set `crop` (fractions of the source). It only
  chooses what the frame shows through a clip; the file is never altered.
- **Empty slots:** an empty slot is omitted and its space goes to the text
  column.

## Owner decisions applied (2026-10-05)

- **Cover descriptor:** "33 crochet bouquet patterns • US terms". This is
  accurate for flowers, foliage, the stem, the wrap and the vase. PDF copy
  only.
- **Hook text:** one rule in `production/src/crochet/hook.mjs`, shared by
  every document, the materials QC and the Telegram pattern review. The
  approved US value is printed as written, so "1.5 mm (US 8 steel)" never
  reads "US US".
- **Reading measure:** 130 mm, as above.

## Images in the adapter

`moonlitSlots(h)` reads the handoff's approved assets by id:

- **Cover hero:** `crochet_layout.hero`.
- **Welcome overview:** `overview`.
- **Back page:** `motif`.
- **Pattern artwork:** owner-mapped `patterns`.
- **Pattern image from the detail render:** when the approved detail visual
  spec depicts exactly one pattern, its render becomes that pattern's image,
  captioned "Illustration of the finished <motif_type>" from the fingerprint.
- **Diagrams:** shown whole (`fit: contain`).

The theme's display crops (`MOONLIT_MEADOW.crops`) keep the proofs'
baked-in lettering out of the frames. Placements record the whole placed
image and its visible frame.
