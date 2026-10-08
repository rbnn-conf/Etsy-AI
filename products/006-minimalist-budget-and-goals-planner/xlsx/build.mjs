/**
 * Product #006 — Minimalist Budget & Goals Planner — XLSX build. v4.
 *
 * TEST/REVIEW build. Recreates the reference workbook as closely as
 * reasonably possible per explicit owner instruction ("make it exactly like
 * this"): the rose+sage two-tone palette, the three-column-zone Budget
 * layout (Cash Flow Summary/Income Summary/Where-My-Money-Went in one zone,
 * Expense Summary/Savings Tracker in a second, Bill Tracker/Debt Payments
 * Tracker in a third), a single Transactions List that every other table's
 * Actual column pulls from via SUMIF (not typed), a Type -> Category
 * dependent dropdown, a top-N ranking engine feeding a "Where My Money
 * Went" pie, and 4 native Excel charts on Budget + 1 native doughnut on
 * Goal Tracker (ExcelJS can't write charts — see native-charts.mjs).
 * See ADR-021 for the full adaptation rationale and what's deliberately not
 * carried over (branding, the live "$"-symbol mechanism, full ~500-row
 * blank padding).
 *
 *   ../product-spec.json + ../xlsx-design-spec.json
 *      -> @dpf/spreadsheet (engine + native chart injection)
 *      -> storage/products/006/final/minimalist-budget-and-goals-planner.xlsx
 *
 *   node build.mjs
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  WorkbookBuilder,
  titleBlock,
  sectionHeading,
  divider,
  table,
  kpiCard,
  callout,
  progressBar,
  checkboxColumn,
  colLetter,
  forEachCell,
  assertValidSpreadsheetSpec,
  injectNativeCharts,
} from "@dpf/spreadsheet";

const HERE = dirname(fileURLToPath(import.meta.url));
const PRODUCT_DIR = join(HERE, "..");
const REPO_ROOT = join(HERE, "..", "..", "..");
const STORE = join(REPO_ROOT, "storage", "products", "006");
const OUT_XLSX = join(STORE, "final", "minimalist-budget-and-goals-planner.xlsx");

const SPAN = 16;
const WASH_ROWS = 220; // generous canvas-wash depth — comfortably covers Budget, the tallest sheet
const q = (sheet) => (/\s|&|-/.test(sheet) ? `'${sheet}'` : sheet);
const money = (b) => b.theme.numberFormat.currencyGBP;
const moneySigned = (b) => b.theme.numberFormat.currencyGBPSigned;

/**
 * @param {object} [opts]
 * @param {object} [opts.seed] - example/QA data, applied to the in-memory
 *   ExcelJS model BEFORE native chart injection and the final write. Native
 *   charts are spliced into the .xlsx as raw OOXML after ExcelJS writes the
 *   file (ExcelJS can't write charts at all — see native-charts.mjs), and
 *   ExcelJS has no model for those parts, so ANY later load->modify->save
 *   round-trip through it (which is what writing example data on top of an
 *   already-built file would be) silently drops them. Seeding here, before
 *   that one-way write, is the only safe order.
 * @param {string} [opts.outPath] - defaults to the standard blank-template path
 */
