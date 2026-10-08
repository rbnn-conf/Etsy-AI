# ProductSpec + Product Database

The application-level, **provider-agnostic** representation of a product to
be produced, and how it persists. Introduced by **ADR-008** (builds on the
`services/` tier from ADR-007).

Status legend: **IMPLEMENTED** · **PLANNED** · **BLOCKED/PENDING**.

```
Product idea
   ↓
ProductSpec            services/src/design/product-spec.ts        (IMPLEMENTED)
   ↓
ProductRepository      services/src/design/product-repository.ts  (IMPLEMENTED, needs a SqlExecutor)
   ↓
PostgreSQL            products / product_versions / design_specs / pages   (migrations 0002–0005, IMPLEMENTED)
   ↓
DesignProvider        LocalRendererProvider | CanvaDesignProvider (see docs/DESIGN_PROVIDER.md)
```

## ProductSpec — what it represents

One typed object describing a product independently of *how* it will be
designed or rendered. Full field list in
`services/src/design/product-spec.ts`; summary:

| Group | Fields |
|---|---|
| Identity | `specVersion` (semver), `productId`, `slug`, `name` |
| Positioning | `productType` (closed set: planner/printable/worksheet/tracker/template), `niche`, `targetCustomer`, `description` |
| Pages | `pageCount`, `pageSizes[]` (`name` + `widthMm`/`heightMm`), `pages[]` (`id`, `title`, `order`, `purpose?`, `sections?`) |
| Design | `style` (typed summary: family, `typography`, hex `palette`), `designSystem` (opaque — the full machine-readable design system) |
| Production | `templateFamily`, `templateVersion`, `requiredAssets[]`, `exportFormats[]` |
| Lifecycle | `status` |
| Extension | `metadata` (provider-neutral escape hatch) |

### Why provider-agnostic (CRITICAL)

A ProductSpec **must never** contain Canva dataset field names, Canva/Figma
design or template IDs, Canva API request structures, or renderer
implementation details (`htmlPath`, `playwright`, `rendererOptions`, …).
Those live *inside* a `DesignProvider`. `validateProductSpec` enforces this
with a recursive key denylist — such a key **anywhere** in the object
(including `metadata`, `sections`, `designSystem`) is a validation failure.

`sections` and `designSystem` are typed `unknown` on purpose: the
`DESIGN_SPEC.md` YAML (per-page field/column definitions, `fit_check`,
`qa_rules`, the `design_system:` block) slots in verbatim without the
contract taking a dependency on its shape.

## Validation — IMPLEMENTED

`validateProductSpec(input): ValidationIssue[]` — pure, returns **every**
problem (never stops at the first). `assertValidProductSpec(input)` throws
`ProductSpecValidationError` (carrying `.issues`) when non-empty.

Checked: required non-empty strings; `specVersion` semver; `slug`
kebab-case; `productId` safe-identifier shape; `productType` ∈ the closed
set; `pageCount` positive integer; `pageSizes` non-empty with finite
dimensions in `(0, 2000]` mm; `exportFormats` non-empty string array;
`pages` (when a complete set) length `=== pageCount` with `order` values
**exactly `1..pageCount`, unique, no gaps**; hex `style.palette.*`;
`designSystem` an object; the provider-key denylist.

**Validation runs before persistence.** `ProductRepository.saveProductSpec`
calls `assertValidProductSpec` first — an invalid spec never reaches SQL
(not even `BEGIN`).

## Database — IMPLEMENTED (migrations 0002–0005)

Plain numbered SQL, applied by `infrastructure/scripts/migrate.sh` (see
`database/migrations/README.md`). No ORM.

```
products                     product identity (one row per product concept)
  id            BIGINT IDENTITY PK
  product_key   TEXT UNIQUE      <- ProductSpec.productId
  slug          TEXT UNIQUE
  created_at / updated_at

product_versions             one versioned ProductSpec snapshot
  id                BIGINT IDENTITY PK
  product_id        BIGINT FK -> products(id) ON DELETE CASCADE
  spec_version      TEXT            <- ProductSpec.specVersion (semver CHECK)
  name, product_type, niche, target_customer, description
  page_count        INTEGER  (CHECK >= 1)
  page_sizes        JSONB    (CHECK array)
  export_formats    JSONB    (CHECK non-empty array)
  template_family, template_version
  status            TEXT     DEFAULT 'draft'
  spec              JSONB    (CHECK object)  <- full canonical ProductSpec, authoritative on read
  created_at / updated_at
  UNIQUE (product_id, spec_version)
  INDEX (product_id), INDEX (status)

design_specs                 the design system for one version (1:1)
  id                   BIGINT IDENTITY PK
  product_version_id   BIGINT UNIQUE FK -> product_versions(id) ON DELETE CASCADE
  style_name, typography JSONB, palette JSONB, design_system JSONB
  created_at / updated_at

pages                        one row per page of a version
  id                   BIGINT IDENTITY PK
  product_version_id   BIGINT FK -> product_versions(id) ON DELETE CASCADE
  page_key             TEXT            <- ProductSpec page id as text
  title, purpose
  page_order           INTEGER (CHECK >= 1)
  sections             JSONB           <- opaque per-page content tree
  created_at / updated_at
  UNIQUE (product_version_id, page_order)
  UNIQUE (product_version_id, page_key)
  INDEX (product_version_id)
```

