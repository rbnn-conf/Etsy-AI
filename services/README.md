# services/

`@dpf/services`: the Etsy Open API v3 integration and the Telegram Bot API
client. Library code, not a running service. The automation bot
(`automation/`) is its only runtime consumer:

- Stage 4 reaches Etsy only through `automation/src/stage4/etsy-live.mjs`,
  which imports `etsy/connection-config.ts`, `etsy/secure-store.ts` and
  `etsy/etsy-service.ts` (an isolation test enforces this).
- `automation/src/bot.mjs` uses `telegram/telegram-client.ts` and
  `config/env.ts` (Telegram actor authorisation).

Shop connection and the reviewed-draft workflow: [`../docs/ETSY_CONNECTION.md`](../docs/ETSY_CONNECTION.md).

| Module | What it is |
|---|---|
| `src/etsy/` | The **only** code that talks to the Etsy Open API v3: OAuth (PKCE), encrypted token store, HTTP client, listing/draft/upload/taxonomy/section calls, and `activateListing`, the only path that publishes. |
| `src/etsy/scripts/` | Owner CLI tools: `etsy:connection` (HTTPS callback, shop check, reviewed draft), `etsy:authorize-url`, `etsy:exchange-code`, `etsy:smoke`, `etsy:create-draft`. |
| `src/telegram/telegram-client.ts` | Telegram Bot API client (`fetch`, no dependencies). |
| `src/config/env.ts` | Etsy and Telegram configuration loading. Nothing else reads `process.env` for these secrets. |

The ADR-007/008/009 design, product-repository and review-bot tiers that used
to live here were retired in ADR-069 (kept in the archived original repository).

## Runtime

- **Node ≥ 22.6** (native TypeScript type-stripping; no build step). Node
  24 is what it's developed against.
- **Zero runtime dependencies.** `typescript` + `@types/node` are
  dev-only, for `npm run typecheck`.
- ESM, `.ts` import specifiers (required by Node's native TS loader).

```bash
npm --prefix services ci          # dev deps only (typescript, @types/node)
npm --prefix services run typecheck
npm --prefix services test        # node --test, no network
```

## Environment variables

Names are in the repository-root `.env.example`; meanings and defaults in
`docs/ETSY_CONNECTION.md`. OAuth access and refresh tokens are never
environment variables: they live in the AES-256-GCM envelope under
`services/.secrets/` (git-ignored), decrypted with a separate key file.

## Etsy integration — status

Verified against Etsy's current docs (developers.etsy.com, 2026-08):
OAuth 2.0 authorization-code + **mandatory PKCE (S256)**, auth endpoint
`https://www.etsy.com/oauth/connect`, token endpoint
`https://api.etsy.com/v3/public/oauth/token`, access token 1 h / refresh
token 90 days, base `https://api.etsy.com/v3`.

| Capability | Status | Where |
|---|---|---|
| Config + credential loading | **IMPLEMENTED** | `config/env.ts` |
| HTTP client: retries, exp. backoff + jitter, `Retry-After`, client-side rate limit, error taxonomy | **IMPLEMENTED** | `etsy/http-client.ts` |
| OAuth: PKCE, build authorize URL, exchange code, refresh token | **IMPLEMENTED** | `etsy/oauth.ts` |
| Token persistence (AES-256-GCM encrypted, atomic, git-ignored) | **IMPLEMENTED** | `etsy/secure-store.ts` |
| `ping()` — API-key liveness (`openapi-ping`) | **IMPLEMENTED** | `etsy/etsy-service.ts` |
| `getAuthenticatedUser()` — proves OAuth (`users/me`) | **IMPLEMENTED** | `etsy/etsy-service.ts` |
| `getMyShop()` / `getShop(id)` | **IMPLEMENTED** | `etsy/etsy-service.ts` |
| `getListing` | **IMPLEMENTED** | `etsy/etsy-service.ts` |
| `createListing` (draft, `type=download`), `updateListing` | **IMPLEMENTED** — form-encoded bodies | ″ |
| `uploadListingImage`, `uploadDigitalFile` | **IMPLEMENTED** — multipart via `EtsyRequest.rawBody` | ″ |
| `getSellerTaxonomyNodes` | **IMPLEMENTED** — flattened tree | ″ |
| `etsy:create-draft` script (spec listing.json → real Etsy draft) | **IMPLEMENTED** — needs a stored OAuth token with `listings_w` | `etsy/scripts/create-draft-listing.ts` |
| `getListingsByShop` | **IMPLEMENTED** | `etsy/etsy-service.ts` |
| `getPropertiesByTaxonomyId`, `getListingProperties`, `updateListingProperty` (Stage 4) | **IMPLEMENTED** | ″ |
| `activateListing` — the ONLY path that sets `state=active` (publishes). Refuses unless `ETSY_PUBLISH_ENABLED=true`, the confirmation is `ACTIVATE <listingId>`, and the listing is this shop's draft/inactive digital download. `updateListing` refuses `state=active`. | **IMPLEMENTED** (ADR-026) | ″ |
| Live Etsy calls in automated tests | **NOT DONE** by design | use the smoke script |

Callers use `EtsyService` (`etsy/etsy-service.ts`), never `http-client.ts` and
never a raw `fetch`.

### Connecting a shop (manual, one-time)

```bash
cd services
# 1. print the authorization URL + a PKCE verifier + state
npm run etsy:authorize-url
#    open the URL, approve, copy ?code= from the redirect
# 2. exchange the code for a token set (saved to ETSY_TOKEN_FILE)
ETSY_OAUTH_CODE=<code> ETSY_OAUTH_CODE_VERIFIER=<verifier from step 1> \
  npm run etsy:exchange-code
# 3. smoke-test connectivity (makes real calls)
npm run etsy:smoke
```

`etsy:smoke` checks, stopping at the first failure: config present →
`openapi-ping` (key live) → `users/me` (token works) → resolve + fetch
the shop. Steps 2–3 are skipped with a notice if no token is stored.

