# ADR-065: The hero chosen in the comparison is the hero the campaign produces

- **Status:** Accepted (owner request, 2026-10-07). Implemented and tested with fake models only.
- **Scope:** Stage 3, every format and engine. It builds on ADR-064 without changing it.

## Context

The hero comparison shows one candidate per engine. Choosing an engine saved only `engine_chosen {by, at}`.
Nothing linked the choice to the candidate the owner saw.

- **Colouring books** (`#planCreative`): the full campaign ignored the comparison. It asked the model for a new
  hero direction and repainted the hero backplate into the same file path. That paid twice and overwrote the
  approved asset.
- **Region-template engines** (greeting cards): they already reused the comparison's direction and backplate.
  Nothing locked them, though.

With ADR-064's route contracts, Product #022's AI Creative hero would have turned into an editorial set. The owner
had approved a warm lifestyle candidate.

## Decision

1. **Selection.** Choosing an engine whose comparison candidate exists stores `engine_chosen.approved_hero`: the
   SHA-256 of the image, the backplate and the direction, plus its route. The comparison entry stays the single
   source of truth (`automation/src/stage3/approved-hero.mjs`).
2. **Consumption.** The plan for an approved engine takes the approved direction verbatim (`source:
   approved-comparison`). It also takes the approved campaign (palette, light and concept, which style every other
   card and the coloured example) and the exact paid backplate.
   - Factory reuses its approved scene.
   - Colouring creative plans rebuild the hero card around the approved composition (`approvedHeroSlide`).
   - Region-template engines keep their existing reuse.
3. **Lock.** `plan.approved_hero.locked` holds:
   - the composition, focal page, text zone, background, scene brief and archetype;
   - the route's major dimensions;
   - the backplate file and its SHA-256.

   Before any paid image, `#assertApprovedHero` checks the plan against the lock and checks that the backplate on disk
   is byte-identical. A violation fails with `ApprovalIntegrityError`: not retryable, nothing generated, and the
   owner must reselect. Headline, support line, crop, supporting pages, spacing and render size may still adapt.
4. **Owner changes.** When the owner deliberately regenerates the hero's scene or direction in review, the approval is
   marked `superseded` (who, when, what). That is a new owner decision, not drift.
5. **Legacy approvals** (no `approved_hero`). The candidate counts as approved only when the comparison was shown
   BEFORE the choice (`comparison.at <= engine_chosen.at`). It is honoured exactly as stored, with no route invented.
   A new-style approval whose candidate changed afterwards is refused, never replaced.

## Alternatives considered

- **Re-deriving the hero from the route contract.** Rejected: that is the mismatch itself.
- **A pixel-identical final hero.** Rejected: the comparison approves the art direction, not the final render.
- **Copying the approved direction into a second record.** Rejected: it creates two sources of truth. The approval
  references the comparison entry by SHA-256 instead.

## Consequences

- No hero backplate is paid for twice. The hero's estimate in the cost line drops by one image.
- A colouring hero approved as the transformation spread (`cb-lifestyle-hero`) shows its labelled coloured example
  in the final render. The comparison could not show it because the example did not exist yet; it is made once, in
  the full campaign.
- **#022** is a legacy approval (chosen 4.5 min after the comparison). Its full campaign keeps the approved
  `cb-lifestyle-hero` direction, its campaign concept and its paid backplate.
