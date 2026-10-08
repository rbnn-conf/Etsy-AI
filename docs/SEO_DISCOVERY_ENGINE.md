# SEO / Discovery Engine v1: architecture

> **Production Engine = HOW products are manufactured.**
> **SEO / Discovery Engine = WHAT search positioning makes commercial sense
> before manufacturing.**

Status: foundation (ADR-031) + **Opportunity Engine v1** (ADR-032) + **Research
Planner** (ADR-033) + **Research Expansion and Clustering** (ADR-034), branch
`feature/seo-discovery-engine`. The package is `seo/` (`@dpf/seo`).

- ADR-031: data contracts, validation, versioned research, evidence drafts, fixtures.
- ADR-032: the **LumiumX internal opportunity score**, relevance classes, keyword
  roles, close competition, confidence, positioning, existing-listing
  recommendations, the owner approval states and the Production handoff document.
- ADR-033: structured idea intake and the **research planner**, which proposes
  which Marketplace Insights searches the owner should run. **A generated
  research query is not evidence of market demand.**
- ADR-034: research rounds that expand from related terms Etsy displays, a
  budget, readiness rules, buyer-intent clusters and the evidence package the
  Opportunity Engine scores. **Discovery is not evidence: a related Etsy term has
  no market value until its own Marketplace Insights data is captured.**

> **The LumiumX opportunity score is NOT the Etsy algorithm.** It is a
> decision-support metric for choosing positioning from the supplied evidence.
> It does not predict ranking, sales, conversion or demand. The exact formula,
> constants and rules are in ADR-032.

Not built yet: an owner approval UI (for example Telegram), the owner override
that would let a SUPPORTING phrase be primary, and using performance feedback.

## Where it sits

```text
OWNER IDEA
   ↓
SEO / DISCOVERY ENGINE   (seo/)
   market validation → SEO positioning
   ↓
OWNER APPROVAL
   ↓
approved Product Handoff (future: a standard, versioned document)
   ↓
PRODUCTION ENGINE v1     (automation/ Stage 1–4, production/, marketing/)
```

The two systems are loosely coupled:
- Production Engine code never imports `seo/` (enforced by a test).
- `seo/` imports nothing outside itself except Node built-ins (enforced by a
  test).
- ADR-036 exception: the Telegram owner interface, `automation/src/seo/` (and its
  owner script), is the ONLY automation code that imports `seo/`. Stage 1–4,
  production, marketing and services never do.

The only future link is a handoff document that the Production Engine can
read, the same way Stage 1 hands off to Stage 2 today.

## Core principle: idea first

The owner decides what to make ("Cozy autumn colouring pages for adults").
The engine finds the strongest commercially relevant positioning **for that
idea**. It never replaces the idea with an unrelated product because another
keyword converts better.

In v1 this is concrete:
- The evidence draft contains only the owner's candidate keywords, plus
  observations that share a distinctive term with the idea.
- Format words ("coloring", "printable", "book", …) do not count as a relation.
- An autumn idea therefore never gets Halloween or Christmas keywords (tested).

## Two modes

| | NEW_PRODUCT | EXISTING_LISTING |
|---|---|---|
| Input | the owner's product idea | a read-only snapshot of a current listing |
| Flow | idea → relevant keyword research → opportunity analysis → SEO brief → owner approval → (future) Production handoff | snapshot → market comparison → proposed SEO revision → owner approval |
| Built | idea validation, evidence draft (`createBriefDraft`), scoring and positioning (`scoreBrief`), owner review (`submitForOwnerReview`, `recordOwnerDecision`), recomputing validation (`validateBrief`), handoff document (`createProductionHandoff`) | snapshot validation, market comparison (`createListingReview`), recommendation (`createListingRecommendation`) |
| Never | generates artwork, PDFs or ZIPs | **regenerates or edits the product**; changes Etsy |

The existing-listing outputs always carry `product_action: "none"` and
`etsy_action: "none"`. The recommendation is a proposal for the owner.

## Data: Etsy Marketplace Insights, manually supplied

- Etsy Marketplace Insights is **not** available through the Etsy API, and
  Etsy is never scraped. In v1 the owner types in what Marketplace Insights
  shows.
- **Raw observation** (`seo/schemas/observation.schema.json`):
  - `keyword`
  - `searches_30d`
  - `search_results`
  - `conversion_label`: one of `very_high | high | typical | low | very_low | unknown`
  - `trend_percent`
  - `captured_at`
  - `source`: `{type: etsy_marketplace_insights, method: manual, captured_by, note}`
- **Nothing is invented:**
  - A value that was not captured is `null` (unknown), never 0 or an estimate.
  - A missing conversion label becomes `unknown`.
