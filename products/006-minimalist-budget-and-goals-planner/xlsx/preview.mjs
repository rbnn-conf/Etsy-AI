/**
 * Product #006 — WORKBOOK PREVIEW: one or more legible PNGs per visible sheet.
 *
 * v4's Budget sheet is now ~240 rows (a 100-row Transactions List + a
 * 20-row ranked "Where My Money Went" table on top of the 3-zone layout) —
 * far taller than v3. Forcing the whole sheet onto ONE page (fitToWidth:1,
 * fitToHeight:1, Product #005's approach, used here through v3) squeezes
 * text to illegible size once a sheet is this tall: text shrinks to fit
 * height while width stays near 100%, so a very tall sheet renders at a
 * few points high.
 *
 * Fix: every sheet's pageSetup goes to fitToWidth:1, fitToHeight:0 — width
 * fits one page, height paginates naturally at a normal, legible scale.
 * Short sheets (Instructions, Goal Tracker) still land on one page; Budget
 * spans as many pages as it naturally needs. Every page is trimmed to its
 * content bounding box.
 *
 * IMPORTANT: this renders the WHOLE workbook as one combined PDF and does
 * NOT use renderXlsxPreview's `excludeSheets`/`includeOnly` — those force a
 * load-modify-resave round-trip through ExcelJS (`stripSheetsForPreview`)
 * to drop sheets, and ExcelJS has no model for the native chart/drawing
 * parts this product injects post-build (see native-charts.mjs) — any
 * round-trip through it silently discards them. `keepHelperSheets: true`
 * plus omitting both exclude options keeps `renderXlsxPreview` on its
 * "nothing to strip" fast path, which returns the file unmodified. The
 * hidden "Lists" helper sheet (also load-bearing now — the ranking engine
 * that drives "Where My Money Went" lives there) is skipped from the PDF by
 * LibreOffice's own default export behaviour (veryHidden sheets aren't
 * printed), not by any stripping step — verified empirically. Page-to-sheet
 * mapping is then done by searching each page's text (pdftotext) for the
 * sheet's unique masthead kicker ("START HERE" / "PLAN · TRACK" / "BONUS"),
 * since a continuation page (Budget spans several) has no such marker and
 * belongs to the most recent sheet that did.
 *
 *   node preview.mjs
 */

import { readFile, writeFile, mkdir, mkdtemp, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import zlib from "node:zlib";
import { renderXlsxPreview, previewToolsAvailable, findRenderers, pngSize, withPreviewPaperSize } from "@dpf/spreadsheet";

const run = promisify(execFile);

/** Decode an 8-bit PNG (pdftoppm output) far enough to bbox non-white content. */
function pngContentBBox(buf, { threshold = 248, pad = 24 } = {}) {
  if (buf.toString("ascii", 1, 4) !== "PNG") throw new Error("not a PNG");
  let p = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString("ascii", p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") { width = data.readUInt32BE(0); height = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; }
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    p += 12 + len;
  }
  if (bitDepth !== 8) return null;
  const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 6 ? 4 : 0;
  if (!channels) return null;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);
  const paeth = (a, b, c) => { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  let rp = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[rp++];
    for (let i = 0; i < stride; i++) {
      const cur = raw[rp++];
      const left = i >= channels ? out[y * stride + i - channels] : 0;
      const up = y > 0 ? out[(y - 1) * stride + i] : 0;
      const ul = y > 0 && i >= channels ? out[(y - 1) * stride + i - channels] : 0;
      let val = cur;
      if (filter === 1) val = cur + left; else if (filter === 2) val = cur + up; else if (filter === 3) val = cur + ((left + up) >> 1); else if (filter === 4) val = cur + paeth(left, up, ul);
      out[y * stride + i] = val & 0xff;
    }
  }
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = y * stride + x * channels;
      const r = out[o], g = channels >= 3 ? out[o + 1] : r, bch = channels >= 3 ? out[o + 2] : r;
      if (r < threshold || g < threshold || bch < threshold) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    }
  }
  if (maxX < 0) return null;
  return { x: Math.max(0, minX - pad), y: Math.max(0, minY - pad), w: Math.min(width, maxX + pad) - Math.max(0, minX - pad), h: Math.min(height, maxY + pad) - Math.max(0, minY - pad) };
}

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", "..");
const STORE = join(REPO_ROOT, "storage", "products", "006");
const WORKBOOK_PREVIEW_DIR = join(STORE, "workbook-preview");

