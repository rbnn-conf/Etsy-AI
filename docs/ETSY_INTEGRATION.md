# Etsy API Integration

How the project talks to Etsy. Code lives in `services/src/etsy/`
(ADR-007). This document is the architecture; `services/README.md` is the
operational quick-reference.

Status legend: **IMPLEMENTED** · **PLANNED** (interface exists, throws) ·
**BLOCKED/PENDING**.

## Boundary

```
Product Pipeline / n8n
        │        imports services/src/etsy/index.ts ONLY
        ▼
   EtsyService  ─────────  the single choke point
        │
        ▼
  EtsyHttpClient   (x-api-key + bearer, retries, backoff, rate limit)
        │
        ▼
   Etsy Open API v3   https://api.etsy.com/v3
```

Nothing outside `services/src/etsy/` constructs an Etsy HTTP request or
imports `http-client.ts`. The pipeline depends on the `IEtsyService`
interface, not the concrete class.

## Authentication (verified against Etsy docs, 2026-08)

Etsy Open API v3 uses **OAuth 2.0 authorization code with PKCE**. PKCE
(`S256`) is mandatory on every authorization request.

| Thing | Value |
|---|---|
| Authorization endpoint | `https://www.etsy.com/oauth/connect` |
| Token endpoint | `https://api.etsy.com/v3/public/oauth/token` |
| API base | `https://api.etsy.com/v3` |
| `client_id` | the app **keystring** (`ETSY_API_KEYSTRING`) |
| `x-api-key` header | required on **every** call (keystring) |
| Access token TTL | 3600 s |
| Refresh token TTL | 90 days (rotates on each refresh) |
| Scopes (this project) | `shops_r listings_r listings_w` (override via `ETSY_OAUTH_SCOPES`) |

Flow, as implemented in `oauth.ts` + the `etsy:*` scripts:

1. `buildAuthorizationUrl()` with a fresh `createPkcePair()` + `generateState()`.
2. User approves in a browser; Etsy redirects to `ETSY_OAUTH_REDIRECT_URI`
   with `?code=&state=`.
3. `exchangeAuthorizationCode()` → `EtsyTokenSet`, persisted by a
   `TokenStore`.
4. `EtsyService` calls `refreshAccessToken()` automatically when the
   stored access token is within 60 s of expiry (single-flight).

### Two distinct Etsy credentials — do not conflate

| | Read-only research | Shop integration (this layer) |
|---|---|---|
| Credential | `ETSY_API_KEYSTRING` as `x-api-key` only | keystring **+ OAuth token** |
| Consumer | `infrastructure/scripts/etsy-api-spike.sh` | `services/src/etsy/` |
| Access | public listing/shop/review reads | the connected shop's own listings/files |
| OAuth | none | required |

## Error handling & resilience — IMPLEMENTED

`http-client.ts` maps every outcome onto the `EtsyError` taxonomy
(`errors.ts`):

| Type | Cause | Retried? |
|---|---|---|
| `EtsyAuthError` | 401 / 403 | no |
| `EtsyRateLimitError` | 429 | yes — honours `Retry-After`, else backoff |
| `EtsyApiError` | other non-2xx | only 5xx |
| `EtsyNetworkError` | transport failure / timeout | yes |
| `EtsyNotImplementedError` | a PLANNED method was called | n/a (fails loudly) |

- Exponential backoff with **full jitter**, capped; default 4 attempts.
- **Client-side rate limiting**: minimum spacing between requests,
  enforced through a serial queue so concurrent callers still comply.
  (Etsy default quota: 10 req/s, 10 000 req/day.)
- Per-request timeout via `AbortController` (default 30 s).

## Endpoint status

