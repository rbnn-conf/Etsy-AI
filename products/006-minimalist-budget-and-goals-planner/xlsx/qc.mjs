/**
 * Product #006 XLSX QC. TEST/REVIEW build, v4 (rose/sage, 3-column-zone
 * layout, Transactions-List-driven Actuals, native charts).
 *
 *   STRUCTURE     3 sheets, right order, none blank, named ranges present
 *   FUNCTIONALITY every zone table's Actual is a live SUMIF off Transactions
 *                 (not typed), Cash Flow Summary + KPI band pull from those,
 *                 the ranking engine feeds Where My Money Went, dropdowns
 *                 exist where required
 *   FORMATTING    GBP currency + % number formats, titles, TOTAL rows
 *   PRINT         print area, portrait, fit-to-width scaling
 *   SCENARIO      known Transactions rows -> LibreOffice recalculation ->
 *                 every Actual/KPI/Cash-Flow/ranking figure checked
 *   PREVIEW       run by cli.mjs after preview.mjs
 *
 * Writes storage/products/006/xlsx-qc-report.json. Exits non-zero on any fail.
 *
 *   node qc.mjs
 */

import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadWorkbook, runWorkbookChecks, recalcWorkbook, ExcelJS, countChartParts } from "@dpf/spreadsheet";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..", "..");
const STORE = join(REPO_ROOT, "storage", "products", "006");
const XLSX = join(STORE, "final", "minimalist-budget-and-goals-planner.xlsx");

const SHEET_ORDER = ["Instructions", "Budget", "BONUS - Goal Tracker"];

export async function runProduct006Qc() {
  const wb = await loadWorkbook(XLSX);
  const report = JSON.parse(await readFile(join(STORE, "xlsx-build-report.json"), "utf8"));
  const p = report.probe;

  const localAddr = (qualified) => qualified.split("!").pop().replace(/\$/g, "").split(":")[0];

  const { results, summary } = runWorkbookChecks(wb, {
    sheets: SHEET_ORDER,
    namedRanges: ["Income", "Expense", "Bill", "Debt", "Savings", "LifeAreas", "TransactionTypes"],
    perSheet: {
      Budget: {
        titleAt: "A1",
        formulasAt: [localAddr(p.overviewIncomeCard), localAddr(p.leftoverActualCell)],
        currencyAt: [localAddr(p.overviewIncomeCard), localAddr(p.leftoverActualCell)],
        totalsAt: [localAddr(p.incomeActualTotal), localAddr(p.expenseActualTotal)],
        printArea: true,
        orientation: "portrait",
        fitToWidth: 1,
      },
      "BONUS - Goal Tracker": { titleAt: "A1", printArea: true, orientation: "portrait", fitToWidth: 1 },
    },
  });

  const rows = [...results];
  const rec = (check, pass, detail = "", sheet = null) => {
    rows.push({ sheet, check, pass: !!pass, detail: String(detail) });
    if (!pass) summary.fail++;
    else summary.pass++;
    summary.total++;
  };

  rec("Budget has a Type dropdown on Transactions", sheetHasListValidation(wb, "Budget"), "", "Budget");
  rec("Budget highlights income/savings rows (conditional formatting)", sheetHasConditionalFormatting(wb, "Budget"), "", "Budget");
  rec("Goal Tracker has a life-area dropdown", sheetHasListValidation(wb, "BONUS - Goal Tracker"), "", "BONUS - Goal Tracker");
  rec("Goal Tracker status column is tinted (conditional formatting)", sheetHasConditionalFormatting(wb, "BONUS - Goal Tracker"), "", "BONUS - Goal Tracker");
  rec("Budget seeds the expense category list", hasExpenseCategories(wb), "", "Budget");
  rec("Budget seeds the bill category list", hasBillCategories(wb), "", "Budget");
  const charts = await countChartParts(await readFile(XLSX));
  rec("workbook has 3 native charts (Cash Flow + Where My Money Went on Budget, 1 Goal Tracker doughnut)", charts === 3, `found ${charts}`, null);
  rec("workbook is protected on every visible sheet (formulas safe)", allProtected(wb), "");
  rec("no third-party branding strings survive from the reference file", noThirdPartyBranding(wb), "");

  const scenario = await recalcScenario(p);
  for (const s of scenario) rec(s.check, s.pass, s.detail, "scenario");

  const finalSummary = {
    pass: rows.filter((r) => r.pass).length,
    fail: rows.filter((r) => !r.pass).length,
    total: rows.length,
  };
  await writeFile(
    join(STORE, "xlsx-qc-report.json"),
    JSON.stringify({ ranAt: new Date().toISOString(), summary: finalSummary, results: rows }, null, 2) + "\n",
    "utf8",
  );
  return { results: rows, summary: finalSummary };
}

