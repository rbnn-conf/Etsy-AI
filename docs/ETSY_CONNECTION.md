# Etsy shop connection and draft upload

LumiumX uses the Node/TypeScript service in `services/`. The repository has no
public web framework, so the connection command starts a small HTTPS callback
server. Product 005 is accepted only when its build report, production QC,
visual QA, listing metadata, 20 source pages, 10 numbered marketing images and
five customer ZIPs still match the hashes in `listing/etsy-manifest.json`.
An `APPROVED` receipt binds the owner's review to that exact manifest hash.

## Etsy app settings

For local authorization, register this exact redirect URI in the Etsy developer
app (including scheme, port and path):

    https://localhost:8443/etsy/oauth/callback

The command requests exactly `listings_r listings_w`. Shop sections (ADR-054) are
read and assigned with these scopes. Creating a MISSING section needs `shops_w`,
which this connection does not request: create the sections once in Etsy Shop
Manager, or widen the pinned scopes deliberately (a security decision, see
SECURITY.md) and reconnect. Etsy requires an HTTPS
redirect URI and an exact redirect match. The flow uses Authorization Code,
PKCE S256, a single-use state value and a secure browser cookie. The verifier,
state, app secret and tokens never enter browser code.

For a deployed callback, replace `localhost:8443` with its public HTTPS host and
set the same exact value in Etsy and `ETSY_OAUTH_REDIRECT_URI`, for example:

    https://etsy.example.com/etsy/oauth/callback

Route that host to this service, persist `ETSY_STATE_DIR`, mount the encryption
key separately, and terminate with a valid certificate. Run only one callback
or draft process against that state directory at a time.

## Environment variables

Put local values in the repository `.env`, which is ignored by Git. Deployment
values belong in the platform's server-side secret settings.

| Variable | Required | Value |
|---|---:|---|
| `ETSY_API_KEYSTRING` | yes | Etsy app keystring |
| `ETSY_SHARED_SECRET` | yes | Etsy app shared secret |
| `ETSY_OAUTH_REDIRECT_URI` | yes | Exact callback above |
| `ETSY_OAUTH_SCOPES` | yes | `listings_r listings_w` |
| `ETSY_SHOP_ID` | after authorization | Numeric shop ID; must match the reviewed manifest |
| `ETSY_STATE_DIR` | optional | Persistent private state directory; default `services/.secrets/etsy` |
| `ETSY_TOKEN_FILE` | optional | Encrypted token envelope; default `<state>/token.enc.json` |
| `ETSY_TOKEN_KEY_FILE` | yes | Separate persistent 32-byte encryption-key file |
| `ETSY_TLS_CERT_FILE` | callback | PEM certificate path |
| `ETSY_TLS_KEY_FILE` | callback | PEM private-key path |
| `ETSY_CALLBACK_HOST` | optional | Listener address; default `127.0.0.1` |
| `ETSY_CALLBACK_PORT` | optional | Listener port; default URI port or `8443` |

Do not set OAuth access or refresh tokens in `.env`. They are stored in an
AES-256-GCM encrypted envelope with restrictive file permissions. Back up the
encryption key separately; losing it requires reconnecting the shop. The app
secret and encryption key must never be exposed to front-end code.

## Local setup and authorization boundary

Install `mkcert`, trust its local CA, then generate the TLS files outside Git:

    mkcert -install
    mkcert -cert-file services/.secrets/localhost.pem -key-file services/.secrets/localhost-key.pem localhost 127.0.0.1 ::1
    cd services
    npm run etsy:connection -- init-key
    npm run etsy:connection -- prepare --product ../products/005-cozy-autumn-adventures
    npm run etsy:connection -- preflight --allow-unset-sale --product ../products/005-cozy-autumn-adventures

Complete `listing/etsy-manifest.json` with the shop ID, price, shop currency,
seller taxonomy ID, and truthful `whoMade`/`whenMade` values. Inspect all text
and assets, then record approval:

    npm run etsy:connection -- approve --approve --reviewer "YOUR NAME" --product ../products/005-cozy-autumn-adventures

Start the callback server:

    npm run etsy:connection -- serve

Only then open `https://localhost:8443/etsy/connect` and click the button. That
browser action is the point at which the shop owner authorizes Etsy access.

To find the numeric shop ID for `ETSY_SHOP_ID`, run:

    npm run etsy:connection -- shops

It makes one read-only request (`GET /users/{user_id}/shops`, no extra scope)
using the stored token and prints only the shop name and numeric shop ID.
After Etsy returns successfully, run the read-only ownership/scope check:

    npm run etsy:connection -- check

The check reads the configured shop and one page of its drafts. It does not
create or change a listing.

## Create the reviewed draft

After authorization and the read-only check pass:

    npm run etsy:connection -- draft --product ../products/005-cozy-autumn-adventures

The command can create only a draft, forces `type=download`, disables automatic
renewal, uploads images in manifest ranks 1–10 and the five reviewed ZIP files,
then reports the Etsy draft editor URL and every upload result. It rechecks the
remote listing before each write and refuses any listing outside the configured
shop or in a state other than `draft`.

The durable journal is written before draft creation and before each upload.
After a lost create response, retry performs read-only reconciliation using the
unique collection reference and will not create another draft. After an
uncertain upload response, it stops for manual inspection instead of risking a
duplicate. A changed manifest needs a new explicit approval.

This workflow contains no publish, activate, renew or live-listing mutation
operation.

## Stage 4 (the automation bot, ADR-026)

The Telegram bot's `/etsy <id>` uses this same connection: the same encrypted
token, key file, state directory and connection lock. Set it up with `init-key`,
`serve` (owner consent) and a passing `check` as above.

Then set:
- `ETSY_SHOP_ID`;
- `ETSY_SELLER_WHO_MADE` and `ETSY_SELLER_WHEN_MADE`;
- `ETSY_STAGE4_DRY_RUN=false` and `ETSY_DRAFT_WRITES_ENABLED=true`.

Leave `ETSY_PUBLISH_ENABLED` unset until you have inspected a real draft on
Etsy. Do not run the callback server or this CLI while the bot is creating a
draft: both use `connection.lock`.

## Recovery

A crash can leave `connection.lock` in the state directory. Confirm no callback,
check or draft process is running before removing only that lock file. Do not
delete the encrypted token or draft journal to recover a retry; those files are
the evidence that prevents duplicate drafts and uploads.

Implementation follows Etsy's current authentication, request and listing
documentation:

- https://developers.etsy.com/documentation/essentials/authentication/
- https://developers.etsy.com/documentation/essentials/requests/
- https://developers.etsy.com/documentation/tutorials/listings/
