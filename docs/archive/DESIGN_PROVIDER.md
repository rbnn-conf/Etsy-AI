# DesignProvider Architecture

The seam that decouples product generation from *how* a design is
produced. Code: `services/src/design/` (ADR-007).

Status legend: **IMPLEMENTED** · **PLANNED** · **BLOCKED/PENDING**.

## Why

The project will eventually produce designs two ways: its own HTML/CSS →
PDF renderer (prototyped under `products/<id>/test/`) and — once
approved — Canva templates. The product-generation layer must not care
which. It codes against one interface; a factory picks the concrete
provider.

```
        Market Research
              ▼
        ProductSpec                (renderer/provider-agnostic)
              ▼
   ┌──────────────────────┐
   │   DesignProvider     │       generate() → DesignResult → export() → ProductFile[]
   └──────────┬───────────┘
        ┌─────┴─────┐
        ▼           ▼
 LocalRenderer   CanvaProvider
 (usable:        (BLOCKED:
  metadata)       unavailable)
              ▼
     storage/products/{id}/{source,preview,final}
              ▼
       Etsy Listing (later phase)
```

## The contract — IMPLEMENTED

`DesignProvider` (`design/design-provider.ts`):

| Member | Purpose |
|---|---|
| `id` | stable provider id (`"local-renderer"`, `"canva"`) |
| `isConfigured()` / `unavailableReason()` | cheap availability check; never throws |
| `listTemplates(family?)` / `getTemplate(id)` | template discovery + `TemplateMetadata` |
| `buildFieldMapping(spec, templateId)` | map a `ProductSpec` → flat `FieldMapping` (provider-neutral field keys) |
| `generate(request)` | start/produce a design → `DesignResult` (has `GenerationStatus`) |
| `getStatus(designId)` / `getResult(designId)` | for async providers (e.g. Canva export polling) |
| `export(request)` | `DesignResult` + formats → `ProductFile[]` |

`ProductFile` carries **either** `bytes` **or** a `sourceUrl`. A provider
that only returns a temporary URL sets `sourceUrl`; the storage layer is
responsible for fetching and persisting it — **final files must live in
our storage, never as a permanent dependency on a third-party temp URL.**

Errors: `DesignProviderUnavailableError` (selected but not configured),
`DesignProviderNotImplementedError` (contract member not built yet).

The generation layer imports `services/src/design/index.ts` only. It must
**not** import `design/providers/*`; use `createDesignProvider(id)` /
`createDefaultDesignProvider()`.

## ProductSpec — IMPLEMENTED

`design/product-spec.ts`. A renderer- and Canva-agnostic description:
`productType` (closed set), `niche`, `targetCustomer`, `description`,
`pageSizes[]` (mm), `pageCount`, optional `pages[]` (opaque `sections`
tree — the existing `DESIGN_SPEC.md` YAML slots straight in), `style`
(typography, hex palette) plus opaque `designSystem` (the full
machine-readable design system), `templateFamily` / `templateVersion`
(a *family* string, not a template id), `requiredAssets[]`,
`exportFormats[]`, `status`, free-form `metadata`.

`validateProductSpec(input)` returns every issue (semver, kebab slug,
safe `productId`, known `productType`, finite/ranged dimensions,
`pages.length === pageCount`, page `order` exactly `1..pageCount`, hex
colors, and a recursive **provider-specific-key denylist**).
`assertValidProductSpec(input)` throws `ProductSpecValidationError`
carrying the issue list.

**Persistence** (ADR-008): `ProductRepository` (over a `SqlExecutor`
port) validates then writes to the `products` / `product_versions` /
`design_specs` / `pages` tables (migrations 0002–0005). The
product-generation layer imports `ProductRepository` from
`services/src/design/index.ts` and never writes SQL itself. Full detail:
`docs/PRODUCT_MODEL.md`.

## LocalRendererProvider

| Part | Status |
|---|---|
| `listTemplates` / `getTemplate` / `buildFieldMapping` | **IMPLEMENTED** (pure metadata; one built-in `local:generic-printable-v1` template mirroring the Product #001 design-system constraints) |
| `generate` / `export` / `getStatus` / `getResult` | **PLANNED** — throw `DesignProviderNotImplementedError` |

Wiring the actual render (the Playwright HTML→PDF harness under
`products/<id>/test/`, A4/Letter variants, font embedding) is a **later
phase**. Per the current task's constraints, **that renderer must not be
redesigned or replaced** — this provider will call into it, not reinvent
it.

## CanvaDesignProvider — BLOCKED / PENDING

Canva API access is **not granted** (application submitted, pending). The
class implements `DesignProvider` so types and the factory compile, but:

- `isConfigured()` → `false` (requires OAuth client credentials **and**
  at least one granted scope — none exist).
- Every operation throws `DesignProviderUnavailableError` with
  `CANVA_UNAVAILABLE_REASON`.
- It **invents no Canva endpoints, makes no network calls, and does not
  assume Autofill/Connect is available.**

### What is needed before writing the real Canva provider

Do not implement any of this until each item is verified against Canva's
**current** API docs (<https://www.canva.dev/docs/connect/>) and our
**granted** scopes:

| Needed | For |
|---|---|
| Canva OAuth client id + secret, redirect URI | auth (new `CANVA_*` env vars — names only in `.env.example` at that time) |
| The **approved** scope list (e.g. `design:content:read`, `design:content:write`, asset upload, export) | knowing which operations are even permitted |
| Real **brand template / template IDs** | `listTemplates` / template selection |
| **Autofill dataset field definitions** per template | `buildFieldMapping` (maps our neutral field keys → Canva dataset field names *inside the provider*, never leaked to the contract) |
| Autofill **job model** (create job → poll status → design id) | `generate` / `getStatus` |
| **Export** API: supported formats, sync vs async, output URL lifetime | `export` |
| Asset/image **upload** flow | product previews / images |
| Rate limits & error shapes | a Canva error taxonomy parallel to `EtsyError` |

Until then the plug-in point is: `createDesignProvider("canva")` returns
the boundary object; the factory does **not** silently fall back.

## Generated-product storage — IMPLEMENTED

`design/product-storage.ts`. Predictable layout under the already
git-ignored `storage/`:

```
storage/products/{productId}/
  source/     provider-native source (render HTML, Canva export payloads)
  preview/    watermarked / low-res review copies
  final/      print-ready deliverables (what goes to Etsy)
  design-result.json   metadata for the latest generation run
```

Path building is pure and validates `productId` / filenames against
path-traversal. `ensureProductLayout`, `persistFile`, `persistDesignResult`
do the (thin) I/O. `storageRoot` defaults to `<repo>/storage`, overridable.

## Testing

`node --test`, no network: contract completeness for both providers,
Canva-unavailable behaviour, `ProductSpec` validation, storage path
generation + traversal rejection. See `services/test/`.
