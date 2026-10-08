import { test } from "node:test";
import assert from "node:assert/strict";

import { deriveMarketingData, MarketingMetadataError } from "../src/product-metadata.mjs";
import { verifyClaims } from "../src/claims.mjs";

const productSpec = {
  productId: "001",
  name: "Minimalist Monthly Budget Planner",
  primaryExport: { type: "hybrid" },
  exportFormats: ["pdf", "zip", "xlsx"],
  niche: "personal finance / budgeting",
  description: "A reusable, undated, print-at-home monthly budget system. It closes the loop: plan -> track -> review.",
  targetCustomer: "Budget-conscious individuals.",
};

const xlsxDesignSpec = {
  sheets: [
    { name: "Quick Start", slug: "quick-start-key", title: "Quick Start & Key" },
    { name: "Monthly Overview", slug: "monthly-overview", title: "Monthly Overview" },
    { name: "Income Tracker", slug: "income-tracker", title: "Income Tracker" },
    { name: "Fixed Expenses", slug: "fixed-expenses", title: "Fixed Expenses / Bills" },
    { name: "Variable Spending", slug: "variable-spending", title: "Variable Spending" },
    { name: "Daily Expense Log", slug: "daily-expense-log", title: "Daily Expense Log" },
    { name: "Savings & Debt", slug: "savings-debt", title: "Savings & Debt" },
    { name: "Month-End Review", slug: "month-end-review", title: "Month-End Review" },
  ],
};

const buildReport = { currency: "GBP", sheets: xlsxDesignSpec.sheets.map((s) => s.name) };

function qc(results) {
  return { summary: { pass: results.filter((r) => r.pass).length, fail: 0, total: results.length }, results };
}

const fullPassQc = qc([
  { check: "workbook contains formulas", pass: true, detail: "120 formula cells" },
  { check: "Overview Leftover = Income - Expenses - Savings (890)", pass: true },
  { check: "Fixed Expenses has a category dropdown", pass: true },
  { check: "Variable Spending highlights over/under budget (conditional formatting)", pass: true },
  { check: "currency format at C16", pass: true },
  { check: "percent format at E10", pass: true },
  { check: "workbook is protected on every visible sheet (formulas safe)", pass: true },
  { check: "print area set", pass: true },
  { check: "orientation portrait", pass: true },
]);

test("deriveMarketingData: worksheet count is taken from the build report", () => {
  const md = deriveMarketingData({ productSpec, xlsxDesignSpec, buildReport, qcReport: fullPassQc });
  assert.equal(md.worksheets.count, 8);
  assert.equal(md.currency, "GBP");
  assert.equal(md.format.primary, "xlsx");
});

test("deriveMarketingData: capabilities are gated on passing workbook-QC checks", () => {
  const md = deriveMarketingData({ productSpec, xlsxDesignSpec, buildReport, qcReport: fullPassQc });
  const ids = md.capabilities.map((c) => c.id).sort();
  assert.deepEqual(ids, ["conditional-formatting", "currency", "dropdowns", "formulas", "percent", "print", "protection"]);
  for (const c of md.capabilities) assert.ok(c.evidence, `capability ${c.id} carries evidence`);
});

test("deriveMarketingData: a capability NOT in the QC report is NOT claimed", () => {
  const partial = qc([
    { check: "workbook contains formulas", pass: true },
    { check: "Overview Leftover = Income - Expenses - Savings", pass: true },
    { check: "currency format at C16", pass: true },
  ]);
  const md = deriveMarketingData({ productSpec, xlsxDesignSpec, buildReport, qcReport: partial });
  const ids = md.capabilities.map((c) => c.id);
  assert.ok(ids.includes("formulas"));
  assert.ok(ids.includes("currency"));
  assert.ok(!ids.includes("dropdowns"), "no dropdown check => no dropdown claim");
  assert.ok(!ids.includes("protection"));
});

test("deriveMarketingData: throws if the build produced a different sheet count", () => {
  assert.throws(
    () => deriveMarketingData({ productSpec, xlsxDesignSpec, buildReport: { ...buildReport, sheets: ["Only", "Three", "Sheets"] }, qcReport: fullPassQc }),
    MarketingMetadataError,
  );
});

test("deriveMarketingData: refuses to build on a FAILING workbook QC", () => {
  const failing = { summary: { pass: 5, fail: 2, total: 7 }, results: [{ check: "x", pass: false }] };
  assert.throws(
    () => deriveMarketingData({ productSpec, xlsxDesignSpec, buildReport, qcReport: failing }),
    MarketingMetadataError,
  );
});

test("verifyClaims: passes when every stamped claim matches the metadata", () => {
  const md = deriveMarketingData({ productSpec, xlsxDesignSpec, buildReport, qcReport: fullPassQc });
  const tokens = [
    { claim: "product-title", value: md.title, text: md.title },
    { claim: "worksheet-count", value: "8", text: "8 worksheets" },
    { claim: "format", value: "xlsx", text: "Excel · XLSX" },
    { claim: "currency", value: "GBP", text: "£ GBP" },
    { claim: "cap-formulas", value: "Automatic calculations", text: "Automatic calculations" },
    { claim: "feature-income-tracker", value: "Income tracking", text: "Income tracking" },
  ];
  const r = verifyClaims(tokens, md);
  assert.equal(r.pass, true, JSON.stringify(r.failures));
  assert.equal(r.verified, tokens.length);
});

test("verifyClaims: fails on an unrecognised claim key", () => {
  const md = deriveMarketingData({ productSpec, xlsxDesignSpec, buildReport, qcReport: fullPassQc });
  const r = verifyClaims([{ claim: "cap-time-travel", value: "Time travel", text: "Time travel" }], md);
  assert.equal(r.pass, false);
  assert.match(r.failures[0].reason, /unrecognised claim key/);
});

test("verifyClaims: fails on a wrong worksheet number", () => {
  const md = deriveMarketingData({ productSpec, xlsxDesignSpec, buildReport, qcReport: fullPassQc });
  const r = verifyClaims([{ claim: "worksheet-count", value: "12", text: "12 worksheets" }], md);
  assert.equal(r.pass, false);
});
