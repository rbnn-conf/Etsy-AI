# ADR-032: SEO Opportunity Engine v1 (LumiumX internal opportunity score)

- **Status:** Accepted (owner specification, 2026-09-29). Branch `feature/seo-discovery-engine`.
- **Builds on:** ADR-031 (SEO / Discovery Engine foundation). Production Engine v1
  (ADR-023 to ADR-030, tag `production-engine-v1`) is not changed.

> **THE LUMIUMX OPPORTUNITY SCORE IS NOT THE ETSY ALGORITHM.**
> It is a decision-support metric for choosing search positioning for the
> owner's product from manually captured Marketplace Insights. It is never an
> Etsy ranking probability, a predicted sales or conversion rate, a likelihood
> of ranking, guaranteed demand or an "Etsy SEO score".

## Context

ADR-031 built the data contracts and evidence drafts but left scoring,
selection, positioning, owner approval and the Production handoff undefined.
The owner specified the Opportunity Engine v1, including the exact formula, and
asked that every rule be documented and that the formula not be tuned to force
expected results.

## Decision

Code: `seo/src/relevance.mjs`, `scoring.mjs`, `positioning.mjs`, `brief.mjs`,
`listing.mjs`, `performance.mjs`, `report.mjs`. Everything is deterministic:
no network, no model, no clock.

### Idea first

The owner's idea (or the existing listing) is authoritative. Research chooses
positioning **for that product**; relevance (below) stops a better-selling
unrelated product (for example a Christmas card) from replacing an autumn
colouring idea.

### Relevance: classes and rules

Relevance is classified from a **relevance profile**
(`seo/schemas/relevance-profile.schema.json`, fixtures in
`seo/fixtures/profiles/`): the product's own words sorted into facets, each
word in one facet only.

| Facet | Meaning |
|---|---|
| `central_themes` | the product's subject (autumn, halloween, christmas) |
| `formats` | what the product is (colouring pages/book, activity book, card) |
| `components` | parts the product contains (the colouring pages in an activity book) |
| `audiences` | who it is for (adult, kid, family) |
| `attributes` | style, use and delivery words (cozy, cute, printable, digital) |
| `tangential` | mentioned but not central (motifs, minor themes) |

Matching: lowercase; UK/US spellings (`colour`→`color`, `cosy`→`cozy`,
`xmas`→`christmas`, and the season word `fall`→`autumn`); accents and
apostrophes removed; a simple plural rule (`-ies`→`-y`; a trailing `-s` after a
consonant or `e`); grammar words (for, the, and, a, of, with, …) ignored.
First matching rule wins:

1. any word the profile does not describe → **IRRELEVANT** (the distinctive-term guardrail)
2. any tangential word → **WEAK**
3. central theme + format, no component → **EXACT**
4. central theme + component, or central theme + audience → **STRONG**
5. format or component + audience → **STRONG**
6. format or component (with attributes only) → **SUPPORTING**
7. central theme (with attributes only) → **SUPPORTING**
8. only audience or attribute words → **WEAK**
   (no content words at all → IRRELEVANT)

The ADR-031 evidence-draft guardrail (`createBriefDraft`) is unchanged.

### Components (all 0–100)

| Component | Definition |
|---|---|
| demand | `100 · log10(1 + searches_30d) / log10(1 + 10000)`, clamped. `DEMAND_REFERENCE = 10000`: at and above it demand is 100. |
| competition | `100 · (1 − log10(1 + min(search_results, 1000000)) / log10(1 + 1000000))`, clamped. `COMPETITION_REFERENCE = 1000000`. Fewer results → higher. A relative internal signal only; Etsy's result count is not a measure of ranking difficulty. |
| conversion | very_high 100 · high 80 · typical 60 · low 30 · very_low 10 · unknown 40 (deliberately conservative). LumiumX modelling values, not Etsy's weights. |
| relevance | EXACT 100 · STRONG 85 · SUPPORTING 65 · WEAK 30 · IRRELEVANT 0 |
| trend | `clamp(50 + trend_percent)`; missing → 50 and `trend_missing` (affects confidence, not the score) |
| seasonality | supplied explicitly by the profile/research context, never from the clock: peak 100 · in_season 85 · approaching 70 · evergreen 70 · off_season 35 · unknown 50; missing → 50 and `seasonality_missing` |

