# ADR-007: Etsy Integration Layer + DesignProvider Abstraction (and a TypeScript services/ tier)

> **PARTLY RETIRED by [ADR-069](ADR-069-repository-cleanup.md) (2026-10-08).** The Etsy integration (`services/src/etsy`) is live and used by Stage 4. The DesignProvider/Canva abstraction (`services/src/design`) was removed.

## Context

The Etsy API application has been approved. The Canva API application is
submitted but **pending**. We want the pipeline to eventually: have AI
generate a product specification, have Canva (later) produce
template-based designs, and publish to Etsy — without coupling the rest
of the system to Canva or to any single renderer.

Three problems had to be solved together:

1. **No application language existed.** Phase 0 is bash + SQL + Markdown;
   the only JavaScript is a throwaway Playwright harness under
   `products/<id>/test/` explicitly marked "not part of the production
   pipeline". A typed Etsy client and a provider interface need a real
   language.
2. **Roadmap ordering.** `ROADMAP.md` places Etsy integration at Phase 5
   and product-spec/design at Phases 1–2. This work builds *foundations*
   for both now, ahead of that order, at the owner's explicit request.
3. **Canva is not available.** Anything we build for design generation
   must not assume Canva endpoints, scopes, or Autofill.

## Decision

**Introduce a `services/` tier in TypeScript on Node (≥ 22.6, native
type-stripping, no build step, zero runtime dependencies).** Chosen over
Python (no existing foothold) and over "bash + Markdown contracts only"
(cannot express a typed provider abstraction or unit tests). It aligns
with the existing Node/Playwright harness and the future `workers/`
intent.

**`services/src/etsy/` is the sole Etsy choke point.** The pipeline
imports `IEtsyService` (an interface); nothing else builds an Etsy HTTP
request. Implemented now: config loading, an HTTP client (retries,
full-jitter backoff, `Retry-After`, client-side rate limiting, a typed
`EtsyError` taxonomy), the full OAuth 2.0 + PKCE flow, token persistence,
and four read calls that prove connectivity (`ping`,
`getAuthenticatedUser`, `getShop`, `getMyShop`). Every write/upload/
taxonomy endpoint exists on the interface and throws
`EtsyNotImplementedError` — not a stub that pretends to succeed.

**`services/src/design/` defines a provider-agnostic `DesignProvider`
interface, a `ProductSpec` contract + validator, a
`LocalRendererProvider` (metadata implemented; `generate`/`export`
deferred — the existing renderer is **not** redesigned), a
`CanvaDesignProvider` boundary that reports itself unavailable, and a
predictable `storage/products/{id}/{source,preview,final}` layout.** The
generation layer imports only `design/index.ts`; providers are selected
via a factory, never imported directly.

**Secrets** follow ADR-006: new `ETSY_OAUTH_*` variable *names* added to
`.env.example` in this change; access/refresh tokens are runtime state in
a git-ignored token file (`FileTokenStore`), never in `.env` or git.

**Roadmap** is updated (`ROADMAP.md`, `ARCHITECTURE.md`) to record this
as a foundation phase taken ahead of the original numbering, rather than
letting the docs drift.

## Alternatives considered

- **Python services tier** — no existing Python in the repo; deferred
  unless later AI-generation work makes it the natural choice.
- **Bash scripts + Markdown "interface" docs only** — matches Phase 0
  conventions but cannot deliver a typed `DesignProvider` contract or the
  Phase-9 unit tests the task requires.
- **Build the Etsy write path now** — rejected; explicitly out of scope.
  "Prove connectivity, define the rest as interfaces" (CLAUDE.md: don't
  build ahead of need).
- **A real Canva provider with placeholder endpoints** — rejected;
  fabricating Canva API behaviour is explicitly forbidden and would be
  wrong once real scopes are known.
- **Add a bundler / ts-node / build step** — unnecessary on Node 22.6+;
  keeps "boring infrastructure".

## Consequences

- A Node toolchain now exists for `services/` (`DEVELOPMENT.md` updated).
  `npm install` there pulls dev-only deps (`typescript`, `@types/node`).
- `tests/verify-foundation.sh` is unchanged and still passes (it checks a
  fixed POSTGRES/N8N variable list). `services/` has its own
  `npm test` (`node --test`, no network).
- The Canva provider will need its own ADR-sized note when approval
  lands (new `CANVA_*` env vars, granted scopes, template/dataset IDs,
  export model) — captured as a checklist in `docs/DESIGN_PROVIDER.md`.
- Wiring `LocalRendererProvider.generate()` to the real renderer is a
  follow-up phase and must preserve that renderer as-is.
- Two Etsy credentials now coexist: the read-only research keystring and
  the OAuth-backed shop integration. `SECURITY.md` / `docs/ETSY_INTEGRATION.md`
  spell out the distinction.
