# ADR-004: n8n as the Orchestration Layer

> **RETIRED by [ADR-069](ADR-069-repository-cleanup.md) (2026-10-08).** n8n was never connected to the running system; the Telegram bot (`automation/`, ADR-023) orchestrates every stage.

## Context

The eventual product-generation pipeline (research → Claude → design →
PDF render → QA → assets → listing → Etsy — see `ARCHITECTURE.md`
FUTURE section) needs an orchestration layer to connect steps,
schedule work, and call external APIs, without hand-rolling a custom
job runner.

## Decision

Use n8n (self-hosted, via Docker) as the orchestration/automation
layer for future pipeline stages. In this phase, n8n is only stood up
and connected to PostgreSQL — no production workflows exist yet.

## Alternatives considered

- **Custom orchestration code (Python/Node scripts + cron)**: full
  control, but reinvents scheduling, retries, credential storage, and
  a visual audit trail that n8n already provides. Rejected as
  unnecessary build-it-yourself work for a solo/small-team project.
- **Airflow / Temporal**: built for much higher orchestration
  complexity and operational overhead than a handful of sequential
  product-generation steps need. Rejected as premature complexity.
- **Zapier / Make (hosted)**: no self-hosting, credentials live with a
  third party, ongoing subscription cost, less control over execution
  environment. Rejected in favor of self-hosted n8n.

## Consequences

- n8n's built-in credential store becomes the place API keys
  (Anthropic, OpenAI, Notion, Telegram, Etsy — future) are entered,
  not `.env` files consumed by custom code (see `SECURITY.md`).
- Workflow logic is portable (JSON) and version-controlled (see
  `n8n/README.md`), but credentials are not — they're re-entered per
  environment.
- Pipeline logic becomes visual/declarative rather than pure code,
  which is a deliberate tradeoff: faster iteration, less flexibility
  than raw code for very complex logic.