export async function buildProduct006Workbook(opts = {}) {
  const productSpec = JSON.parse(await readFile(join(PRODUCT_DIR, "product-spec.json"), "utf8"));
  const xlsxSpec = JSON.parse(await readFile(join(PRODUCT_DIR, "xlsx-design-spec.json"), "utf8"));
  assertValidSpreadsheetSpec(xlsxSpec);

  const b = new WorkbookBuilder({
    theme: xlsxSpec.theme,
    meta: {
      title: xlsxSpec.title ?? productSpec.name,
      creator: "Digital Product Factory",
      company: "Digital Product Factory",
      description: productSpec.description,
    },
  });

  const cats = xlsxSpec.categories;
  const cardBand = xlsxSpec.cardBand;
  const tabColor = xlsxSpec.phaseTabColor ?? {};
  const chartSpec = xlsxSpec.charts;

  // --- Lists sheet: dropdown sources + the ranking engine ---------------
  const lists = b.addSheet("Lists", { hidden: true });
  const TYPES = ["Income", "Expense", "Bill", "Debt", "Savings"];
  const poolFor = { Income: cats.income, Expense: cats.expense, Bill: cats.bill, Debt: cats.debt, Savings: cats.savings };
  const LIST_COL = { Income: "A", Expense: "B", Bill: "C", Debt: "D", Savings: "E" };
  for (const type of TYPES) {
    const col = LIST_COL[type];
    poolFor[type].forEach((v, i) => (lists.getCell(`${col}${i + 1}`).value = v));
    b.defineName(type, `Lists!$${col}$1:$${col}$${poolFor[type].length}`);
  }
  cats.lifeAreas.forEach((v, i) => (lists.getCell(`F${i + 1}`).value = v));
  b.defineName("LifeAreas", `Lists!$F$1:$F$${cats.lifeAreas.length}`);
  TYPES.forEach((v, i) => (lists.getCell(`G${i + 1}`).value = v));
  b.defineName("TransactionTypes", `Lists!$G$1:$G$${TYPES.length}`);

  const sheets = [...xlsxSpec.sheets].sort((a, c) => a.order - c.order);
  let budgetRefs = null;
  let goalRefs = null;

  for (const sheet of sheets) {
    const tab = tabColor[sheet.slug === "goal-tracker" ? "goals" : sheet.slug] ?? b.theme.color.accent;
    const ws = b.addSheet(sheet.name, { tabColorArgb: tab });
    const span = sheet.kind === "goals" ? xlsxSpec.sheets.find((s) => s.slug === "goal-tracker").sections.columns.length : SPAN;
    b.setColumns(ws, Array.from({ length: span }, () => ({ width: 96 / span })));

    // warm-ivory canvas wash (LumiumX house register, ADR-022 — same
    // treatment as Product #001) — set before any content so later themed
    // cells (which only carry their own fill when the kind specifies one)
    // show it through underneath.
    forEachCell(ws, `${cell(1, 1)}:${cell(span, WASH_ROWS)}`, (c) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: b.theme.color.canvas } };
    });

    // masthead: "LUMIUMX" left, the plan/track/bonus phase right, one row —
    // then the editorial title block below. No solid colour band.
    b.write(ws, cell(1, 1), "LUMIUMX", { kind: "kicker" });
    b.write(ws, cell(span, 1), phaseFor(sheet).toUpperCase(), {
      kind: "kicker",
      style: { alignment: { horizontal: "right", vertical: "middle" } },
    });
    ws.getRow(1).height = b.theme.rowHeight.subtitle;

    let row = titleBlock(b, ws, { row: 2, span, title: sheet.title, subtitle: subtitleFor(sheet) });
    row += 1;

    if (sheet.kind === "instructions") {
      buildInstructions(b, ws, row, sheet);
    } else if (sheet.kind === "workspace") {
      budgetRefs = buildBudgetWorkspace(b, ws, row, sheet, { cats, cardBand });
    } else if (sheet.kind === "goals") {
      goalRefs = buildGoalTracker(b, ws, row, sheet, { cardBand, cats });
    }

    b.headerFooter(ws, { footerLeft: "LUMIUMX", footerCenter: escAmp(productSpec.name), footerRight: `Sheet ${sheet.order} / ${sheets.length}` });
  }

  wireKpiAndCashFlow(b, budgetRefs);

  if (opts.seed) seedExampleData(b, budgetRefs, goalRefs, opts.seed);

  for (const ws of b.wb.worksheets) {
    if (ws.state === "veryHidden") continue;
    await b.protectFormulas(ws);
  }

  const outXlsx = opts.outPath ?? OUT_XLSX;
  await mkdir(dirname(outXlsx), { recursive: true });

  // Native chart injection — ExcelJS can't write charts, so build the .xlsx
  // normally, then splice in the OOXML chart/drawing parts by hand.
  const buffer = await b.toBuffer();
  const charted = await injectNativeCharts(buffer, {
    [budgetRefs.sheetName]: buildBudgetCharts(budgetRefs, chartSpec, b.theme),
    [goalRefs.sheetName]: buildGoalChart(goalRefs, chartSpec),
  });
  await writeFile(outXlsx, charted);

  const report = {
    builtAt: new Date().toISOString(),
    product: "006",
    output: "storage/products/006/final/minimalist-budget-and-goals-planner.xlsx",
    currency: b.theme.currency,
    sheets: sheets.map((s) => s.name),
    namedRanges: (b.wb.definedNames.model ?? []).map((d) => d.name),
    probe: {
      overviewSheet: budgetRefs.sheetName,
      overviewIncomeCard: budgetRefs.cards.income,
      overviewExpensesBillsCard: budgetRefs.cards.expensesBills,
      overviewDebtCard: budgetRefs.cards.debt,
      overviewSavingsCard: budgetRefs.cards.savings,
      rolloverCell: `${q(budgetRefs.sheetName)}!${budgetRefs.rolloverCell}`,
      leftoverActualCell: `${q(budgetRefs.sheetName)}!${budgetRefs.cashFlow.leftoverActual}`,
      incomeCategoryRange: budgetRefs.income.dataRange("category"),
      incomeExpectedRange: budgetRefs.income.dataRange("expected"),
      incomeActualRange: budgetRefs.income.dataRange("actual"),
      incomeActualTotal: `${q(budgetRefs.sheetName)}!${budgetRefs.income.totalCell("actual")}`,
      expenseCategoryRange: budgetRefs.expense.dataRange("category"),
      expenseExpectedRange: budgetRefs.expense.dataRange("expected"),
      expenseActualRange: budgetRefs.expense.dataRange("actual"),
      expenseActualTotal: `${q(budgetRefs.sheetName)}!${budgetRefs.expense.totalCell("actual")}`,
      billCategoryRange: budgetRefs.bill.dataRange("category"),
      billExpectedRange: budgetRefs.bill.dataRange("expected"),
      billActualRange: budgetRefs.bill.dataRange("actual"),
      billPaidRange: budgetRefs.bill.dataRange("paid"),
      billDueRange: budgetRefs.bill.dataRange("due"),
      savingsCategoryRange: budgetRefs.savings.dataRange("category"),
      savingsExpectedRange: budgetRefs.savings.dataRange("expected"),
      savingsActualRange: budgetRefs.savings.dataRange("actual"),
      debtCategoryRange: budgetRefs.debt.dataRange("category"),
      debtExpectedRange: budgetRefs.debt.dataRange("expected"),
      debtActualRange: budgetRefs.debt.dataRange("actual"),
      debtPaidRange: budgetRefs.debt.dataRange("paid"),
      transactionsDateRange: budgetRefs.transactions.dataRange("date"),
      transactionsTypeRange: budgetRefs.transactions.dataRange("type"),
      transactionsCategoryRange: budgetRefs.transactions.dataRange("category"),
      transactionsAmountRange: budgetRefs.transactions.dataRange("amount"),
      transactionsDescriptionRange: budgetRefs.transactions.dataRange("description"),
      whereMoneyWentCategoryRange: budgetRefs.whereMoneyWent.dataRange("category"),
      whereMoneyWentAmountRange: budgetRefs.whereMoneyWent.dataRange("amount"),
      goalTrackerSheet: goalRefs.sheetName,
      goalTrackerStepsDoneRange: goalRefs.dataRange("stepsDone"),
      goalTrackerStepsTotalRange: goalRefs.dataRange("stepsTotal"),
      goalTrackerStatusRange: goalRefs.dataRange("status"),
      goalTrackerOverallProgressCell: `${q(goalRefs.sheetName)}!${goalRefs.overallProgressCell}`,
    },
  };
  if (!opts.seed) await writeFile(join(STORE, "xlsx-build-report.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
  return { xlsxPath: outXlsx, report };
}

// --- small helpers ------------------------------------------------------

function escAmp(s) { return String(s).replace(/&/g, "&&"); }

function cell(colNum, rowNum) { return `${colLetter(colNum)}${rowNum}`; }

function phaseFor(sheet) {
  if (sheet.slug === "instructions") return "Start here";
  if (sheet.slug === "goal-tracker") return "Bonus";
  return "Plan · Track";
}

function subtitleFor(sheet) {
  if (sheet.slug === "instructions") return "Read this once. Cream cells are yours; plain cells calculate themselves.";
  if (sheet.slug === "budget") return "Budget planner dashboard — everything for this month, in one place.";
  if (sheet.slug === "goal-tracker") return "Named goals, a life area each, progress from the steps you've ticked off.";
  return "";
}

/**
 * Section heading — tracked caps + one hairline underneath, no fill/band
 * (LumiumX house register, ADR-022 — replaces v4's solid rose card band).
 * Kept as `cardHeading` and the same call signature (an unused `cardBand`
 * param may still be threaded through by callers) purely so every existing
 * call site works unchanged; the implementation now just delegates to the
 * shared `sectionHeading` component.
 */
function cardHeading(b, ws, { row, left = 1, span = SPAN, text }) {
  return sectionHeading(b, ws, { row, left, span, text });
}

function buildInstructions(b, ws, row, sheet) {
  const s = sheet.sections;
  row = sectionHeading(b, ws, { row, span: SPAN, text: "HOW THIS WORKS" });
  callout(b, ws, { range: `${cell(1, row)}:${cell(SPAN, row + 5)}`, lines: s.howItWorks });
  row += 7;
  row = sectionHeading(b, ws, { row, span: SPAN, text: "DIFFERENT TRANSACTION TYPES" });
  callout(b, ws, { range: `${cell(1, row)}:${cell(SPAN, row + 5)}`, lines: s.transactionTypes });
  row += 7;
  row = sectionHeading(b, ws, { row, span: SPAN, text: "KEY" });
  callout(b, ws, { range: `${cell(1, row)}:${cell(SPAN, row + 6)}`, lines: s.key });
  row += 8;
  row = sectionHeading(b, ws, { row, span: SPAN, text: "WORKED EXAMPLE" });
  callout(b, ws, { range: `${cell(1, row)}:${cell(SPAN, row + 2)}`, lines: s.workedExample });
  row += 4;
  row = sectionHeading(b, ws, { row, span: SPAN, text: "PRINTING" });
  callout(b, ws, { range: `${cell(1, row)}:${cell(SPAN, row + 2)}`, lines: s.printing });
  row += 4;
  b.printArea(ws, `A1:${cell(SPAN, row)}`);
}

/**
 * One zone table: card heading + table, Actual always a live SUMIF against
 * the Transactions List (never typed), Progress a native data bar.
 * `hasDueAndPaid` adds the Paid checkbox + Due columns (Bill/Debt family);
 * without it, this is the simpler Category/Expected/Actual[/Progress] shape
 * (Income/Expense/Savings family — Income has no Progress column).
 */
function zoneTable(b, ws, { row, left, heading, categories, capacity, hasDueAndPaid, withProgress, txnCategoryRange, txnAmountRange, useAbs, cardBand }) {
  const span = hasDueAndPaid ? 6 : withProgress ? 4 : 3;
  row = cardHeading(b, ws, { row, left, span, text: heading, cardBand });

  const actualFormula = (r, ctx) => {
    const inner = `SUMIF(${txnCategoryRange},${ctx.col("category")}${r},${txnAmountRange})`;
    return `IFERROR(${useAbs ? `ABS(${inner})` : inner},0)`;
  };

  const columns = hasDueAndPaid
    ? [
        { header: "", key: "paid", kind: "check", width: 6 },
        { header: "Category", key: "category", kind: "text", width: 17, totalLabel: true, value: (i) => categories[i] ?? null },
        { header: "Due", key: "due", kind: "int", total: "none", width: 7 },
        { header: "Expected", key: "expected", kind: "currency", total: "sum", width: 12 },
        { header: "Actual", key: "actual", kind: "currency", total: "sum", width: 12, formula: actualFormula },
        { header: "Progress", key: "progress", kind: "text", width: 16 },
      ]
    : withProgress
      ? [
          { header: "Category", key: "category", kind: "text", width: 22, totalLabel: true, value: (i) => categories[i] ?? null },
          { header: "Expected", key: "expected", kind: "currency", total: "sum", width: 13 },
          { header: "Actual", key: "actual", kind: "currency", total: "sum", width: 13, formula: actualFormula },
          { header: "Progress", key: "progress", kind: "text", width: 18 },
        ]
      : [
          { header: "Category", key: "category", kind: "text", width: 24, totalLabel: true, value: (i) => categories[i] ?? null },
          { header: "Expected", key: "expected", kind: "currency", total: "sum", width: 13 },
          { header: "Actual", key: "actual", kind: "currency", total: "sum", width: 13, formula: actualFormula },
        ];

  const t = table(b, ws, { top: row, left, rows: capacity, columns, totalRow: true, totalText: "TOTAL", rowHeight: b.theme.rowHeight.ledger });

  if (hasDueAndPaid) checkboxColumn(b, ws, `${t.col("paid")}${t.firstRow}:${t.col("paid")}${t.lastRow}`);
  if (hasDueAndPaid || withProgress) {
    for (let r = t.firstRow; r <= t.lastRow; r++) {
      const frac = `IFERROR(${t.col("actual")}${r}/${t.col("expected")}${r},0)`;
      progressBar(b, ws, { ref: `${t.col("progress")}${r}`, fractionFormula: frac });
    }
  }

  return { t, nextRow: (t.totalRow ?? t.lastRow) + 2 };
}

/** The ranking engine (Lists sheet): flattens Expense+Bill+Debt+Savings into
 * one amount-sorted, duplicate-safe top-N list for the "Where My Money
 * Went" pie. Uses the classic INDEX(range,0) trick to force array
 * evaluation without a legacy CSE array formula (ExcelJS has no API to mark
 * a cell as a true array formula) — functionally identical to the
 * reference's own LARGE/INDEX/MATCH/COUNTIF engine, portable to any modern
 * Excel without Ctrl+Shift+Enter. */
function buildRankingEngine(b, lists, { budgetSheetName, pools }) {
  const startRow = 2; // row 1 reserved as the blank COUNTIF anchor
  let r = startRow;
  const poolRanges = [];
  for (const pool of pools) {
    const first = r;
    for (let i = 0; i < pool.capacity; i++) {
      lists.getCell(`I${r}`).value = r - startRow + 1; // rank index k
      // IF(...="","",...): a formula referencing a genuinely blank source
      // cell (an unused capacity row) evaluates to the number 0, not blank
      // text — without this guard, blank rows would rank and display as
      // the literal category label "0".
      const srcRef = `${q(budgetSheetName)}!${pool.categoryCell(i)}`;
      b.write(lists, `J${r}`, `=IF(${srcRef}="","",${srcRef})`, { kind: "calc" });
      b.write(lists, `K${r}`, `=IFERROR(${q(budgetSheetName)}!${pool.actualCell(i)},0)`, { kind: "calc", numFmt: b.theme.numberFormat.currencyGBP });
      r += 1;
    }
    poolRanges.push([first, r - 1]);
  }
  const lastData = r - 1;
  const jRange = `$J$${startRow}:$J$${lastData}`;
  const kRange = `$K$${startRow}:$K$${lastData}`;
  const totalCell = `K${lastData + 1}`;
  b.write(lists, totalCell, `=SUM(${kRange})`, { kind: "calc", numFmt: b.theme.numberFormat.currencyGBP });

  for (let i = 0; i < lastData - startRow + 1; i++) {
    const row = startRow + i;
    b.write(lists, `M${row}`, `=LARGE(${kRange},ROWS($I$${startRow}:I${row}))`, { kind: "calc", numFmt: b.theme.numberFormat.currencyGBP });
    const excludeRange = `L$${startRow - 1}:L${row - 1}`;
    b.write(
      lists,
      `L${row}`,
      `=IFERROR(INDEX(${jRange},MATCH(1,INDEX((${kRange}=M${row})*(COUNTIF(${excludeRange},${jRange})=0),0),0)),"")`,
      { kind: "calc" },
    );
    b.write(lists, `N${row}`, `=IFERROR(M${row}/${q("Lists")}!${totalCell},"")`, { kind: "calc", numFmt: b.theme.numberFormat.percent1 });
  }

  return {
    rankedCategoryCell: (rank) => `L${startRow + rank}`, // rank: 0-based
    rankedAmountCell: (rank) => `M${startRow + rank}`,
    rankedPercentCell: (rank) => `N${startRow + rank}`,
    totalCell,
  };
}

/**
 * A whisper-light fill + soft hairline frame around a KPI block's 2-row
 * (label + value) merged range — "elegant restrained block," matching
 * Product #001's KPI treatment (ADR-022), not a saturated bordered card.
 */
function kpiBlockFrame(b, ws, { top, left, right, fillArgb }) {
  const rule = { style: "thin", color: { argb: b.theme.color.rule } };
  for (let r = top; r <= top + 1; r++) {
    for (let c = left; c <= right; c++) {
      const target = ws.getCell(cell(c, r));
      target.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fillArgb } };
      const border = {};
      if (r === top) border.top = rule;
      if (r === top + 1) border.bottom = rule;
      if (c === left) border.left = rule;
      if (c === right) border.right = rule;
      target.border = border;
    }
  }
}

