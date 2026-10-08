# ADR-024: Stage 2 deterministic production

Status: **Accepted** (owner request, 2026-09-27). Extends ADR-023. ADR-013
(no runtime LLM in production) applies in full.

## Context

Stage 1 (`automation/`, ADR-023) ends at `CREATIVE_APPROVED`, with approved
proof artwork and a page specification in `product.json`. Product #009 is
the first to get there. The owner now wants those approved designs turned
into customer-ready files. Stage 1 must not be re-run, and no image model may
redraw the artwork.

## Decision

- Add a new deterministic package, `production/` (`@dpf/production`).
  - It reads the approved Stage 1 files and writes customer files under
    `products/<id>/production/`.
  - It has no model client, no network code and no dependency of its own: it
    reuses Product #004's sharp, pdf-lib and fflate and primitives, and
    Product #003's pdf.js renderer, as #005 and #007 already do.
  - It never imports `automation/`, and a test enforces this.
- The **handoff** (`production/handoff.json`) is a small, immutable manifest.
  - It records the approved concept and proof attempt, each approved artwork
    file by path and SHA-256, the page roles, the exact text asked for in the
    specification, and references to the specification and creative
    direction.
  - Every run re-verifies it: a changed original or specification stops
    production.
- **Adapters** plan production per `product_format`. `greeting-card` is the
  first; other formats fail with a clear "no adapter yet" message.
- **Build** is resumable and deterministic.
  - Each output is recorded in `production/build-record.json` with its hash
    and source hashes.
  - Reruns skip outputs that are already correct.
  - Fixed PDF and ZIP metadata mean identical inputs produce identical bytes.
- **QC** (`production/qc-report.json`) re-checks everything from disk and
  renders every PDF page.
  - Only a pass reaches the owner.
  - A failure parks the product in FAILED and deletes nothing.
- **Coordination** stays in the Stage 1 Telegram bot, which owns
  `product.json` state:
  - Flow: `/produce <id>` → `PRODUCTION_READY` → `PRODUCTION_BUILDING` →
    `PRODUCTION_QC` → `AWAITING_PRODUCTION_APPROVAL`, then APPROVE PRODUCTION
    → `PRODUCTION_APPROVED` (terminal).
  - REBUILD rebuilds everything.
  - CANCEL returns the product to `CREATIVE_APPROVED`.
  - A creatively approved product can no longer be rejected.
- Stage 2 stops at `PRODUCTION_APPROVED`. Listing, marketing and Etsy are
  Stage 3.

## Alternatives considered

- **Put production inside `automation/`.** That would mix deterministic
  manufacturing into the package that holds the OpenAI client. Rejected; the
  bot only coordinates.
- **Use the ADR-013 `services/` pipeline.** It is built around design specs
  and review bots for hand-built products, not Stage 1 handoffs. Rejected for
  now; the reuse happens at the primitive level.
- **Regenerate artwork at print size.** That breaks "the approved artwork is
  the source of truth" and costs money. Rejected: originals are embedded or
  delivered as they are, with effective resolution reported honestly.

## Consequences

- Stage 1 artwork is 1024x1536 px. It prints at about 200–260 ppi at card
  size, not 300; QC reports the real figure.
- Lettering is baked into the Stage 1 artwork. Production cannot correct it;
  the review lists the exact expected text for the owner to check. A future
  option is text-safe artwork plus deterministic typography.
- Stage 2 depends on Products #003 and #004 having their `node_modules`
  installed, as #005 and #007 already do.

## Amendment (2026-09-27): assets and card variants

Product #009's approved "Christmas Wishes" image, specified as the card back,
is actually a second card front. Production therefore separates approved
creative assets (every proof image) from customer-facing roles:

- The greeting-card adapter produces **card variants**: front, inside, and a
  back that is either approved or a deterministic minimal back.
- Variants come from the specification by default, or from an owner-authored,
  strictly validated `production-plan.json`.
- There is no product-specific code. #009's decision (option B: two designs
  sharing one inside, minimal backs) lives in
  `products/009-christmas-greetings-card/production-plan.json`.
