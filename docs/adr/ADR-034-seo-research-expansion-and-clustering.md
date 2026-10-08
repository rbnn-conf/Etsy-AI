# ADR-034: SEO research expansion, rounds, readiness, clustering and evidence package

- **Status:** Accepted (owner specification, 2026-09-29). Branch `feature/seo-discovery-engine`.
- **Builds on:** ADR-031 (foundation), ADR-032 (Opportunity Engine), ADR-033
  (research planner). The opportunity formula, weights, conversion mapping,
  demand/competition formulas and relevance values are **not changed**.
  Production Engine v1 is not changed. There is no Etsy listing builder and no
  Etsy write.

> **DISCOVERY IS NOT EVIDENCE.**
> **A RELATED ETSY TERM HAS NO MARKET VALUE ASSIGNED TO IT UNTIL ITS
> MARKETPLACE INSIGHTS DATA IS ACTUALLY CAPTURED.**

## Context

The research planner (ADR-033) proposes the first searches. Marketplace
Insights then shows related searches beside each one. Without rules, research
either stops too early or loops forever, and unrelated suggestions pull it into
other niches.

## Decision

```
ResearchPlan (= round 1) → owner captures → related terms DISCOVERED
  → relevance vs the product (idea first) → ResearchRound 2..4 (requested terms)
  → owner captures / marks unavailable → readiness
  → clusters → ResearchEvidencePackage (captured observations only)
  → Opportunity Engine (ADR-032, unchanged) → brief or listing audit
```

Code: `seo/src/expansion.mjs` (pure) and `seo/src/workspace.mjs` (local files for
the owner workflow). Owner commands: `npm --prefix seo run research -- <command> --dir <workspace>`,
where the command is one of `init`, `status`, `round`, `next-round`, `import`,
`unavailable`, `discovered`, `clusters`, `readiness` or `score`.

### Term lifecycle (`researchState` ledger)

| State | Meaning |
|---|---|
| `planned` | in the research plan, not yet captured |
| `discovered` | shown by Etsy as a related search; qualifies for research |
| `research_requested` | asked for in an expansion round |
| `captured` | the research set holds its own observation |
| `unavailable` | the owner could not get data: unknown, **not zero** |
| `rejected` | not researched (irrelevant, weak, or no new intent) |
| `duplicate` | the same search as another term (`duplicate_of`) |

Every discovered term records `term`, `normalized_term`, `discovered_from` (the
researched queries it appeared beside), `discovered_at` (the research version's
`recorded_at`), `metrics_supplied` (none/partial/all), `relevance_class`,
`decision` and `decision_reason`. Metrics shown beside a related term never make
it researched; only its own observation does.

### Expansion decisions

Relevance is the ADR-032 classifier against the product's relevance profile.
Discovered terms are evaluated EXACT/STRONG first, then SUPPORTING, each by
normalised text:

- **EXACT or STRONG:** requested, if not already planned, researched or duplicated.
- **SUPPORTING:** requested only if it adds a buyer-intent word that no planned,
  researched or already-accepted term contains. This is the meaning of
  "meaningfully different" in v1. Otherwise it is rejected.
- **WEAK or IRRELEVANT:** rejected, with the relevance reason. A Halloween,
  Christmas or bridal suggestion can never expand an autumn colouring idea.
- **No market numbers** are used to decide: a discovered term has none.

### Duplicates

The planner's `normaliseQuery` defines a duplicate: case, punctuation,
colour/color, colouring/coloring, cosy/cozy and simple plurals. Word order,
theme variants and extra words are kept, so "fall coloring pages", "adult
coloring pages" and "fall coloring pages for adults" are three intents. Each
collapsed wording is listed with `duplicate_of`.

### Budget