/** The Budget sheet: KPI band, 2 native charts (Cash Flow + Where My Money
 * Went), Cash Flow Summary, an "Available to Spend" feature, a 3-across x
 * 2-row grid of category tables (Income/Expense/Bill, then Savings/Debt +
 * the ranked Where My Money Went table), and a full-width Transactions
 * List every table's Actual pulls from live. */
function buildBudgetWorkspace(b, ws, row, sheet, ctx) {
  const cats = ctx.cats;
  const sheetName = ws.name;

  // Budget period + rollover + currency note — reference-only, unlinked.
  b.write(ws, cell(1, row), "Budget period", { kind: "label" });
  b.merge(ws, `${cell(3, row)}:${cell(5, row)}`); b.write(ws, cell(3, row), null, { kind: "input", numFmt: b.theme.numberFormat.dateUK });
  b.write(ws, cell(6, row), "to", { kind: "footnote", style: { alignment: { horizontal: "center", vertical: "middle" } } });
  b.merge(ws, `${cell(7, row)}:${cell(9, row)}`); b.write(ws, cell(7, row), null, { kind: "input", numFmt: b.theme.numberFormat.dateUK });
  row += 2;
  b.write(ws, cell(1, row), "Rollover from last month", { kind: "label" });
  const rolloverCell = cell(3, row);
  b.write(ws, rolloverCell, 0, { kind: "input", numFmt: money(b) });
  row += 2;

  // KPI dashboard band — 4 cards spanning the full width, each a soft
  // family-tinted block (income=plain, spending pools=pale terracotta,
  // savings=pale sage) rather than a plain thin-bordered box.
  const cards = {};
  const cardTop = row;
  const kpiLayout = { income: 1, expensesBills: 5, debt: 9, savings: 13 };
  const kpiLabels = { income: "Income", expensesBills: "Expenses & Bills", debt: "Debt Payments", savings: "Savings" };
  const kpiTint = { income: "FFFFFF", expensesBills: b.theme.color.accentSoft, debt: b.theme.color.accentSoft, savings: b.theme.color.sageSoft };
  for (const key of Object.keys(kpiLayout)) {
    const left = kpiLayout[key];
    cards[key] = kpiCard(b, ws, { top: cardTop, left, wCols: 4, label: kpiLabels[key], value: 0, numFmt: money(b) });
    kpiBlockFrame(b, ws, { top: cardTop, left, right: left + 3, fillArgb: kpiTint[key] });
  }
  row = cardTop + 4;
  row = divider(b, ws, { row, span: SPAN });

  // Charts row — reserved blank rows; the native Cash Flow bar (primary,
  // wider) + Where My Money Went doughnut (supporting, narrower) get
  // injected here after the workbook is built (see buildBudgetCharts).
  const chartsTop = row;
  row += 20;
  row = divider(b, ws, { row, span: SPAN });

  // --- Cash Flow Summary (compact) ----------------------------------------
  row = cardHeading(b, ws, { row, left: 1, span: 3, text: "CASH FLOW SUMMARY" });
  const cfColumns = [
    { header: "Category", key: "category", kind: "text", width: 22 },
    { header: "Expected", key: "expected", kind: "currency", width: 13 },
    { header: "Actual", key: "actual", kind: "currency", width: 13 },
  ];
  const cf = table(b, ws, { top: row, left: 1, rows: 7, columns: cfColumns, totalRow: false, rowHeight: b.theme.rowHeight.ledger });
  const cfRow = { rollover: cf.firstRow, income: cf.firstRow + 1, expenses: cf.firstRow + 2, bills: cf.firstRow + 3, debt: cf.firstRow + 4, savings: cf.firstRow + 5, leftover: cf.firstRow + 6 };
  const cfLabel = { rollover: "+ Rollover", income: "+ Total Income", expenses: "- Expenses", bills: "- Bills", debt: "- Debt", savings: "- Savings", leftover: "TOTAL LEFTOVER" };
  for (const [k, r] of Object.entries(cfRow)) {
    b.write(ws, `${cf.col("category")}${r}`, cfLabel[k], { kind: k === "leftover" ? "total" : "label" });
  }
  row = cf.lastRow + 2;
  row = divider(b, ws, { row, span: SPAN });

  // --- Available to Spend (feature treatment, matching Product #001) ------
  const leftoverActualCell = kpiCard(b, ws, { top: row, left: 1, wCols: 6, label: "Available to Spend", value: 0, numFmt: moneySigned(b), emphasis: true });
  const statusRow = row + 2;
  b.merge(ws, `${cell(1, statusRow)}:${cell(6, statusRow)}`);
  const statusCell = cell(1, statusRow);
  b.write(ws, statusCell, `=IF(${leftoverActualCell}<0,"Over budget this month.","You're on track this month.")`, { kind: "footnote" });
  b.conditional(ws, statusCell, { type: "cellIs", operator: "lessThan", formulae: ["0"], style: { font: { color: { argb: b.theme.color.negative } } } });
  row = statusRow + 1;
  row = divider(b, ws, { row, span: SPAN });

  // --- Table grid, row 1: Income / Expense / Bill --------------------------
  const income = zoneTable(b, ws, {
    row, left: 1, heading: "INCOME SUMMARY", categories: cats.income, capacity: cats.incomeCapacity,
    hasDueAndPaid: false, withProgress: false, useAbs: false,
    txnCategoryRange: "TXN_CAT_RANGE", txnAmountRange: "TXN_AMT_RANGE", // wired below once Transactions exists
  });
  const expense = zoneTable(b, ws, {
    row, left: 5, heading: "EXPENSE SUMMARY", categories: cats.expense, capacity: cats.expenseCapacity,
    hasDueAndPaid: false, withProgress: true, useAbs: true,
    txnCategoryRange: "TXN_CAT_RANGE", txnAmountRange: "TXN_AMT_RANGE",
  });
  const bill = zoneTable(b, ws, {
    row, left: 10, heading: "BILL TRACKER", categories: cats.bill, capacity: cats.billCapacity,
    hasDueAndPaid: true, withProgress: true, useAbs: true,
    txnCategoryRange: "TXN_CAT_RANGE", txnAmountRange: "TXN_AMT_RANGE",
  });
  row = Math.max(income.nextRow, expense.nextRow, bill.nextRow);
  row = divider(b, ws, { row, span: SPAN });

  // --- Table grid, row 2: Savings / Debt -----------------------------------
  // Column positions are chosen to LINE UP with row 1's matching shapes
  // (Excel column width is a whole-column property, like row height is a
  // whole-row property — two tables sharing a column but wanting different
  // widths silently corrupt each other, the same bug class documented below
  // for row-height sync). Savings uses the identical withProgress column
  // widths as Expense Summary (left=5); Debt uses the identical
  // hasDueAndPaid widths as Bill Tracker (left=10) — both exact shape
  // matches, so the shared columns get one consistent width. Where My Money
  // Went (below) takes Income's old slot (left=1) for the same reason.
  const savings = zoneTable(b, ws, {
    row, left: 5, heading: "SAVINGS TRACKER", categories: cats.savings, capacity: cats.savingsCapacity,
    hasDueAndPaid: false, withProgress: true, useAbs: true,
    txnCategoryRange: "TXN_CAT_RANGE", txnAmountRange: "TXN_AMT_RANGE",
  });
  const debt = zoneTable(b, ws, {
    row, left: 10, heading: "DEBT PAYMENTS TRACKER", categories: cats.debt, capacity: cats.debtCapacity,
    hasDueAndPaid: true, withProgress: true, useAbs: true,
    txnCategoryRange: "TXN_CAT_RANGE", txnAmountRange: "TXN_AMT_RANGE",
  });

  // --- Ranking engine + "Where My Money Went" (3rd slot, row 2) -----------
  // Needs Expense/Bill/Debt/Savings' cell addresses (known immediately after
  // zoneTable returns) but not the Transactions List itself — see the
  // Actual-formula placeholder fixup below, which is the only thing that
  // genuinely must happen after Transactions exists.
  const ranking = buildRankingEngine(b, b.wb.getWorksheet("Lists"), {
    budgetSheetName: sheetName,
    pools: [
      { categoryCell: (i) => expense.t.col("category") + (expense.t.firstRow + i), actualCell: (i) => expense.t.col("actual") + (expense.t.firstRow + i), capacity: cats.expenseCapacity },
      { categoryCell: (i) => bill.t.col("category") + (bill.t.firstRow + i), actualCell: (i) => bill.t.col("actual") + (bill.t.firstRow + i), capacity: cats.billCapacity },
      { categoryCell: (i) => debt.t.col("category") + (debt.t.firstRow + i), actualCell: (i) => debt.t.col("actual") + (debt.t.firstRow + i), capacity: cats.debtCapacity },
      { categoryCell: (i) => savings.t.col("category") + (savings.t.firstRow + i), actualCell: (i) => savings.t.col("actual") + (savings.t.firstRow + i), capacity: cats.savingsCapacity },
    ],
  });

  // A small top-4-plus-Other summary (Lists!P70:Q74) feeding the doughnut
  // chart's legend — reuses the ranking engine's own output, well clear of
  // its own I:N working rows (largest pool combination tops out ~row 57).
  const lists = b.wb.getWorksheet("Lists");
  const donutN = 4;
  const donutFirstRow = 70;
  for (let i = 0; i < donutN; i++) {
    const r = donutFirstRow + i;
    b.write(lists, `P${r}`, `=${ranking.rankedCategoryCell(i)}`, { kind: "calc" });
    b.write(lists, `Q${r}`, `=IFERROR(${ranking.rankedAmountCell(i)},0)`, { kind: "calc", numFmt: money(b) });
  }
  const otherRow = donutFirstRow + donutN;
  b.write(lists, `P${otherRow}`, "Other", { kind: "calc" });
  b.write(lists, `Q${otherRow}`, `=MAX(0,${ranking.totalCell}-SUM(Q${donutFirstRow}:Q${donutFirstRow + donutN - 1}))`, { kind: "calc", numFmt: money(b) });
  const donutSummary = {
    categoriesRef: `${q("Lists")}!$P$${donutFirstRow}:$P$${otherRow}`,
    valuesRef: `${q("Lists")}!$Q$${donutFirstRow}:$Q$${otherRow}`,
    totalCellRef: `${q("Lists")}!${ranking.totalCell}`,
  };

  // Doughnut centre total — merged cells positioned where the injected
  // doughnut's hole will be (see buildBudgetCharts); the doughnut's plot
  // area is unfilled, so this reads straight through the ring once the
  // chart is spliced in over it.
  const donutCenterRow = chartsTop + 8;
  b.merge(ws, `${cell(11, donutCenterRow)}:${cell(16, donutCenterRow)}`);
  b.write(ws, cell(11, donutCenterRow), `=${donutSummary.totalCellRef}`, {
    kind: "calc", numFmt: money(b),
    style: { font: { name: b.theme.font.display, size: 14, bold: true, color: { argb: b.theme.color.ink } }, alignment: { horizontal: "center", vertical: "bottom" } },
  });
  b.merge(ws, `${cell(11, donutCenterRow + 1)}:${cell(16, donutCenterRow + 1)}`);
  b.write(ws, cell(11, donutCenterRow + 1), "TOTAL OUT", {
    kind: "footnote", style: { alignment: { horizontal: "center", vertical: "top" } },
  });

  // left=1 and these widths are Income Summary's exact shape (its old slot,
  // row 1) — see the column-width note above the Savings/Debt block.
  row = cardHeading(b, ws, { row, left: 1, span: 3, text: "WHERE MY MONEY WENT" });
  const wmwColumns = [
    { header: "Category", key: "category", kind: "text", width: 24 },
    { header: "Amount", key: "amount", kind: "currency", width: 13 },
    { header: "%", key: "percent", kind: "text", width: 13 },
  ];
  const topN = cats.whereMoneyWentTopN;
  const wmw = table(b, ws, { top: row, left: 1, rows: topN, columns: wmwColumns, totalRow: false, rowHeight: b.theme.rowHeight.compact });
  for (let i = 0; i < topN; i++) {
    const r = wmw.firstRow + i;
    b.write(ws, `${wmw.col("category")}${r}`, `=IFERROR(${q("Lists")}!${ranking.rankedCategoryCell(i)},"")`, { kind: "calc" });
    b.write(ws, `${wmw.col("amount")}${r}`, `=IFERROR(${q("Lists")}!${ranking.rankedAmountCell(i)},"")`, { kind: "calc", numFmt: money(b) });
    b.write(ws, `${wmw.col("percent")}${r}`, `=IFERROR(${q("Lists")}!${ranking.rankedPercentCell(i)},"")`, { kind: "calc", numFmt: b.theme.numberFormat.percent1 });
  }
  row = Math.max(savings.nextRow, debt.nextRow, wmw.lastRow + 2);
  row = divider(b, ws, { row, span: SPAN });

  // --- Transactions List (full width, below the grid) ---------------------
  row = cardHeading(b, ws, { row, left: 1, span: SPAN, text: "TRANSACTIONS LIST" });
  const txnColumns = [
    { header: "Date", key: "date", kind: "date", width: 12 },
    { header: "Type", key: "type", kind: "text", width: 11 },
    { header: "Category", key: "category", kind: "text", width: 20 },
    { header: "Amount", key: "amount", kind: "currency", total: "sum", width: 13 },
    { header: "Description", key: "description", kind: "text", width: 30 },
  ];
  const txn = table(b, ws, { top: row, left: 1, rows: cats.transactionsCapacity, columns: txnColumns, totalRow: true, totalText: "TOTAL", rowHeight: b.theme.rowHeight.ledger });
  b.dropdown(ws, `${txn.col("type")}${txn.firstRow}:${txn.col("type")}${txn.lastRow}`, "=TransactionTypes", { strict: true });
  b.dropdown(ws, `${txn.col("category")}${txn.firstRow}:${txn.col("category")}${txn.lastRow}`, `=INDIRECT($${txn.col("type")}${txn.firstRow})`, {
    promptTitle: "Category", prompt: "Pick a Type first — the Category list depends on it.",
  });
  // Type column reads as a restrained colour-coded status word (income/
  // savings = sage, expense = terracotta) rather than a full-row tint —
  // visual differentiation without filling the whole list with colour.
  b.conditional(ws, `${txn.col("type")}${txn.firstRow}:${txn.col("type")}${txn.lastRow}`, [
    { type: "cellIs", operator: "equal", formulae: [`"Income"`], style: { font: { color: { argb: b.theme.color.sage }, bold: true } } },
    { type: "cellIs", operator: "equal", formulae: [`"Savings"`], style: { font: { color: { argb: b.theme.color.sage }, bold: true } } },
    { type: "cellIs", operator: "equal", formulae: [`"Expense"`], style: { font: { color: { argb: b.theme.color.accent } } } },
  ]);
  row = txn.totalRow + 2;

  const txnCategoryRange = `${q(sheetName)}!${txn.dataRange("category")}`;
  const txnAmountRange = `${q(sheetName)}!${txn.dataRange("amount")}`;
  for (const t of [income.t, expense.t, bill.t, savings.t, debt.t]) {
    for (let r = t.firstRow; r <= t.lastRow; r++) {
      const cellRef = ws.getCell(`${t.col("actual")}${r}`);
      const raw = cellRef.value?.formula ?? "";
      const fixed = raw.replace(/TXN_CAT_RANGE/g, txnCategoryRange).replace(/TXN_AMT_RANGE/g, txnAmountRange);
      if (fixed !== raw) cellRef.value = { formula: fixed };
    }
  }

  b.freeze(ws, { ySplit: cardTop + 3 });
  b.printArea(ws, `A1:${cell(SPAN, row)}`);

  return {
    ws, sheetName, cards, rolloverCell, chartsTop, donutSummary,
    cashFlow: { ...Object.fromEntries(Object.entries(cfRow).map(([k, r]) => [k, `${cf.col("expected")}${r}`])), leftoverExpected: null, leftoverActual: leftoverActualCell, cfRow, categoryCol: cf.col("category"), expectedCol: cf.col("expected"), actualCol: cf.col("actual") },
    income: tableRef(sheetName, income.t), expense: tableRef(sheetName, expense.t), bill: tableRef(sheetName, bill.t),
    savings: tableRef(sheetName, savings.t), debt: tableRef(sheetName, debt.t), transactions: tableRef(sheetName, txn),
    whereMoneyWent: tableRef(sheetName, wmw),
  };
}

