import { test } from "node:test";
import assert from "node:assert/strict";
import JSZip from "jszip";

import { WorkbookBuilder } from "../src/engine/index.mjs";
import { injectNativeCharts } from "../src/engine/native-charts.mjs";

async function buildBaseWorkbook() {
  const b = new WorkbookBuilder({ theme: { currency: "GBP" } });
  const ws = b.addSheet("Budget");
  ws.getCell("A1").value = "Income";
  ws.getCell("B1").value = 100;
  ws.getCell("A2").value = "Bills";
  ws.getCell("B2").value = 50;
  // a data-bar conditional-format rule so the fixture matches the real
  // build's shape: ExcelJS emits a per-rule <extLst> for these (nested
  // inside <cfRule>), plus one worksheet-level <extLst> aggregating them —
  // the exact structure that broke a naive first-<extLst> splice.
  b.dataBar(ws, "B1:B2", { min: 0, max: 200 });
  return b.toBuffer();
}

test("injectNativeCharts adds a bar chart the zip resolves correctly", async () => {
  const buf = await buildBaseWorkbook();
  const out = await injectNativeCharts(buf, {
    Budget: [
      {
        type: "bar",
        title: "T E S T",
        ink: "1F1F1F",
        anchor: { fromCol: 3, fromRow: 0, toCol: 8, toRow: 10 },
        categoriesRef: "Budget!$A$1:$A$2",
        categories: ["Income", "Bills"],
        series: [
          { name: "Expected", valuesRef: "Budget!$B$1:$B$2", values: [100, 50], color: "4F7A52" },
          { name: "Actual", valuesRef: "Budget!$C$1:$C$2", values: [90, 45], color: "EBC2B9" },
        ],
      },
    ],
  });

  const zip = await JSZip.loadAsync(out);
  assert.ok(zip.file("xl/charts/chart1.xml"), "chart part written");
  assert.ok(zip.file("xl/drawings/drawing1.xml"), "drawing part written");
  assert.ok(zip.file("xl/drawings/_rels/drawing1.xml.rels"), "drawing rels written");

  const contentTypes = await zip.file("[Content_Types].xml").async("string");
  assert.match(contentTypes, /PartName="\/xl\/charts\/chart1\.xml"/);
  assert.match(contentTypes, /PartName="\/xl\/drawings\/drawing1\.xml"/);

  // resolve Budget -> sheet file the same way Excel does, not by assumed numbering
  const workbookXml = await zip.file("xl/workbook.xml").async("string");
  const rid = /<sheet[^>]*name="Budget"[^>]*r:id="([^"]*)"/.exec(workbookXml)[1];
  const wbRels = await zip.file("xl/_rels/workbook.xml.rels").async("string");
  const target = new RegExp(`Id="${rid}"[^>]*Target="([^"]*)"`).exec(wbRels)[1];
  const sheetPath = `xl/${target}`;
  const sheetFile = sheetPath.split("/").pop();

  const sheetXml = await zip.file(sheetPath).async("string");
  const drawingRelId = /<drawing r:id="([^"]*)"\/>/.exec(sheetXml)?.[1];
  assert.ok(drawingRelId, "<drawing> element present in worksheet XML");

  // the critical regression check: <drawing> must be a direct child of
  // <worksheet>, not spliced inside a <cfRule>'s own per-rule <extLst>
  const cfRuleWithDrawing = /<cfRule[^]*?<drawing[^]*?<\/cfRule>/.test(sheetXml);
  assert.equal(cfRuleWithDrawing, false, "<drawing> must not land inside a conditional-format <cfRule>");

  const sheetRels = await zip.file(`xl/worksheets/_rels/${sheetFile}.rels`).async("string");
  assert.match(sheetRels, new RegExp(`Id="${drawingRelId}"[^>]*Target="\\.\\./drawings/drawing1\\.xml"`));
});

test("injectNativeCharts adds a doughnut chart with no title", async () => {
  const buf = await buildBaseWorkbook();
  const out = await injectNativeCharts(buf, {
    Budget: [
      {
        type: "doughnut",
        anchor: { fromCol: 3, fromRow: 0, toCol: 8, toRow: 10 },
        valuesRef: "Budget!$B$1:$B$2",
        values: [0.5, 0.5],
        colors: ["EBC2B9", "F3F3F3"],
      },
    ],
  });
  const zip = await JSZip.loadAsync(out);
  const chartXml = await zip.file("xl/charts/chart1.xml").async("string");
  assert.match(chartXml, /<c:doughnutChart>/);
  assert.match(chartXml, /<c:autoTitleDeleted val="1"\/>/);
  assert.doesNotMatch(chartXml, /<c:title>/);
  assert.match(chartXml, /<c:holeSize val="75"\/>/);
});

