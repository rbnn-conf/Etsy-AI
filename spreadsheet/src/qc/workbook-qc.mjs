/**
 * Reusable XLSX quality checks. Product-agnostic: a product QC script builds an
 * `expectations` object and calls {@link runWorkbookChecks}; #001-specific rules
 * live in the product's own xlsx/qc.mjs.
 *
 * Covers STRUCTURE, FUNCTIONALITY (formula presence + syntactic validity +
 * reference targets), FORMATTING (currency / percent number formats, titles,
 * totals, column widths) and PRINT (print area, orientation, scaling).
 *
 * It deliberately does NOT claim formula *correctness* from formula strings —
 * that is the job of the recalculation scenario test (see ../preview/recalcToCsv
 * and the product QC's known input/output fixture).
 */

import ExcelJS from "exceljs";

export async function loadWorkbook(path) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  return wb;
}

const isFormula = (cell) =>
  cell && (cell.type === ExcelJS.ValueType.Formula || typeof cell.formula === "string");

const CURRENCY_RE = /[£$€]|\bGBP\b|\bUSD\b|\bEUR\b/;
const PERCENT_RE = /%/;

/** Balanced parens, non-empty, no spilled error literal. */
export function formulaLooksValid(formula) {
  if (!formula || typeof formula !== "string") return false;
  const f = formula.trim();
  if (f.length === 0) return false;
  if (/#(REF|DIV\/0|VALUE|NAME\?|N\/A|NULL|NUM)!/.test(f)) return false;
  let depth = 0;
  let inStr = false;
  for (let i = 0; i < f.length; i++) {
    const ch = f[i];
    if (inStr) {
      if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "(") depth++;
    else if (ch === ")") { depth--; if (depth < 0) return false; }
  }
  return depth === 0 && !inStr;
}

class Results {
  constructor() {
    this.rows = [];
    this.failures = 0;
  }
  rec(check, pass, detail = "", sheet = null) {
    this.rows.push({ sheet, check, pass: !!pass, detail: String(detail) });
    if (!pass) this.failures++;
  }
  get summary() {
    return {
      pass: this.rows.filter((r) => r.pass).length,
      fail: this.failures,
      total: this.rows.length,
    };
  }
}

/**
 * @param {ExcelJS.Workbook} wb
 * @param {object} expectations
 * @param {string[]} [expectations.sheets]        sheet names that must exist (in order)
 * @param {string[]} [expectations.namedRanges]   defined names that must exist
 * @param {number}   [expectations.minSheetCells=4]
 * @param {Record<string, SheetExpectation>} [expectations.perSheet]
 *
 * @typedef {object} SheetExpectation
 * @property {string}   [titleAt]            address that must hold non-trivial text
 * @property {string[]} [formulasAt]         addresses that must be formula cells
 * @property {Array<{at:string, includes:string[]}>} [formulaRefs]  formula text must contain each substring
 * @property {string[]} [currencyAt]         addresses whose numFmt must look like currency
 * @property {string[]} [percentAt]          addresses whose numFmt must look like a percentage
 * @property {string[]} [totalsAt]           addresses that must be formula cells (totals)
 * @property {string[]} [dropdownsAt]        ranges/cells that must carry list data-validation
 * @property {boolean}  [printArea]          a print area must be set
 * @property {"portrait"|"landscape"} [orientation]
 * @property {number}   [fitToWidth]         pageSetup.fitToWidth must equal this
 * @property {{min:number,max:number}} [columnWidths]  every used column width in range
 */
export function runWorkbookChecks(wb, expectations = {}) {
  const R = new Results();
  const minCells = expectations.minSheetCells ?? 4;

  R.rec("workbook opens with >=1 sheet", wb.worksheets.length >= 1, `${wb.worksheets.length} sheets`);

  // STRUCTURE — expected sheets present, in order, none blank
  if (expectations.sheets) {
    const actual = wb.worksheets.map((w) => w.name);
    for (const name of expectations.sheets) {
      R.rec(`sheet "${name}" exists`, actual.includes(name), actual.join(" | "));
    }
    const expectedOrder = expectations.sheets.filter((n) => actual.includes(n));
    const actualOrder = actual.filter((n) => expectations.sheets.includes(n));
    R.rec(
      "expected sheets are in the declared order",
      JSON.stringify(expectedOrder) === JSON.stringify(actualOrder),
      actualOrder.join(" | "),
    );
  }

  for (const ws of wb.worksheets) {
    let nonEmpty = 0;
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        if (cell.value !== null && cell.value !== undefined && cell.value !== "") nonEmpty++;
      });
    });
    if (ws.state !== "veryHidden" && ws.state !== "hidden") {
      R.rec(`sheet not blank`, nonEmpty >= minCells, `${nonEmpty} non-empty cells`, ws.name);
    }
  }

  // FUNCTIONALITY — every formula in the book is syntactically sane
  let badFormula = null;
  let formulaCount = 0;
  for (const ws of wb.worksheets) {
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        if (!isFormula(cell)) return;
        formulaCount++;
        const f = cell.formula ?? cell.value?.formula ?? "";
        if (!formulaLooksValid(f) && !badFormula) badFormula = `${ws.name}!${cell.address} =${f}`;
      });
    });
  }
  R.rec("workbook contains formulas", formulaCount > 0, `${formulaCount} formula cells`);
  R.rec("every formula is syntactically valid", badFormula === null, badFormula ?? "ok");

  // NAMED RANGES
  if (expectations.namedRanges) {
    const names = new Set((wb.definedNames?.model ?? []).map((d) => d.name));
    for (const n of expectations.namedRanges) {
      R.rec(`named range "${n}" exists`, names.has(n), [...names].join(", "));
    }
  }

  // PER-SHEET
  for (const [sheetName, ex] of Object.entries(expectations.perSheet ?? {})) {
    const ws = wb.getWorksheet(sheetName);
    if (!ws) {
      R.rec("sheet present for per-sheet checks", false, "missing", sheetName);
      continue;
    }
    const cellText = (a) => {
      const v = ws.getCell(a).value;
      if (v == null) return "";
      if (typeof v === "object") return v.result ?? v.text ?? v.richText?.map((r) => r.text).join("") ?? "";
      return String(v);
    };

    if (ex.titleAt) {
      R.rec(`title present at ${ex.titleAt}`, cellText(ex.titleAt).trim().length >= 3, `"${cellText(ex.titleAt)}"`, sheetName);
    }
    for (const a of ex.formulasAt ?? []) {
      R.rec(`formula at ${a}`, isFormula(ws.getCell(a)), describe(ws.getCell(a)), sheetName);
    }
    for (const a of ex.totalsAt ?? []) {
      R.rec(`total formula at ${a}`, isFormula(ws.getCell(a)), describe(ws.getCell(a)), sheetName);
    }
    for (const { at, includes } of ex.formulaRefs ?? []) {
      const f = (ws.getCell(at).formula ?? ws.getCell(at).value?.formula ?? "").toUpperCase();
      const missing = includes.filter((s) => !f.includes(s.toUpperCase()));
      R.rec(`formula at ${at} references ${includes.join(", ")}`, missing.length === 0, `=${f} (missing ${missing.join(", ")})`, sheetName);
    }
    for (const a of ex.currencyAt ?? []) {
      const nf = ws.getCell(a).numFmt ?? "";
      R.rec(`currency format at ${a}`, CURRENCY_RE.test(nf), `numFmt="${nf}"`, sheetName);
    }
    for (const a of ex.percentAt ?? []) {
      const nf = ws.getCell(a).numFmt ?? "";
      R.rec(`percent format at ${a}`, PERCENT_RE.test(nf), `numFmt="${nf}"`, sheetName);
    }
    for (const range of ex.dropdownsAt ?? []) {
      const first = range.split(":")[0];
      const dv = ws.getCell(first).dataValidation;
      R.rec(`dropdown at ${range}`, !!dv && dv.type === "list", dv ? dv.type : "none", sheetName);
    }
    if (ex.printArea) {
      R.rec("print area set", !!ws.pageSetup?.printArea, ws.pageSetup?.printArea ?? "none", sheetName);
    }
    if (ex.orientation) {
      R.rec(`orientation ${ex.orientation}`, ws.pageSetup?.orientation === ex.orientation, ws.pageSetup?.orientation ?? "default", sheetName);
    }
    if (ex.fitToWidth != null) {
      const ok = ws.pageSetup?.fitToPage !== false && Number(ws.pageSetup?.fitToWidth) === ex.fitToWidth;
      R.rec(`print scaling fitToWidth=${ex.fitToWidth}`, ok, `fitToPage=${ws.pageSetup?.fitToWidth}/${ws.pageSetup?.fitToHeight}`, sheetName);
    }
    if (ex.columnWidths) {
      const { min, max } = ex.columnWidths;
      let bad = null;
      ws.columns?.forEach((c, i) => {
        if (c.width != null && (c.width < min || c.width > max) && bad === null) {
          bad = `col ${i + 1} width ${c.width}`;
        }
      });
      R.rec(`column widths within [${min}, ${max}]`, bad === null, bad ?? "ok", sheetName);
    }
  }

  return { results: R.rows, summary: R.summary };
}

function describe(cell) {
  if (!cell || cell.value == null) return "empty";
  if (isFormula(cell)) return `=${cell.formula ?? cell.value?.formula}`;
  return String(cell.value);
}
