# ADR-057: APPROVE PRODUCTION only for a package built with the live design

- **Status:** Accepted (owner request, 2026-10-06).
- **Amends:** ADR-024 (Stage 2 review), ADR-056 (Moonlit Meadow rollout).

## Context

After the live crochet design moved to Moonlit v2, #016's package awaiting
approval was still the classic v1 build. APPROVE PRODUCTION checked only the
product state, so it could have approved the outdated package.

## Decision

- **Every adapter declares its design.** Each Stage 2 adapter has a `design`
  id and a `designName`:
  - crochet: `classic` / Classic (v1) and `moonlit` / Moonlit (v2);
  - greeting card and colouring book: `standard` / Standard.
- **The build records it.** `build-record.json` `adapter` holds `{format,
  design, design_name, version}`. A change of design or version starts a
  clean build. The handoff is unchanged.
- **Approval compares it** (`production/src/package-design.mjs`,
  `packageDesignCheck`). APPROVE PRODUCTION reads the recorded metadata and
  compares format, design and version with the live adapter for the product's
  own format. Nothing is inferred from file names.
  - **Refused:** any difference, missing or malformed metadata, or a format
    with no live adapter.
  - **The package is untouched:** nothing is modified or rebuilt
    automatically.
- **Telegram:** "❌ Production package is outdated", then what the package was
  built with, the current design, and "Rebuild production before approving".
  The buttons are 🏭 Rebuild (the existing free rebuild) and Back.
  - **Legacy packages:** a package built before metadata was recorded is named
    from its recorded format and version (#016's reads "Classic v1"). This is
    display only, and it is still refused.

## Alternatives considered

- **Compare file names or page counts:** rejected; not authoritative.
- **Store the design in the handoff:** rejected. The handoff is the approved
  content contract; the design belongs to the build.

## Consequences

- **Future upgrades:** they need no new guard. A version bump makes every
  older package unapprovable until it is rebuilt.
- **Existing approvals:** products already approved are unaffected. The check
  runs only at the moment of approval.
