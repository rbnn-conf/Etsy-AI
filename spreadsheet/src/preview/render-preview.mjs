/**
 * Headless PNG preview of an ACTUAL workbook.
 *
 *   product.xlsx
 *      -> LibreOffice --headless --convert-to pdf   (opens the real file,
 *         recalculates formulas on load, lays every sheet out for print)
 *      -> pdftoppm -png                             (rasterise each page)
 *      -> page-<variant>-NN.png  +  primary.png
 *
 * No desktop-app screenshots, no re-created HTML mockup: the PNG is a render of
 * the file the customer downloads. Requires `soffice` (LibreOffice) and
 * `pdftoppm` (poppler) on PATH — override with SOFFICE_BIN / PDFTOPPM_BIN.
 */

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, copyFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { join, dirname, basename, extname } from "node:path";
import ExcelJS from "exceljs";

const run = promisify(execFile);

const SOFFICE_CANDIDATES = [
  process.env.SOFFICE_BIN,
  "/Applications/LibreOffice.app/Contents/MacOS/soffice",
  "soffice",
  "libreoffice",
].filter(Boolean);

const PDFTOPPM_CANDIDATES = [process.env.PDFTOPPM_BIN, "pdftoppm"].filter(Boolean);

async function firstWorking(candidates, args) {
  for (const bin of candidates) {
    try {
      await run(bin, args, { timeout: 20_000 });
      return bin;
    } catch (err) {
      // ENOENT -> try next; a non-zero exit for `--version` still means it exists
      if (err && err.code === "ENOENT") continue;
      return bin;
    }
  }
  return null;
}

export async function findRenderers() {
  const soffice = await firstWorking(SOFFICE_CANDIDATES, ["--version"]);
  const pdftoppm = await firstWorking(PDFTOPPM_CANDIDATES, ["-v"]);
  return { soffice, pdftoppm };
}

/** true when both headless renderers are available. */
export async function previewToolsAvailable() {
  const { soffice, pdftoppm } = await findRenderers();
  return Boolean(soffice && pdftoppm);
}

/** Parse a PNG IHDR for pixel dimensions — no image library needed. */
export async function pngSize(path) {
  const buf = await readFile(path);
  if (buf.length < 24 || buf.toString("ascii", 1, 4) !== "PNG") {
    throw new Error(`not a PNG: ${path}`);
  }
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), bytes: buf.length };
}

/**
 * @param {string} xlsxPath
 * @param {object} [opts]
 * @param {string} [opts.outDir]   where the PNGs land (default: <xlsx dir>/preview)
 * @param {string} [opts.variant="xlsx"]  the review-flow "variant" token
 * @param {string} [opts.baseName="page"] output prefix -> `<baseName>-<variant>-NN.png`
 * @param {number} [opts.dpi=150]
 * @param {string} [opts.keepPdfAs] if set, the intermediate PDF is copied here
 * @param {string[]} [opts.excludeSheets]  sheet names to drop before rendering
 * @param {string[]} [opts.includeOnly]    render only these sheets (in this order)
 * @param {boolean} [opts.keepHelperSheets=false]  keep `veryHidden` sheets in the preview
 * @returns {Promise<{pdfPath:string|null, outDir:string, primary:string,
 *   pages:{index:number,path:string,width:number,height:number,bytes:number}[]}>}
 */
