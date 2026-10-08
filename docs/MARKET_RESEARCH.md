# Market Research — Feasibility Investigation

**Status:** Investigation only. Nothing here is implemented or approved for
implementation. This does not change the current phase (Phase 0 —
Foundation, see `ROADMAP.md`). No collector, no n8n workflow, no schema,
no change to the PDF renderer.

**Question being answered:** Can we build a reliable, sustainable system
that tells us *"what digital products appear to have strong demand on
Etsy, and where is there room to build an original product?"* — and if so,
what is the simplest shape it could take.

**Method:** Reviewed the current Etsy Open API v3 documentation
(`developers.etsy.com/documentation`), the published OpenAPI spec
(`etsy.com/openapi/generated/oas/3.0.0.json`), the rate-limit and
authentication essentials pages, and the API Terms of Use references.
Live listing pages could not be fetched during this investigation —
Etsy returns HTTP 403 to automated fetchers — which is itself a finding
(see Risks).

---

## 1. What the Etsy API Can Do

All endpoints below are **public**: they require only an application API
key (`x-api-key` header). They do **not** require OAuth or any seller to
connect their shop. This is the important result — marketplace-wide
read access for research does not need shop authorisation.

| Capability | Endpoint | Notes |
|---|---|---|
| Keyword search of active listings | `findAllListingsActive` — `GET /v3/application/listings/active` | Filters: `keywords`, `taxonomy_id`, `min_price`, `max_price`, `shop_location`. Sort: `sort_on` = `created` \| `price` \| `updated` \| `score`; `sort_order` = `asc`/`desc`. `limit` max 100, `offset` paginated. |
| Single listing detail | `getListing` — `GET /v3/application/listings/{listing_id}` | `includes` can pull `Images`, `Shop`, `User`, `Inventory`, `Videos`, `Translations` in one call. |
| Listings for a known shop | `getListingsByShop`, `findAllActiveListingsByShop` | Needs a `shop_id` you already have. |
| Shop detail + shop-level stats | `getShop` — `GET /v3/application/shops/{shop_id}` | Returns `transaction_sold_count`, `review_count`, `review_average`, `listing_active_count`, `digital_listing_count`, `num_favorers`, `is_star_seller`, creation date. |
| Find a shop **by name** | `findShops` — `GET /v3/application/shops?shop_name=` | Name search only — not open-ended shop discovery. |
| Reviews for a listing | `getReviewsByListing` — `GET /v3/application/listings/{listing_id}/reviews` | Public. Fields: `rating` (1–5), `review` (text), `language`, image URL, created/updated timestamps. `limit`/`offset`, `min_created`/`max_created`. |
| Reviews for a shop | `getReviewsByShop` — `GET /v3/application/shops/{shop_id}/reviews` | Public. Same shape as above. |
| Category tree | `getSellerTaxonomyNodes`, `getPropertiesByTaxonomyId`, `getBuyerTaxonomyNodes` | Public. Lets us map keywords → `taxonomy_id` and enumerate category structure. |

### Fields available on a listing object

`getListing` / `findAllListingsActive` return, per listing:
`listing_id`, `shop_id`, `user_id`, `title`, `description`, `state`
(`active` / `inactive` / `sold_out` / `draft` / `expired`), `price`
(+ `currency_code`), `quantity`, `tags[]`, `materials[]`, `style[]`,
`taxonomy_id`, `num_favorers`, `featured_rank`, `url`, `has_variations`,
`is_customizable`, `is_personalizable`, `listing_type` (physical /
download / both), `who_made` / `when_made`, item dimensions/weight,
`creation_timestamp`, `last_modified_timestamp`, `ending_timestamp`,
`original_creation_timestamp`. With `includes=Images`: image URLs at
multiple sizes.

---

## 2. What the Etsy API Cannot Do

- **No per-listing sales count.** There is no "units sold" field on a
  listing. `Shop.transaction_sold_count` is the only sales number and it
  is **cumulative, all-time, and shop-wide** — not per product, not
  time-boxed.
- **No per-listing views.** The v2 API exposed `views`; v3 does not
  expose it for other people's listings, and Etsy Shop Stats (views,
  visits, conversion, traffic sources) are **not in the API at all**,
  not even for your own shop.