function tableRef(sheetName, t) {
  return {
    t,
    dataRange: (k) => `${q(sheetName)}!${t.dataRange(k)}`,
    totalCell: (k) => (t.totalCell ? t.totalCell(k) : null),
  };
}

/** Realistic example/QA data — Expected amounts + a Transactions List that
 * drives every Actual via the same SUMIF formulas a real customer's own
 * entries would. Written directly to the in-memory ExcelJS model, before
 * native chart injection (see the note on buildProduct006Workbook). */
function seedExampleData(b, budget, goal, seed) {
  b.write(budget.ws, budget.rolloverCell, seed.rollover ?? 0, { kind: "input", numFmt: money(b) });

  const setExpected = (tableRef, rowsFromZero, values) => {
    for (let i = 0; i < values.length; i++) {
      const r = tableRef.t.firstRow + rowsFromZero[i];
      budget.ws.getCell(`${tableRef.t.col("expected")}${r}`).value = values[i];
    }
  };
  setExpected(budget.income, seed.incomeExpectedRows, seed.incomeExpected);
  setExpected(budget.expense, seed.expenseExpectedRows, seed.expenseExpected);
  setExpected(budget.bill, seed.billExpectedRows, seed.billExpected);
  setExpected(budget.debt, seed.debtExpectedRows, seed.debtExpected);
  setExpected(budget.savings, seed.savingsExpectedRows, seed.savingsExpected);

  const txn = budget.transactions.t;
  seed.transactions.forEach((row, i) => {
    const r = txn.firstRow + i;
    budget.ws.getCell(`${txn.col("date")}${r}`).value = row.date;
    budget.ws.getCell(`${txn.col("type")}${r}`).value = row.type;
    budget.ws.getCell(`${txn.col("category")}${r}`).value = row.category;
    budget.ws.getCell(`${txn.col("amount")}${r}`).value = row.amount;
    budget.ws.getCell(`${txn.col("description")}${r}`).value = row.description;
  });

  const goalFirstRow = Number(/(\d+)(?::|$)/.exec(goal.dataRange("lifeArea").split("!")[1])[1]);
  seed.goals.forEach((g, i) => {
    const r = goalFirstRow + i;
    goal.ws.getCell(`A${r}`).value = g.lifeArea;
    goal.ws.getCell(`B${r}`).value = g.goal;
    goal.ws.getCell(`C${r}`).value = g.reward;
    goal.ws.getCell(`E${r}`).value = g.status;
    goal.ws.getCell(`F${r}`).value = g.stepsDone;
    goal.ws.getCell(`G${r}`).value = g.stepsTotal;
  });
}

