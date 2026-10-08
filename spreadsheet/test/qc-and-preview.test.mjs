import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { buildDemoWorkbook } from "../examples/demo.mjs";
import { loadWorkbook, runWorkbookChecks, runPreviewChecks, formulaLooksValid } from "../src/qc/index.mjs";
import { renderXlsxPreview, recalcToCsv, previewToolsAvailable } from "../src/preview/render-preview.mjs";

let dir;
let xlsxPath;

test("build the demo workbook to a temp file", async () => {
  dir = await mkdtemp(join(tmpdir(), "xlsx-qc-"));
  xlsxPath = join(dir, "demo.xlsx");
  const { builder } = await buildDemoWorkbook();
  await builder.writeFile(xlsxPath);
});

test("formulaLooksValid catches unbalanced parens and error literals", () => {
  assert.equal(formulaLooksValid("SUM(A1:A2)"), true);
  assert.equal(formulaLooksValid('IF(A1>0,"ok","no")'), true);
  assert.equal(formulaLooksValid("SUM(A1:A2"), false);
  assert.equal(formulaLooksValid("A1+#REF!"), false);
  assert.equal(formulaLooksValid(""), false);
});

test("runWorkbookChecks: structure / formulas / formats / print all pass for the demo", async () => {
  const wb = await loadWorkbook(xlsxPath);
  const { summary, results } = runWorkbookChecks(wb, {
    sheets: ["Budget"],
    namedRanges: ["Categories"],
    perSheet: {
      Budget: {
        titleAt: "A1",
        formulasAt: ["E8", "E9"],
        totalsAt: ["C14", "D14"],
        formulaRefs: [{ at: "E8", includes: ["C8", "D8"] }],
        currencyAt: ["C8", "D8", "C14"],
        dropdownsAt: ["B8:B13"],
        printArea: true,
        orientation: "portrait",
        fitToWidth: 1,
        columnWidths: { min: 4, max: 120 },
      },
    },
  });
  const failed = results.filter((r) => !r.pass);
  assert.equal(summary.fail, 0, JSON.stringify(failed, null, 2));
  assert.ok(summary.pass > 10);
});

test("runWorkbookChecks flags a genuinely missing expectation", async () => {
  const wb = await loadWorkbook(xlsxPath);
  const { summary } = runWorkbookChecks(wb, { sheets: ["NoSuchSheet"] });
  assert.ok(summary.fail >= 1);
});

test("preview: real PNG from the actual workbook (needs soffice + pdftoppm)", async (t) => {
  if (!(await previewToolsAvailable())) {
    t.skip("LibreOffice / pdftoppm not available");
    return;
  }
  const res = await renderXlsxPreview(xlsxPath, { outDir: join(dir, "preview"), variant: "xlsx" });
  assert.ok(res.pages.length >= 1);
  const pc = await runPreviewChecks(res.pages);
  assert.equal(pc.summary.fail, 0, JSON.stringify(pc.results, null, 2));
  // helper sheet must NOT appear in the preview
  assert.equal(res.pages.length, 1);
});

test("recalculation scenario: LibreOffice computes the totals we expect", async (t) => {
  if (!(await previewToolsAvailable())) {
    t.skip("LibreOffice not available");
    return;
  }
  const { cell } = await recalcToCsv(xlsxPath);
  // demo seeds: budgets 320/90/75/40 -> 525 ; actuals 305.4/112.2/75/22 -> 514.6
  assert.equal(cleanMoney(cell("C14")), "525");
  assert.equal(cleanMoney(cell("D14")), "514.6");
  assert.equal(cleanMoney(cell("E14")), "10.4"); // difference total = 525 - 514.6
});

test("cleanup", async () => {
  await rm(dir, { recursive: true, force: true });
});

function cleanMoney(s) {
  return String(s).replace(/[£$€,\s]/g, "").replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}
