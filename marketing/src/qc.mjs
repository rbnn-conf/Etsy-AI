/**
 * Marketing QC = Visual QC + Marketing-Claim QC.
 *
 *   VISUAL   PNG exists · dimensions correct · nothing clipped past the canvas ·
 *            branding present · product title present · text readable ·
 *            no external asset requests · expected asset count
 *   CLAIM    every stamped factual claim matches the verified product metadata
 *
 * Pure inspection of what renderAssets() returned + the marketing metadata.
 */

import { verifyClaims } from "./claims.mjs";

/**
 * @param {object} args
 * @param {Array} args.renderResults    output of renderAssets()
 * @param {object} args.marketingData   output of deriveMarketingData()
 * @param {number} args.expectAssets
 * @param {number} [args.minBytes=20000]
 * @param {number} [args.minFontPx=20]
 * @param {number} [args.maxClipPx=2]
 */
export function marketingQc({ renderResults, marketingData, expectAssets, minBytes = 20000, minFontPx = 20, maxClipPx = 2 }) {
  const rows = [];
  const rec = (asset, check, pass, detail = "") =>
    rows.push({ asset, check, pass: !!pass, detail: String(detail) });

  rec(null, `asset count == ${expectAssets}`, renderResults.length === expectAssets, `${renderResults.length}`);
  rec(null, "at least one asset carries the product title", renderResults.some((r) => r.hasTitle), "");

  for (const r of renderResults) {
    const name = base(r.outPath);
    rec(name, "PNG exists and is non-empty", r.bytes >= minBytes, `${r.bytes} bytes`);
    rec(name, "dimensions correct", r.width === (r.expectWidth ?? r.width) && r.height === (r.expectHeight ?? r.height) && r.width > 0 && r.height > 0, `${r.width}x${r.height}`);
    rec(name, "nothing clipped past the canvas", r.overflowPx <= maxClipPx, `overflow ${r.overflowPx}px`);
    rec(name, "branding present", r.hasBranding, "");
    rec(name, "text readable (min font ≥ " + minFontPx + "px)", r.minFontPx >= minFontPx, `min ${r.minFontPx}px`);
    rec(name, "no external asset requests", (r.blocked?.length ?? 0) === 0, `${r.blocked?.length ?? 0} blocked`);
  }

  // ---- claim QC across every asset ----
  const allTokens = renderResults.flatMap((r) => r.claimTokens ?? []);
  const claims = verifyClaims(allTokens, marketingData);
  rec(null, "every marketing claim matches verified product metadata", claims.pass, `${claims.verified}/${claims.total} verified`);
  for (const f of claims.failures) {
    rec("claims", `unverified claim: ${f.claim}`, false, `${f.text} — ${f.reason}`);
  }

  const summary = {
    pass: rows.filter((r) => r.pass).length,
    fail: rows.filter((r) => !r.pass).length,
    total: rows.length,
  };
  return { summary, results: rows, claims };
}

function base(p) {
  return String(p).split("/").pop();
}