- **Strict rules:**
  - No coercion: `"4800"` or `"4.8k"` is rejected.
  - Unknown fields are rejected, so a score can't be slipped into raw data.
  - Duplicate keywords in one batch are rejected.
  - A research set refuses a capture with any bad row.
- **Raw observations are separate from calculated scores.** Observations have
  content-addressed ids (`obs-…`). Future scores must reference those ids.
- **Versioning** (`ResearchStore`):
  - Stored as `research/<id>/vNNN.json`, write-once and sequential.
  - Each version records its parent's SHA-256.
  - A new capture is a new version, never an edit.

## SEO brief (`seo/schemas/seo-brief.schema.json`)

- **Fields:**
  - keywords: `primary_keyword`, `secondary_keywords`, `supporting_keywords`, `rejected_keywords`
  - evidence and scores: `market_evidence`, `opportunity_scores`, `pricing_evidence`
  - listing direction: `positioning`, `title_direction`, `tag_candidates`, `description_keywords`
  - status and provenance: `confidence`, `warnings`, `research_version`, `approval_status`
- **Guards against fabricated statistics** (`validateBrief`):
  - every `market_evidence` row cites an observation of the exact research
    version (id, version and checksum), with identical raw values;
  - chosen keywords must have evidence;
  - pricing evidence needs a source.
- **No opaque score:** a draft has `opportunity_scores.status: "not_scored"`.
  A scored brief stores every evaluated keyword's raw values, components,
  weighted contributions, role and reasons, plus the relevance profile used.
  `validateBrief(brief, research, idea)` recomputes it and rejects any edit.
- **Statuses** (schema v2): `draft`, `research_required`, `scored`,
  `owner_review`, `approved`, `rejected`. A handoff exists only for `approved`.

## Research planning (ADR-033)

```text
idea → research plan (P1/P2/P3 queries) → owner captures Marketplace Insights
     → applyResearch (captured / unavailable / discovered related terms)
     → (future) research expansion → opportunity scoring
```

- `resolveIdea` checks completeness (`complete` / `usable_with_warnings` /
  `insufficient`). Missing audience, delivery, theme or format is reported,
  never guessed.
- `createResearchPlan` generates queries from the idea's own words, plus the
  documented format families (including crochet pattern ↔ crochet pattern
  bundle, ADR-040) and the autumn ↔ fall variant, capped at 40.
- **Search shapes (ADR-042):** a family whose buyers put the theme inside the
  format words uses that shape for its theme queries: `crochet {theme}
  pattern` ("crochet rose pattern"). The theme is singular and derived from
  the idea's own word. Other families are unchanged.
- An owner-scored AND owner-approved session's keywords are passed to the
  Stage 3 listing call as search focus (`SeoPanel.approvedKeywords`). Nothing
  else from SEO reaches marketing.
- **Related terms** Etsy displays can be recorded on an observation
  (`related_terms`). They are *discovered*, not researched, and are never scored.
- `planExistingListingResearch` reports which current tags and title terms are
  researched, which are not, and which new queries to run. It recommends no
  listing change.
- **Read it:** `npm --prefix seo run plan`.

## Research expansion, readiness and clustering (ADR-034)

- **Lifecycle:** each term is planned, discovered, research_requested, captured,
  unavailable, rejected or duplicate, with its provenance (`discovered_from`,
  `discovered_at`, `metrics_supplied`, relevance class and decision reason).
- **What expands:** EXACT and STRONG discovered terms, and SUPPORTING terms that
  add a new buyer-intent word. WEAK and IRRELEVANT terms never expand.
- **Budget:** 40 research queries in total, 3 expansion rounds and 10 new terms
  per round. Anything cut is listed with the reason.
- **Readiness:** `RESEARCH_INCOMPLETE`, `EXPANSION_RECOMMENDED`, `READY_TO_SCORE`
  or `READY_TO_SCORE_WITH_WARNINGS`. It needs P1 done, 3 relevant captured
  observations and at least one EXACT/STRONG.
- **Clusters:** theme, audience, style, delivery, core product and long-tail,
  from the relevance profile. A keyword can be in several clusters; no numbers
  are aggregated.
- **Evidence package:** only captured observations for this plan. Unavailable
  is unknown, never zero. It is scored by the unchanged Opportunity Engine, or
  audited for an existing listing (a proposal only).
- **Owner stop (ADR-035):** `FINISH_WITH_CURRENT_EVIDENCE` (`finish`) ends expansion. Outstanding requested
  terms stay `owner_stopped` (unknown, never evidence); the minimum-evidence rules still apply, and readiness is at
  best `READY_TO_SCORE_WITH_WARNINGS`.
- **Owner workflow:** `npm --prefix seo run research -- <command> --dir <workspace>`
  with `init`, `status`, `round`, `next-round`, `import`, `unavailable`, `finish`,
  `discovered`, `clusters`, `readiness` or `score`.

## Telegram owner interface (ADR-036)

