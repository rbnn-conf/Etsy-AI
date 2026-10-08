# ADR-023 — Stage 1 creative orchestrator (scoped LLM use, outside production)

Status: **Accepted** (owner request, 2026-09-27). Narrows, but does not
supersede, ADR-013.

## Context

ADR-013 made the production pipeline (spec → PDF/XLSX → marketing → QC →
Telegram review → Etsy draft) fully deterministic, with no runtime LLM. The owner now wants an
upstream, pre-production step: turn a Telegram request (plus optional
reference images) into three concepts, a structured page specification and
three style proofs for approval. That is creative exploration that needs a
model: vision analysis, ideation and image generation.

## Decision

- Build it as a separate package, `automation/` (Stage 1), using the OpenAI
  Responses API (strict JSON schema, image input) and the Images API via plain
  `fetch`, with no SDK.
- ADR-013 still governs everything it covered. The production pipeline must
  not import `automation/`; `automation/test/isolation-and-client.test.mjs`
  enforces this, and `services/test/no-runtime-llm.test.ts` is unchanged and
  still passing.
- OpenAI variable names live in `automation/.env.example`, not the root
  `.env.example` (which the ADR-013 guard keeps LLM-free). Values go in the
  same git-ignored root `.env`.
- Stage 1 uses its own Telegram bot token, because the Bot API allows one
  `getUpdates` poller per token. It reuses `TelegramClient` (which gains an
  additive `getFile`/`downloadFile`) and `isTelegramActorAuthorized`.
- It stops at `CREATIVE_APPROVED`. It never generates full artwork, runs
  production builds, calls Etsy or makes marketing.
- `product.json` in each new `products/NNN-slug/` workspace is the
  machine-readable source of truth, schema-validated on every save, with an
  explicit persisted state machine.

## Alternatives considered

- **Put it in `services/`.** That would break the ADR-013 guard or require
  weakening it; rejected.
- **Share the review bot's token.** Two pollers would steal each other's
  button presses; rejected. It is allowed only via an explicit override, and
  never concurrently.
- **Official OpenAI SDK.** A new dependency for two endpoints; rejected in
  favour of ~100 lines of `fetch`.
- **Generate the whole product immediately.** Too costly and unreviewable;
  rejected in favour of 3 proofs plus an approval gate.

## Consequences

- Model output is non-deterministic and costs money. This is accepted only at
  the creative-exploration stage, behind explicit owner approval, with
  locking against duplicate spend.
- Model names are configuration, not code; they will need updating over time.
- Stage 2 is now defined by ADR-024 (deterministic production, `/produce`).
- A later Stage 2 must define how a `CREATIVE_APPROVED` `product.json` hands
  off to production without breaking ADR-013's determinism for the customer
  deliverable.

## Amendment (2026-09-27): visual concept selection

The owner found long written concept descriptions hard to judge. Concept
choice is now visual. After ideation, one low-cost preview image per concept
is generated and sent to Telegram as three captioned photos. The owner then
chooses A, B or C. This adds two explicit states, `CONCEPT_PREVIEWS_GENERATING`
and `AWAITING_CONCEPT_SELECTION`.

This is a separate gate from creative approval. Previews answer "which idea?";
the 3 creative proofs after the specification answer "is this design good
enough to build?".

Consequences:

- Up to 3 extra image calls before selection, per concept batch, at the
  model's cheapest documented quality.
- Batches are capped by `AUTOMATION_MAX_CONCEPT_BATCHES` (default 3), and
  progress is saved per image, so a retry or restart never pays twice for a
  finished preview.
- Structured concept JSON is unchanged in role and gains `tagline`,
  `orientation` and `preview_brief`.

## Amendment (2026-09-27): shared style vs concept content, and diversity

Product #009's first previews were three near-identical pictures of a fox
carrying a parcel. The references (a rabbit, a squirrel and mice) contained
no fox. The creative-direction step invented one concept and wrote it into
the shared direction's style fields, and every concept and preview prompt
inherited it.

Decision:

- The creative direction is style only, by prompt, by schema description and
  by a `scope` stamp.
- Concepts carry their own `visual_route`.
- A deterministic check rejects a batch whose routes don't differ on at least
  3 of 5 dimensions, before any image is paid for.
- A leak guard keeps concept content found in the direction out of preview
  prompts.
- Legacy directions are rebuilt once from the saved reference analysis.
- Owner-required subjects are exempt from the diversity check.
