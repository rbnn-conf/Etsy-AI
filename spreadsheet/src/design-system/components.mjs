/**
 * Etsy Spreadsheet Design System v1 — reusable visual components.
 *
 * Each function composes themed cells (via a WorkbookBuilder) into a recognised
 * spreadsheet pattern: a title block, a section heading, a data table with
 * header / body / input / total rows, a KPI card, a summary box, a callout, a
 * progress bar, a checkbox column, a status column.
 *
 * They return the addresses / ranges they occupied so a caller can wire
 * formulas and QC against them. No product-specific content lives here.
 */

import { colLetter } from "../engine/workbook-builder.mjs";

const A = (col, row) => `${colLetter(col)}${row}`;

/** Column-kind -> number format key on the theme + whether it is user-editable. */
function kindMeta(theme, kind) {
  switch (kind) {
    case "currency":
      return { numFmt: theme.numberFormat.currencyGBP, cellKind: "input", align: "right" };
    case "currencyCalc":
      return { numFmt: theme.numberFormat.currencyGBP, cellKind: "calc", align: "right" };
    case "percent":
      return { numFmt: theme.numberFormat.percent1, cellKind: "input", align: "right" };
    case "percentCalc":
      return { numFmt: theme.numberFormat.percent1, cellKind: "calc", align: "right" };
    case "date":
      return { numFmt: theme.numberFormat.dateUK, cellKind: "input", align: "center" };
    case "check":
      return { numFmt: theme.numberFormat.text, cellKind: "input", align: "center" };
    case "int":
      return { numFmt: theme.numberFormat.integer, cellKind: "input", align: "right" };
    case "staticInt":
      return { numFmt: theme.numberFormat.dayOfMonth, cellKind: "label", align: "center" };
    case "label":
      return { numFmt: theme.numberFormat.text, cellKind: "label", align: "left" };
    case "text":
    default:
      return { numFmt: theme.numberFormat.text, cellKind: "input", align: "left" };
  }
}

const RULE = (style, argb) => ({ style, color: { argb } });

/**
 * Editorial masthead: an optional tracked-caps kicker, a serif title, an
 * optional subtitle, then the ONE accent mark for the sheet — a short (2-col)
 * terracotta rule sitting on a full-width stone hairline. No fill, no box.
 * Returns the next free row.
 */
export function titleBlock(builder, ws, { row = 1, left = 1, span = 6, kicker, title, subtitle }) {
  const t = builder.theme;
  const end = left + span - 1;
  let r = row;

  if (kicker) {
    builder.merge(ws, `${A(left, r)}:${A(end, r)}`);
    builder.write(ws, A(left, r), kicker.toUpperCase(), { kind: "kicker" });
    ws.getRow(r).height = t.rowHeight.subtitle;
    r += 1;
  }

  builder.merge(ws, `${A(left, r)}:${A(end, r)}`);
  builder.write(ws, A(left, r), title, { kind: "title" });
  ws.getRow(r).height = t.rowHeight.title;
  r += 1;

  if (subtitle) {
    builder.merge(ws, `${A(left, r)}:${A(end, r)}`);
    builder.write(ws, A(left, r), subtitle, { kind: "subtitle" });
    ws.getRow(r).height = t.rowHeight.subtitle;
    r += 1;
  }

  // the one accent mark: a short terracotta rule on a full-width stone hairline
  ws.getRow(r).height = t.rowHeight.rule;
  for (let c = left; c <= end; c++) {
    const cell = ws.getCell(A(c, r));
    cell.border = { bottom: RULE("thin", t.color.ruleStrong) };
  }
  ws.getCell(A(left, r)).border = { bottom: RULE("medium", t.color.accent) };
  ws.getCell(A(left + 1, r)).border = { bottom: RULE("medium", t.color.accent) };

  return r + 2;
}

/**
 * Section heading — tracked UPPERCASE ink + a single hairline underneath.
 * NO fill, NO coloured bar. Returns the next free row.
 */
export function sectionHeading(builder, ws, { row, left = 1, span = 6, text }) {
  const t = builder.theme;
  const end = left + span - 1;
  builder.merge(ws, `${A(left, row)}:${A(end, row)}`);
  builder.write(ws, A(left, row), String(text).toUpperCase(), { kind: "sectionHeading" });
  ws.getRow(row).height = t.rowHeight.sectionHeading;
  // extend the hairline across the merged span
  for (let c = left; c <= end; c++) {
    ws.getCell(A(c, row)).border = { bottom: RULE("thin", t.color.ruleStrong) };
  }
  return row + 2;
}

/** A full-width stone hairline as a divider row. Returns the next free row. */
export function divider(builder, ws, { row, left = 1, span = 6, weight = "thin" }) {
  const end = left + span - 1;
  ws.getRow(row).height = builder.theme.rowHeight.rule;
  for (let c = left; c <= end; c++) {
    ws.getCell(A(c, row)).border = { bottom: RULE(weight, builder.theme.color.ruleStrong) };
  }
  return row + 2;
}

