# ADR-031: SEO / Discovery Engine v1 foundation

- **Status:** Accepted (owner request, 2026-09-29). Branch `feature/seo-discovery-engine`.
- **Relates to:** ADR-023 to ADR-030 (Production Engine v1). Those are not changed.

## Context

The Production Engine v1 manufactures products well: Stage 1 creative,
Stage 2 production, Stage 3 marketing, Stage 4 Etsy draft. It does not decide
what search positioning a product should have before it is made. The owner's
Etsy Marketplace Insights research shows large differences between related
keywords, for example:
- "halloween coloring book": 3,400 searches, low conversion;
- "halloween coloring pages": 4,800 searches, high conversion.

## Decision

- **A separate package, `seo/` (`@dpf/seo`),** loosely coupled to the
  Production Engine. Neither imports the other; tests enforce both
  directions. The future link is a standard handoff document, approved by the
  owner.
- **Idea first:** research positions the owner's idea. It never substitutes
  an unrelated product.
- **Two modes:**
  - NEW_PRODUCT: idea → evidence → brief → approval → handoff.
  - EXISTING_LISTING: snapshot → comparison → revision proposal → approval.
    It never regenerates the product.
- **Data:**
  - Etsy Marketplace Insights is entered by hand in v1. It is not scraped,
    and the Etsy API does not provide it.
  - Raw observations are strict and null-for-unknown.
  - They are versioned, write-once and content-addressed, and kept separate
    from any calculated score.
- **The brief contract is defined now:**
  - v1 fills only the evidence;
  - validation rejects any statistic that is not an exact copy of the cited
    research version;
  - opportunity scores are `not_implemented`, and any future score must be
    explainable (inputs and formula), never opaque AI output.
- **Architecture doc:** `docs/SEO_DISCOVERY_ENGINE.md`.

## Alternatives considered

- **Add SEO steps to Stage 1 or Stage 3:** this couples research to
  manufacturing and makes research on existing listings awkward. Rejected.
- **Scrape Etsy, or estimate missing numbers:** this breaks Etsy's terms and
  the no-fabrication rule. Rejected.
- **An LLM "opportunity score":** opaque and impossible to audit. Rejected;
  scoring will be deterministic and explainable when it is built.

## Consequences

- There is no user-facing flow yet (no Telegram and no handoff). v1 is data
  contracts, validation, versioned storage, evidence drafts and fixtures.
- The Production Engine's behaviour is unchanged; its full test suites were
  re-run.
- The seed capture has no dates or trends. A later capture must record
  `captured_at` so the evidence can be judged for freshness.
