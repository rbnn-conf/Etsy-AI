/**
 * @dpf/marketing — deterministic listing-image rendering and QC.
 *
 *   verified product facts + REAL product artwork
 *        →  HTML/CSS compositions (Stage 3: ./stage3/)
 *        →  Playwright/Chromium (network hard-blocked)
 *        →  2000×2000 listing PNGs + Visual and Marketing-Claim QC
 *
 * The Stage 3 engine lives in ./stage3/index.mjs (ADR-025, ADR-037, ADR-058).
 * This entry point exposes the shared rendering core it is built on. The
 * Product #001 planner compositions were retired in ADR-069.
 */

export { DEFAULT_MARKETING_THEME, resolveMarketingTheme, baseCss, fontFaceCss } from "./design-system/index.mjs";
export { esc, claim, factual, brandingFooter } from "./components/index.mjs";
export { composeAsset, imgDataUri } from "./compose.mjs";
export { renderAssets, rendererAvailable } from "./render.mjs";
export { deriveMarketingData, MarketingMetadataError, norm } from "./product-metadata.mjs";
export { verifyClaims, expectedClaims } from "./claims.mjs";
export { marketingQc } from "./qc.mjs";