/** Fill in every zone table's Actual SUMIF formula now that Transactions
 * exists (they were written with placeholder markers since Transactions is
 * built after the zone tables it feeds). */
function wireKpiAndCashFlow(b, budget) {
  if (!budget) return;
  const ws = budget.ws;
  const sheetName = budget.sheetName;

  // Cash Flow Summary Expected/Actual per row.
  const set = (row, expectedFormula, actualFormula) => {
    b.write(ws, `${budget.cashFlow.expectedCol}${row}`, expectedFormula, { kind: "calc", numFmt: money(b) });
    b.write(ws, `${budget.cashFlow.actualCol}${row}`, actualFormula, { kind: "calc", numFmt: money(b) });
  };
  const r = budget.cashFlow.cfRow;
  set(r.rollover, `=${budget.rolloverCell}`, `=${budget.rolloverCell}`);
  set(r.income, `=${budget.income.totalCell("expected") ?? sum(budget.income.dataRange("expected"))}`, `=${budget.income.totalCell("actual") ?? sum(budget.income.dataRange("actual"))}`);
  set(r.expenses, `=${budget.expense.totalCell("expected")}`, `=${budget.expense.totalCell("actual")}`);
  set(r.bills, `=${budget.bill.totalCell("expected")}`, `=${budget.bill.totalCell("actual")}`);
  set(r.debt, `=${budget.debt.totalCell("expected")}`, `=${budget.debt.totalCell("actual")}`);
  set(r.savings, `=${budget.savings.totalCell("expected")}`, `=${budget.savings.totalCell("actual")}`);

  const eCol = budget.cashFlow.expectedCol, aCol = budget.cashFlow.actualCol;
  const sumIncome = (col) => `SUM(${col}${r.rollover}:${col}${r.income})`;
  const sumOutgo = (col) => `SUM(${col}${r.expenses}:${col}${r.savings})`;
  set(r.leftover, `=${sumIncome(eCol)}-${sumOutgo(eCol)}`, `=${sumIncome(aCol)}-${sumOutgo(aCol)}`);
  ws.getCell(`${aCol}${r.leftover}`).value = { formula: `${sumIncome(aCol)}-${sumOutgo(aCol)}` };

  // KPI band pulls straight from Cash Flow Summary Actuals.
  const kpi = (cellRef, formula) => b.write(ws, cellRef, formula, {
    kind: "calc", numFmt: money(b),
    style: { font: { name: b.theme.font.family, bold: true, color: { argb: b.theme.color.ink } }, alignment: { horizontal: "left", vertical: "middle" } },
  });
  kpi(budget.cards.income, `=${aCol}${r.income}`);
  kpi(budget.cards.expensesBills, `=${aCol}${r.expenses}+${aCol}${r.bills}`);
  kpi(budget.cards.debt, `=${aCol}${r.debt}`);
  kpi(budget.cards.savings, `=${aCol}${r.savings}`);

  // "Amount Left to Spend" banner mirrors Total Leftover Actual.
  ws.getCell(budget.cashFlow.leftoverActual).value = { formula: `${aCol}${r.leftover}` };
}