| Method | HTTP | Status | Scope |
|---|---|---|---|
| `ping()` | `GET /application/openapi-ping` | **IMPLEMENTED** | api key |
| `getAuthenticatedUser()` | `GET /application/users/me` | **IMPLEMENTED** | any token |
| `getShop(id)` | `GET /application/shops/{shop_id}` | **IMPLEMENTED** | api key |
| `getMyShop()` | `users/me` → `users/{id}/shops` → `shops/{id}` | **IMPLEMENTED** | token |
| `getListing(id)` | `GET /application/listings/{listing_id}` | **IMPLEMENTED** | api key |
| `getListingsByShop()` | `GET /application/shops/{shop_id}/listings` | **PLANNED** | `listings_r` |
| `createListing()` | `POST /application/shops/{shop_id}/listings` (form-encoded, `state=draft`, `type=download`) | **IMPLEMENTED** | `listings_w` |
| `updateListing()` | `PATCH /application/shops/{shop_id}/listings/{listing_id}` (form-encoded) | **IMPLEMENTED** | `listings_w` |
| `uploadListingImage()` | `POST …/listings/{listing_id}/images` (multipart) | **IMPLEMENTED** | `listings_w` |
| `uploadDigitalFile()` | `POST …/listings/{listing_id}/files` (multipart) | **IMPLEMENTED** | `listings_w` |
| `getSellerTaxonomyNodes()` | `GET /application/seller-taxonomy/nodes` | **IMPLEMENTED** | api key |

The listing-write path was implemented for the first real product (Product
#001). `createListing`/`updateListing` send **`application/x-www-form-urlencoded`**
bodies (tags/materials comma-joined), not JSON; uploads send
`multipart/form-data` via `EtsyRequest.rawBody` (the HTTP client leaves the
`content-type` to `fetch` so the multipart boundary is set correctly).
`createListing` always creates in `draft` state — publishing stays a manual
step in the Etsy UI after human review.

The shared core is `services/src/etsy/create-draft.ts` →
`createDraftFromListingSpec(service, listing, …)`: resolves the shop,
resolves the taxonomy id from `getSellerTaxonomyNodes`, creates the draft,
uploads images then digital files (ranked). Two callers, one path:

- `services/src/etsy/scripts/create-draft-listing.ts` (`npm run
  etsy:create-draft <listing.json> [--dry-run]`) — the manual CLI; also
  writes `storage/products/<id>/etsy-draft.json`.
- `ListingBackedDraftCreator` in the Telegram review workflow — invoked
  when APPROVE is pressed (ADR-009, `docs/archive/TELEGRAM_REVIEW.md`). It does
  **not** build Etsy requests itself; it calls the same function against
  the same `EtsyService`.

`getListingsByShop` remains unimplemented (not needed yet).

### Currency

`listing.json` declares an explicit `currency` + `price` (amount). Product
#001 is `"GBP"` / `5.99` (UK operation). Etsy sets a listing's price in the
**shop's** currency (from `getMyShop`), so `createDraftFromListingSpec`
sends `price` **verbatim** — it never converts. When `listing.json.currency`
differs from the shop currency the result carries `currencyMismatch: true`,
the CLI prints a warning, and `etsy-draft.json` records
`listingCurrency` / `shopCurrency` / `priceAmount`. There is deliberately
**no FX system** — set `listing.json` to the shop currency (or change the
shop currency in Etsy) if they diverge.

## Secrets

Per `SECURITY.md` / ADR-006:

- `ETSY_API_KEYSTRING`, `ETSY_SHARED_SECRET`, `ETSY_OAUTH_REDIRECT_URI` →
  repo-root `.env` (git-ignored), names in `.env.example`.
- Access + refresh tokens → `ETSY_TOKEN_FILE`
  (`services/.secrets/etsy-token.json` by default), git-ignored by
  `services/.gitignore` **and** the root `*token*.json` rule. Never
  committed, no recovery from git — re-run the OAuth flow.
- A production deployment swaps `FileTokenStore` for n8n's encrypted
  credential store or a secrets manager; `TokenStore` is that seam.

## Manual smoke test

See `services/README.md` → "Connecting a shop". `npm run etsy:smoke`
performs: config check → `openapi-ping` → `users/me` → shop fetch. All
`403` while the Etsy app key is still pending approval — expected; re-run
once active.

## Not in scope for this phase

Listing CRUD, image/file upload, taxonomy lookup, the publish workflow,
n8n wiring, and any live-call integration test harness. Those arrive with
the Etsy publishing phase (see `ROADMAP.md`).
