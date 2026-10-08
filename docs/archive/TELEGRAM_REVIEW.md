# Telegram product review workflow

A phone-first human review gate for generated Etsy products. When a
product passes QC, a Telegram message arrives with the product facts, the
actual files, and **APPROVE / REJECT** buttons. Pressing APPROVE runs the
existing Etsy draft-creation path; nothing is ever published automatically.

Status: **IMPLEMENTED** for Product #001. Code: `services/src/telegram/`
and `services/src/review/`. Decision record: `docs/adr/ADR-009-telegram-review-workflow.md`.

```
Product generated ─▶ QC (products/<id>/render/qc.mjs)
                          │ pass
                          ▼
        npm run telegram:submit-review           (assemble + notify)
                          │
                   Telegram (visual review — PNGs only), in order:
                     1. 🛍️ PRODUCT READY FOR REVIEW  — ONE concise message
                        (name/#/price in GBP, pages, variants, design,
                        target customer, QC result, Etsy title, tags)
                        + [📖 View Product] [🖼️ Listing Images] [📝 View Listing]
                        + [✅ APPROVE] [❌ REJECT]
                     2. page previews  (Product #001: 8 curated pages of the
                        default theme + 1 page across all 5 themes for
                        comparison — 13 total, not every page/theme/mode;
                        other products: primary variant only by default;
                        albums of 10, leftover via sendPhoto)
                     3. the Etsy listing images  (one album; Product #001: 10, ADR-019)
                     — NO PDFs. The customer PDFs stay in storage.
                          │
              npm run telegram:review-bot  (long-polls getUpdates)
                          │
              ┌───────────┴───────────┐
          ✅ APPROVE               ❌ REJECT
              │                        │
   ReviewService.approve()   ReviewService.reject()
              │                        │
   ListingBackedDraftCreator     state → REJECTED
              │                  (no Etsy draft)
   EtsyService.createListing (draft, price in the SHOP currency)
   + uploadListingImage ×5
   + uploadDigitalFile ×2   ◀── the A4 + US Letter PDFs FROM STORAGE
              │
   state → ETSY_DRAFT_CREATED
   Telegram: 📋 ETSY DRAFT CREATED  (listing id + edit URL)
              │
   Human opens Etsy, does the final review, hits Publish
```

## Configuration

Repo-root `.env` (names only in `.env.example`):

| Variable | Required | Meaning |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | to send | Bot token from @BotFather. **Secret** — never committed, logged, or echoed into a message. |
| `TELEGRAM_CHAT_ID` | to send | The one chat the bot posts to and accepts button presses from. |
| `TELEGRAM_NOTIFICATIONS_ENABLED` | no (default `true`) | `false` / `0` / `no` / `off` → the review service uses a no-op notifier; the pipeline is unaffected. |
| `TELEGRAM_ALLOWED_USER_IDS` | no | Comma/space-separated Telegram user IDs allowed to APPROVE/REJECT. Empty → any user in `TELEGRAM_CHAT_ID` (fine for a private 1:1 chat). |

`loadTelegramConfig()` never throws. `canSendTelegram()` is true only when
enabled **and** token **and** chat id are all present.

### One-time bot setup

1. Message **@BotFather** → `/newbot` → copy the token into
   `TELEGRAM_BOT_TOKEN`.
2. Start a chat with your new bot, send it any message.
3. Get your chat id: `curl "https://api.telegram.org/bot<token>/getUpdates"`
   and read `result[].message.chat.id`. Put it in `TELEGRAM_CHAT_ID`.
4. (Recommended) put your own numeric user id in `TELEGRAM_ALLOWED_USER_IDS`.

## Review state machine

`services/src/review/review-state.ts` is the single source of truth.

```
GENERATED ──▶ QC_PASSED ──▶ AWAITING_REVIEW ──▶ APPROVED ──▶ ETSY_DRAFT_CREATED ──▶ PUBLISHED
    │                            │                 │
    └──▶ QC_FAILED ──▶ GENERATED └──▶ REJECTED     └──▶ ETSY_DRAFT_FAILED ──▶ APPROVED (retry)
                                                              └──▶ ETSY_DRAFT_CREATED
                                                              └──▶ REJECTED
```

- `PUBLISHED` exists for completeness; this workflow never sets it —
  publishing is a manual Etsy-UI action.
- One JSON file per product: `storage/products/<id>/review-state.json`
  (`storage/**` is git-ignored). It carries the current state, the full
  transition history, the live request nonce, and — once created — the
  Etsy listing reference.

### Guarantees (enforced by `ReviewService`, covered by tests)

- APPROVE acts only on `AWAITING_REVIEW` (or retries `ETSY_DRAFT_FAILED`).
- A product that **failed QC** or was **rejected** can never be approved.
- APPROVE is **idempotent**: a second press never creates a second draft
  (returns `already_done`). Concurrent presses are serialised by an
  in-process lock — one does the work, the other gets `busy`.
- A **stale keyboard** (button from an older review message, i.e. a
  different nonce) is refused.
- A **failed draft** leaves the product in `ETSY_DRAFT_FAILED` (retryable),
  never in a "created"/"published" state.
- Notification delivery is **best-effort**: a Telegram outage is logged and
  never blocks or reverses a state change.

## Security

- The Telegram `update` is untrusted. Before any state change the
  dispatcher checks `isTelegramActorAuthorized()`: the callback's
  `message.chat.id` must equal `TELEGRAM_CHAT_ID`, and — when
  `TELEGRAM_ALLOWED_USER_IDS` is set — `from.id` must be on that list.