function sum(range) { return `SUM(${range})`; }

/** The 2 native charts on Budget — Cash Flow (bar, primary, wider) and Where
 * My Money Went (doughnut, supporting, narrower with a centre total) — built
 * from OUR OWN cell addresses. v4 also shipped Income Breakdown and Actual
 * Allocation as separate pies; this LumiumX-register pass (ADR-022) drops
 * them as redundant with the Income Summary / KPI band already on the page
 * — no data or functionality is lost, both are still real tables. */
function buildBudgetCharts(budget, chartSpec, theme) {
  const ink = theme.color.ink;
  const sheetName = budget.sheetName;
  const r = budget.cashFlow.cfRow;
  const catCol = budget.cashFlow.categoryCol, eCol = budget.cashFlow.expectedCol, aCol = budget.cashFlow.actualCol;

  const top = budget.chartsTop;
  const cashFlowCats = ["Total Income", "Expenses", "Bills", "Debt", "Savings"];
  const cashFlowFirst = r.income; // Total Income .. Savings (skip Rollover + Total Leftover)

  const barChart = {
    type: "bar",
    title: chartSpec.cashFlowSummary.title,
    ink,
    showValues: true,
    valueNumFmt: theme.numberFormat.currencyGBP,
    anchor: { fromCol: 0, fromRow: top - 1, toCol: 10, toRow: top + 18 },
    categoriesRef: `${q(sheetName)}!$${catCol}$${cashFlowFirst}:$${catCol}$${cashFlowFirst + 4}`,
    categories: cashFlowCats,
    series: [
      { name: "Expected", valuesRef: `${q(sheetName)}!$${eCol}$${cashFlowFirst}:$${eCol}$${cashFlowFirst + 4}`, values: [0, 0, 0, 0, 0], color: chartSpec.cashFlowSummary.expectedColor },
      { name: "Actual", valuesRef: `${q(sheetName)}!$${aCol}$${cashFlowFirst}:$${aCol}$${cashFlowFirst + 4}`, values: [0, 0, 0, 0, 0], color: chartSpec.cashFlowSummary.actualColor },
    ],
  };

  const donutCats = [...Array(5).keys()].map(() => ""); // real labels are formulas — see donutSummary
  const wmwDoughnut = {
    type: "doughnut",
    title: chartSpec.whereMoneyWent.title,
    ink,
    legendPos: "b",
    holeSize: 60,
    anchor: { fromCol: 10, fromRow: top - 1, toCol: 16, toRow: top + 18 },
    categoriesRef: budget.donutSummary.categoriesRef,
    categories: donutCats,
    valuesRef: budget.donutSummary.valuesRef,
    values: donutCats.map(() => 0),
    colors: chartSpec.sliceColors.slice(0, 5),
  };

  return [barChart, wmwDoughnut];
}