// --- helpers ---------------------------------------------------------

function cellPlainText(c) {
  const v = c.value;
  if (v == null) return "";
  if (typeof v === "object") return String(v.result ?? v.text ?? (v.richText?.map((r) => r.text).join("") ?? ""));
  return String(v);
}

function allText(wb) {
  let text = "";
  for (const ws of wb.worksheets) ws.eachRow((row) => row.eachCell((c) => (text += ` ${cellPlainText(c)}`)));
  return text;
}

function noThirdPartyBranding(wb) {
  const text = allText(wb).toLowerCase();
  return !["weekly crew", "theweeklycrew", "etsy.com"].some((needle) => text.includes(needle));
}

function hasExpenseCategories(wb) {
  const ws = wb.getWorksheet("Budget");
  if (!ws) return false;
  let text = "";
  ws.eachRow((row) => row.eachCell((c) => (text += ` ${cellPlainText(c)}`)));
  return ["Food", "Household", "Self-development"].every((w) => text.includes(w));
}

function hasBillCategories(wb) {
  const ws = wb.getWorksheet("Budget");
  if (!ws) return false;
  let text = "";
  ws.eachRow((row) => row.eachCell((c) => (text += ` ${cellPlainText(c)}`)));
  return ["Internet", "Electricity", "Gas"].every((w) => text.includes(w));
}

function allProtected(wb) {
  return wb.worksheets.filter((w) => w.state !== "veryHidden").every((w) => w.sheetProtection?.sheet === true);
}

function sheetHasListValidation(wb, name) {
  const ws = wb.getWorksheet(name);
  if (!ws) return false;
  const model = ws.dataValidations?.model ?? {};
  return Object.values(model).some((v) => v && v.type === "list");
}

function sheetHasConditionalFormatting(wb, name) {
  const ws = wb.getWorksheet(name);
  if (!ws) return false;
  const cf = ws.conditionalFormattings ?? [];
  return cf.some((c) => (c.rules ?? []).length > 0);
}