### Relationships

```
products 1───* product_versions 1───1 design_specs
                       │
                       1
                       │
                       *
                     pages
```

Delete a `products` row → its versions, their design specs, and all their
pages cascade away.

### Storage model: document + projections

`product_versions.spec` holds the **canonical** ProductSpec JSON and is
authoritative on read. The flat `product_versions` columns plus the
`design_specs` and `pages` rows are **write-through projections** that
exist to carry real relational constraints (FKs, uniqueness, page
ordering) and to make the data queryable in SQL.
`assertRecordsConsistent()` checks the projections still agree with the
blob.

## Persistence boundary — IMPLEMENTED

- `product-spec-mapper.ts` — **pure** `productSpecToRecords` /
  `recordsToProductSpec` / `recordsFromRows` / `assertRecordsConsistent`.
  No I/O. This is the unit-tested core.
- `db/sql-executor.ts` — the `SqlExecutor` **port** (`query(text, params)`)
  + `withTransaction`. `services/` ships no Postgres driver (ADR-007 —
  zero runtime deps); a caller supplies a concrete adapter (e.g. wrapping
  `pg`) when live persistence is wired.
- `product-repository.ts` — `ProductRepository(exec)` with
  `saveProductSpec` (validate → upsert product → insert version → insert
  design spec → insert one row per page, all in one transaction),
  `loadProductSpec`, `loadRecords`, `listProducts`, `listVersions`,
  `deleteProduct`. All SQL lives here; the generation logic never writes
  SQL.

## Example — IMPLEMENTED

`products/001-minimalist-monthly-budget-planner/product-spec.json` — the
real Product #001 spec (8 pages, A4 + US Letter, full `designSystem`,
per-page `sections` with pre-printed content), reconciled from that
product's `PRODUCT_SPEC.md` + `DESIGN_SPEC.md`. It validates with zero
issues and maps to 1 product + 1 version + 1 design spec + 8 page rows
(covered by `services/test/product-spec-fixture.test.ts`).

**Design-direction note:** `DESIGN_SPEC.md` §2 (Minimalist Finance /
Editorial, sage `#6F8174`, Inter only) is canonical for this fixture.
`products/001-…/test/DESIGN_SYSTEM.md` is a **later, page-scoped visual
revision** (Spectral + Inter, terracotta `#B5633F`) marked *pending human
visual approval* and is intentionally **not** reflected in the spec. That
conflict is the owner's to resolve, not this phase's.

## Testing — IMPLEMENTED

`node --test`, no database:

| File | Covers |
|---|---|
| `product-spec.test.ts` | all validation rules incl. Phase-1 additions (product type, identifiers, ordering contiguity, dimensions, provider-key denylist, new optional fields) |
| `product-spec-mapper.test.ts` | spec ↔ records split, defaults, round-trip, JSON-column parsing, consistency assertion |
| `product-repository.test.ts` | validation-before-persistence (0 SQL on invalid), transaction ordering, per-page inserts, duplicate-version → `ProductVersionExistsError` + `ROLLBACK`, load reconstruction |
| `product-spec-fixture.test.ts` | the Product #001 JSON validates, has 8 pages/design system/content, maps to the expected rows, is consumable by a `DesignProvider` |

Live database behaviour (real FK cascade, CHECK/UNIQUE enforcement,
migration apply) is **manual** — see below.

## Manual database verification — PLANNED to run by the operator

Requires Docker running.

```bash
# 1. bring up Postgres + apply all migrations (0001–0005)
cp .env.example .env        # if not already done; fill in values
docker compose up -d
./infrastructure/scripts/migrate.sh
# expect: apply: 0002_create_products.sql ... 0005_create_pages.sql
#         Migrations up to date.

# 2. confirm the tables + constraints exist
source .env
docker compose exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\dt"
docker compose exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\d+ product_versions"
docker compose exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\d+ pages"

# 3. re-run migrate.sh — every migration should report "skip ... already applied"

# 4. (optional) spot-check the constraints reject bad data:
docker compose exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<'SQL'
BEGIN;
INSERT INTO products (product_key, slug) VALUES ('001', 'minimalist-monthly-budget-planner');
-- bad product_type -> should raise: violates check constraint
INSERT INTO product_versions (product_id, spec_version, name, product_type, niche,
  target_customer, page_count, page_sizes, export_formats, spec)
VALUES ((SELECT id FROM products WHERE product_key='001'), '1.0.0', 'x', 'ebook',
  'n', 't', 1, '[]'::jsonb, '["pdf"]'::jsonb, '{}'::jsonb);
ROLLBACK;
SQL
```

Wiring a concrete `SqlExecutor` (a `pg` adapter) and an automated
integration-test job is deferred until a worker / the pipeline actually
persists specs.
