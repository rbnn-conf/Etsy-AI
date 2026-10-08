# ADR-055: Windows-safe Stage 2 writes and a per-product build lock

- **Status:** Accepted (owner request, 2026-10-05).
- **Amends:** ADR-024 (Stage 2 production).

## Context

#016's Stage 2 build stopped with `EPERM: operation not permitted, rename
'…\production\build-record.json.tmp-18060' -> '…\production\build-record.json'`.

- **Who wrote:** one process (the bot, pid 18060) and one build. The record is
  saved after every output (about 75 times), and each save awaits the previous
  one. The update before had replaced `build-record.json` 7 ms earlier.
- **Cause:** Windows refuses to rename over a file that another program holds
  open for a moment, typically antivirus or the search indexer reading a
  just-written file, or an editor re-reading it. `atomicWrite` made a single
  attempt.
- **What survived:** both `build-record.json` (45 outputs) and the leftover
  temp file (46 outputs) were complete, valid JSON.
- **Latent risk:** the temp name was only `<file>.tmp-<pid>`, so two
  overlapping writes to one file in one process would share a temp file.
- **Concurrency gap:** inside one bot, the persisted product lock and the
  one-update-at-a-time loop serialise steps. A second bot started mid-build,
  however, runs restart recovery, which clears that product lock. It can then
  take over Telegram polling and accept a Build press while the first bot is
  still writing.

## Decision

- **`atomicWrite` (`production/src/lib.mjs`):**
  - The temp name is unique per write (`<file>.tmp-<pid>-<8 hex>`).
  - On Windows only, a rename refused with EPERM, EBUSY or EACCES is retried
    after 50, 100, 200 and 400 ms (5 attempts). The original error is then
    thrown unchanged.
  - A failed write removes its temp file. The destination is never deleted
    first, so it is always the previous complete version or the new one.
  - Other codes and other platforms behave as before: no retry.
- **Build lock (`production/src/build-lock.mjs`):** `production/.build.lock`
  records `{pid, host, id, at}`. The bot's whole production step (handoff,
  build, QC) runs inside `withBuildLock`, which always releases in `finally`.
  - **Refused:** another holder makes the step fail with `BuildLockedError`,
    which is retryable and changes nothing.
  - **Recovered:** a lock is replaced only when it is still the same lock after
    a re-read, and only if its owner process has ended, it is more than 2 h
    old, it was left by this process and is not currently held, or it is
    unreadable and more than 60 s old.
  - **Never removed:** an active lock, or another machine's lock before it
    expires.
- **Temp cleanup:** each build first removes `*.tmp-*` files under
  `production/` that are more than 10 minutes old or whose owner process has
  ended. Nothing else is touched.
- **Telegram copy:** a production failure with EPERM, EBUSY or EACCES reads
  "⚠️ Product #N build paused / Windows temporarily locked a production file. /
  No work was lost. / Retry is free." The raw error and path stay in the bot
  log and `last_error`. A held build lock reads "build already running". No
  retry is ever automatic.

## Alternatives considered

- **Delete the destination, then rename:** rejected. A crash between the two
  steps would leave no record.
- **Unbounded retry:** rejected. It can hang a build behind a stuck handle.
- **A single-instance bot lock:** it would not cover other callers, and the
  per-product lock is smaller.

## Consequences

- **Retry stays free:** finished outputs whose hashes match are skipped, and an
  output written but not yet recorded is rebuilt deterministically.
- **Retry is not guaranteed to work:** a file held open for more than about
  750 ms still fails the step, with plain copy and a free Retry.
- **Recovering an existing temp:** a leftover named after the still-running
  bot's process ID is removed once it is more than 10 minutes old.