function buildGoalChart(goal, chartSpec) {
  return [
    {
      type: "doughnut",
      anchor: { fromCol: goal.ringAnchorCol, fromRow: goal.ringAnchorRow, toCol: goal.ringAnchorCol + 5, toRow: goal.ringAnchorRow + 10 },
      valuesRef: goal.overallProgressRangeRef,
      values: [0.5, 0.5],
      colors: [chartSpec.goalProgressRing.achievedColor, chartSpec.goalProgressRing.remainingColor],
      holeSize: 75,
    },
  ];
}

function buildGoalTracker(b, ws, row, sheet, ctx) {
  const s = sheet.sections;
  const areas = ctx.cats.lifeAreas;

  row = cardHeading(b, ws, { row, span: SPAN, text: "AREAS OF LIFE", cardBand: ctx.cardBand });
  const headers = ["Life Area", "Goals Set", "Achieved", "Avg. Progress"];
  headers.forEach((h, i) => b.write(ws, cell(1 + i, row), h, { kind: "tableHeading" }));
  ws.getRow(row).height = b.theme.rowHeight.tableHeading;
  row += 1;
  const rollupFirst = row;
  areas.forEach((area, i) => b.write(ws, cell(1, rollupFirst + i), area, { kind: "label" }));
  row = rollupFirst + areas.length;
  const ringAnchorRow = row + 1;
  row = divider(b, ws, { row: row + 1, span: SPAN });

  row = cardHeading(b, ws, { row, span: SPAN, text: "YOUR GOALS", cardBand: ctx.cardBand });
  const columns = s.columns.map((c) => ({
    header: c.header, key: c.key, kind: c.kind === "progress" ? "text" : c.kind, width: c.width,
    total: "none", totalLabel: false,
    ...(c.rowFormula ? { formula: (r) => c.rowFormula.replace(/\{(\w+)\}/g, (_, k) => `${colLetterOfKey(s.columns, k)}${r}`) } : {}),
  }));
  const t = table(b, ws, { top: row, left: 1, rows: s.goalCapacity, columns, totalRow: false, rowHeight: b.theme.rowHeight.ledger });

  b.dropdown(ws, `${t.col("lifeArea")}${t.firstRow}:${t.col("lifeArea")}${t.lastRow}`, "=LifeAreas");
  const statusRng = `${t.col("status")}${t.firstRow}:${t.col("status")}${t.lastRow}`;
  b.dropdown(ws, statusRng, s.statusOptions, { allowBlank: true, strict: true });
  for (const [value, colours] of Object.entries(ctx.goalStatusPalette ?? {})) {
    b.conditional(ws, statusRng, {
      type: "containsText", operator: "containsText", text: value,
      style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: colours.fill } }, font: { color: { argb: colours.font }, bold: value === "Achieved" } },
    });
  }

  for (let r = t.firstRow; r <= t.lastRow; r++) {
    const frac = `IFERROR(${t.col("stepsDone")}${r}/${t.col("stepsTotal")}${r},0)`;
    progressBar(b, ws, { ref: `${t.col("progress")}${r}`, fractionFormula: frac });
  }

  const lifeAreaRange = `${t.col("lifeArea")}${t.firstRow}:${t.col("lifeArea")}${t.lastRow}`;
  const progressRange = `${t.col("progress")}${t.firstRow}:${t.col("progress")}${t.lastRow}`;
  areas.forEach((area, i) => {
    const r2 = rollupFirst + i;
    b.write(ws, cell(2, r2), `=COUNTIF(${lifeAreaRange},$A${r2})`, { kind: "calc", style: { alignment: { horizontal: "center", vertical: "middle" } } });
    b.write(ws, cell(3, r2), `=COUNTIFS(${lifeAreaRange},$A${r2},${statusRng},"Achieved")`, { kind: "calc", style: { alignment: { horizontal: "center", vertical: "middle" } } });
    b.write(ws, cell(4, r2), `=IFERROR(AVERAGEIF(${lifeAreaRange},$A${r2},${progressRange}),0)`, {
      kind: "calc", numFmt: b.theme.numberFormat.percent0, style: { alignment: { horizontal: "center", vertical: "middle" } },
    });
  });

  // Overall progress ring (doughnut): [progress, 1-progress] fed by SUM(stepsDone)/SUM(stepsTotal).
  const stepsDoneRange = `${t.col("stepsDone")}${t.firstRow}:${t.col("stepsDone")}${t.lastRow}`;
  const stepsTotalRange = `${t.col("stepsTotal")}${t.firstRow}:${t.col("stepsTotal")}${t.lastRow}`;
  const ringRow = ringAnchorRow;
  const ringCol = colLetter(SPAN - 1);
  const overallProgressCell = `${ringCol}${ringRow}`;
  b.write(ws, overallProgressCell, `=IFERROR(SUM(${stepsDoneRange})/SUM(${stepsTotalRange}),0)`, { kind: "calc", numFmt: b.theme.numberFormat.percent0 });
  const remainderCell = `${colLetter(SPAN)}${ringRow}`;
  b.write(ws, remainderCell, `=1-${overallProgressCell}`, { kind: "calc", numFmt: b.theme.numberFormat.percent0 });
  ws.getRow(ringRow).outlineLevel = 0;
  ws.getColumn(SPAN - 1).hidden = false;

  const after = t.lastRow + 2;
  b.freeze(ws, { ySplit: rollupFirst - 1 });
  b.printArea(ws, `A1:${cell(columns.length, after)}`);

  return {
    ws, sheetName: ws.name,
    dataRange: (k) => `${q(ws.name)}!${t.dataRange(k)}`,
    overallProgressCell,
    overallProgressRangeRef: `${q(ws.name)}!${overallProgressCell}:${remainderCell}`,
    ringAnchorCol: SPAN - 3, ringAnchorRow: rollupFirst - 2,
  };
}

function colLetterOfKey(cols, key) {
  const idx = cols.findIndex((c) => c.key === key);
  return colLetter(1 + idx);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  buildProduct006Workbook()
    .then(({ xlsxPath }) => console.log(`workbook -> ${xlsxPath}`))
    .catch((e) => { console.error(e); process.exit(1); });
}
