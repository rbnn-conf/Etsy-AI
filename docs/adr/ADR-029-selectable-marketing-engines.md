# ADR-029: Selectable Stage 3 marketing engines (Factory, Hybrid, AI Creative)

- **Status:** Accepted (owner request, 2026-09-28)
- **Extends:** ADR-025 (Stage 3). The ADR-023 scoping applies: OpenAI use
  stays in `automation/`, and the deterministic core stays model-free.

## Context

Factory marketing is correct but often reads as a template: small
products, boxed layouts, the same grammar on every image. The owner wants
art-directed Etsy advertising without giving up product truth. That means:
- the real Stage 2 artwork, never redrawn;
- code-rendered claims;
- the same QC as today;
- every call costed.

## Decision

- **One Stage 3, three engines.** The product adapter (`planSlides`) still
  decides WHAT the campaign says and shows. An engine decides HOW it is
  produced (`marketing/src/stage3/engines.mjs`).
  - **`factory`:** the existing pipeline, unchanged. Its images are
    byte-identical to `/market` (tested).
  - **`hybrid`** (recommended, never automatic):
    - One art-direction call (structured, `art-direction` schema). It
      receives the facts, the strategy, the real artwork as an image (colour
      and mood only), its exact aspect ratio and each image's purpose.
    - One environment image per art-directed image (hero, inside, design,
      print, gift), prompted by code around an EMPTY product area.
    - Code composites the REAL Stage 2 artwork into that region, whole, at
      its own ratio, with perspective and shadow, and renders all text.
    - Information images (contents, sizes, digital, several designs) keep
      the Factory layouts. "Several designs" uses the hero's environment.
  - **`ai-creative`:** the same safeguards, with wider AI control:
    - more archetypes (diagonal, overhead, close-up);
    - scale up to 70%;
    - ±8° rotation and perspective;
    - décor.

    Investigated option: letting the model render a finished advert risks
    altered artwork and malformed claims. Instead, its composition is an
    art-direction REFERENCE that code reconstructs deterministically.
- **The model's direction is validated and clamped, never trusted.**
  - Unknown archetypes fall back to the default; numbers are clamped to the
    engine's bounds.
  - Scene briefs that mention cards, paper, text, people and so on are
    rejected.
  - Region geometry comes from the artwork's real aspect ratio. If an
    archetype or a tilt cannot reach the visibility floor, the layout falls
    back and the tilt is dropped.
- **Product-truth safeguards:**
  - the environment prompt forbids product substitutes and reserves an empty
    area;
  - the real artwork covers that region (QC: "product region covered by
    real Stage 2 artwork");
  - a deterministic detector flags flat, paper-like rectangles outside the
    region as ⚠️ warnings. The owner can regenerate that scene.
  - the existing checks all still apply: traceable, unstretched, AI images
    never used as product art, headlines from the plan.
- **QC:** Stage 3 QC is unchanged and always runs. Engine runs add:
  - "marketing engine recorded with the run";
  - "product region covered by real Stage 2 artwork";
  - "engine product visibility floor": hero/design ≥ 45%, gift ≥ 35%,
    inside/print ≥ 30%. It is never below Factory's floor, and justified by
    template, not product.
- **Choice and reproducibility:**
  - `product.json` `marketing.engine` and `engine_chosen`;
  - `plan.json` `engine` {id, version}, with `directions` and
    `campaign_direction`;
  - environments are stored under `marketing/engines/<engine>/scenes/`.

  Switching engines archives the old visuals; the listing is kept. The bare
  `/market <n>` command stays Factory (backwards compatible).
- **Telegram:**
  - the "🛍 MARKETING — choose a style" screen;
  - "❓ Compare Modes";
  - "🆚 Generate Hero Comparison": only 01-hero in all three styles, 2 text +
    3 image calls. Its paid hero direction and environment are reused if
    that engine is then chosen.
  - "🧩 Edit Individual Images": per image, 👀 View, ✨ Regenerate Scene
    (paid, confirmed), 🎨 Change Direction (paid; from an owner instruction)
    and 🧱 Rebuild Composite (free, £0.00, direct).

  Replaced environments go to `marketing/history/assets/`; they are never
  deleted.
- **Costs:**
  - every call goes through the metered client into the ledger
    (`marketing-direction` → stage "Marketing");
  - confirmations show an estimate: call counts × the ledger's recent
    average per call;
  - the review shows "Marketing generation" and "Product total".

## Consequences

- An engine campaign costs about 2 text calls + 6 image calls (two-design
  card), against Factory's 2 + 4. A comparison costs 2 + 3.
- The fake-product detector is a heuristic: it can miss a textured fake card
  or flag a white tablecloth. It warns and never blocks. The owner's visual
  review stays the gate.
- Colouring books still have no Stage 3 support (ADR-028).
