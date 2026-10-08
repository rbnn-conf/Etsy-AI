# ADR-064: Marketing route contracts, a pre-image route gate, and deterministic listing-claim correction

- **Status:** Accepted (owner request, 2026-10-07). Implemented and tested with fake models only. No live OpenAI,
  image or Etsy call has been made.
- **Scope:** Stage 3 for every format. Product #022 (colouring book) is the worked example.

## Context

Two failures on Product #022 cost money without producing usable output.

1. **Near-duplicate hero routes.** The hero comparison paid for three environments. Hybrid and AI Creative came
   out as the same warm walnut desk with a knitted throw, a mug, leaves and string-light bokeh, with the same
   camera and the same layout. The causes:
   - both engines used ONE baseline hero card;
   - its only allowed composition was `cb-lifestyle-hero`;
   - the concept brief told the model to write exactly that scene for every route ("rich wood, knit, a mug…");
   - the backplate prompt had one fixed camera line for both.

   The only difference between the routes was one "creative latitude" sentence.
2. **`editable` failure.** The listing was rejected with `description/disclaimer: "editable"`. The old rule rejected
   the bare token in any sentence, so a truthful "this is not an editable file" failed too. The rejected paid answer
   was thrown away, so Retry had to pay for a new listing call.

## Decision

1. **Route contracts** (`marketing/src/stage3/routes.mjs`). Each engine's hero has a code-owned, structured route:
   `composition_family`, `camera_angle`, `page_arrangement`, `environment`, `lighting`, `prop_strategy`,
   `visual_story`, `product_focus`, `colour_strategy` and `transformation_demo`.
   - **Factory:** a catalogue flat lay, seen top-down, on a plain neutral surface, with minimal props.
   - **Hybrid:** styled lifestyle, three-quarter overhead. For colouring books it is the transformation demo
     `line_art_plus_coloured_example`: a real page beside a labelled coloured example (composition
     `cb-lifestyle-hero`).
   - **AI Creative:** editorial and cinematic, low eye-level with depth, a narrative set. For colouring books it is a
     single-page reveal (the new composition `cb-editorial-hero`), and the default cosy desk is forbidden.

   The route sets the baseline hero card: its composition, allowed compositions, props, brief and claims. It also
   sets the backplate prompt's Route, Camera, Environment, Lighting, Props and style lines. The Creative Director is
   shown the contract and refines inside it; the model can never change it.
2. **Pre-image route gate** (`routeGate`, `gateBeforeImage`; workflow `#routeGate`, `#gateHeroScene`). Before any
   PAID hero environment image (in the comparison, and for the full-campaign hero), the candidate is compared with
   the routes already produced for the product.
   - **Structure:** a route must differ on at least 3 of the 7 major dimensions. Lighting, colour or focus alone never
     count.
   - **Brief:** briefs are compared by motif groups (wood surface, knit, hot drink, seasonal scatter, fairy lights,
     candle, …). Sharing at least 3 motifs at ≥ 60 % overlap means the same scene. Tea vs coffee or adding a blanket
     changes nothing.
   - A repeated brief is redirected ONCE to the route's code-written brief, with no model call.
   - Structural sameness, or a redirect that still fails, is refused before the image call (`RouteSimilarityError`,
     not retryable).
   - No image similarity check, and no loop.
   - Comparison entries now record `route` and `brief` (`product.schema.json`). Older entries are compared using
     their engine's contract and their saved brief.
3. **Listing claims** (`marketing/src/stage3/claims.mjs`). The facts come from the Stage 2 adapters (`editable`,
   `digital_download`, `physical_item`, formats and page quantities). No second source of truth was added.
   - **Rejected:** an affirmative editable claim, or the instruction "edit the/your … text/file/source/template", unless
     `editable === true`. A clause-level negation ("no editable source files", "not an editable file", "editable
     files are not included", "non-editable") is allowed. A distant negator ("No shipping, fully editable") is not.
   - **New colouring-book rule:** saying coloured, pre-coloured or example pages are included is rejected. The
     coloured example is an illustration only.
   - **Correction layer** (`correctUnsupported`, run BEFORE validation). It only DELETES the qualifier "editable" in
     front of a deliverable noun that exists ("editable printable pages" -> "printable pages").
     - It never substitutes or adds a word.
     - It skips negated mentions, and any sentence about editing, customising or changing.
     - "Editable template" and "edit the included source file" are left alone, so validation rejects them.
   - Validation then runs as before. Corrections are audited in `tag-selection.json`.
   - The listing prompt gets a `DELIVERABLE FACTS` block built from the same facts fields.
4. **No paying twice for a listing.** A listing answer rejected by validation is saved to
   `marketing/listing.rejected.json`, with the SHA-256 of the model-facing facts and the approved SEO focus. The next
   run (Retry or restart) first re-checks that saved answer with the current correction and validation, at no cost.
   - If it passes, it is used and no model call is made.
   - If it still fails, or the facts or SEO focus changed, the model is asked again (one call, as before).

## Alternatives considered

- **Image similarity after generation.** Rejected: it only finds the duplicate after paying for it.
- **More adjectives per engine.** Rejected: that is the failure mode itself.
- **Dropping `editable` from the never-list, or whitelisting the token.** Rejected: it weakens protection against
  real false claims.
- **Asking the model to rewrite the listing on a validation failure.** Rejected: it is a paid loop.

## Consequences

- Colouring-book AI Creative heroes no longer show the coloured example on the hero card. The example is still made
  once (cards 04 and 05). `COLOURING_CREATIVE_VERSION` is now 4, so only the free renders are redone.
- The colouring Factory hero scene is a clean catalogue flat lay (stone surface, studio light) instead of a styled
  desk. Greeting-card and crochet Factory scenes are unchanged.
- **Product #022:** its AI Creative full campaign has not run yet. When it does, its hero will follow the new
  editorial route, which differs from the comparison image the owner picked.
- **Product #022's listing:** its rejected answer was produced before this change and was never saved, so its Retry
  makes one new listing text call. Later rejections are recoverable for free.
- Portable: Node APIs and the product store only; no paths, shells or machine state.