test("injectNativeCharts adds a pie chart with per-slice colours", async () => {
  const buf = await buildBaseWorkbook();
  const out = await injectNativeCharts(buf, {
    Budget: [
      {
        type: "pie",
        title: "P I E",
        ink: "1F1F1F",
        anchor: { fromCol: 3, fromRow: 0, toCol: 8, toRow: 10 },
        categoriesRef: "Budget!$A$1:$A$2",
        categories: ["Income", "Bills"],
        valuesRef: "Budget!$B$1:$B$2",
        values: [100, 50],
        colors: ["4F7A52", "EBC2B9"],
      },
    ],
  });

  const zip = await JSZip.loadAsync(out);
  const chartXml = await zip.file("xl/charts/chart1.xml").async("string");
  assert.match(chartXml, /<c:pieChart>/);
  assert.match(chartXml, /srgbClr val="4F7A52"/);
  assert.match(chartXml, /srgbClr val="EBC2B9"/);
  assert.match(chartXml, /Budget!\$A\$1:\$A\$2/);
  assert.match(chartXml, /Budget!\$B\$1:\$B\$2/);
});

test("injectNativeCharts on a sheet with no dataBar (no extLst at all) still appends before </worksheet>", async () => {
  const b = new WorkbookBuilder({ theme: { currency: "GBP" } });
  const ws = b.addSheet("Plain");
  ws.getCell("A1").value = "x";
  const buf = await b.toBuffer();

  const out = await injectNativeCharts(buf, {
    Plain: [
      {
        type: "pie",
        title: "P",
        ink: "1F1F1F",
        anchor: { fromCol: 1, fromRow: 1, toCol: 4, toRow: 6 },
        categoriesRef: "Plain!$A$1:$A$1",
        categories: ["x"],
        valuesRef: "Plain!$B$1:$B$1",
        values: [1],
        colors: ["4F7A52"],
      },
    ],
  });

  const zip = await JSZip.loadAsync(out);
  const workbookXml = await zip.file("xl/workbook.xml").async("string");
  const rid = /<sheet[^>]*name="Plain"[^>]*r:id="([^"]*)"/.exec(workbookXml)[1];
  const wbRels = await zip.file("xl/_rels/workbook.xml.rels").async("string");
  const target = new RegExp(`Id="${rid}"[^>]*Target="([^"]*)"`).exec(wbRels)[1];
  const sheetXml = await zip.file(`xl/${target}`).async("string");
  assert.match(sheetXml, /<drawing r:id="rId1"\/><\/worksheet>$/);
});

test("multiple charts on one sheet share a single drawing part", async () => {
  const buf = await buildBaseWorkbook();
  const out = await injectNativeCharts(buf, {
    Budget: [
      {
        type: "pie", title: "A", ink: "1F1F1F",
        anchor: { fromCol: 1, fromRow: 1, toCol: 4, toRow: 6 },
        categoriesRef: "Budget!$A$1:$A$2", categories: ["Income", "Bills"],
        valuesRef: "Budget!$B$1:$B$2", values: [100, 50], colors: ["4F7A52", "EBC2B9"],
      },
      {
        type: "pie", title: "B", ink: "1F1F1F",
        anchor: { fromCol: 5, fromRow: 1, toCol: 8, toRow: 6 },
        categoriesRef: "Budget!$A$1:$A$2", categories: ["Income", "Bills"],
        valuesRef: "Budget!$B$1:$B$2", values: [100, 50], colors: ["4F7A52", "EBC2B9"],
      },
    ],
  });

  const zip = await JSZip.loadAsync(out);
  assert.ok(zip.file("xl/charts/chart1.xml"));
  assert.ok(zip.file("xl/charts/chart2.xml"));
  assert.ok(zip.file("xl/drawings/drawing1.xml"));
  assert.equal(zip.file("xl/drawings/drawing2.xml"), null, "only one drawing part for two charts on the same sheet");
  const drawingXml = await zip.file("xl/drawings/drawing1.xml").async("string");
  assert.equal((drawingXml.match(/<xdr:twoCellAnchor/g) ?? []).length, 2);
});
