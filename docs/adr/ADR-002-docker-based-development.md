# ADR-002: Docker-Based Development

> **RETIRED by [ADR-069](ADR-069-repository-cleanup.md) (2026-10-08).** Docker Compose was removed: the running system is one Node.js process with file-based state and needs no containers.

## Context

The project needs a reproducible way to run PostgreSQL and n8n locally
that doesn't depend on what's installed on the developer's machine,
and that can plausibly move to a server later without a rewrite.

## Decision

Use Docker Compose to run all infrastructure services (`postgres`,
`n8n` in this phase). Services run on a private bridge network
(`dpf-internal`), with only the ports actually needed for local
development bound to `127.0.0.1`, never `0.0.0.0`.

## Alternatives considered

- **Native install (Postgres.app, n8n via npm)**: faster to start, but
  environment drifts between machines and doesn't mirror how this
  would eventually be deployed. Rejected for reproducibility.
- **Kubernetes / full orchestration**: far more than this phase (two
  services, one developer) needs. Rejected as premature complexity —
  see `CLAUDE.md` principle on not building for future scale early.

## Consequences

- Requires Docker Desktop (or equivalent) on any development machine.
- `docker-compose.yml` is the single source of truth for what
  infrastructure exists; nothing should be installed "by hand" outside
  it.
- Migrating to a production host later means translating this Compose
  file, not rewriting application assumptions.