Telegram (🔎 SEO, `/seo`) is the normal owner workflow: audit an existing
product, research a new one, capture Marketplace Insights step by step, reuse
earlier captures from the Insights Library, finish early and receive the
recommendation and a deterministic SEO revision. It calls this engine
(`ResearchWorkspace`, `researchState`, the evidence package,
`scoreEvidencePackage`, `listingRecommendationFromResult`, `proposeRevision`).
The adapter duplicates no rule. Etsy is never read or changed, and no OpenAI
call is made. The CLI (`npm --prefix seo run research`) remains for development.

The relevance profile made from a structured idea (`profileFromIdea`) gives
each word to one facet only, in the order themes > formats > audiences >
attributes. ADR-040 adds one exception: when that order would drop every
format, formats claim their words first. For example, the theme "crochet
flowers" would otherwise remove the format "crochet pattern bundle". Example
crochet idea: `seo/fixtures/ideas/crochet-flower-pattern-bundle.json`.

## Opportunity scoring (ADR-032)

- **Relevance profile** (`seo/schemas/relevance-profile.schema.json`,
  `seo/fixtures/profiles/`): the product's own words in facets (central
  themes, formats, components, audiences, attributes, tangential). Keywords are
  classified EXACT / STRONG / SUPPORTING / WEAK / IRRELEVANT by fixed rules; a
  word the profile does not describe makes a keyword IRRELEVANT.
- **Score:** demand 0.20 · competition 0.15 · conversion 0.30 · relevance 0.25 ·
  trend 0.05 · seasonality 0.05 (log-scaled demand and competition). Only
  EXACT/STRONG can be primary; otherwise `research_required`.
- **Output:** a diagnostic row per keyword (raw data beside every component),
  PRIMARY / SECONDARY / SUPPORTING / REJECTED with reasons, close competition
  (≤ 5.0 points), and HIGH / MEDIUM / LOW confidence with the conditions that
  triggered it.
- **Read it:** `npm --prefix seo run report` prints the diagnostics for every
  fixture.

## Production handoff (`seo/schemas/production-handoff.schema.json`)

Only from an approved brief. It carries product facts, the approved search
intents and positioning, and references to the research version and the brief
(SHA-256). It carries no scores. Creating it runs nothing; the Production
Engine still never imports `seo/`.

## Performance feedback (future; `seo/schemas/performance-observation.schema.json`)

Listing views, clicks, orders, revenue, spend and search terms, validated
null-for-unknown. Derived CTR, conversion rate and ROAS exist only when their
inputs exist. Not used by scoring in v1.

## Product idea (`seo/schemas/product-idea.schema.json`)

- **Fields:**
  - identity and type: `product_id` (null for a new idea), `working_name`, `product_type`
  - creative: `concept`, `audience`, `season`, `themes`
  - shape: `format`, `page_count`
  - owner input: `owner_notes`, `candidate_keywords`
  - `status`
- It is product-type agnostic: `product_type` and `format` are the owner's
  words, not an enum.

## Fixtures (`seo/fixtures/`)

- `marketplace-insights/manual-capture-01.json`: the 12 owner-supplied
  observations. They are clearly marked as manually captured. Trend and
  capture date were not supplied, so they are `null`.
- `listings/`: non-live snapshots of:
  - #004 Cozy Spooky Halloween;
  - #005 Cozy Autumn Adventures;
  - #006 Cute Ghost Halloween (repo folder `products/007-…`);
  - the Traditional Robin Christmas Card (#009's approved Stage 4 draft payload).

  They are built from files in the repository and record each source file's
  SHA-256. `live_state_read` is always `false`; shop performance is all
  `null`. #004 has no recorded tag list, so its `tags` is `null`. The real
  Etsy listings are never read or changed.
- `ideas/cozy-autumn-colouring-adults.json`: an example NEW_PRODUCT idea.
- `profiles/`: relevance profiles for the idea and the four listings, built
  strictly from each one's own words. Seasonality was not supplied, so it is
  `null` in all of them.

## Boundaries (enforced by `seo/test/seo.test.mjs`)

The SEO engine does not:
- generate artwork, render PDFs or create ZIPs;
- invoke production adapters or import production, automation, marketing or
  services code;
- read or modify Etsy, send Telegram messages, or call OpenAI;
- make any network call.

Running every flow leaves the repository's product files byte-identical.

## Not yet built (next steps)

1. The Etsy listing builder (Phase 3; still no Etsy writes without the
   Stage 4 publish gates).
2. An owner approval UI (for example Telegram) over the existing approval states.
3. The owner override that lets a SUPPORTING phrase become primary.
4. Reading handoff documents in the Production Engine (it does not today).
5. SEO Engine v1.1: combining Marketplace Insights with LumiumX performance
   feedback. Scoring weights do not change from performance data in v1.
