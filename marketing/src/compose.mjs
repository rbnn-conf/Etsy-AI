/**
 * Compose a full, self-contained HTML document for one marketing asset.
 *
 * Each component emits its own `<div id="canvas">…</div>`; compose() wraps it
 * with `<html><head><style>…design system…</style></head><body>`. No external
 * references — fonts are inlined @font-face, images must already be data: URIs
 * (use imgDataUri()).
 */

import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { resolveMarketingTheme } from "./design-system/tokens.mjs";
import { baseCss } from "./design-system/css.mjs";
import { fontFaceCss } from "./fonts.mjs";

const IMG_MIME = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

/** Read a local image file and return a `data:` URI. */
export async function imgDataUri(path) {
  const buf = await readFile(path);
  const mime = IMG_MIME[extname(path).toLowerCase()] ?? "image/png";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

/**
 * @param {object} opts
 * @param {string} opts.bodyHtml   a component's `<div id="canvas">…</div>`
 * @param {object} [opts.theme]    marketing theme overrides
 * @param {string} [opts.title]
 * @param {string} [opts.extraCss] additional CSS appended after the base stylesheet
 *   (used by composition families — e.g. the planner set — that need classes
 *   beyond the shared desk-scene vocabulary; keeps compose.mjs/css.mjs generic).
 * @returns {Promise<{html:string, theme:object}>}
 */
export async function composeAsset({ bodyHtml, theme, title, extraCss }) {
  const t = resolveMarketingTheme(theme ?? {});
  const css = baseCss(t, await fontFaceCss()) + (extraCss ?? "");
  const html = `<!doctype html><html><head><meta charset="utf-8">
<title>${title ? escapeTitle(title) : "marketing asset"}</title>
<style>${css}</style></head><body>${bodyHtml}</body></html>`;
  return { html, theme: t };
}

function escapeTitle(s) {
  return String(s).replace(/[<>&]/g, "");
}
