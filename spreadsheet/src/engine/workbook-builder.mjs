/**
 * WorkbookBuilder — a thin, documented wrapper over ExcelJS.
 *
 * It is deliberately NOT a framework: it removes ExcelJS boilerplate and wires
 * in the design-system theme, but every method maps closely onto one ExcelJS
 * operation so the escape hatch (`builder.wb`, `sheet` objects) is always there.
 *
 * Responsibilities:
 *   - workbook + worksheets (visible / hidden helper sheets)
 *   - themed cell styles by semantic KIND (title, heading, body, input, calc, total …)
 *   - values and formulas, with input-vs-formula visually distinguished
 *   - merges, row heights, column widths, number/currency/percent formats
 *   - freeze panes, print area, page setup, headers/footers, print scaling
 *   - data validation (dropdowns, numeric bounds), conditional formatting, data bars
 *   - named ranges, sheet protection (lock formulas, leave inputs editable)
 *
 * Native embedded charts are intentionally out of scope — ExcelJS cannot write
 * them. Progress bars and "mini charts" are done with conditional-formatting
 * data bars and REPT()-based in-cell bars, which recalculate, print and survive
 * customer edits. See ../design-system/components.mjs and docs/XLSX_PIPELINE.md.
 */

import ExcelJS from "exceljs";
import { resolveTheme } from "../design-system/tokens.mjs";

/** @typedef {"title"|"subtitle"|"kicker"|"sectionHeading"|"tableHeading"|"body"|"label"|"input"|"calc"|"total"|"footnote"|"band"} CellKind */

const fill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const side = (style, argb) => ({ style, color: { argb } });

export class WorkbookBuilder {
  /**
   * @param {object} [opts]
   * @param {object} [opts.theme] Design-Spec theme overrides (see resolveTheme).
   * @param {object} [opts.meta] Workbook metadata (creator, title, description…).
   */
  constructor({ theme, meta } = {}) {
    this.theme = resolveTheme(theme ?? {});
    this.wb = new ExcelJS.Workbook();
    this.wb.creator = meta?.creator ?? "Digital Product Factory";
    this.wb.lastModifiedBy = meta?.creator ?? "Digital Product Factory";
    this.wb.created = meta?.created ?? new Date();
    this.wb.modified = meta?.created ?? new Date();
    if (meta?.title) this.wb.title = meta.title;
    if (meta?.description) this.wb.description = meta.description;
    if (meta?.company) this.wb.company = meta.company;
    this.wb.calcProperties.fullCalcOnLoad = true; // recalc formulas on open
  }

  // --- sheets ----------------------------------------------------------------

  /**
   * @param {string} name
   * @param {object} [opts]
   * @param {boolean} [opts.hidden] add as a `veryHidden` helper sheet
   * @param {string}  [opts.tabColorArgb]
   * @param {boolean} [opts.applyPrintDefaults=true]
   * @returns {ExcelJS.Worksheet}
   */
  addSheet(name, opts = {}) {
    const ws = this.wb.addWorksheet(name, {
      state: opts.hidden ? "veryHidden" : "visible",
      properties: { defaultRowHeight: this.theme.rowHeight.body, showGridLines: false },
      views: [{ showGridLines: false }],
      pageSetup: {
        paperSize: this.theme.print.paperSize,
        orientation: this.theme.print.orientation,
        fitToPage: true,
        fitToWidth: this.theme.print.fitToWidth,
        fitToHeight: this.theme.print.fitToHeight,
        horizontalCentered: this.theme.print.horizontalCentered,
        margins: this.theme.print.marginsInch,
      },
    });
    if (opts.hidden) ws.state = "veryHidden";
    if (opts.tabColorArgb) ws.properties.tabColor = { argb: opts.tabColorArgb };
    return ws;
  }

  // --- styles --------------------------------------------------------------