`MAX_TOTAL_RESEARCH_QUERIES = 40` (the plan's queries plus every requested term),
`MAX_EXPANSION_ROUNDS = 3` (rounds 2–4), and `MAX_NEW_TERMS_PER_ROUND = 10`.

- **Order:** candidates are ranked EXACT, STRONG, then SUPPORTING. Within a class,
  more `discovered_from` sources come first, then lexical order.
- **Overflow:** terms beyond the budget are listed in `not_requested` with the
  reason, and the round records `expansion_truncated: true`.
- **Refusals:** a new round is refused while any round is pending capture, after
  3 expansion rounds, or when nothing qualifies.

### ResearchRound (`seo/schemas/research-round.schema.json`)

- **Fields:** `round_number`, `input_research_version`, `discovered_terms`,
  `requested_terms`, `rejected_terms`, `duplicates`, `unavailable_terms`,
  `not_requested`, `expansion_truncated`, `created_at` and `status`.
- **Round 1** is the plan (only P1 is required to complete it).
- **Status:** `pending_capture` until every required term is captured or
  unavailable. Then `complete`, or `truncated` if the budget cut the round.

### Readiness (first match wins)

1. **RESEARCH_INCOMPLETE:** a required P1 query is not captured or unavailable,
   or a requested term is pending.
2. **EXPANSION_RECOMMENDED:** discovered terms qualify, and the budget allows
   another round.
3. **RESEARCH_INCOMPLETE:** fewer than 3 relevant (EXACT/STRONG/SUPPORTING)
   captured observations with searches and results, or no EXACT/STRONG one.
4. **READY_TO_SCORE**, or **READY_TO_SCORE_WITH_WARNINGS** when any of these holds:
   - a P1 query or a requested term is unavailable;
   - candidates were left unrequested because the budget is exhausted, or a round
     was truncated;
   - the evidence is at the minimum (exactly 3 relevant, or exactly 1 EXACT/STRONG);
   - a captured observation lacks searches or results.

P2 and P3 queries are never required. The point is to stop intelligently.

### Keyword clustering (`clusterKeywords`)

Captured and unavailable research terms of class SUPPORTING or better are grouped
by the facets of their words in the relevance profile:

- `theme-<word>`, `audience-<word>` and `style-<word>` from the profile's themes,
  audiences and non-delivery attributes;
- `delivery-<word>` for digital, printable or editable;
- `core-product` when a term names none of those dimensions;
- `long-tail` when a term names two or more of theme, audience and style.

A term joins every cluster it names. Each cluster lists `cluster_id`,
`cluster_type`, `label`, `keywords`, `captured_count`, `unavailable_count`,
`primary_candidate_terms` (captured EXACT/STRONG) and `supporting_terms`.
**No statistics are averaged or aggregated;** the Opportunity Engine still
scores individual keywords.

### ResearchEvidencePackage (`seo/schemas/evidence-package.schema.json`)

- Built only at READY_TO_SCORE or READY_TO_SCORE_WITH_WARNINGS.
- **What goes in:** exact copies of the observations captured for this plan's
  research terms, without their related-term lists. Also the plan, round and
  research-version references, clusters, readiness and warnings.
- **Unavailable terms** are listed as unknown, never zero.
- **Excluded:** discovered terms, and observations in the research set that are
  not research terms of this plan. They are counted but not included.
- **Checking:** `validateEvidencePackage` verifies every observation against the
  cited research.
- **Scoring:** `scoreEvidencePackage` calls the unchanged `scoreOpportunities` on
  the package's observations only. For an existing listing,
  `auditListingFromEvidence` returns the ADR-032 recommendation (a proposal;
  product and Etsy untouched).
- **Existing listings:** `createListingResearchPlan` builds the plan from the
  listing's metadata plus its relevant current tags (`existing_term` queries).

### Ads and performance boundary

Marketplace Insights is market evidence. Listing and ads performance is LumiumX
performance evidence (`performance.mjs`, ADR-032). Expansion and scoring never
read performance data. The package carries `performance_evidence: null` as the
seam for attaching results after an SEO revision in a later version.

## Alternatives considered

- **Treat related searches as evidence, or copy their numbers:** rejected; this
  is discovery, not capture.
- **Rank expansion by estimated demand:** rejected; there is no data yet.
- **Require every P2/P3 query:** rejected; it creates endless research.
- **Average cluster metrics:** rejected; this invents numbers.

## Consequences and limitations

- Relevance is only as good as the profile. The Cozy Autumn demonstration profile
  includes "colouring sheets" because the owner's specification calls it a
  relevant format variant.
- "Meaningfully different" for SUPPORTING terms is a word-level rule. For example,
  "coloring sheets" is rejected once "autumn coloring sheets" is requested.
- Duplicates are literal (normalised text). "fall coloring pages adults" (planned)
  and "fall coloring pages for adults" (discovered) are both kept.
- Each research version must be a complete capture set; the workflow's `import`
  merges new rows into the previous version.
- The demonstration's synthetic discoveries have no real data, so they end up
  unavailable, and the package holds only the three real observations.