- **No "Bestseller" badge, no "Etsy's Pick" badge.** These exist only on
  the website UI. Not a field anywhere in the API.
- **No tag search.** `tags` come back *on* a listing, but you cannot
  search or filter listings *by* tag. Keyword search is a match-all
  phrase search over title/tags/attributes and is materially weaker than
  the consumer search box (no boolean, no real relevance model exposed).
- **No true search-ranking position.** `sort_on=score` gives *an*
  Etsy relevance ordering, but not the live, personalised, ads-blended
  results a shopper sees. Treat rank as a rough proxy only.
- **No conversion, revenue, cart, or wishlist-trend data.**
- **No historical time series.** You see the state on the day you call.
  Any trend has to be built by us storing repeated snapshots.
- **Cannot enumerate a whole category.** `offset` into
  `listings/active` has an effective ceiling (deep offsets return
  nothing / error). You get the top slice per keyword, not the long tail.

### Field classification (as requested)

| Field | Classification | How |
|---|---|---|
| Title | **AVAILABLE** | listing object |
| Description | **AVAILABLE** | listing object |
| Price + currency | **AVAILABLE** | listing object |
| Images | **AVAILABLE** | `includes=Images` / `getListingImages` |
| Shop identity | **AVAILABLE** | `includes=Shop` / `getShop` |
| Listing state (active/sold_out/…) | **AVAILABLE** | listing object |
| Taxonomy / category | **AVAILABLE** | `taxonomy_id` + taxonomy endpoints |
| Tags | **AVAILABLE to read**, **NOT AVAILABLE as a filter** | on listing object; no tag search |
| Creation / update timestamps | **AVAILABLE** | listing object |
| Reviews (rating + text) | **AVAILABLE** (public) | `getReviewsByListing` / `getReviewsByShop` |
| Favourites — per listing | **AVAILABLE** | `num_favorers` on listing |
| Favourites — per shop | **AVAILABLE** | `num_favorers` on shop |
| Sales — per listing | **NOT AVAILABLE** | — |
| Sales — per shop (cumulative, all-time) | **AVAILABLE** | `Shop.transaction_sold_count` |
| Views (any listing) | **NOT AVAILABLE** | removed in v3 |
| Views / visits — our own shop | **NOT AVAILABLE via API** | Shop Stats is web UI only |
| Bestseller badge | **NOT AVAILABLE** | website UI only |
| "Etsy's Pick" badge | **NOT AVAILABLE** | website UI only |
| Star Seller (shop) | **AVAILABLE** | `Shop.is_star_seller` |
| Featured rank | **AVAILABLE but weak** | `featured_rank` = seller's own shop-page ordering, not a market signal |
| Search-result position | **UNCERTAIN / proxy only** | `sort_on=score` order ≠ live SERP |
| Estimated revenue | **NOT AVAILABLE** | only crudely derivable, unreliable |
| Buyer identity in reviews | **REQUIRES SHOP AUTH** (and only for your own shop's transactions) | not exposed on public review reads |
| Full order / transaction data | **REQUIRES SHOP AUTH** | your own shop only |

---

## 3. Required Access

| Access level | What it's for | What it gives us |
|---|---|---|
| **Seller App** | Managing *your own* shop | OAuth scopes over your own listings, orders, inventory. Fast approval. Phase 5 concern, not research. |
| **Personal App** | Tools that go beyond your own shop, at limited scale | The public read endpoints in section 1, via API key. Deeper review than a Seller App. **This is what market research needs.** Default limits: 10 QPS, 10,000 requests/day. |
| **Commercial Access** | Apps that *other sellers connect to* and use at scale, or that exceed the default limits | Requires an already-approved Personal App first. Needed only if we distribute this as a product or outgrow the rate limits. Higher limits are negotiated by emailing `developer@etsy.com` with a usage estimate. |

- **For our own shop** (future publishing): Seller App or Personal App
  with OAuth. Note even this will *not* give us our own view/traffic
  stats through the API.
- **For market research across Etsy:** a **Personal App**, calling the
  public read endpoints with the API key only. No OAuth, no seller
  connections. Default rate limits are comfortably enough for a
  once-daily research sweep.

---

## 4. Useful Public Signals

Ranked by how much weight they can safely carry.

**Strong (measured, not modelled):**

- **Review count** on a listing and on a shop. Every review maps to a
  real purchase, so review count is a *lower bound* on sales. Recency of
  reviews (`min_created`/`max_created`) tells us if a product is selling
  *now* vs sold years ago.
- **Review text.** The single highest-value input for "build something
  better". Complaints, "I wish it had…", "doesn't work on my device",
  repeated praise — this is the customer-needs and gap map.
- **Price distribution** across the top listings for a keyword. Reliable
  for positioning and for spotting an unserved price band.
- **`Shop.transaction_sold_count`** for the shops that own the top
  listings. Real cumulative volume — good for "is there a real business
  here", weak for "how much of it is *this* product".
- **Count of near-identical active listings** for a keyword →
  saturation.

**Weak / proxy (use for direction, never for sizing):**

- **`num_favorers`** — real interest, but accumulates over a listing's
  whole life and favours old listings; can be inflated.
- **`sort_on=score` ordering** — approximates relevance, not demand.
- **Favorers ÷ listing age** — crude velocity estimate.
- **`featured_rank`** — the seller's choice, not the market's.

**Not from the API — external, modelled, optional:**

- Etsy search autocomplete and the website's visible "Bestseller" /
  "Etsy's Pick" badges (observable only by a human looking at the site).
- Third-party keyword tools (eRank, Marmalead, Sale Samurai, Google
  Keyword Planner) — these publish *estimated* search volume and
  competition. Modelled numbers, useful as a sanity check, not ground
  truth.

---

## 5. Recommended Research Architecture

Simplest shape that works. Do not build ahead of this.

```text
n8n (scheduled, e.g. daily)
  │   fixed list of seed keywords + taxonomy_ids (curated by us)
  ▼
Research Collector  (thin script: paginate findAllListingsActive,
  │                  then getShop + getReviewsByListing for the top N)
  │                  respects 10 QPS, backs off on 429, caches
  ▼
PostgreSQL  (snapshot tables: listing_snapshot, shop_snapshot,
  │          review, keyword_run — append-only, timestamped, so
  │          trends are built from repeated runs)
  ▼
Opportunity Scoring  (plain SQL views / a small function —
  │                   aggregates per keyword, applies the model in §6)
  ▼
Claude Analysis  (Anthropic API: reads the aggregates + review text,
  │               writes the customer-needs summary, gap analysis,
  │               and a draft BUILD/INVESTIGATE/IGNORE with reasoning)
  ▼
Notion Research Dashboard  (one row per opportunity, human-readable)
  ▼
Human Approval  (owner picks what proceeds — the review gate)
  ▼
Product Factory  (existing Phase 1+ pipeline, unchanged)
```

Notes:

- Keywords are **curated by us**, not discovered by the system. The API
  can't crawl the marketplace, so we feed it a watchlist and let it
  track those niches over time.
- The collector is a plain script (house convention:
  `infrastructure/scripts/` style), not a framework.
- No Redis, no queue, no new service. A daily cron in n8n and a few
  tables is the whole thing.
- Storage of Etsy data must follow the current API Terms of Use — see
  Risks. Store what the model needs (aggregates, review text for
  analysis), refresh it, and don't retain buyer personal data.

---

## 6. Proposed Opportunity Score

Each signal scored 0–5, multiplied by a **confidence weight** that
reflects how much we trust that signal, then combined to 0–100.

| Signal | Derived from | Confidence | Rationale |
|---|---|---|---|
| **Demand** | Σ review counts across top-N listings; favorers; recent-review rate; shop sold counts | **Medium** | Lagging and cumulative. Tells us *direction*, not market size. This is the weakest thing we're trying to measure and the score must not pretend otherwise. |
| **Competition** | Count of active listings for the keyword; concentration of reviews among few shops | **Medium–High** | Directly observable. |
| **Price** | Median + spread of top-N listing prices | **High** | Directly observed, reliable. |
| **Review evidence** | Review volume + recency + rating distribution | **High** for "someone is buying"; **Medium** for magnitude | Every review is a real sale. |
| **Bestseller evidence** | Manual check of website badges (not API) | **Low** | Not automatable, not always available. Optional manual input. |
| **Product complexity** | Parsed from descriptions — page counts, variants, formats (GoodNotes, hyperlinks, etc.) | **Medium** | Descriptions are inconsistent. |
| **Market saturation** | Ratio of near-duplicate titles; #shops vs #listings | **Medium** | Heuristic. |
| **Differentiation potential** | Claude's reading of unmet needs in review text | **Low–Medium confidence, high value** | Judgement call, but it's the whole point of the exercise. |
| **Production difficulty** | Our own capability model (we render PDF planners/printables well; interactive GoodNotes ecosystems are more work) | **High** | We control this input. |

**Reliability summary:** Price and Competition are the signals that can
carry real weight. Review evidence is strong for *existence* of demand,
soft for *scale*. Demand magnitude, views, and per-product sales are
either proxies or unavailable — the score should surface uncertainty,
not launder it into a number that looks precise.

**Output bands:**

- **BUILD** — demand direction is clearly positive, review text shows a
  concrete unmet need we can serve, and production is within our
  capability.
- **INVESTIGATE** — mixed or thin evidence; needs a manual look or a
  second data source before deciding.
- **IGNORE** — no demand signal, or saturated with no visible gap, or
  the product type is beyond what we can produce well.

---

## 7. Example Analysis

Using the two reference listings. **The metric values below are
illustrative placeholders** — the investigation could not pull live
figures (Etsy blocks automated page fetches; the API spike in §10 is
what fills these in). The *structure* and the *reasoning* are the
deliverable here.

### Reference A — "Simple Budget Spreadsheet (Google Sheets)"

The lightweight end: a single spreadsheet, one file, minimal support
burden.

```text
Opportunity:        Simple monthly budget spreadsheet (Sheets/Excel)
Demand:             MEDIUM–HIGH  (steady, broad, low intent to pay much)
Competition:        VERY HIGH    (thousands of near-identical listings)
Price:              Low band, roughly £3–£10; race to the bottom
Evidence:           Many shops with high review counts on this exact
                    product type; reviews recent → still selling
Customer needs      "easy to use", "not overwhelming", "works on my
 (from reviews):    phone", "didn't want a subscription app"
Existing patterns:  One tab or few tabs; auto-calculating category
                    totals; a dashboard chart; instant download
Differentiation:    Hard. The format is commoditised. Any edge is
                    onboarding quality, niche framing (e.g. for
                    freelancers / UK households / debt payoff), or
                    bundling with a printable
Production:         LOW for us (this is our core competency)
Recommendation:     INVESTIGATE — cheap to make, but only worth it
                    with a sharp niche angle; generic version = IGNORE
```

### Reference B — "Digital Budget Planner / Finance Tracker" (GoodNotes/iPad)

The ecosystem end: many hyperlinked pages, colour variants, savings
challenges, stickers/widgets, custom sections.

```text
Opportunity:        Hyperlinked digital budget planner for GoodNotes
Demand:             HIGH   (large, engaged; buyers expect to pay more)
Competition:        HIGH   (mature category, several dominant shops
                    with very large review counts)
Price:              Mid band, roughly £8–£25; variants and bundles
                    push effective price up
Evidence:           Top shops show high transaction_sold_count and
                    hundreds+ of reviews; sustained recent review flow
Customer needs      "hyperlinks must actually work in GoodNotes",
 (from reviews):    "want dark mode / more colours", "undated so I can
                    start anytime", "sync across iPad and phone",
                    "instructions for importing", "more savings
                    challenge pages", "landscape version"
Existing patterns:  Undated; index/tab navigation; monthly + weekly
                    spreads; net-worth and debt trackers; sinking
                    funds; sticker sheet; multiple colourways as
                    variants; setup PDF
Differentiation:    Real openings visible in complaints — reliable
                    hyperlink nav, genuine cross-device layouts,
                    a specific audience (UK/irregular income/couples),
                    better onboarding, a focused feature done well
                    rather than 300 generic pages
Production:         MEDIUM–HIGH for us — interactive hyperlinked PDF
                    with many linked pages and variant sets is more
                    than a flat printable; needs a template system
Recommendation:     INVESTIGATE → BUILD if a specific under-served
                    audience is confirmed in the review data and we
                    accept the higher production scope
```

**Read-across:** demand is clearly real at both ends. Neither is a
green-field opportunity. The value of the research engine is not "find
untapped niches with no competition" (those are rare and usually
low-demand) — it's *"among niches with proven demand, find the specific
unmet need in the review text and build the focused thing nobody has
done well."*

