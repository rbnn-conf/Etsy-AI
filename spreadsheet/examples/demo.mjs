/**
 * Engine demo / test product — proves the pipeline end to end.
 *
 * Demonstrates: formulas, currency + percent number formats, a dropdown, a
 * status column with conditional formatting, totals, a progress bar + REPT()
 * in-cell bar ("mini chart"), freeze panes, a named range, sheet protection
 * (inputs stay editable), print settings, a hidden helper sheet — then renders
 * a PNG preview from the actual file.
 *
 *   node examples/demo.mjs            # build + preview into examples/out/
 *   npm run demo
 */

import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  WorkbookBuilder,
  titleBlock,
  sectionHeading,
  table,
  kpiCard,
  progressBar,
  statusColumn,
  checkboxColumn,
  renderXlsxPreview,
  previewToolsAvailable,
} from "../src/index.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "out");

export async function buildDemoWorkbook() {
  const b = new WorkbookBuilder({
    theme: { currency: "GBP" },
    meta: { title: "XLSX Engine Demo", description: "Digital Product Factory — engine demo product" },
  });
  const money = b.theme.numberFormat.currencyGBP;

  // --- hidden helper sheet: dropdown source list ---
  const lists = b.addSheet("Lists", { hidden: true });
  ["Category", "Groceries", "Transport", "Bills", "Leisure", "Other"].forEach((v, i) => {
    lists.getCell(`A${i + 1}`).value = v;
  });
  b.defineName("Categories", "Lists!$A$2:$A$6");

  // --- main sheet ---
  const ws = b.addSheet("Budget", { tabColorArgb: b.theme.color.accent });
  b.setColumns(ws, [
    { width: 30 }, // A description
    { width: 16 }, // B category
    { width: 14 }, // C budget
    { width: 14 }, // D actual
    { width: 14 }, // E difference
    { width: 12 }, // F status
    { width: 22 }, // G bar
  ]);

  let row = titleBlock(b, ws, {
    row: 1,
    span: 7,
    title: "Monthly Budget — Demo",
    subtitle: "Yellow cells are yours to edit · grey cells calculate themselves",
  });

  row = sectionHeading(b, ws, { row, span: 7, text: "SPENDING" });

  const t = table(b, ws, {
    top: row,
    left: 1,
    rows: 6,
    totalText: "TOTAL",
    columns: [
      { header: "Description", key: "desc", kind: "text", width: 30, totalLabel: true,
        value: (i) => ["Weekly shop", "Fuel", "Electricity", "Cinema", "", ""][i] },
      { header: "Category", key: "cat", kind: "text", width: 16,
        value: (i) => ["Groceries", "Transport", "Bills", "Leisure", "", ""][i] },
      { header: "Budget", key: "budget", kind: "currency",
        value: (i) => [320, 90, 75, 40, null, null][i] },
      { header: "Actual", key: "actual", kind: "currency",
        value: (i) => [305.4, 112.2, 75, 22, null, null][i] },
      { header: "Difference", key: "diff", kind: "currencyCalc",
        formula: (r) => `IFERROR(C${r}-D${r},0)` },
      { header: "Status", key: "status", kind: "text", total: "none" },
      { header: "Budget used", key: "bar", kind: "text", total: "none" },
    ],
  });

  // dropdown on Category (uses the named range), status column w/ conditional formatting
  b.dropdown(ws, `${t.col("cat")}${t.firstRow}:${t.col("cat")}${t.lastRow}`, "=Categories");
  statusColumn(
    b,
    ws,
    `${t.col("status")}${t.firstRow}:${t.col("status")}${t.lastRow}`,
    ["Under", "On track", "Over"],
    { Under: b.theme.color.positive + "22", "On track": b.theme.color.accentSoft, Over: b.theme.color.negative + "22" },
  );
  // auto-status formula would fight the dropdown; instead colour the Difference cell
  b.conditional(ws, `${t.col("diff")}${t.firstRow}:${t.col("diff")}${t.lastRow}`, [
    { type: "cellIs", operator: "lessThan", formulae: ["0"],
      style: { font: { color: { argb: b.theme.color.negative } } } },
    { type: "cellIs", operator: "greaterThanOrEqual", formulae: ["0"],
      style: { font: { color: { argb: b.theme.color.positive } } } },
  ]);

  // REPT() in-cell bar — a formula-driven "mini chart" of budget used
  for (let r = t.firstRow; r <= t.lastRow; r++) {
    b.write(ws, `${t.col("bar")}${r}`, `=IF(C${r}=0,"",REPT("|",MIN(20,ROUND(D${r}/C${r}*20,0))))`, {
      kind: "calc",
      style: { font: { name: "Consolas", size: 9, color: { argb: b.theme.color.accent } }, alignment: { horizontal: "left", vertical: "middle" } },
    });
  }

  // --- KPI cards + savings-rate + progress bar ---
  const kpiTop = t.totalRow + 2;
  const budgetTotal = `${t.totalCell("budget")}`;
  const actualTotal = `${t.totalCell("actual")}`;
  kpiCard(b, ws, { top: kpiTop, left: 1, wCols: 2, label: "TOTAL BUDGET", value: `=${budgetTotal}`, numFmt: money });
  kpiCard(b, ws, { top: kpiTop, left: 3, wCols: 2, label: "TOTAL SPENT", value: `=${actualTotal}`, numFmt: money });
  kpiCard(b, ws, {
    top: kpiTop, left: 5, wCols: 2, label: "LEFT / OVER", emphasis: true,
    value: `=IFERROR(${budgetTotal}-${actualTotal},0)`, numFmt: b.theme.numberFormat.currencyGBPSigned,
  });

  const barRow = kpiTop + 3;
  b.write(ws, `A${barRow}`, "Budget used", { kind: "label" });
  progressBar(b, ws, { ref: `B${barRow}`, fractionFormula: `IFERROR(${actualTotal}/${budgetTotal},0)` });
  b.merge(ws, `C${barRow}:G${barRow}`);
  b.write(ws, `C${barRow}`, `=IF(${actualTotal}>${budgetTotal},"Over budget — adjust next month","Within budget")`, {
    kind: "calc", style: { alignment: { horizontal: "left", vertical: "middle" } },
  });

  const checkRow = barRow + 2;
  b.write(ws, `A${checkRow}`, "Reviewed & reconciled?", { kind: "label" });
  checkboxColumn(b, ws, `B${checkRow}`);

  // --- finishing: freeze header, print area, header/footer, protection ---
  b.freeze(ws, { ySplit: t.header });
  b.printArea(ws, `A1:G${checkRow + 1}`);
  b.headerFooter(ws, {
    center: "Monthly Budget — Demo",
    footerLeft: "Digital Product Factory",
    footerRight: "Page &P of &N",
  });
  await b.protectFormulas(ws);

  return { builder: b, sheets: ["Budget"] };
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const { builder } = await buildDemoWorkbook();
  const xlsxPath = join(OUT, "demo.xlsx");
  await builder.writeFile(xlsxPath);
  console.log(`workbook -> ${xlsxPath}`);

  if (await previewToolsAvailable()) {
    const res = await renderXlsxPreview(xlsxPath, {
      outDir: join(OUT, "preview"),
      variant: "demo",
      keepPdfAs: join(OUT, "demo.pdf"),
    });
    console.log(`preview -> ${res.primary}`);
    for (const p of res.pages) console.log(`  ${p.path}  ${p.width}x${p.height}`);
  } else {
    console.log("preview skipped — soffice / pdftoppm not on PATH");
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
