# @dpf/seo: SEO / Discovery Engine (foundation + Opportunity Engine v1)

> **Production Engine = HOW products are manufactured.**
> **SEO / Discovery Engine = WHAT search positioning makes commercial sense
> before manufacturing.**

This package holds:
- manually captured Etsy Marketplace Insights observations, strictly validated
  and versioned;
- product ideas (NEW_PRODUCT);
- structured idea intake and research plans: which Marketplace Insights searches
  to run (ADR-033). **A generated query is not evidence of demand**;
- research expansion rounds, readiness, keyword clusters and the evidence
  package (ADR-034). **Discovery is not evidence**;
- evidence drafts, then scored SEO briefs with owner approval states;
- the **LumiumX internal opportunity score** (ADR-032). It is **not the Etsy
  algorithm**; every score is shown beside its raw Marketplace Insights values;
- read-only listing snapshots, market comparisons and recommendations (EXISTING_LISTING);
- the SEO → Production handoff document (approved briefs only; no scores);
- a performance-feedback schema for a future version.

No network, no model, no Etsy, no Telegram, and no production code.

- Architecture: [`docs/SEO_DISCOVERY_ENGINE.md`](../docs/SEO_DISCOVERY_ENGINE.md)
- Decision records: [ADR-031](../docs/adr/ADR-031-seo-discovery-engine-foundation.md) (foundation),
  [ADR-032](../docs/adr/ADR-032-seo-opportunity-engine-v1.md) (opportunity scoring: formula, constants, rules),
  [ADR-033](../docs/adr/ADR-033-seo-research-planner.md) (research planner),
  [ADR-034](../docs/adr/ADR-034-seo-research-expansion-and-clustering.md) (research expansion, readiness, clusters, evidence package),
  [ADR-035](../docs/adr/ADR-035-seo-owner-finish-with-current-evidence.md) (owner action FINISH_WITH_CURRENT_EVIDENCE),
  [ADR-036](../docs/adr/ADR-036-seo-telegram-owner-panel.md) (Telegram owner interface; the only automation code that uses this engine)

```
src/        observations, research, idea, planner, expansion, workspace, capture, intake, relevance, scoring, positioning, brief, listing,
            revision, performance, report
schemas/    observation, research-set, product-idea, research-plan, research-round, evidence-package, relevance-profile, seo-brief, listing-snapshot,
            production-handoff, performance-observation
fixtures/   marketplace-insights/ (12 manual observations), listings/ (4 non-live snapshots), ideas/ (2), profiles/ (6),
            research-cycle/cozy-autumn/ (real seed values + clearly synthetic related terms, no invented metrics)
            research-cycle/cozy-autumn-real/ (the REAL completed 2026-09-29 cycle, finished by the owner; regression)
scripts/    opportunity-report.mjs   npm --prefix seo run report
            research-plan.mjs        npm --prefix seo run plan
            research.mjs             npm --prefix seo run research -- <command> --dir <workspace>
test/       npm --prefix seo test
```
