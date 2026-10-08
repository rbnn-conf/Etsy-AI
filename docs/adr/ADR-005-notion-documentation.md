# ADR-005: Notion for Human-Readable Documentation

> **Note ([ADR-069](ADR-069-repository-cleanup.md), 2026-10-08):** Notion was never connected. `NOTION_SETUP.md` moved to `docs/archive/`; GitHub remains the source of truth.

## Context

Technical documentation (code, config, migrations, ADRs) belongs in
Git alongside what it describes. But project status, runbooks,
onboarding, and roadmap tracking benefit from a more human-friendly,
navigable surface that non-technical stakeholders (or a future
non-engineer collaborator) can read without cloning a repo.

## Decision

GitHub is the source of truth for code and infrastructure. Notion is
the human-readable project documentation and operations layer —
architecture explanations, decisions, runbooks, project status,
roadmap, onboarding. Notion does not duplicate source files; it links
to and explains them. See `NOTION_SETUP.md` for the concrete
integration plan.

## Alternatives considered

- **Everything in GitHub (README/wiki only)**: keeps a single source
  of truth, but GitHub wikis/READMEs are a poor fit for the
  operational, frequently-skimmed content (status, runbooks) this
  project will accumulate. Rejected — doesn't match how the project
  owner actually wants to work.
- **Everything in Notion, including code/config**: rejected outright —
  code and config need real version control, diffs, and CI hook
  points that Notion doesn't provide.

## Consequences

- Two systems must stay conceptually separate: GitHub = what/how
  (implementation), Notion = why/status (operating system). Docs that
  drift between the two need periodic reconciliation — a manual
  process in this phase (see `NOTION_SETUP.md`), automatable later via
  n8n once the integration exists.
- Notion integration is not yet authenticated in this environment;
  `NOTION_SETUP.md` documents exactly what's needed to connect it.