  /**
   * Themed style object for a semantic KIND. Spread/merge extra ExcelJS style
   * keys via `extra`.
   * @param {CellKind} kind
   * @param {Partial<ExcelJS.Style>} [extra]
   * @returns {Partial<ExcelJS.Style>}
   */
  styleFor(kind, extra = {}) {
    const t = this.theme;
    const f = (size, opts = {}) => ({
      name: opts.face === "display" ? t.font.display ?? t.font.family : t.font.family,
      size,
      color: { argb: opts.argb ?? t.color.ink },
      bold: !!opts.bold,
      italic: !!opts.italic,
    });
    /** @type {Record<CellKind, Partial<ExcelJS.Style>>} */
    const table = {
      // Editorial serif title. No fill, no border — the short accent rule is a
      // separate row drawn by titleBlock().
      title: {
        font: f(t.font.size.title, { face: "display", bold: true }),
        alignment: { vertical: "middle" },
      },
      subtitle: {
        font: f(t.font.size.subtitle, { argb: t.color.subtleInk }),
        alignment: { vertical: "middle" },
      },
      // Small tracked eyebrow / brand mark.
      kicker: {
        font: f(t.font.size.kicker ?? 8, { bold: true, argb: t.color.subtleInk }),
        alignment: { vertical: "middle" },
      },
      // NO fill, NO box. Tracked UPPERCASE ink + one hairline underneath.
      sectionHeading: {
        font: f(t.font.size.sectionHeading, { bold: true, argb: t.color.ink }),
        alignment: { vertical: "bottom", horizontal: "left" },
        border: { bottom: side("thin", t.color.ruleStrong) },
      },
      // No vertical gridlines. Warm ivory band, medium bottom rule only.
      tableHeading: {
        font: f(t.font.size.tableHeading, { bold: true, argb: t.color.ink }),
        alignment: { vertical: "middle", horizontal: "center", wrapText: true },
        fill: fill(t.color.band),
        border: { bottom: side("medium", t.color.ruleStrong) },
      },
      body: {
        font: f(t.font.size.body),
        alignment: { vertical: "middle" },
        border: { bottom: side("thin", t.color.rule) },
      },
      label: {
        font: f(t.font.size.body, { argb: t.color.ink }),
        alignment: { vertical: "middle" },
        border: { bottom: side("thin", t.color.rule) },
      },
      // Faint warm fill + a single bottom hairline. The fill is the only signal.
      input: {
        font: f(t.font.size.input),
        alignment: { vertical: "middle" },
        fill: fill(t.color.inputFill),
        border: { bottom: side("thin", t.color.inputRule) },
        protection: { locked: false },
      },
      // Calculated: NO fill (so "no yellow = don't type here"), plain weight,
      // hairline. "grey means calculated" is carried by the absence of yellow.
      calc: {
        font: f(t.font.size.calc, { argb: t.color.ink }),
        alignment: { vertical: "middle" },
        border: { bottom: side("thin", t.color.rule) },
        protection: { locked: true },
      },
      // Total: NO fill. Medium top rule + bold. That's the whole treatment.
      total: {
        font: f(t.font.size.body, { bold: true }),
        alignment: { vertical: "middle" },
        border: {
          top: side("medium", t.color.ruleStrong),
          bottom: side("thin", t.color.rule),
        },
        protection: { locked: true },
      },
      footnote: {
        font: f(t.font.size.footnote, { argb: t.color.subtleInk }),
        alignment: { vertical: "top", wrapText: true },
      },
      band: { fill: fill(t.color.band) },
    };
    return mergeStyle(table[kind] ?? {}, extra);
  }

  /** Assign every present style key onto a cell (does not clobber unrelated keys). */
  applyStyle(cell, style) {
    for (const key of ["font", "alignment", "fill", "border", "protection"]) {
      if (style[key]) cell[key] = style[key];
    }
    if (style.numFmt) cell.numFmt = style.numFmt;
  }

  // --- values & formulas -------------------------------------------------

  /**
   * Write a value or formula to a cell with a themed KIND.
   * A formula is either a string beginning with "=" or `{ formula, result? }`.
   * @param {ExcelJS.Worksheet} ws
   * @param {string} addr e.g. "B4"
   * @param {*} value
   * @param {object} [opts]
   * @param {CellKind} [opts.kind="body"]
   * @param {string}   [opts.numFmt]
   * @param {string}   [opts.note] cell comment
   * @param {Partial<ExcelJS.Style>} [opts.style] extra style overrides
   * @returns {ExcelJS.Cell}
   */
  write(ws, addr, value, opts = {}) {
    const cell = ws.getCell(addr);
    const isFormula =
      (typeof value === "string" && value.startsWith("=")) ||
      (value && typeof value === "object" && "formula" in value);
    if (isFormula) {
      const formula = typeof value === "string" ? value.slice(1) : value.formula;
      cell.value = { formula, result: value?.result };
    } else {
      cell.value = value ?? null;
    }
    const kind = opts.kind ?? (isFormula ? "calc" : "body");
    this.applyStyle(cell, this.styleFor(kind, opts.style ?? {}));
    if (opts.numFmt) cell.numFmt = opts.numFmt;
    if (opts.note) cell.note = opts.note;
    return cell;
  }

  /** Convenience: write a formula as a `calc` (or `total`) cell. */
  writeFormula(ws, addr, formula, opts = {}) {
    return this.write(ws, addr, `=${formula.replace(/^=/, "")}`, {
      kind: "calc",
      ...opts,
    });
  }

  // --- geometry -------------------------------------------------------

  /**
   * @param {ExcelJS.Worksheet} ws
   * @param {Array<{width:number,key?:string,hidden?:boolean,numFmt?:string}>} specs
   */
  setColumns(ws, specs) {
    specs.forEach((s, i) => {
      const col = ws.getColumn(i + 1);
      if (s.width != null) col.width = s.width;
      if (s.key) col.key = s.key;
      if (s.hidden) col.hidden = true;
      if (s.numFmt) col.numFmt = s.numFmt;
    });
  }

  /** @param {Record<number|string, number>} heights row -> points */
  setRowHeights(ws, heights) {
    for (const [row, pts] of Object.entries(heights)) {
      ws.getRow(Number(row)).height = pts;
    }
  }

  merge(ws, range) {
    ws.mergeCells(range);
    return ws.getCell(range.split(":")[0]);
  }

