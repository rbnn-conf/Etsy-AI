# ADR-008: ProductSpec formalisation + product database schema

> **RETIRED by [ADR-069](ADR-069-repository-cleanup.md) (2026-10-08).** The ProductSpec repository, SqlExecutor port and migrations 0002-0005 were removed; products are described by `products/<id>/product.json` (ADR-023).

## Context

ADR-007 added a `services/` tier with a provider-agnostic `ProductSpec`
type and a `DesignProvider` interface, but nothing persisted a
`ProductSpec` and the type had gaps versus the project's existing product
documentation (`products/001-…/PRODUCT_SPEC.md`, `DESIGN_SPEC.md`).

`database/migrations/README.md` already named `products`,
`product_versions`, `design_specs`, and `pages` as Phase-1 tables that
"will each arrive as their own numbered migration". `ROADMAP.md` Phase 1
asks for the product schema, a design-spec format, and a versioning
strategy.

The existing `ProductSpec` lacked: a product `description`, a home for the
rich `DESIGN_SPEC.md` `design_system:` block, a template version, and a
lifecycle `status`. Its `productType` accepted any string, but Phase 1
requires an unknown product type to be a validation failure. There is no
ORM, no DB client in `services/`, and no DB integration-test harness.

There is also an unresolved design conflict: `products/001-…/test/
DESIGN_SYSTEM.md` supersedes `DESIGN_SPEC.md` §2's visual direction but is
marked "pending human visual approval".

## Decision

**Extend `ProductSpec` additively** (all new fields optional, so nothing
breaks): `description`, `designSystem` (opaque holder for the full
machine-readable design system), `templateVersion`, `status`. **Close
`ProductType`** to `planner | printable | worksheet | tracker | template`.

**Strengthen `validateProductSpec`**: product-type allowlist,
`productId` safe-identifier shape, finite/ranged page dimensions,
page-`order` must be exactly `1..pageCount` (unique, no gaps) when `pages`
is a complete set, and a **recursive denylist** that rejects any
Canva/Figma/renderer-specific key anywhere in the tree. Validation stays
pure and is invoked before every write.

**Four migrations, `0002`–`0005`** (`products`, `product_versions`,
`design_specs`, `pages`) — plain numbered SQL per the existing
convention, `BIGINT GENERATED ALWAYS AS IDENTITY` PKs, natural UNIQUE
keys, FK `ON DELETE CASCADE`, CHECK constraints mirroring the validator,
and JSONB for `page_sizes` / `export_formats` / `design_system` /
`sections`.

**Storage model = document + projections.** `product_versions.spec` holds
the canonical ProductSpec JSON (authoritative on read); the flat columns
and `design_specs` / `pages` rows are write-through projections carrying
the relational constraints.

**Persistence boundary without new dependencies.** A `SqlExecutor` port
(`query(text, params)` + `withTransaction`) instead of bundling `pg`. A
pure `ProductSpecMapper` (spec ↔ records) is the unit-tested core; a
`ProductRepository(exec)` owns all SQL and validates before persisting.

**One real example.** `products/001-…/product-spec.json` — the Product
#001 spec reconciled from its markdown, following `DESIGN_SPEC.md` §2 as
canonical and recording (in `metadata`) that `DESIGN_SYSTEM.md` is a
pending-approval revision not reflected here.

**Tests** cover validation, mapping, and repository behaviour with a
recording fake `SqlExecutor`; live DB behaviour is a documented manual
procedure (`docs/PRODUCT_MODEL.md`), matching Phase 7's guidance not to
stand up an integration-test project yet.

## Alternatives considered

- **Pure relational (no `spec` blob)** — reconstructing a ProductSpec from
  normalised rows means every optional/opaque field (`metadata`,
  `requiredAssets`, `sections`) needs its own column or table. The blob +
  projections pattern is simpler and makes round-trips exact.
- **Add `pg` now + real integration tests** — violates ADR-007's
  zero-runtime-deps stance and Phase 7's "don't introduce a large testing
  infrastructure" instruction. The `SqlExecutor` port keeps the door open.
- **Introduce an ORM / query builder / migration framework** — the repo
  deliberately has none; nothing here needs one.
- **Expand `DesignStyle` to model the whole design system** — it is large,
  still evolving, and partly print-craft detail. Keeping `style` as a
  small typed summary and `designSystem` opaque avoids churn.
- **Keep `ProductType` open** (`string & {}`) — incompatible with the
  Phase-1 requirement that an invalid product type fails validation.

## Consequences

- `ProductSpec` consumers gain four optional fields; existing specs and
  the 46 prior tests are unaffected.
- The `productType` type is now closed — adding a product type is a
  one-line change in `PRODUCT_TYPES` **and** the
  `product_versions_product_type_known` CHECK constraint (kept in sync
  deliberately).
- Migrations `0002`–`0005` must be applied (`migrate.sh`) before any
  product persistence works. `schema_migrations` tracks them.
- A concrete `SqlExecutor` adapter and an automated DB integration job are
  still to come, when a worker or the pipeline first persists a spec.
- The `DESIGN_SPEC.md` vs `DESIGN_SYSTEM.md` visual conflict remains open
  and is now explicitly recorded in the fixture and `docs/PRODUCT_MODEL.md`.
