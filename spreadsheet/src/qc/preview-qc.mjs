/**
 * Preview QC — the PNG(s) exist, are non-empty, are real PNGs and have
 * sensible dimensions. Pure file inspection, no image library.
 */

import { stat } from "node:fs/promises";
import { pngSize } from "../preview/render-preview.mjs";

/**
 * @param {{path:string}[]} pages  the pages returned by renderXlsxPreview
 * @param {object} [opts]
 * @param {number} [opts.minWidth=600]
 * @param {number} [opts.minHeight=600]
 * @param {number} [opts.maxWidth=6000]
 * @param {number} [opts.maxHeight=12000]
 * @param {number} [opts.minBytes=2048]
 * @param {number} [opts.expectPages]  exact page count, when known
 */
export async function runPreviewChecks(pages, opts = {}) {
  const {
    minWidth = 600,
    minHeight = 600,
    maxWidth = 6000,
    maxHeight = 12000,
    minBytes = 2048,
    expectPages,
  } = opts;
  const rows = [];
  const rec = (check, pass, detail = "") => rows.push({ check, pass: !!pass, detail: String(detail) });

  rec("at least one preview PNG", pages.length >= 1, `${pages.length} pages`);
  if (expectPages != null) {
    rec(`preview page count == ${expectPages}`, pages.length === expectPages, `${pages.length}`);
  }

  for (const p of pages) {
    let size;
    try {
      const s = await stat(p.path);
      rec(`${base(p.path)} non-empty`, s.size >= minBytes, `${s.size} bytes`);
      size = await pngSize(p.path);
    } catch (err) {
      rec(`${base(p.path)} readable PNG`, false, String(err.message ?? err));
      continue;
    }
    rec(
      `${base(p.path)} dimensions sane`,
      size.width >= minWidth && size.height >= minHeight && size.width <= maxWidth && size.height <= maxHeight,
      `${size.width}x${size.height}`,
    );
  }

  return {
    results: rows,
    summary: {
      pass: rows.filter((r) => r.pass).length,
      fail: rows.filter((r) => !r.pass).length,
      total: rows.length,
    },
  };
}

function base(p) {
  return p.split("/").pop();
}