/**
 * A data table.
 *
 * @param {WorkbookBuilder} builder
 * @param {ExcelJS.Worksheet} ws
 * @param {object} cfg
 * @param {number} cfg.top   header row number
 * @param {number} cfg.left  left-most column number (1-based)
 * @param {number} cfg.rows  number of data rows
 * @param {Array<{
 *   header: string, key: string, kind?: string, width?: number,
 *   formula?: (rowNum:number, ctx:object)=>string,  // per-row formula (=> calc cell)
 *   value?: (rowIndex:number)=>*,                    // per-row seeded value
 *   total?: "sum"|"none"|((range:string)=>string),   // total-row behaviour
 *   totalLabel?: boolean                             // this col holds the "Total" label
 * }>} cfg.columns
 * @param {boolean} [cfg.alt=true]        alternating row bands
 * @param {boolean} [cfg.totalRow=true]   render a total row
 * @param {string}  [cfg.totalText="Total"]
 * @returns {{header:number, firstRow:number, lastRow:number, totalRow:number|null,
 *            col:(key:string)=>string, dataRange:(key:string)=>string,
 *            totalCell:(key:string)=>string|null, bodyRange:string}}
 */
export function table(builder, ws, cfg) {
  const t = builder.theme;
  const { top, left = 1, rows, columns, alt = false, totalRow = true, totalText = "Total", rowHeight } = cfg;
  const width = columns.length;
  const right = left + width - 1;
  const firstRow = top + 1;
  const lastRow = top + rows;
  const totRow = totalRow ? lastRow + 1 : null;

  const colNumOf = (key) => left + columns.findIndex((c) => c.key === key);
  const colLetterOf = (key) => colLetter(colNumOf(key));
  const dataRangeOf = (key) => `${colLetterOf(key)}${firstRow}:${colLetterOf(key)}${lastRow}`;
  const totalCellOf = (key) => (totRow ? `${colLetterOf(key)}${totRow}` : null);

  // column widths — set from the spec (an explicit width wins), else the
  // kind default. Set, not max: the caller controls the total page fit.
  columns.forEach((c, i) => {
    const w =
      c.width ??
      (c.kind === "label" || c.kind === "text"
        ? t.columnWidth.label
        : c.kind === "check" || c.kind === "staticInt"
          ? t.columnWidth.check
          : c.kind === "date"
            ? t.columnWidth.date
            : c.kind === "percent" || c.kind === "percentCalc"
              ? t.columnWidth.percent
              : t.columnWidth.currency);
    ws.getColumn(left + i).width = w;
  });

  // header
  ws.getRow(top).height = t.rowHeight.tableHeading;
  columns.forEach((c, i) => {
    builder.write(ws, A(left + i, top), c.header, { kind: "tableHeading" });
  });

  // body — hairline row rules only, no vertical gridlines, no boxing
  const ctx = { firstRow, lastRow, col: colLetterOf, dataRange: dataRangeOf };
  const bodyH = rowHeight ?? t.rowHeight.input;
  for (let r = firstRow; r <= lastRow; r++) {
    ws.getRow(r).height = bodyH;
    const banded = alt && (r - firstRow) % 2 === 1;
    columns.forEach((c, i) => {
      const meta = kindMeta(t, c.kind ?? "text");
      const addr = A(left + i, r);
      let value = null;
      let kind = meta.cellKind;
      if (typeof c.formula === "function") {
        value = `=${c.formula(r, ctx)}`;
        kind = "calc";
      } else if (typeof c.value === "function") {
        value = c.value(r - firstRow);
      }
      builder.write(ws, addr, value, {
        kind,
        numFmt: meta.numFmt,
        style: {
          alignment: { vertical: "middle", horizontal: meta.align },
          ...(banded && kind !== "input" && kind !== "calc"
            ? { fill: { type: "pattern", pattern: "solid", fgColor: { argb: t.color.altRow } } }
            : {}),
        },
      });
    });
  }

  // total row
  if (totRow) {
    ws.getRow(totRow).height = t.rowHeight.body;
    columns.forEach((c, i) => {
      const addr = A(left + i, totRow);
      if (c.totalLabel) {
        builder.write(ws, addr, totalText, {
          kind: "total",
          style: { alignment: { horizontal: "right", vertical: "middle" } },
        });
        return;
      }
      const behaviour = c.total ?? (isNumeric(c.kind) ? "sum" : "none");
      if (behaviour === "none") {
        builder.write(ws, addr, null, { kind: "total" });
        return;
      }
      const range = dataRangeOf(c.key);
      const formula =
        typeof behaviour === "function"
          ? behaviour(range)
          : `SUM(${range})`;
      const meta = kindMeta(t, c.kind ?? "currency");
      builder.write(ws, addr, `=${formula}`, {
        kind: "total",
        numFmt: meta.numFmt,
        style: { alignment: { horizontal: meta.align, vertical: "middle" } },
      });
    });
  }

  return {
    header: top,
    firstRow,
    lastRow,
    totalRow: totRow,
    left,
    right,
    col: colLetterOf,
    colNum: colNumOf,
    dataRange: dataRangeOf,
    totalCell: totalCellOf,
    bodyRange: `${colLetter(left)}${firstRow}:${colLetter(right)}${lastRow}`,
  };
}