  /** Freeze the top `ySplit` rows and left `xSplit` cols. */
  freeze(ws, { xSplit = 0, ySplit = 0 } = {}) {
    ws.views = [{ state: "frozen", xSplit, ySplit, showGridLines: false }];
  }

  // --- validation ----------------------------------------------------

  /**
   * List dropdown. `source` is an array of strings or a formula range string
   * like "=Categories" or "=Sheet1!$A$1:$A$9".
   */
  dropdown(ws, range, source, opts = {}) {
    const formulae = Array.isArray(source)
      ? [`"${source.join(",")}"`]
      : [source.startsWith("=") ? source.slice(1) : source];
    forEachCell(ws, range, (cell) => {
      cell.dataValidation = {
        type: "list",
        allowBlank: opts.allowBlank ?? true,
        formulae,
        showErrorMessage: opts.strict ?? true,
        errorStyle: "warning",
        showInputMessage: !!opts.prompt,
        promptTitle: opts.promptTitle,
        prompt: opts.prompt,
      };
    });
  }

  /** Numeric bound validation, e.g. `{ operator: "greaterThanOrEqual", formula1: "0" }`. */
  numberValidation(ws, range, { operator = "greaterThanOrEqual", formula1 = "0", formula2, allowBlank = true } = {}) {
    forEachCell(ws, range, (cell) => {
      cell.dataValidation = {
        type: "decimal",
        operator,
        allowBlank,
        formulae: formula2 != null ? [formula1, formula2] : [formula1],
        showErrorMessage: true,
        errorStyle: "warning",
        error: "Enter a number.",
      };
    });
  }

  // --- conditional formatting -------------------------------------

  /** Pass-through to ExcelJS addConditionalFormatting. */
  conditional(ws, ref, rules) {
    ws.addConditionalFormatting({ ref, rules: Array.isArray(rules) ? rules : [rules] });
  }

  /** A native data bar over `ref` — the "progress bar" primitive. */
  dataBar(ws, ref, { colorArgb, min = 0, max, gradient = false } = {}) {
    ws.addConditionalFormatting({
      ref,
      rules: [
        {
          type: "dataBar",
          gradient,
          minLength: 0,
          maxLength: 100,
          border: false,
          cfvo: [
            { type: "num", value: min },
            max != null ? { type: "num", value: max } : { type: "max" },
          ],
          color: { argb: colorArgb ?? this.theme.color.accent },
        },
      ],
    });
  }

  // --- print / names / protection --------------------------------

  printArea(ws, range) {
    ws.pageSetup.printArea = range;
  }

  /** &L / &C / &R header + footer. */
  headerFooter(ws, { left = "", center = "", right = "", footerLeft = "", footerCenter = "", footerRight = "" } = {}) {
    ws.headerFooter.oddHeader = `&L${left}&C${center}&R${right}`;
    ws.headerFooter.oddFooter = `&L${footerLeft}&C${footerCenter}&R${footerRight}`;
    ws.headerFooter.differentFirst = false;
  }

  /** Register a workbook-scoped named range. `ref` must be fully qualified. */
  defineName(name, ref) {
    this.wb.definedNames.add(ref, name);
  }

  /**
   * Lock the sheet but leave input cells editable. Input cells are those the
   * components marked `protection.locked = false` (KIND "input"). Formulas and
   * headings stay read-only so a customer cannot accidentally delete the maths.
   */
  async protectFormulas(ws, { password = "", allowFormatting = true } = {}) {
    await ws.protect(password, {
      selectLockedCells: true,
      selectUnlockedCells: true,
      formatCells: allowFormatting,
      formatColumns: allowFormatting,
      formatRows: allowFormatting,
      insertRows: false,
      deleteRows: false,
      sort: true,
      autoFilter: true,
    });
  }

  // --- output --------------------------------------------------------

  async toBuffer() {
    return this.wb.xlsx.writeBuffer();
  }

  async writeFile(path) {
    await this.wb.xlsx.writeFile(path);
    return path;
  }
}

// --- helpers --------------------------------------------------------------

function mergeStyle(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b ?? {})) {
    out[k] = v && typeof v === "object" && !Array.isArray(v) && out[k]
      ? { ...out[k], ...v }
      : v;
  }
  return out;
}

/** Iterate every cell in an "A1:C3" (or single-cell) range. */
export function forEachCell(ws, range, fn) {
  const [start, end = start] = range.split(":");
  const s = splitAddr(start);
  const e = splitAddr(end);
  for (let r = Math.min(s.row, e.row); r <= Math.max(s.row, e.row); r++) {
    for (let c = Math.min(s.col, e.col); c <= Math.max(s.col, e.col); c++) {
      fn(ws.getCell(r, c), r, c);
    }
  }
}

export function colLetter(n) {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function colNumber(letters) {
  return [...letters.toUpperCase()].reduce((acc, ch) => acc * 26 + (ch.charCodeAt(0) - 64), 0);
}

function splitAddr(a) {
  const m = /^\$?([A-Za-z]+)\$?(\d+)$/.exec(a.trim());
  if (!m) throw new Error(`bad cell address: ${a}`);
  return { col: colNumber(m[1]), row: Number(m[2]) };
}

export { ExcelJS };
