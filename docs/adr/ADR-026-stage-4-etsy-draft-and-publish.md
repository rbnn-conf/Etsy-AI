# ADR-026: Stage 4, Etsy draft creation and explicit publishing

Status: **Accepted** (owner request, 2026-09-28). Extends ADR-023, ADR-024 and
ADR-025. Reuses the Etsy integration layer of ADR-007 (`services/src/etsy`).

## Context

Stage 3 ends at `MARKETING_APPROVED`: an approved listing, ten approved listing
images and an approved Stage 2 customer package. The owner wants these to become
an Etsy listing. Creating a draft and publishing it are separate decisions:
publishing is public, may trigger Etsy's listing fees, and must never happen as
a side effect.

The Etsy client already existed:
- form-encoded draft creation that refuses non-draft states;
- multipart image and file uploads;
- OAuth with PKCE and an AES-GCM encrypted token store with refresh;
- an HTTP client that never blindly retries writes.

The Product 005 workflow in the same layer had a crash-safe draft journal and no
publish path.

## Decision

- **Command:** `/etsy <id>` prepares an Etsy **draft** only. It runs only from
  `MARKETING_APPROVED`, and its first message says nothing will be published.
- **States:** `ETSY_PREPARING`, `ETSY_DRAFT_CREATED`, `ETSY_ASSETS_UPLOADING`,
  `ETSY_DRAFT_VERIFYING`, `AWAITING_ETSY_PUBLISH_APPROVAL`, `PUBLISHING`,
  `PUBLISHED`.
  - `PUBLISHED` is terminal; `MARKETING_APPROVED` is no longer.
  - A failure is `FAILED` with step `etsy`, `etsy-publish` or
    `etsy-refresh`. It resumes from `ETSY_PREPARING` (draft steps) or
    `AWAITING_ETSY_PUBLISH_APPROVAL` (publish), never from a Stage 3 state.
  - A product at or after `MARKETING_APPROVED` can never be rejected, even
    from `FAILED`; the state machine enforces this.
- **Deterministic payload:** `products/<id>/etsy/payload.json` is built from
  the approved Stage 3 listing and images and the Stage 4 customer ZIP.
  - It has title, description, tags, materials, the approved GBP price,
    quantity, `type=download`, `should_auto_renew=false`, `is_supply=false`,
    taxonomy, and optional properties.
  - Every value is checked against Etsy's current rules and never altered.
  - `who_made` and `when_made` are seller declarations from configuration
    (`ETSY_SELLER_WHO_MADE`, `ETSY_SELLER_WHEN_MADE`). If they are missing,
    Stage 4 stops. No model call exists in Stage 4.
- **Taxonomy:** an owner `taxonomy_id` in `etsy/settings.json`, or an exact,
  unique match of the approved category path against Etsy's live seller
  taxonomy. Anything else stops before any write. **Amended by ADR-039:** an
  owner-approved mapping (`automation/config/etsy-taxonomy-map.json`, exact
  path, ID verified live) sits between the product override and the exact
  match.
  - Occasion and colours are set as Etsy properties only on an exact value
    match; otherwise they are recorded as skipped.
- **Customer download:** one deterministic ZIP (`etsy/delivery/`). **Amended
  by ADR-038:** one product may have up to 5 delivery ZIPs, planned and
  verified as a set before any Etsy call.
  - It holds exactly the files the Stage 2 build record lists, never an
    arbitrary folder.
  - It is reopened and every entry compared by SHA-256 with its approved
    source. It must fit Etsy's 20 MB per-file limit, or Stage 4 stops and
    proposes a split without removing anything.
  - Stage 2 files are only read.
- **Images:** the approved PNGs are uploaded in rank order, unconverted.
- **Idempotency:**
  - Intent is written before every non-idempotent POST, and every remote ID
    is recorded immediately (`draft.json`, `uploads.json`).
  - A lost response is reconciled by reading Etsy before any retry:
    - a draft is adopted only if it is the single exact title+description
      match;
    - an image only if its rank and pixel size match;
    - a file only if its name and size match.
  - An unconfirmed create with no visible draft is blocked until the owner
    confirms (`/etsy <id> confirm-no-draft`).
  - A known listing ID is never recreated.
- **Remote verification:** the draft is read back and every managed field
  checked (`verification.json`). A failure means no review and no PUBLISH.
  An `active` listing before approval is critical.
  - Etsy reads title, description, tags and materials back HTML-encoded
    (`'` → `&#39;`). Verification decodes only HTML character references, in
    one pass (`decodeEtsyText`), then compares exactly. Any other difference
    still fails. Added 2026-10-06 after Product #019's description failed on
    one apostrophe.
  - VERIFY_FAILED always names the mismatching fields, both on its first line
    and as short bullets. Telegram shows them under "Mismatch:".
  - REFRESH DRAFT re-reads Etsy. Manual Etsy edits show as drift and block
    publishing; Stage 4 never overwrites them.
- **Publishing, three independent layers:**
  1. Owner: PUBLISH shows a second message with an Etsy-fees warning. Only
     CONFIRM PUBLISH proceeds, bound to the verified fingerprint and valid
     30 minutes.
  2. Server: `ETSY_PUBLISH_ENABLED=true`, checked in the bot **and** inside
     `EtsyService.activateListing`, the only code that sends `state=active`.
     `updateListing` refuses it.
  3. Revalidation immediately before activation: Stage 2 and Stage 3 hashes,
     the ZIP and a fresh remote verification. Any difference aborts.

  Only a remote read-back showing `active` marks `PUBLISHED`
  (`publish-record.json`). RETRY after an interrupted publish only reads Etsy
  and never activates again.
- **Modes:** `ETSY_STAGE4_DRY_RUN` defaults to true (a simulated Etsy with zero
  requests and no publishing, records in `etsy/dry-run/`). Live drafts
  additionally need `ETSY_DRAFT_WRITES_ENABLED=true`.
- **Records and secrets:**
  - `etsy/api-activity.json` logs operation, method, resource, outcome,
    remote ID and HTTP status. It never records headers, tokens, keys, bodies
    or query strings.
  - Every stored or sent error is classified (`AUTH_ERROR`, `RATE_LIMIT`,
    `ETSY_VALIDATION_ERROR`, …) and sanitized.
  - Auth is checked before the first write: stored token, `listings_r` and
    `listings_w` when Etsy reports scopes, token owner owns `ETSY_SHOP_ID`, a
    read probe, and a GBP shop currency.
- **Isolation:** `automation/src/stage4/etsy-live.mjs` is the only automation
  module that imports the Etsy client, and only `bot.mjs` loads it (enforced
  by test). Stage 4 never receives the OpenAI client.

## Alternatives considered

- **Publishing from `/etsy`:** rejected; draft and publish are different
  decisions.
- **Reusing the Stage 2 ZIP directly:** it exists and is hash-recorded.
  Stage 4 builds its own verified delivery ZIP from the build record, as the
  owner asked, and checks that its entries equal the approved Stage 2 ZIP's.
- **Blind retries or two-way sync with manual Etsy edits:** rejected for v1.

## Consequences

- `MARKETING_APPROVED` is now a hand-off point, not the end of the pipeline.
- The first live run needs the one-time shop connection
  (`docs/ETSY_CONNECTION.md`: encryption key, HTTPS callback, owner consent)
  and the seller declarations.
- Etsy's `when_made` enum now includes `2020_2026`.
- Etsy states its digital-file limits (5 files, 20 MB each, names of at most
  70 characters) in its Help Center, not in the API specification.
