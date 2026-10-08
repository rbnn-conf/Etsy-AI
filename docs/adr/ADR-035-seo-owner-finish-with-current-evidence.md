# ADR-035: Owner action FINISH_WITH_CURRENT_EVIDENCE

- **Status:** Accepted (owner request, 2026-09-29). Branch `feature/seo-discovery-engine`.
- **Extends:** ADR-034 (research expansion), which is not changed. The opportunity
  formula (ADR-032) is not changed.

## Context

Research expansion can recommend more searches than the owner wants to make.
Before this change, the only ways to close a pending round were to capture every
requested term or to mark it unavailable. Marking a term unavailable says "Etsy
had no data", which is false when the owner simply chose to stop.

## Decision

- **New owner action:** `FINISH_WITH_CURRENT_EVIDENCE`. It is available as
  `finishWithCurrentEvidence` and as `npm --prefix seo run research -- finish --dir <ws> [--by <name>] [--note <text>]`.
- **Where it's recorded:** on the latest round, as `owner_finished`: the action, who
  decided, when, a note, and `terms_not_researched`.
- **The latest round's outstanding requested terms become `owner_stopped`.** That
  means requested, NOT researched, unknown. They are not marked unavailable or
  rejected, and they get no metrics.
- **Captured observations are untouched,** including any requested term that was
  captured before the stop. Related-term table figures stay discovery metadata.
- **After the stop:**
  - no further expansion round can be created;
  - the round's status is `owner_stopped`;
  - `EXPANSION_RECOMMENDED` no longer applies.
- **The evidence rules are unchanged:**
  - every required P1 query must still be captured or unavailable;
  - at least 3 relevant captured observations and at least one EXACT/STRONG are
    still needed.

  Stopping too early leaves the research `RESEARCH_INCOMPLETE`; stopping cannot
  replace missing evidence.
- **When the minimum is met, readiness is `READY_TO_SCORE_WITH_WARNINGS`,** with
  the warning *"Research was ended before all recommended expansion terms were
  captured."* The warning names the requested-but-unresearched terms and any
  recommended-but-never-requested terms.
- **The evidence package still contains only captured observations.** Stopped
  terms are listed in `unresearched_terms` (unknown, not zero, not evidence) and
  not in `unavailable_terms`. The package also carries the `owner_finished`
  record.
- **Bug fixed alongside:** a term already decided in an earlier round (rejected,
  requested or stopped) that Etsy shows again in the same wording is no longer
  counted as a duplicate of itself.

## Consequences

- The owner can score with good-enough evidence without false "unavailable"
  records.
- A stopped plan cannot be expanded again; a new plan would be needed.
