# Prompt 6 — Host-planning pages

Status: production candidate complete; owner visual approval pending. Branch: `feature/product-3-midnight-seance`.

## Delivered inventory

H01–H10 are complete without changing the approved 48-master inventory: party overview and priorities; four-week checklist; currency-neutral budget/payment tracker; 20-row guest and RSVP tracker; menu/dietary planner; drinks/apothecary bar planner; shopping and supplies; décor/lighting/table plan; evening timeline; and day-of setup/cleanup.

Every master is supplied as Signature Ivory and Economy White in separate A4 and US Letter layouts: 40 PDFs and 40 300 dpi page previews. All text, tables, checkboxes, writing lines and the H08 sketch grid are deterministic. Accepted Prompt 3 assets C04, E05, D02 and B04 appear only in non-writing header/footer zones.

## Functional verification

The inventory reconciles 18 stationery + 16 games + 10 host pages + 4 instruction pages to 48 masters. H04 has exactly 20 numbered rows. H02 contains four five-item weekly sections. The budget uses no currency symbol. Alcohol-free drinks, dietary needs, access, pathways, flame/heat, delegation, cleanup, returns and pack-away are explicit. Stable content tests cover 10 budget categories, six bar rows, 12 timeline rows and three six-task day-of sections.

The Product 3 suite passes 30 tests. Matrix QC passes 40 PDFs, 40 pages, ten masters, two treatments and two formats, including embedded fonts, selectable text and physical dimensions within 0.25 mm. Every page was reviewed through ten hash-bound four-up inspection sheets; H04, H08 and H10 also received a focused functional comparison. No clipping, overflow, writing-zone collision, misaligned checkbox, inaccessible table, or excessive Economy White ink area remains. Physical print testing remains scheduled for Prompt 8.

Review root: `storage/products/003/prompt-06-review/`. Key evidence: `page-format-manifest.json`, `reports/automated-qc.json`, `reports/matrix-qc.json`, `reports/visual-inspection.json`, `contact-sheets/full-colour-A4.jpg`, `contact-sheets/economy-A4.jpg`, and `contact-sheets/functional-detail-comparison.jpg`.

Telegram status: no material was sent because no approved Product 3 recipient/path was supplied. No owner decision blocks implementation; visual approval of these planning pages is required before Prompt 7.

## Functional correction

The original candidate’s H01–H09 layouts omitted fields from the full authorized specification. They have been rebuilt and validated against visible rendered output. See `PROMPT_06_FUNCTIONAL_CORRECTION.md`. H03–H09 are landscape; H01, H02 and preserved H10 are portrait. The current review artifacts and manifests supersede the initial Prompt 6 candidate.
