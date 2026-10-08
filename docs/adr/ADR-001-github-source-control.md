# ADR-001: GitHub as Source Control

## Context

The project needs a version control system and a place to host it that
supports private repositories, branch protection, and standard PR
review workflows, and that the developer already has tooling for
(`gh` CLI, authenticated).

## Decision

Use Git for version control and GitHub (private repository) as the
remote. `main` is the stable branch; work happens on
`feature/<name>`, `fix/<name>`, `chore/<name>` branches merged via PR.

## Alternatives considered

- **GitLab / Bitbucket**: comparable feature set, but no existing
  authenticated tooling in this environment; would add setup friction
  with no offsetting benefit.
- **No remote (local-only Git)**: rejected — no off-machine backup of
  source, no PR review surface, no CI hook point for later phases.

## Consequences

- GitHub becomes the source of truth for code, configuration,
  migrations, workflows, and scripts (see ADR-005 for the Notion
  split).
- Requires `gh auth login` to be maintained on any machine that pushes.
- Secrets must never reach GitHub — enforced by `.gitignore` and the
  checks in `tests/verify-foundation.sh` (see ADR-006).
