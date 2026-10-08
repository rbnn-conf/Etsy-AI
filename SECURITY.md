# Security

LumiumX holds credentials for Telegram, OpenAI and an Etsy shop. Treat every
rule here as protecting a live credential, because each one does.

## Secrets management

- Real secrets live only in the git-ignored repository-root `.env` and in
  `services/.secrets/` (the encrypted Etsy token, its separate key and the
  localhost TLS files). Nothing else.
- Never hard-code credentials in source code, workflow files, documentation,
  tests or scripts. If you find one, treat it as compromised: rotate it, don't
  just delete the line.
- `.env.example` and `automation/.env.example` document variable *names* only.
  They must never contain real values or plausible-looking fake ones.
- Before committing, run `bash tests/verify-foundation.sh`. It checks that
  `.env` is ignored and that no key, credential or `.env` file is tracked.

### Secrets flow

```text
.env (git-ignored, repo root)
   │  node --env-file-if-exists=../.env   (npm start / check-config / etsy:* scripts)
   ▼
process environment of the one bot process
   ├─ AUTOMATION_TELEGRAM_BOT_TOKEN ─► Telegram Bot API (long-poll, outbound only)
   ├─ OPENAI_API_KEY ──────────────► OpenAI (automation/ only)
   └─ ETSY_API_KEYSTRING/SECRET ──► services/src/etsy ◄── services/.secrets/ (AES-256-GCM token envelope + key)
```

Tests never load `.env`; they run with mocked services.

### Variables

Names and meanings: `.env.example` (Etsy, review chat) and
`automation/.env.example` (bot, OpenAI, limits); full Etsy table in
`docs/ETSY_CONNECTION.md`.

- `OPENAI_API_KEY` is used only by `automation/` (Stage 1 creative and Stage 3
  copy/scenes). Production, rendering and Etsy code have no LLM client
  (`services/test/no-runtime-llm.test.ts`, `automation/test/isolation-and-client.test.mjs`).
- `AUTOMATION_TELEGRAM_BOT_TOKEN` is a secret. `TELEGRAM_CHAT_ID` /
  `AUTOMATION_TELEGRAM_ALLOWED_USER_IDS` are not secrets, but they decide who
  may approve, so they are configured, never hard-coded. Set an allowed-user
  list; without one, anyone in the configured chat can act.
- The Etsy **access and refresh tokens are not environment variables.** They
  are written by the OAuth callback to the encrypted envelope
  (`ETSY_TOKEN_FILE`, default `services/.secrets/etsy/token.enc.json`) and
  decrypted with a separate key file (`ETSY_TOKEN_KEY_FILE`). Losing the key
  means reconnecting the shop. The authorization code, PKCE verifier and state
  are never persisted or printed.

### Development vs. production

There is one environment: the owner's machine. A second developer uses their
own Telegram bot, their own OpenAI key, a scratch products folder and the
Stage 4 dry run, and never receives the owner's `.env` or `services/.secrets/`
(see `DEVELOPER_SETUP.md`).

### Credential rotation

1. Generate the new credential at the provider (BotFather, OpenAI, Etsy).
2. Update the local `.env`; never commit it.
3. Restart the bot (`Ctrl-C`, `npm start`).
4. Revoke the old credential once the new one works.
5. Etsy tokens rotate by reconnecting (`docs/ETSY_CONNECTION.md`); the token
   key file is rotated the same way (new key, reconnect).

## Network boundaries

- All traffic is outbound HTTPS to Telegram, OpenAI and Etsy. The bot opens no
  listening port and has no webhook.
- The only listener is the optional local OAuth callback
  (`npm --prefix services run etsy:connection -- serve`), bound to
  `127.0.0.1:8443` with a local TLS certificate, run only while connecting the
  shop.
- Stage 3 renders listing images in Playwright Chromium with all network
  requests blocked.

## Etsy publishing (Stage 4, ADR-026)

The Etsy token is scoped to `listings_r listings_w` (no delete scope) and
stored encrypted. Making a listing public needs three independent things:

- the owner's PUBLISH and then CONFIRM PUBLISH in Telegram;
- `ETSY_PUBLISH_ENABLED=true` on the machine, checked again inside
  `EtsyService.activateListing`, the only code allowed to send `state=active`;
- a fresh revalidation of the approved files and the remote draft.

Shop sections (ADR-054) are read and assigned within these scopes. Creating a
missing section needs `shops_w`, which is deliberately NOT requested. Widening
the pinned scopes is an owner decision that needs a reconnect. Until then,
missing sections are created by hand in Etsy.

Stage 4 defaults to a dry run with no Etsy requests. Its records and
`etsy/api-activity.json` never contain headers, tokens, keys or query strings,
and every stored or sent error is sanitized. Never create live Etsy objects
during development or tests.

## Logging

- The bot's logger redacts every configured secret and anything shaped like an
  OpenAI key or a bot token (`automation/src/log.mjs`). Never log full
  credential values, even while debugging.
- OpenAI usage is recorded as token counts and prices only, never prompts with
  secrets.

## Backups

See `OPERATIONS.md`. **GitHub is not a backup for secrets.** Back up `.env`
and `services/.secrets/` only to encrypted storage, separately from the
repository.

## Sensitive data

- No customer or buyer data is stored. Etsy access is limited to the shop's
  own listings.
- Product records hold creative content, approvals and Etsy listing IDs only.

## Least privilege

Request the narrowest scope each integration needs (Etsy: `listings_r
listings_w`; Telegram: one chat, an allowed-user list). Broaden only for a
concrete need, and record why in an ADR.
