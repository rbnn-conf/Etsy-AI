# ADR-033: SEO Research Planner (idea intake + keyword research plan)

- **Status:** Accepted (owner specification, 2026-09-29). Branch `feature/seo-discovery-engine`.
- **Builds on:** ADR-031 (foundation), ADR-032 (Opportunity Engine). The
  opportunity formula, weights, conversion mapping, demand/competition formulas
  and relevance values are **not changed**. Production Engine v1 is not changed.
- **Scope:** Phase 1 of the SEO Research & Listing Engine only. Research
  expansion and the Etsy listing builder are not built.

> **A GENERATED RESEARCH QUERY IS NOT EVIDENCE OF MARKET DEMAND.**
> The planner proposes searches for the owner to run in Etsy Marketplace
> Insights. It never supplies, estimates or implies a number, and its
> priorities contain no demand assumption.

## Context

The Opportunity Engine (ADR-032) ranks observations it is given, but it cannot
say which searches are worth capturing. Without a plan, research is ad hoc and
easily drifts to unrelated niches with attractive numbers.

## Decision

```
OWNER IDEA → structured idea (intake + completeness)
          → research plan (queries, P1/P2/P3, reasons)       seo/src/planner.mjs
          → OWNER captures Marketplace Insights by hand        (observations + related terms)
          → applyResearch: captured / unavailable / discovered terms
          → (future) research expansion from discovered terms
          → Opportunity Engine (ADR-032), unchanged
```

### Idea intake (`seo/schemas/product-idea.schema.json`)

New optional fields; absent means unknown (`null`), never guessed. Existing
ideas stay valid.

| Field | Values |
|---|---|
| `audiences` | adults, teens, kids, families, general, or custom words |
| `delivery` | digital, printable, physical, editable, other |
| `formats` | freeform; the first is the primary format |
| `styles` | freeform style/attribute words |
| `item_count` | whole number, for products counted in items |

`themes`, `season`, `page_count` and `owner_notes` already existed. Nothing is
colouring-specific.

### Completeness (`resolveIdea`)

- Structured fields win. If one is absent, only **explicit** words in the idea's
  own text are used: a known audience word, a known format phrase, or the literal
  words printable, digital or editable. Each such value is flagged "extracted
  from text: confirm it". "Colouring pages for adults" gives format and audience;
  it never implies digital.
- `insufficient`: no format (nothing to research).
- `usable_with_warnings`: a format is known, but themes, audiences or delivery
  are missing, or a value came from text.
- `complete`: format, themes, audiences and delivery all supplied as structured
  data. `missing_fields` and `warnings` say what is absent.

### Query generation (`generateQueries`)

The words come only from the idea, plus two documented tables:

- `FORMAT_FAMILIES`: alternative packagings of the same product, for example
  coloring pages / coloring book, greeting card / card, invitation / invite,
  spreadsheet / spreadsheet template. A format not listed has no siblings.
- `THEME_VARIANTS`: genuine regional variants, currently autumn ↔ fall only.

Audience words: adults → "adult …" before the format and "… adults" after it;
teens → teen/teens; kids → kids; families → family; general → no word; custom →
as given. Delivery words: digital, printable, editable. Physical and other add
no word.

| Priority | Queries (f0 = primary format, sibling = same family) |
|---|---|
| P1 (required) | theme + f0 (and regional variants) · audience + f0 |
| P2 | theme + sibling · audience + sibling · style + f0 · theme + f0 + audience · delivery + f0 · f0 alone |
| P3 | sibling alone · style + sibling · delivery + sibling |

Priority means closeness to the core buyer intent. It is **not** an opportunity
score, and no demand assumption influences it. The plan is capped at
`MAX_QUERIES = 40`; any overflow drops the lowest-priority, last-generated
queries, with a warning. A final guardrail throws if any query word is not from
the idea or those tables, so Halloween or Christmas queries cannot appear for
an autumn idea.

### Normalisation (`normaliseQuery`, the dedupe key only)

- lowercase;
- colour → color, cosy → cozy;
- accents and punctuation removed; single spaces;
- plural rule: -ies → -y; a trailing -s after a consonant or e.

Word order and theme variants are kept, so "fall coloring pages" and "autumn
coloring pages" are separate intents. Queries are shown in US spelling, one
spelling per intent, with the UK spelling listed as `also_spelled`. Duplicate
wordings merge into the first (higher-priority) query and are listed in
`merged_variants`.

### Research plan (`seo/schemas/research-plan.schema.json`)

- **Identity:** `research_plan_id` (a content hash; the same idea gives the same
  id), `product_id`, `idea_reference` (name and SHA-256), `created_at`.
- **Idea:** `idea_completeness`, `missing_fields`, `resolved_idea`.
- **Queries:** `queries`, each with `query`, `normalized_query`, `also_spelled`,
  `intent_type`, `priority`, `reason`, `required` (= P1), `observation_status`
  and `components`.
- **Capture:** `capture_fields`, `discovered_terms`, `research_references`,
  `warnings`.
- **Lifecycle:** `status` and `status_history`.
- `observation_status`: `not_researched` → `captured` (only when a research set
  contains an observation for the query) or `unavailable` (the owner records that
  Etsy showed nothing).
- Status: `draft` → `researching` → `ready_for_expansion` (every P1 query captured
  or unavailable) → `complete`; any open plan → `superseded`.
- `researchPlanReport` / `npm --prefix seo run plan` prints the owner checklist:
  P1 / P2 / P3 queries with reasons, and what to capture for each. It contains no
  numbers.

### Related terms (observation field `related_terms`)

- **Shape:** an optional list of `{term, searches_30d?, search_results?, conversion_label?}`
  on a manual observation. Metrics that were not captured stay `null`.
- **Compatibility:** the field is included only when supplied, so existing
  observation ids and research checksums are unchanged.
- **Status:** a related term is **DISCOVERED, not RESEARCHED**. `applyResearch`
  lists it under `discovered_terms` (status `discovered`, `metrics_captured`
  none/partial/all). It is never marked as a researched query, never becomes an
  observation, and the Opportunity Engine never scores it (tested). Deciding what
  to do with discovered terms is Phase 2.

### Existing listings (`planExistingListingResearch`)

- **Inputs:** the listing's tags and title lead, its relevance profile (formats,
  central themes, audiences, delivery words, and the style words the title leads
  with) and the existing observations.
- **Output:** `existing_terms_already_researched`,
  `existing_terms_needing_research`, `new_candidate_queries` and
  `research_gaps`.
- **No change:** `listing_action` and `etsy_action` are always `none`. No listing
  change is recommended at this stage.

## Alternatives considered

- **Ask a model for keyword ideas:** rejected (no LLM; not reproducible; drifts
  off the idea).
- **Full permutations of every field:** rejected (explodes and wastes the owner's
  manual research time). The combinations are fixed by priority and capped.
- **Treat related searches as data:** rejected; a term Etsy displays has no
  captured metrics until the owner captures them.

## Consequences and limitations

- The quality of a plan depends on the idea's structured fields. Missing
  fields reduce the plan and are reported, never filled in.
- The format families and theme variants are small, explicit tables; new
  product families need an entry to get sibling formats.
- Word order within a query is fixed by rule (for example theme, then format,
  then audience). Other natural phrasings, such as "coloring pages for adults",
  are left to Phase 2 (discovered terms).
- Style + theme + format combinations (for example "cute ghost coloring pages")
  are not generated, to bound the plan.
- The planner imports neither the scoring module nor the Production Engine.
