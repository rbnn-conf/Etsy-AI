# ADR-068: Crochet plans declare their collection type and reserve role slots first

- **Status:** Accepted (owner request, 2026-10-07). Implemented and tested with a fake model only.
- **Scope:** the Stage 1 crochet collection plan (`crochet-plan` call and `planProblems`). Drafting, the validator
  bundle, the visual set, Stage 2, Stage 3 and Stage 4 are unchanged.

## Context

Product #024 ("Little Halloween Costume Accessories", 3 patterns) failed at planning with:

- no focal piece;
- no foliage or structural pieces;
- no combination joining a focal piece with foliage or stems (Telegram truncated this third error).

The arrangement rules (made for #016's bouquets) applied whenever `combinations` was non-empty. But the prompt and
schema described combinations generically, as "ways to combine the patterns". The roles were botanical ("main bloom",
"leaves"), and nothing said when a collection is an arrangement. A costume set the model suggested wearing together
was therefore judged as a bouquet. With only 3 patterns it would have needed one of each of three role groups.

The causes were B (requirement not explicit), D (the planner did not know what kind of collection it was) and E (a
3-pattern brief cannot satisfy a bouquet's roles without an explicit decision). The validator itself was correct for
arrangements. The rejected plan was also discarded, so it could not be inspected.

## Decision

1. **Schema** (`crochet-plan.schema.json`). Two new required fields come BEFORE `patterns`, so the model decides them
   first:
   - `collection_type`: `arrangement` (assembled into one composition, at least 3 patterns), `coordinated-set` (used or
     worn together) or `independent` (no combinations).
   - `role_plan`: a count for each role in the existing enum.

   Role and combination descriptions are now theme-neutral.
2. **Validator** (`planProblems`):
   - `role_plan` must add up to exactly the brief's count and match the patterns' roles. Roles are allocated inside
     the count; a pattern is never added to fill a role.
   - The arrangement rules are unchanged, and now apply to declared arrangements, plus a clear "an arrangement needs
     at least 3 patterns" error.
   - An independent collection may not list combinations.
   - A plan without `collection_type` (made before this ADR, e.g. #016) is judged exactly as before.
3. **Prompt.** The prompt and the count rule state this order: collection type, then role plan, then patterns. They
   also say a 1- or 2-pattern brief cannot be an arrangement.
4. **Diagnosis.** A rejected plan reports every problem (no `slice(0,4)`). It is saved to
   `crochet/plan.rejected.json`, for diagnosis only and never used as a plan.
5. **One source of truth for names.** `PLAN_ROLES` and `COLLECTION_TYPES` equal the schema enums (enforced by a test).

## Alternatives considered

- **Dropping the arrangement rules, or not applying them when the count is small.** Rejected: it weakens the #016
  integrity.
- **Inferring the type from titles or theme words.** Rejected: fragile, and theme-specific.
- **Repairing an invalid plan in code.** Rejected: it would invent roles or patterns.

## Consequences

- Costume, nursery, table and ornament sets plan as coordinated sets, with no forced leaves or stems.
- Bouquets, wreaths and garlands keep every #016 rule.
- Every requirement is still checked right after the single plan call, before any pattern is drafted. A rejection
  costs only that one call.
