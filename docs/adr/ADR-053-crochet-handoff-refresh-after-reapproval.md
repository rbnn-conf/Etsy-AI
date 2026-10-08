# ADR-053: Refresh a crochet production handoff after pattern re-approval

- **Status:** Accepted (owner request, 2026-10-02).
- **Amends:** ADR-024 (immutable handoff), ADR-052 (approved-source correction).

## Context

After the ADR-052 text correction, #016 failed with "Approved content changed
since handoff: crochet/patterns.json".

- **#016's actual state:** the patterns had not been re-approved. The
  approval, the visual specs and the handoff were all still at the old
  checksum (`a6747971…`); only the file was new (`4ef6040a…`). Production was
  retried twice instead, so refusing was correct.
- **The real gap:** after a legitimate re-approval, `writeHandoff` would still
  have failed. It re-verified the OLD handoff's pattern sources before
  noticing that a newer approval had superseded it, so a fresh handoff was
  never written.
- **Misleading copy:** the Retry button was offered, although a retry could
  only fail again. The `/produce` pre-check reported "Run Restyle", which is
  paid, for what is a free re-approval.

## Decision

- **One authoritative checksum:** `product.crochet.approval.source_sha256`.
  The handoff (`crochet.source`, `content_sources`) and the visual specs
  (`patterns_sha256`, with `rebinds`) are snapshots derived from it; nothing
  else is stored.
- **`writeHandoff` refreshes a superseded handoff.** A crochet handoff counts
  as superseded when the product's current approval differs from the
  approval the handoff was built from. When that is found before a build
  starts (CREATIVE_APPROVED, or PRODUCTION_READY on a retry):
  - its pattern sources are not re-checked against the old approval;
  - approved artwork and the specification are still verified against it;
  - it is archived (`production/handoff.vNN.json`);
  - a fresh handoff is built by `createHandoff` from the current approval,
    with every check: approved SHA equals `patterns.json`, the validator,
    and the visual gate.

  Build outputs follow their own input checks; a new handoff SHA rebuilds
  them, free.
- **APPROVE PATTERNS after an edit:** once the visual specs are re-bound,
  any existing handoff is refreshed immediately, so the owner never meets a
  stale state. A retry also refreshes.
- **Telegram:**
  - An edited source that has not been re-approved shows "❌ #… patterns
    changed after approval" and points to "Re-validate edited patterns.json
    (free)". This applies to both a production failure and the `/produce`
    pre-check, never "Run Restyle", and Retry is hidden.
  - The (should-never-happen) stale state reads "❌ #… production state is
    stale … Refresh production state and retry. No paid call is required."

## Still refused

- An edit without re-approval, at every state.
- A forged approval checksum.
- Stale visual specs, and fingerprint-changing edits (which need a Restyle).
- Changed approved artwork or specification.
- Any change during a run in progress.
- Non-crochet handoffs are unchanged.
