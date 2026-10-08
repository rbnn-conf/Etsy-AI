# docs/archive/

Superseded documents, kept for history only (ADR-069, 2026-10-08). They
describe code, products or plans that no longer exist in the active tree, so
paths and commands inside them may not work. The current documentation starts
at the repository `README.md`.

| Document | What it was | Superseded by |
|---|---|---|
| `product-3/` | Build prompts, specifications and reports for Product #003 (Midnight Séance), 2026-09-17 to 09-23 | The product itself stays in `products/003-midnight-seance/` |
| `TELEGRAM_REVIEW.md` | ADR-009 review bot guide (`services` `telegram:review-bot`) | The automation bot's approval gates: `automation/docs/STAGE_1_README.md` |
| `DESIGN_PROVIDER.md` | DesignProvider / Canva boundary (ADR-007) | Stage 2 adapters in `production/` |
| `PRODUCT_MODEL.md` | ProductSpec contract and PostgreSQL product schema (ADR-008) | `products/<id>/product.json` + `automation/schemas/product.schema.json` |
| `HANDOVER.md` | Repository state as of 2026-09-16 | `README.md`, `ARCHITECTURE.md`, `DEVELOPER_SETUP.md` |
| `NOTION_SETUP.md` | Plan for connecting Notion (ADR-005); never connected | — |
| `STAGE_1_AUDIT.md` | The audit that preceded Stage 1 (ADR-023), from `automation/docs/` | `automation/docs/STAGE_1_README.md` |

The removed code itself (n8n, Docker, PostgreSQL, the `services/` design and
review tiers, the Product #001 planner marketing) is not in this repository's
history. It is preserved in the owner's private archive of the original
`digital-product-factory` repository (commit `1bdca32` and earlier).
