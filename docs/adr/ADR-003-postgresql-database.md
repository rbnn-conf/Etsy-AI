# ADR-003: PostgreSQL as the Database

> **RETIRED by [ADR-069](ADR-069-repository-cleanup.md) (2026-10-08).** No code ever connected to PostgreSQL; the database, migrations and scripts were removed. State lives in `products/` and `automation/state/`.

## Context

Both n8n's internal state and the future application schema (products,
assets, listings, etc. — see `ROADMAP.md` Phase 1) need a relational
database. n8n natively supports PostgreSQL as a first-class backend.

## Decision

Run a single PostgreSQL 16 instance (official `postgres:16-alpine`
image), with n8n and the future application sharing one logical
database (the value of `POSTGRES_DB`). No application tables exist
yet — only the migration-tracking table required by the migration
mechanism itself (see `database/migrations/README.md`).

## Alternatives considered

- **Separate databases for n8n vs. application** (better long-term
  isolation): rejected for now as unnecessary complexity — there is no
  application schema yet to collide with n8n's tables, and this is
  easy to split later (a single migration + Compose change) once the
  application schema actually exists.
- **SQLite for n8n**: simpler for a single-user toy setup, but doesn't
  match where this is headed (concurrent workflow executions, future
  server deployment) and n8n's SQLite mode is explicitly not
  recommended for anything beyond quick testing.
- **MySQL**: no meaningful advantage here; PostgreSQL has better JSON
  support, which the future product-spec schema will likely want.

## Consequences

- One set of credentials (`POSTGRES_USER`/`POSTGRES_PASSWORD`) governs
  both n8n's data and future application data in this phase.
- If/when the application schema grows large or needs independent
  scaling/backup cadence from n8n, revisit this ADR and split into two
  databases (or two instances).
- Postgres is bound to `127.0.0.1` only, never exposed to the LAN (see
  `SECURITY.md`).