A `searches_30d` or `search_results` that was not captured is **not** zero: the
keyword is left unscored (`final_opportunity_score: null`) and rejected with
`missing_market_evidence`.

### Final formula

```
final_opportunity_score = clamp(
    demand      × 0.20
  + competition × 0.15
  + conversion  × 0.30
  + relevance   × 0.25
  + trend       × 0.05
  + seasonality × 0.05 , 0, 100)
```

Weights total 1.00. Rationale (owner): conversion 30% (buyer behaviour beats raw
volume); relevance 25% (accuracy cannot be hijacked); demand 20%; competition
15% (opportunity signal, not ranking difficulty); trend 5% and seasonality 5%
(helpful, optional, deliberately small because an observation may already
reflect the season). Full precision is kept; presentation rounds to one decimal.

### Eligibility, roles and rejection

- **Eligible for primary:** EXACT or STRONG, with complete evidence and no
  rejection reason. Score and eligibility are separate: a WEAK or IRRELEVANT
  phrase can never be primary, however high its score (the diagnostics say so).
- **No eligible candidate:** `primary_keyword = null`, `research_required = true`.
  Nothing weaker is promoted. SUPPORTING is never primary in v1 (the owner
  override is a future feature). The spec's §3 "unless no exact/strong viable
  candidate exists" is therefore not implemented; §11 governs.
- **PRIMARY:** the top eligible candidate. **SECONDARY:** up to 4 further eligible
  candidates, excluding very_low conversion. **SUPPORTING:** SUPPORTING-class
  phrases that are not rejected, plus eligible phrases not given a secondary place
  (limit reached, or very_low conversion: "accurate but de-emphasised").
  **REJECTED:** at least one reason:

| Reason | Rule |
|---|---|
| `irrelevant` | IRRELEVANT class |
| `weak_relevance` | WEAK class |
| `missing_market_evidence` | no observation, or searches/results not captured |
| `insufficient_demand` | `searches_30d = 0` |
| `poor_competitive_opportunity` | `search_results ≥ COMPETITION_REFERENCE` (competition score 0) |
| `very_low_conversion` | very_low conversion AND class below STRONG (an accurate EXACT/STRONG phrase is kept and de-emphasised instead) |
| `duplicate_intent` | same words (any order, plural, spelling) as a better-ranked candidate |
| `superseded` | reserved; not produced in v1 |

### Tie breaking

Eligible candidates are ordered by the final score **rounded to one decimal**,
then: higher relevance class, higher conversion score, higher demand score,
higher competition score, keyword in lexical order.

### Close competition

`close_competition = true` when #1 − #2 eligible scores ≤ **5.0** points
(full precision, 1e-9 tolerance). The primary is not changed; both candidates
and their component-by-component difference are shown.

### Confidence (in OUR recommendation, from evidence completeness)

Start at HIGH; every triggered condition is listed in `confidence_triggers`.
Any LOW trigger gives LOW; otherwise any MEDIUM trigger gives MEDIUM.

| Level | Condition |
|---|---|
| LOW | no EXACT/STRONG primary (research required) |
| LOW | primary lacks searches or results (cannot occur for a scored primary; kept as a guard) |
| LOW | primary conversion unknown |
| LOW | ≤ 1 relevant observation (EXACT/STRONG/SUPPORTING with complete evidence) |
| LOW | research explicitly marked stale (`context.research_stale`) |
| LOW | owner-recorded evidence conflicts (`context.evidence_conflicts`); v1 does not detect conflicts automatically |
| MEDIUM | primary trend missing · seasonality missing · exactly 2 relevant observations · close competition |

