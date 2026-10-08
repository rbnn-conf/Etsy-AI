# ADR-006: Secrets Management

## Context

This project will eventually hold credentials for Etsy, Anthropic,
OpenAI, Telegram, Notion, and the database. A commercial pipeline that
leaks any of these is a serious incident, not an inconvenience. A
clear, boring, enforced secrets strategy needs to exist before any
real credential is ever created.

## Decision

- All secrets live in a single git-ignored `.env` file on the
  developer's machine (or an equivalent environment-injection
  mechanism in production — not yet built).
- `.env.example` documents variable *names* only, never real or
  fake-looking values.
- Docker Compose reads `.env` and injects values into container
  environments; containers never hard-code credentials.
- n8n-specific credentials (future third-party API keys used *inside*
  workflows) are entered directly into n8n's own encrypted credential
  store, not passed through `.env` — see ADR-004.
- `tests/verify-foundation.sh` checks for tracked secret-shaped files
  on every run as a backstop, not a substitute for the above.

## Alternatives considered

- **A secrets manager (Vault, AWS Secrets Manager, 1Password CLI,
  etc.)**: the right answer at production scale, but pure overhead for
  a single-developer local setup with two services. Rejected for this
  phase — revisit when moving to a real production deployment (see
  `ROADMAP.md` Phase 5+ and `SECURITY.md` rotation notes).
- **Secrets committed encrypted in Git (git-crypt, SOPS)**: adds
  tooling complexity this phase doesn't need yet; `.env` + `.gitignore`
  is simpler and sufficient while there's one developer and one
  environment.

## Consequences

- Losing the local `.env` file means re-entering credentials — no
  recovery path from Git (by design; see `SECURITY.md` "GitHub is not
  a backup for secrets").
- Every new required variable must be added to `.env.example` (name
  only) in the same change that introduces it, or the foundation check
  in `tests/verify-foundation.sh` will start failing for anyone who
  pulls the change.
- Rotation procedure is documented in `SECURITY.md` and must be
  followed manually until an automated secrets manager is justified.
