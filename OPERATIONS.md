# Operations

The system is one Node.js process on the owner's machine. There are no
containers, databases or deployed services.

## Start, stop, check

```bash
npm run check-config   # validate .env, print the next product ID; makes no network call
npm start              # start the Telegram bot; Ctrl-C to stop
```

Startup logs the products folder, the next product ID, the Stage 1
validation fingerprint and image settings. On start the bot moves any step
that was interrupted (for example by Ctrl-C or a crash) to `FAILED` with a
RETRY button; completed work is kept.

Run only **one** bot process per Telegram token.

## Logs

The bot logs to the console with timestamps. Secrets (OpenAI key, bot tokens)
are redacted. Per-product history is in `products/<id>/product.json`
(`status_history`, `api_usage`); Stage 4 Etsy calls are recorded, without
headers or tokens, in `products/<id>/etsy/api-activity.json`.

## OpenAI costs

Every metered call is priced into the append-only ledger in
`automation/state/costs/` (pricing: `automation/config/openai-pricing.json`).
The control panel's cost view reads it.

## What to back up

Git covers code, configuration and product **records** (`product.json`,
approvals, plans, approved artwork, QC and Etsy records). It does not cover:

| Data | Location | Why it matters |
|---|---|---|
| Runtime state | `automation/state/` (registry, Telegram offset, cost ledger, owner status, SEO sessions) | Cost history and SEO sessions are not reproducible |
| Generated binaries | git-ignored paths under `products/*/` (proofs, concept previews, deliverables, packages, marketing images, delivery ZIPs) | Regenerating costs OpenAI money or a rebuild |
| Secrets | `.env`, `services/.secrets/` (encrypted Etsy token + its key, TLS files) | Without the key the shop must be reconnected |

Back these up outside Git, for example:

```bash
# from the repository root: everything git ignores, minus dependencies and secrets
git ls-files -o -i --exclude-standard -z \
  | tr '\0' '\n' | grep -v 'node_modules/' | grep -vx '.env' | grep -v '^services/.secrets/' \
  | tr '\n' '\0' | tar --force-local --null -T - -cf ../dpf-backup-$(date +%Y%m%d).tar
```

Back up `.env` and `services/.secrets/` separately, to encrypted storage only.
GitHub is never a backup for secrets.

## Recovery

| Problem | Action |
|---|---|
| A step failed (OpenAI error, QC failure, interrupted run) | Press RETRY in Telegram. Retries regenerate only what is missing. |
| Bot crashed | Start it again; `recover()` makes interrupted steps retryable. |
| Lost machine | Clone, run the installs in `DEVELOPER_SETUP.md`, restore `.env`, `services/.secrets/`, `automation/state/` and the ignored product binaries from backup. |
| Etsy token lost or key lost | Reconnect the shop: `docs/ETSY_CONNECTION.md`. |
| Etsy draft problem | `/etsy <id>` is idempotent and journalled; `/etsy <id> section` retries only the shop-section step. |

## Updating dependencies

Dependencies are pinned in each package's `package-lock.json`. Update
deliberately in a branch and run `npm test`. Remember that Stage 2 uses the
installs in `products/003-midnight-seance/` and
`products/004-cozy-spooky-coloring/`.