Missing trend or seasonality alone never gives LOW. Confidence never predicts
Etsy ranking, conversion, sales or success.

### Transparency

Each evaluated keyword keeps: raw `searches_30d`, `search_results`,
`conversion_label`, `trend_percent`; each component; each weighted
contribution; the final score; `eligible_for_primary`; `selected_role`;
`rejection_reasons`; `decision_reasons` (including the component-by-component
difference against the primary); and `market_weaknesses` (demand below 50,
fewer than 100 searches; conversion low, very_low or unknown). A winner with weak
market signals gets a warning: "best of the supplied candidates, not evidence of
a strong market". `opportunityReport` / `npm run report` prints all of it.

### Brief, approval and handoff

- Brief statuses: `draft → scored | research_required`, `scored → owner_review`,
  `owner_review → approved | rejected`. `research_required` cannot be reviewed;
  capture more research and score again. Brief schema v2.
- `validateBrief` recomputes a scored brief from the cited research version and
  the relevance profile stored in the brief; any edited score, selection or tag
  is rejected.
- `createProductionHandoff` is refused unless the brief is `approved` and valid.
  The handoff (`seo/schemas/production-handoff.schema.json`) carries product
  facts, approved search intents, the approved positioning and references
  (research id/version/sha, brief sha). It contains no scores. Creating it runs
  nothing; the Production Engine still never imports `seo/`.

### Title, tags and description

- Title direction: lead with the primary, then at most two secondary phrases,
  then product facts; each phrase once.
- Tags: researched phrases (primary, secondary, supporting), then unresearched
  but relevant phrases (current tags or owner candidates; EXACT, STRONG,
  SUPPORTING). Etsy's 20-character limit; same-word phrases kept once. At most 13;
  fewer gives the warning `insufficient_valid_tag_candidates`. Never padded.

### Existing listings

`createListingRecommendation` compares the title lead's researched keyword with
the recommended primary and returns the owner's specified fields (retained, add,
de-emphasise, reasoning, title direction, 13 tag candidates, description plan,
pricing evidence and thumbnail search intent). `product_action` and `etsy_action`
are always `none`.

### Performance feedback (future)

`validatePerformance` and `seo/schemas/performance-observation.schema.json`
define listing results (views, clicks, orders, revenue, spend, search terms).
Derived `ctr = clicks/views`, `conversion_rate = orders/clicks` and
`roas = revenue/spend` exist only when their inputs do. Nothing here feeds the
score or changes weights (tested). This is the foundation for v1.1.

## Alternatives considered

- **Infer relevance with a model:** rejected (no LLM; not auditable).
- **Infer seasonality from today's date:** rejected by the owner; seasonality
  must be supplied.
- **Treat uncaptured numbers as zero:** rejected; unknown is not zero.
- **Tune weights until the expected fixture results appear:** rejected. The
  formula is the owner's; surprising results are reported, not tuned away.

## Consequences and known limitations

- Relevance is only as good as the profile. Fixture profiles are built strictly
  from each product's own words; the owner should review them. For example,
  #005's listing never names adults, so "adult coloring pages" is IRRELEVANT
  for #005 until the owner adds that audience.
- The plural rule and alias list are deliberately small; unusual words may not
  match their variants (for example `photos`/`photo`).
- Long-tail variants that add a delivery word (for example
  "halloween coloring pages printable") are separate intents, not duplicates. With
  very_high conversion they can outrank the shorter phrase (seen in #004/#006;
  flagged as close competition).
- Many strong phrases are longer than Etsy's 20-character tag limit; they go
  to the title and description, so tag lists are often short.
- Seed research has no trend, capture date or seasonality: every fixture result
  is at most MEDIUM confidence.
- The score is relative to the supplied candidates. It is not an absolute
  market-size measure.