function isNumeric(kind) {
  return ["currency", "currencyCalc", "percent", "percentCalc", "int"].includes(kind);
}

/**
 * A KPI: a small muted UPPERCASE label above a large tabular figure. NO box, NO
 * fill. Supporting KPIs get a plain figure + a hairline under. The `emphasis`
 * KPI (the dashboard's bottom line) gets the editorial serif, the sheet's one
 * terracotta mark (a medium rule above the figure) and a larger size.
 * `value` may be a literal, a formula string ("=…") or `{ formula }`.
 * Returns the value cell address.
 */
export function kpiCard(builder, ws, { top, left, wCols = 2, label, value, numFmt, emphasis = false }) {
  const t = builder.theme;
  const right = left + wCols - 1;

  builder.merge(ws, `${A(left, top)}:${A(right, top)}`);
  builder.write(ws, A(left, top), String(label).toUpperCase(), {
    kind: "kicker",
    style: {
      alignment: { horizontal: "left", vertical: "bottom" },
      font: { name: t.font.family, size: t.font.size.kpiLabel ?? 8, bold: true, color: { argb: t.color.subtleInk } },
    },
  });
  ws.getRow(top).height = t.rowHeight.kpiLabel ?? t.rowHeight.compact;

  builder.merge(ws, `${A(left, top + 1)}:${A(right, top + 1)}`);
  builder.write(ws, A(left, top + 1), value, {
    kind: "calc",
    numFmt: numFmt ?? t.numberFormat.currencyGBP,
    style: {
      font: emphasis
        ? { name: t.font.display ?? t.font.family, size: t.font.size.kpiLeftover ?? 26, bold: true, color: { argb: t.color.accent } }
        : { name: t.font.family, size: t.font.size.kpiValue ?? 16, bold: true, color: { argb: t.color.ink } },
      alignment: { horizontal: "left", vertical: "middle" },
      border: emphasis
        ? { top: { style: "medium", color: { argb: t.color.accent } } }
        : { bottom: { style: "thin", color: { argb: t.color.rule } } },
    },
  });
  ws.getRow(top + 1).height = emphasis ? t.rowHeight.kpiLeftover ?? 46 : t.rowHeight.kpiValue ?? 30;
  return A(left, top + 1);
}

/**
 * A quiet multi-line note. A barely-there ivory wash + a thin terracotta rule
 * on the left edge — a margin note, not a coloured card.
 */
export function callout(builder, ws, { range, lines }) {
  const t = builder.theme;
  builder.merge(ws, range);
  const [start, end] = range.split(":");
  const cell = ws.getCell(start);
  cell.value = Array.isArray(lines) ? lines.join("\n") : lines;
  cell.font = { name: t.font.family, size: t.font.size.body, color: { argb: t.color.ink } };
  cell.alignment = { vertical: "top", wrapText: true, horizontal: "left", indent: 1 };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: t.color.altRow } };
  // left terracotta rule down the merged block's first column
  const startRow = Number(start.replace(/\D+/g, ""));
  const endRow = Number(end.replace(/\D+/g, ""));
  for (let r = startRow; r <= endRow; r++) {
    ws.getCell(start.replace(/\d+/, String(r))).border = {
      left: { style: "medium", color: { argb: t.color.accent } },
    };
  }
  return cell;
}

/**
 * A progress bar cell: writes `fractionFormula` (a 0..1 value) into `ref`,
 * formats it as a percentage and lays a native data bar over it.
 */
export function progressBar(builder, ws, { ref, fractionFormula, colorArgb }) {
  builder.write(ws, ref, `=${String(fractionFormula).replace(/^=/, "")}`, {
    kind: "calc",
    numFmt: builder.theme.numberFormat.percent0,
    style: { alignment: { horizontal: "left", vertical: "middle" } },
  });
  builder.dataBar(ws, ref, { colorArgb: colorArgb ?? builder.theme.color.accent, min: 0, max: 1 });
  return ref;
}

/**
 * A checkbox column: a centred data-validation dropdown of "" / "✓" over an
 * A1:A9 style range. Functional (customer clicks the dropdown) and prints.
 */
export function checkboxColumn(builder, ws, range, { checked = "✓" } = {}) {
  builder.dropdown(ws, range, ["", checked], { allowBlank: true, strict: false });
}

/**
 * A status column: dropdown of `options` plus conditional formatting that
 * tints each value. `palette` maps option -> argb fill.
 */
export function statusColumn(builder, ws, range, options, palette = {}) {
  builder.dropdown(ws, range, options, { allowBlank: true, strict: true });
  for (const [value, argb] of Object.entries(palette)) {
    builder.conditional(ws, range, {
      type: "containsText",
      operator: "containsText",
      text: value,
      style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb } } },
    });
  }
}

export const components = {
  titleBlock,
  sectionHeading,
  divider,
  table,
  kpiCard,
  callout,
  progressBar,
  checkboxColumn,
  statusColumn,
};
