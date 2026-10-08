/**
 * Vendored fonts (SIL OFL 1.1) as inline @font-face rules — no network, no
 * file:// font requests when the composed HTML is rendered by Playwright.
 *
 *   assets/fonts/Inter-Regular.woff2   Inter 400
 *   assets/fonts/Inter-SemiBold.woff2  Inter 600
 *   assets/fonts/Spectral-SemiBold.ttf Spectral 600  (display serif)
 *   assets/fonts/Spectral-Italic.ttf   Spectral 400 italic
 */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const FONT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "fonts");

const FACES = [
  { file: "Inter-Regular.woff2", family: "Inter", weight: 400, style: "normal", fmt: "woff2" },
  { file: "Inter-SemiBold.woff2", family: "Inter", weight: 600, style: "normal", fmt: "woff2" },
  { file: "Spectral-SemiBold.ttf", family: "Spectral", weight: 600, style: "normal", fmt: "truetype" },
  { file: "Spectral-Italic.ttf", family: "Spectral", weight: 400, style: "italic", fmt: "truetype" },
];

const MIME = { woff2: "font/woff2", truetype: "font/ttf" };

let cached = null;

/** `@font-face` CSS with base64 data URIs. Cached after first read. */
export async function fontFaceCss() {
  if (cached) return cached;
  const rules = await Promise.all(
    FACES.map(async (f) => {
      const b64 = (await readFile(join(FONT_DIR, f.file))).toString("base64");
      return `@font-face{font-family:'${f.family}';font-style:${f.style};font-weight:${f.weight};font-display:block;src:url(data:${MIME[f.fmt]};base64,${b64}) format('${f.fmt}');}`;
    }),
  );
  cached = rules.join("\n");
  return cached;
}