- `callback_data` is re-validated by `parseCallbackData()` (version tag,
  known action, safe product id, nonce shape, 64-byte cap). Anything
  malformed is answered and ignored.
- No inbound webhook, no public endpoint — the bot long-polls
  `getUpdates`.
- Etsy errors surfaced to Telegram are categorised (`authorization`,
  `rate_limit`, `network`, `api_5xx`, …) and scrubbed of anything
  token-shaped before display.

## Etsy integration

The review layer never builds an Etsy request. On APPROVE,
`ListingBackedDraftCreator` loads `products/<id>-*/listing/listing.json`
and calls `createDraftFromListingSpec(service, …)` — the **same** function
the `etsy:create-draft` CLI uses — against the shared `EtsyService`
(`services/src/etsy/`). It needs a stored OAuth token with `listings_w`
(run the `etsy:authorize-url` / `etsy:exchange-code` flow first).

```
Telegram ▶ dispatchCallback ▶ ReviewService ▶ ListingBackedDraftCreator ▶ EtsyService ▶ Etsy API
```

## Commands

### Safe manual test (fake Etsy, throwaway state)

No real listing is created; review state goes to a temp dir.

```bash
cd services
npm run telegram:review-demo -- --approve          # submit → fake APPROVE → fake draft
npm run telegram:review-demo -- --reject           # submit → fake REJECT
npm run telegram:review-demo -- --approve --fail-etsy   # exercise the failure path
npm run telegram:review-demo -- --approve --real-telegram  # send to a real chat, still fake Etsy
```

Console output shows the review request, every event, and the final
`review-state.json`.

### Real run — Product #001

```bash
cd services

# 0. one-time: bot setup (above) + Etsy OAuth token with listings_w
npm run etsy:authorize-url
ETSY_OAUTH_CODE=... ETSY_OAUTH_CODE_VERIFIER=... npm run etsy:exchange-code
npm run etsy:smoke

# 1. send the product into review (real Telegram):
#    one concise message + A4 page previews + listing images. No PDFs.
npm run telegram:submit-review -- --product 001
#   → writes storage/products/001/review-state.json (state: AWAITING_REVIEW)
#   → --console to preview without Telegram
#   → --all-preview-variants to also send the US Letter previews

# 2. run the bot; press APPROVE / REJECT on your phone
npm run telegram:review-bot
#   APPROVE → creates the Etsy DRAFT, uploads the listing images and the
#             A4 + US Letter PDFs FROM STORAGE, state → ETSY_DRAFT_CREATED,
#             edit URL sent back to Telegram
#   --once  → drain pending presses and exit (for scripted testing)

# 3. open the edit URL from the Telegram confirmation, review, Publish in Etsy
```

## Notifications

| Event | Heading |
|---|---|
| Product ready | 🛍️ PRODUCT READY FOR REVIEW |
| QC failed | ⚠️ PRODUCT QC FAILED |
| Approved | ✅ PRODUCT APPROVED |
| Etsy draft created | 📋 ETSY DRAFT CREATED |
| Etsy draft failed | ❌ ETSY DRAFT CREATION FAILED |
| Rejected | 🚫 PRODUCT REJECTED |

## What you can inspect from the phone

Telegram is a **visual** review surface — it answers *"would I actually
sell this?"* from images, not files:

| Want to check | Where it is in Telegram |
|---|---|
| The product design, representative pages | the page-preview album (Product #001: 8 curated pages, one per functional area, plus 1 page across all 5 themes — see ADR-017) |
| The Etsy marketing images | the listing images (one album; Product #001: 10, ADR-019) |
| Name / price (GBP) / pages / variants / design / target / QC / title / tags | the one headline message |
| Full QA/output/theme rollup + which exact build this is (Product #001) | STATUS / OUTPUTS / THEMES / PREVIEWS blocks + Version/Build/Generated/Theme line in the headline message, when present |
| Full description | not sent by default — it's in `products/<id>/listing/listing.json`. `renderListingCopy` can post it on request. |

The **customer PDFs are never sent to Telegram**. They stay at
`storage/products/<id>/final/*.pdf` and are uploaded to Etsy on APPROVE.

Both page-size variants render to the same layout at different paper
sizes, so only the **primary variant** (A4) previews are sent — pass
`--all-preview-variants` to `telegram:submit-review` to send every variant.

## Currency

The product-review UI and the listing model use **GBP** (the project is
run from the UK). `products/<id>/listing/listing.json` carries an explicit
`currency` + `price` (amount); Product #001 is `"GBP"` / `5.99`, shown as
`£5.99 GBP`. `assembleSubmission` reads the currency from the listing —
never a hard-coded default.

Etsy is separate: `createDraftFromListingSpec` sends the amount **verbatim**
and Etsy prices it in the **shop's** currency (returned by `getMyShop`).
If `listing.json.currency` ≠ the shop currency the draft script warns and
still sends the amount as-is — this project does **no FX conversion**.

## File-size handling

Telegram bot uploads are capped (~50 MB/file; we use a 45 MB guard).
Product #001's preview/listing PNGs are ≤ ~320 KB. An image over the guard
is skipped, named, and a one-line note is sent — the headline message and
buttons still go through. Album delivery is best-effort per group: one
failed album never blocks the headline or the other albums.

## What this is not

No PDF delivery over Telegram, no regeneration button (can't be done safely
from the existing pipeline), no `PUBLISH` button (deliberate — added later,
after several products are proven), no webhook server, no multi-product
dashboard, no new Etsy client, no FX system.