export async function renderXlsxPreview(xlsxPath, opts = {}) {
  const variant = opts.variant ?? "xlsx";
  const baseName = opts.baseName ?? "page";
  const dpi = opts.dpi ?? 150;
  const outDir = opts.outDir ?? join(dirname(xlsxPath), "preview");
  await mkdir(outDir, { recursive: true });

  const { soffice, pdftoppm } = await findRenderers();
  if (!soffice) throw new Error("LibreOffice (soffice) not found — set SOFFICE_BIN");
  if (!pdftoppm) throw new Error("pdftoppm (poppler) not found — set PDFTOPPM_BIN");

  const work = await mkdtemp(join(tmpdir(), "xlsx-preview-"));
  try {
    // 0) LibreOffice's headless PDF filter renders EVERY sheet, hidden or not.
    //    Build a preview-only copy with helper / excluded sheets removed so the
    //    PNG matches what a customer sees. The real product .xlsx is untouched.
    const previewSrc = await stripSheetsForPreview(xlsxPath, work, {
      excludeSheets: opts.excludeSheets,
      includeOnly: opts.includeOnly,
      keepHelperSheets: opts.keepHelperSheets,
    });

    // 1) xlsx -> pdf (isolated LO profile so a running desktop instance can't clash)
    await run(
      soffice,
      [
        "--headless",
        "--norestore",
        "--nolockcheck",
        `-env:UserInstallation=file://${join(work, "loprofile")}`,
        "--convert-to",
        "pdf",
        "--outdir",
        work,
        previewSrc,
      ],
      { timeout: 120_000 },
    );
    const pdfName = `${basename(previewSrc, extname(previewSrc))}.pdf`;
    const pdfPath = join(work, pdfName);
    await stat(pdfPath); // throws if the conversion produced nothing

    // 2) pdf -> png per page
    const prefix = join(work, "raw");
    await run(pdftoppm, ["-png", "-r", String(dpi), pdfPath, prefix], { timeout: 120_000 });
    const raws = (await readdir(work))
      .filter((n) => /^raw-?\d+\.png$/.test(n))
      .sort((a, b) => pageNum(a) - pageNum(b));
    if (raws.length === 0) throw new Error("pdftoppm produced no pages");

    // 3) rename into the review-flow convention + collect sizes
    const pages = [];
    for (let i = 0; i < raws.length; i++) {
      const nn = String(i + 1).padStart(2, "0");
      const dest = join(outDir, `${baseName}-${variant}-${nn}.png`);
      await copyFile(join(work, raws[i]), dest);
      const { width, height, bytes } = await pngSize(dest);
      pages.push({ index: i + 1, path: dest, width, height, bytes });
    }
    const primary = join(outDir, "primary.png");
    await copyFile(pages[0].path, primary);

    let keptPdf = null;
    if (opts.keepPdfAs) {
      await mkdir(dirname(opts.keepPdfAs), { recursive: true });
      await copyFile(pdfPath, opts.keepPdfAs);
      keptPdf = opts.keepPdfAs;
    }

    return { pdfPath: keptPdf, outDir, primary, pages };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/**
 * Recalculate `xlsxPath` with LibreOffice and return the (active/first) sheet
 * as parsed rows of computed values. Used by QC to test real input/output
 * scenarios without shipping a formula engine. Point it at a single-sheet
 * fixture workbook for deterministic results.
 *
 * @param {object} [opts]
 * @param {string} [opts.sheet]  which sheet to export (made sheet 1 first);
 *                               defaults to the first non-helper sheet
 * @returns {Promise<{csv:string, rows:string[][], cell:(a1:string)=>string}>}
 */
export async function recalcToCsv(xlsxPath, opts = {}) {
  const { soffice } = await findRenderers();
  if (!soffice) throw new Error("LibreOffice (soffice) not found — set SOFFICE_BIN");
  const work = await mkdtemp(join(tmpdir(), "xlsx-recalc-"));
  try {
    // LibreOffice's CSV filter only emits the first sheet — drop helper sheets
    // (and, if asked, everything but `opts.sheet`) so we export the right one.
    const src = await stripSheetsForPreview(xlsxPath, work, {
      includeOnly: opts.sheet ? [opts.sheet] : undefined,
    });
    await run(
      soffice,
      [
        "--headless",
        "--norestore",
        "--nolockcheck",
        `-env:UserInstallation=file://${join(work, "loprofile")}`,
        "--convert-to",
        "csv",
        "--outdir",
        work,
        src,
      ],
      { timeout: 120_000 },
    );
    const csvName = (await readdir(work)).find((n) => n.endsWith(".csv"));
    if (!csvName) throw new Error("LibreOffice produced no CSV");
    const csv = await readFile(join(work, csvName), "utf8");
    const rows = parseCsv(csv);
    return {
      csv,
      rows,
      cell: (a1) => {
        const m = /^([A-Za-z]+)(\d+)$/.exec(a1);
        if (!m) throw new Error(`bad address ${a1}`);
        const c = [...m[1].toUpperCase()].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0);
        return rows[Number(m[2]) - 1]?.[c - 1] ?? "";
      },
    };
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/**
 * Recalculate an ENTIRE workbook with LibreOffice and return every sheet's
 * computed values, keyed by sheet name. Needed for cross-sheet formulas — a
 * per-sheet export would turn other-sheet references into `#REF!`.
 *
 * @returns {Promise<Record<string, {rows:string[][], cell:(a1:string)=>string}>>}
 */
export async function recalcWorkbook(xlsxPath) {
  const { soffice } = await findRenderers();
  if (!soffice) throw new Error("LibreOffice (soffice) not found — set SOFFICE_BIN");
  const work = await mkdtemp(join(tmpdir(), "xlsx-recalc-wb-"));
  try {
    // trailing `-1` = export every sheet to its own `<base>-<SheetName>.csv`
    await run(
      soffice,
      [
        "--headless",
        "--norestore",
        "--nolockcheck",
        `-env:UserInstallation=file://${join(work, "loprofile")}`,
        "--convert-to",
        "csv:Text - txt - csv (StarCalc):44,34,76,1,,,true,false,true,false,false,-1",
        "--outdir",
        work,
        xlsxPath,
      ],
      { timeout: 120_000 },
    );
    const base = basename(xlsxPath, extname(xlsxPath));
    const out = {};
    for (const name of (await readdir(work)).filter((n) => n.endsWith(".csv"))) {
      const sheet = name.startsWith(`${base}-`)
        ? name.slice(base.length + 1, -4)
        : name.slice(0, -4);
      const rows = parseCsv(await readFile(join(work, name), "utf8"));
      out[sheet] = { rows, cell: (a1) => cellFromRows(rows, a1) };
    }
    return out;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

function cellFromRows(rows, a1) {
  const m = /^([A-Za-z]+)(\d+)$/.exec(a1);
  if (!m) throw new Error(`bad address ${a1}`);
  const c = [...m[1].toUpperCase()].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0);
  return rows[Number(m[2]) - 1]?.[c - 1] ?? "";
}

/** Minimal RFC-4180-ish CSV parser (handles quotes, embedded commas/newlines). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (ch === "\r") { /* skip */ }
    else field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function pageNum(name) {
  const m = /(\d+)\.png$/.exec(name);
  return m ? Number(m[1]) : 0;
}

/**
 * Write a preview-only copy of `xlsxPath` into `work` with helper / excluded
 * sheets removed. By default drops sheets whose state is `veryHidden` (the
 * engine's convention for "dropdown-source / scratch" helpers). Returns the new
 * path — or the original if nothing needed removing.
 */
async function stripSheetsForPreview(xlsxPath, work, { excludeSheets = [], includeOnly, keepHelperSheets = false } = {}) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(xlsxPath);

  const exclude = new Set(excludeSheets);
  const keep = includeOnly ? new Set(includeOnly) : null;
  const toRemove = [];
  wb.eachSheet((ws) => {
    const isHelper = !keepHelperSheets && ws.state === "veryHidden";
    const drop = exclude.has(ws.name) || isHelper || (keep && !keep.has(ws.name));
    if (drop) toRemove.push(ws.id);
  });

  if (toRemove.length === 0 && !keep) return xlsxPath;
  for (const id of toRemove) wb.removeWorksheet(id);

  // any remaining sheet must be visible for LO to lay it out
  wb.eachSheet((ws) => {
    if (ws.state !== "visible") ws.state = "visible";
  });
  if (keep) {
    // reorder to includeOnly order
    [...keep].forEach((name, i) => {
      const ws = wb.getWorksheet(name);
      if (ws) ws.orderNo = i + 1;
    });
  }

  const out = join(work, "preview-src.xlsx");
  await wb.xlsx.writeFile(out);
  return out;
}