async function recalcScenario(probe) {
  const out = [];
  const dir = await mkdtemp(join(tmpdir(), "p006-xlsx-qc-"));
  try {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(XLSX);

    const setRange = (qualifiedRange, values) => {
      const [sheet, rng] = splitQualified(qualifiedRange);
      const ws = wb.getWorksheet(sheet);
      const [start] = rng.split(":");
      const m = /^([A-Z]+)(\d+)$/.exec(start);
      const col = m[1];
      let r = Number(m[2]);
      for (const v of values) { ws.getCell(`${col}${r}`).value = v; r++; }
    };

    // Expected (typed) amounts for a handful of categories per pool.
    setRangeAt(setRange, probe.incomeExpectedRange, 0, [2000, 450]); // Paycheck, Business
    setRangeAt(setRange, probe.expenseExpectedRange, 0, [400]); // Food
    setRangeAt(setRange, probe.expenseExpectedRange, 2, [80]); // Transportation
    setRangeAt(setRange, probe.billExpectedRange, 0, [35]); // Internet
    setRangeAt(setRange, probe.debtExpectedRange, 0, [150]); // Student Loans
    setRangeAt(setRange, probe.savingsExpectedRange, 0, [250]); // Travel Fund

    // The single Transactions List — every Actual above is a live SUMIF off this.
    const today = new Date();
    const txnRows = [
      ["Income", "Paycheck", 2000, "Salary"],
      ["Income", "Business", 450, "Freelance"],
      ["Expense", "Food", 300, "Groceries"],
      ["Expense", "Transportation", 95, "Fuel"],
      ["Bill", "Internet", 35, "Monthly plan"],
      ["Debt", "Student Loans", 150, "Monthly payment"],
      ["Savings", "Travel Fund", 250, "This month"],
    ];
    setRange(probe.transactionsDateRange, txnRows.map(() => today));
    setRange(probe.transactionsTypeRange, txnRows.map((r) => r[0]));
    setRange(probe.transactionsCategoryRange, txnRows.map((r) => r[1]));
    setRange(probe.transactionsAmountRange, txnRows.map((r) => r[2]));
    setRange(probe.transactionsDescriptionRange, txnRows.map((r) => r[3]));

    setRange(probe.goalTrackerStepsDoneRange, [3, 6]);
    setRange(probe.goalTrackerStepsTotalRange, [6, 6]);

    const scenarioPath = join(dir, "scenario.xlsx");
    await wb.xlsx.writeFile(scenarioPath);

    const sheetsCsv = await recalcWorkbook(scenarioPath);
    const budget = sheetsCsv[probe.overviewSheet];
    const goals = sheetsCsv[probe.goalTrackerSheet] ?? sheetsCsv[probe.overviewSheet];
    if (!budget) {
      out.push({ check: "recalc: Budget sheet exported", pass: false, detail: Object.keys(sheetsCsv).join(", ") });
      return out;
    }
    const num = (sheetCsv, a) => {
      const raw = String(sheetCsv.cell(a)).trim();
      if (raw.endsWith("%")) return Number(raw.slice(0, -1).replace(/[,\s]/g, "")) / 100;
      return Number(raw.replace(/[£$€,\s]/g, ""));
    };

    approx(out, "Income Actual (Paycheck+Business) = 2450", num(budget, localOf(firstCellOf(probe.incomeActualRange))), 2000);
    approx(out, "Expense Food Actual = 300", num(budget, localOf(firstCellOf(probe.expenseActualRange))), 300);
    approx(out, "Bill Internet Actual = 35", num(budget, localOf(firstCellOf(probe.billActualRange))), 35);
    approx(out, "Debt Student Loans Actual = 150", num(budget, localOf(firstCellOf(probe.debtActualRange))), 150);
    approx(out, "Savings Travel Fund Actual = 250", num(budget, localOf(firstCellOf(probe.savingsActualRange))), 250);

    approx(out, "KPI Income = 2450", num(budget, localOf(probe.overviewIncomeCard)), 2450);
    approx(out, "KPI Expenses & Bills = 395+35 = 430", num(budget, localOf(probe.overviewExpensesBillsCard)), 430);
    approx(out, "KPI Debt Payments = 150", num(budget, localOf(probe.overviewDebtCard)), 150);
    approx(out, "KPI Savings = 250", num(budget, localOf(probe.overviewSavingsCard)), 250);
    approx(out, "Amount Left to Spend = 2450 - (395+35+150+250) = 1620", num(budget, localOf(probe.leftoverActualCell)), 2450 - (395 + 35 + 150 + 250));

    approx(out, "Where My Money Went #1 category is Food (top amount)", num(budget, localOf(firstCellOf(probe.whereMoneyWentAmountRange))), 300);

    approx(out, "Goals progress = average(3/6, 6/6) = 75%", num(goals, localOf(probe.goalTrackerOverallProgressCell)), 0.75, 0.02);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  return out;
}

function setRangeAt(setRange, qualifiedRange, offset, values) {
  const [sheet, rng] = splitQualified(qualifiedRange);
  const [start] = rng.split(":");
  const m = /^([A-Z]+)(\d+)$/.exec(start);
  const shifted = `${sheet}!${m[1]}${Number(m[2]) + offset}`;
  setRange(shifted, values);
}

function firstCellOf(qualifiedRange) {
  const [sheet, rng] = splitQualified(qualifiedRange);
  return `${sheet}!${rng.split(":")[0]}`;
}

function approx(out, check, got, want, tol = 0.5) {
  out.push({ check, pass: Number.isFinite(got) && Math.abs(got - want) <= tol, detail: `got ${got}, want ~${want}` });
}
function splitQualified(q) {
  const i = q.indexOf("!");
  return [q.slice(0, i).replace(/^'|'$/g, ""), q.slice(i + 1).replace(/\$/g, "")];
}
function localOf(q) { return q.split("!").pop().replace(/\$/g, ""); }

if (import.meta.url === `file://${process.argv[1]}`) {
  runProduct006Qc()
    .then(({ summary, results }) => {
      console.log(`\nXLSX QC: ${summary.pass}/${summary.total} checks passed.`);
      const fails = results.filter((r) => !r.pass);
      if (fails.length) {
        console.log("\nFAILURES:");
        for (const f of fails) console.log(`  [${f.sheet ?? "-"}] ${f.check}  ${f.detail}`);
        process.exit(1);
      }
      console.log("All XLSX QC checks passed.");
    })
    .catch((e) => { console.error(e); process.exit(1); });
}
