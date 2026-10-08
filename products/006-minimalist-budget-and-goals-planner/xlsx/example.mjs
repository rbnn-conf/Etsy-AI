/**
 * Product #006 — EXAMPLE workbook: realistic test data, for visual QA and
 * human review only. Not part of the customer deliverable — the example
 * file lives in storage/products/006/example/, QA scratch.
 *
 * Seeds through buildProduct006Workbook({ seed, outPath }) — NOT by loading
 * the already-built blank .xlsx and writing values on top via a plain
 * ExcelJS read/modify/write. That round-trip would silently drop this
 * product's native charts, since ExcelJS has no model for the raw OOXML
 * chart/drawing parts injectNativeCharts splices in after ExcelJS's own
 * write. Seeding inside the same build pass, before that one-way write, is
 * the only safe order (see build.mjs's buildProduct006Workbook doc-comment).
 *
 *   node example.mjs
 */

import { join } from "node:path";
import { buildProduct006Workbook } from "./build.mjs";
import { renderProduct006Preview } from "./preview.mjs";

const STORE = join(import.meta.dirname, "..", "..", "..", "storage", "products", "006");
const EXAMPLE = join(STORE, "example", "minimalist-budget-and-goals-planner-example.xlsx");

const SEED = {
  rollover: 0,

  // Row offsets are 0-based into each table's fixed-category rows (see
  // xlsx-design-spec.json's categories block for the full ordered lists).
  incomeExpectedRows: [0, 1], // Paycheck, Business
  incomeExpected: [2000, 450],
  expenseExpectedRows: [0, 1, 2, 3], // Food, Social Life, Transportation, Household
  expenseExpected: [400, 100, 80, 120],
  billExpectedRows: [0, 1, 2], // Internet, Electricity, Water
  billExpected: [35, 60, 25],
  debtExpectedRows: [0], // Student Loans
  debtExpected: [150],
  savingsExpectedRows: [0, 1], // Travel Fund, Wedding Fund
  savingsExpected: [250, 100],

  transactions: (() => {
    const today = new Date();
    return [
      { date: today, type: "Income", category: "Paycheck", amount: 2000, description: "Monthly salary" },
      { date: today, type: "Income", category: "Business", amount: 450, description: "Freelance design" },
      { date: today, type: "Expense", category: "Food", amount: 300, description: "Groceries" },
      { date: today, type: "Expense", category: "Social Life", amount: 90, description: "Dinner out" },
      { date: today, type: "Expense", category: "Transportation", amount: 95, description: "Fuel + bus fares" },
      { date: today, type: "Expense", category: "Household", amount: 110, description: "Cleaning supplies" },
      { date: today, type: "Bill", category: "Internet", amount: 35, description: "Monthly plan" },
      { date: today, type: "Bill", category: "Electricity", amount: 58, description: "Monthly bill" },
      { date: today, type: "Debt", category: "Student Loans", amount: 150, description: "Monthly payment" },
      { date: today, type: "Savings", category: "Travel Fund", amount: 250, description: "This month" },
      { date: today, type: "Savings", category: "Wedding Fund", amount: 40, description: "This month" },
    ];
  })(),

  goals: [
    { lifeArea: "Finances", goal: "Build emergency fund", reward: "A weekend away", status: "In Progress", stepsDone: 3, stepsTotal: 6 },
    { lifeArea: "Career", goal: "Finish certification", reward: "New desk setup", status: "In Progress", stepsDone: 2, stepsTotal: 5 },
    { lifeArea: "Health & Wellness", goal: "Run a 10k", reward: "New running shoes", status: "Achieved", stepsDone: 6, stepsTotal: 6 },
  ],
};

async function main() {
  const { xlsxPath } = await buildProduct006Workbook({ seed: SEED, outPath: EXAMPLE });
  console.log(`example workbook -> ${xlsxPath}`);

  const outDir = join(STORE, "workbook-preview", "example");
  const res = await renderProduct006Preview({ xlsxPath, outDir });
  console.log(`example previews -> ${outDir}`);
  for (const pg of res.pages) {
    const suffix = pg.pagesInSheet > 1 ? `-${pg.page}` : "";
    console.log(`  sheet-${String(pg.index).padStart(2, "0")}${suffix}.png  ${pg.title}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