---

## 8. Risks / Limitations

- **Demand magnitude is not measurable.** No per-product sales, no
  views. We infer scale from review counts and cumulative shop sales.
  Anyone expecting "this product sells 400 units/month" will be
  disappointed — the system gives ranked direction, not forecasts.
- **API Terms of Use.** The current ToU (`etsy.com/legal/api`) must be
  read in full before any data is stored. Known constraints from Etsy's
  terms: no using Etsy or member data with third-party advertising /
  marketing platforms; don't build something competitive with Etsy;
  respect member privacy; cached Etsy content carries refresh/retention
  obligations. **Open item: confirm current wording before Phase-1 of
  this workstream.**
- **No scraping path.** Etsy's public pages sit behind bot protection
  (this investigation's fetches returned HTTP 403). Working around that
  — CAPTCHAs, headless evasion — is against the ToU and not
  sustainable. Website-only signals (Bestseller badge, live SERP order)
  are therefore *manual human observation only*, not automated.
- **Coverage is a watchlist, not a crawl.** We can only track keywords
  we think to add. Genuinely novel categories won't surface on their
  own.
- **Keyword search quality.** The API's `keywords` search is weaker than
  the consumer search engine; results may not match what a shopper
  actually sees.
- **Rate limits.** 10,000/day is plenty for a daily sweep of a few
  dozen keywords with top-N enrichment; it is not enough to enumerate
  categories or run large ad-hoc crawls. Needs caching and 429
  back-off from day one.
- **Snapshot bias.** Trends require us to run the collector repeatedly
  over weeks before the data is useful. No instant answers.
- **Third-party keyword tools** (if we ever add them) sell modelled
  estimates and have their own ToU; not a substitute for the API.

---

## 9. Recommendation

**Feasible, with a clear ceiling.** A Personal App calling Etsy's
public read endpoints (listings search, shop detail, reviews, taxonomy)
can sustainably answer:

- *Is there demand, and is it current?* — yes, via review counts and
  recency.
- *How competitive and how saturated?* — yes, via listing counts and
  shop concentration.
- *What price does the market bear?* — yes, reliably.
- *What do customers actually want and complain about?* — yes, and this
  is the strongest reason to build it: review-text mining feeds
  original product design directly.

It **cannot** tell us per-product sales, views, revenue, or bestseller
status. Those gaps are acceptable if the goal is *ranked opportunity
direction + customer-need discovery* feeding a human decision — which is
exactly the stated goal ("find demand → understand demand → create
something better/different").

Recommended shape: the thin architecture in §5 — n8n daily cron → small
collector → Postgres snapshots → SQL scoring → Claude summary → Notion
dashboard → human gate. No new infrastructure. Build it only if/when
this is promoted to an actual roadmap phase; if promoted, it also needs
an ADR and updates to `ARCHITECTURE.md` and `ROADMAP.md`.

Do **not** pursue scraping or third-party paid data for a v1.

---

## 10. ONE Next Action

**Register a Personal App in the Etsy Developer Portal (under our own
shop identity) and run a manual ~20-call spike** — by hand, `curl` or
similar, no code committed — against `findAllListingsActive`, `getShop`,
and `getReviewsByListing` for three seed keywords (e.g. *budget
planner*, *budget spreadsheet*, *savings tracker*). Purpose: confirm the
field availability claimed in §1–§2, measure how deep `offset`
pagination actually goes, and check review-endpoint volume — before any
collector design work begins.

Everything past this point (schema, collector, n8n workflow, scoring
code) stays unbuilt until the owner promotes this to a roadmap phase.

### Status

- **Personal App registered** — 2026-08-27, app name `svnzapp`, status
  *Pending Personal Approval* (5 QPS / 5K QPD until approved). Keystring
  lives in the local git-ignored `.env` as `ETSY_API_KEYSTRING`.
- **Spike script written** — `infrastructure/scripts/etsy-api-spike.sh`
  (read-only, writes nothing, safe to re-run). It exercises steps 1–6
  above and reports which fields are present/`ABSENT` and how deep
  `offset` pagination goes.
- **Blocked on Etsy approval.** Every endpoint returns HTTP 403 while
  the key is pending; the script detects this and says so. Re-run it
  once the Developer Portal shows the key active, then fill the
  placeholder metrics in §7 from real output.
