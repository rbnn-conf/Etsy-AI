import { test } from "node:test";
import assert from "node:assert/strict";

import { WorkbookBuilder } from "../src/engine/index.mjs";
import { titleBlock, sectionHeading, table, kpiCard, progressBar } from "../src/design-system/index.mjs";

function newSheet() {
  const b = new WorkbookBuilder({ theme: { currency: "GBP" } });
  return { b, ws: b.addSheet("S") };
}

test("titleBlock writes the title and returns a later row", () => {
  const { b, ws } = newSheet();
  const next = titleBlock(b, ws, { row: 1, span: 6, title: "My Title", subtitle: "sub" });
  assert.equal(ws.getCell("A1").value, "My Title");
  assert.equal(ws.getCell("A2").value, "sub");
  assert.ok(next > 3);
});

test("sectionHeading: tracked caps + a hairline, NO coloured fill", () => {
  const { b, ws } = newSheet();
  sectionHeading(b, ws, { row: 5, span: 6, text: "Income" });
  assert.equal(ws.getCell("A5").value, "INCOME"); // uppercased
  assert.equal(ws.getCell("A5").fill, undefined); // no bar
  assert.equal(ws.getCell("A5").border.bottom.color.argb, b.theme.color.ruleStrong);
  assert.equal(ws.getCell("F5").border.bottom.style, "thin"); // rule spans the merge
});

test("table: header, seeded values, per-row formula, and a SUM total row", () => {
  const { b, ws } = newSheet();
  const t = table(b, ws, {
    top: 3,
    left: 1,
    rows: 4,
    columns: [
      { header: "Item", key: "item", kind: "text", totalLabel: true, value: (i) => `row${i}` },
      { header: "Budget", key: "budget", kind: "currency", value: () => 100 },
      { header: "Actual", key: "actual", kind: "currency", value: () => 90 },
      { header: "Diff", key: "diff", kind: "currencyCalc", formula: (r) => `B${r}-C${r}` },
    ],
  });
  assert.equal(t.firstRow, 4);
  assert.equal(t.lastRow, 7);
  assert.equal(t.totalRow, 8);
  assert.equal(ws.getCell("A3").value, "Item"); // header
  assert.equal(ws.getCell("A4").value, "row0"); // seeded
  assert.equal(ws.getCell("D4").value.formula, "B4-C4"); // per-row formula
  assert.equal(ws.getCell("B8").value.formula, "SUM(B4:B7)"); // total
  assert.equal(ws.getCell("A8").value, "Total"); // total label
  assert.equal(t.totalCell("actual"), "C8");
  assert.equal(t.dataRange("budget"), "B4:B7");
});

test("table: non-numeric columns get no total formula", () => {
  const { b, ws } = newSheet();
  table(b, ws, {
    top: 1,
    rows: 2,
    columns: [
      { header: "Name", key: "name", kind: "text", totalLabel: true },
      { header: "Note", key: "note", kind: "text" },
    ],
  });
  assert.equal(ws.getCell("B4").value, null); // total row, text col -> blank
});

test("kpiCard: label + big figure, NO box; emphasis = serif + one terracotta rule above", () => {
  const { b, ws } = newSheet();
  const addr = kpiCard(b, ws, { top: 2, left: 1, wCols: 2, label: "Leftover", value: "=B10-B11", emphasis: true });
  assert.equal(addr, "A3");
  assert.equal(ws.getCell("A2").value, "LEFTOVER"); // label uppercased
  assert.equal(ws.getCell("A3").value.formula, "B10-B11");
  assert.equal(ws.getCell("A3").fill, undefined); // no box, no fill
  assert.equal(ws.getCell("A3").border.top.style, "medium");
  assert.equal(ws.getCell("A3").border.top.color.argb, b.theme.color.accent);
  assert.equal(ws.getCell("A3").font.name, b.theme.font.display); // editorial serif
});

test("kpiCard: a supporting (non-emphasis) figure gets only a hairline under it", () => {
  const { b, ws } = newSheet();
  kpiCard(b, ws, { top: 2, left: 1, wCols: 2, label: "Income", value: 0 });
  assert.equal(ws.getCell("A3").fill, undefined);
  assert.equal(ws.getCell("A3").border.bottom.style, "thin");
  assert.equal(ws.getCell("A3").border.top, undefined);
});

test("progressBar: writes a percent-formatted fraction formula and a data bar rule", () => {
  const { b, ws } = newSheet();
  progressBar(b, ws, { ref: "B2", fractionFormula: "IFERROR(C1/C2,0)" });
  assert.equal(ws.getCell("B2").value.formula, "IFERROR(C1/C2,0)");
  assert.match(ws.getCell("B2").numFmt, /%/);
  const cf = ws.conditionalFormattings ?? [];
  assert.ok(JSON.stringify(cf).includes("dataBar"));
});