export async function renderProduct006Preview({ xlsxPath, outDir } = {}) {
  if (!(await previewToolsAvailable())) {
    throw new Error("LibreOffice (soffice) and/or pdftoppm not found. Install: `brew install --cask libreoffice` and `brew install poppler` (or set SOFFICE_BIN / PDFTOPPM_BIN).");
  }
  const spec = JSON.parse(await readFile(join(HERE, "..", "xlsx-design-spec.json"), "utf8"));
  const dpi = spec.preview?.dpi ?? 150;
  const paper = spec.preview?.fullSheetPaperSize ?? 8; // A3 — generous width, still a normal print scale
  const XLSX = xlsxPath ?? join(STORE, "final", "minimalist-budget-and-goals-planner.xlsx");
  const dest = outDir ?? WORKBOOK_PREVIEW_DIR;
  await mkdir(dest, { recursive: true });

  const visibleSheets = spec.sheets;
  // "PLAN" alone would also match "Planner" in the footer text
  // ("Minimalist Budget & Goals Planner", printed on every page) — use the
  // full kicker text, which the footer never contains.
  const KICKER_MARKER = { instructions: "START HERE", budget: "PLAN · TRACK", "goal-tracker": "BONUS" };
  const { pdftoppm } = await findRenderers();
  const work = await mkdtemp(join(tmpdir(), "p006-preview-"));
  const pages = [];
  try {
    // The built file's own pageSetup already has fitToWidth:1/fitToHeight:0
    // (this product's house print default) — exactly what a legible
    // natural-pagination preview needs. The only thing worth overriding for
    // the (larger, easier-to-read) preview is paperSize A4->A3, done via
    // raw XML (withPreviewPaperSize), NOT ExcelJS: confirmed empirically
    // that even a no-op ExcelJS load->save round-trip silently drops this
    // product's injected chart/drawing parts (ExcelJS has no model for
    // them), regardless of whether any sheet is touched or removed.
    const tmpXlsx = join(work, "preview.xlsx");
    const original = await readFile(XLSX);
    const resized = await withPreviewPaperSize(original, paper, visibleSheets.map((s) => s.name));
    await writeFile(tmpXlsx, resized);

    const keptPdf = join(work, "preview.pdf");
    const res = await renderXlsxPreview(tmpXlsx, {
      outDir: join(work, "raw"), variant: "full", baseName: "p", dpi, keepHelperSheets: true, keepPdfAs: keptPdf,
    });

    // Map each PDF page to a sheet by searching for that sheet's masthead
    // kicker text (present only on a sheet's own first page); a
    // continuation page (no kicker) belongs to the most recent sheet found.
    // LibreOffice's default PDF export does NOT skip the hidden "Lists"
    // helper sheet (verified empirically — contrary to Excel's usual
    // behaviour), so it lands as an orphan page(s) before Instructions'
    // real first page; current starts at -1 (not sheet 0) so any such
    // leading, kicker-less page is dropped rather than merged into
    // Instructions.
    const pageSheetIdx = [];
    let current = -1;
    for (let pi = 0; pi < res.pages.length; pi++) {
      // pdftotext ships alongside pdftoppm in the same poppler bin dir.
      const pdftotext = pdftoppm ? pdftoppm.replace(/pdftoppm(\.exe)?$/, "pdftotext$1") : "pdftotext";
      const { stdout } = await run(pdftotext, ["-f", String(pi + 1), "-l", String(pi + 1), keptPdf, "-"]).catch(() => ({ stdout: "" }));
      const text = (stdout || "").toUpperCase();
      const foundIdx = visibleSheets.findIndex((s) => text.includes(KICKER_MARKER[s.slug] ?? "\0"));
      if (foundIdx !== -1) current = foundIdx;
      pageSheetIdx.push(current);
    }
    if (res.pages.length && pageSheetIdx.every((idx) => idx === -1) && visibleSheets.length > 1) {
      throw new Error("preview: could not distinguish sheets by kicker text — pdftotext may be unavailable or masthead text changed");
    }

    for (let i = 0; i < visibleSheets.length; i++) {
      const sheet = visibleSheets[i];
      const nn = String(i + 1).padStart(2, "0");
      const sheetPageIndices = pageSheetIdx.reduce((acc, sIdx, pi) => (sIdx === i ? [...acc, pi] : acc), []);

      for (let k = 0; k < sheetPageIndices.length; k++) {
        const pi = sheetPageIndices[k];
        const rawPng = res.pages[pi].path;
        const suffix = sheetPageIndices.length > 1 ? `-${k + 1}` : "";
        const outPath = join(dest, `sheet-${nn}${suffix}.png`);
        let trimmed = false;
        try {
          const bbox = pngContentBBox(await readFile(rawPng));
          if (bbox && pdftoppm && bbox.w > 200 && bbox.h > 200) {
            await run(pdftoppm, ["-png", "-r", String(dpi), "-f", String(pi + 1), "-l", String(pi + 1), "-x", String(bbox.x), "-y", String(bbox.y), "-W", String(bbox.w), "-H", String(bbox.h), "-singlefile", keptPdf, outPath.replace(/\.png$/, "")]);
            trimmed = true;
          }
        } catch { /* fall through */ }
        if (!trimmed) await copyFile(rawPng, outPath);

        const { width, height, bytes } = await pngSize(outPath);
        pages.push({
          index: i + 1, page: k + 1, pagesInSheet: sheetPageIndices.length, slug: sheet.slug, title: sheet.title,
          path: outPath, file: outPath.replace(REPO_ROOT + "/", ""), width, height, bytes, trimmed,
        });
      }
    }
    if (!outDir) await copyFile(pages[0].path, join(dest, "primary.png"));
  } finally {
    await rm(work, { recursive: true, force: true });
  }

  const report = { renderedAt: new Date().toISOString(), kind: "workbook-preview-per-sheet", source: XLSX.replace(REPO_ROOT + "/", ""), dpi, paperSize: paper, pages };
  if (!outDir) await writeFile(join(STORE, "xlsx-preview-report.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
  return { pages, report, dir: dest };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  renderProduct006Preview()
    .then((r) => { console.log(`workbook preview -> ${r.dir}`); for (const p of r.pages) console.log(`  sheet-${String(p.index).padStart(2, "0")}${p.pagesInSheet > 1 ? `-${p.page}` : ""}.png  ${p.title}  ${p.width}x${p.height}${p.trimmed ? "  (trimmed)" : ""}`); })
    .catch((e) => { console.error(e); process.exit(1); });
}
