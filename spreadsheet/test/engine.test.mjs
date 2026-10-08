import { test } from "node:test";
import assert from "node:assert/strict";

import { WorkbookBuilder, colLetter, colNumber, forEachCell } from "../src/engine/index.mjs";
import { resolveTheme, DEFAULT_THEME, currencyFormat } from "../src/design-system/index.mjs";

test("colLetter / colNumber round-trip", () => {
  for (const n of [1, 2, 26, 27, 52, 53, 702, 703]) {
    assert.equal(colNumber(colLetter(n)), n);
  }
  assert.equal(colLetter(1), "A");
  assert.equal(colLetter(28), "AB");
});

test("resolveTheme: defaults + currency + deep override", () => {
  const t = resolveTheme({ currency: "GBP", color: { accent: "B5633F" } });
  assert.equal(t.currency, "GBP");
  assert.equal(t.currencySymbol, "£");
  assert.equal(t.numberFormat.currencyGBP, "£#,##0.00");
  assert.equal(t.color.accent, "B5633F");
  // untouched leaves survive the merge
  assert.equal(t.color.ink, DEFAULT_THEME.color.ink);
  assert.equal(t.font.family, DEFAULT_THEME.font.family);
});

test("resolveTheme: USD currency switches the symbol in the number format", () => {
  const t = resolveTheme({ currency: "USD" });
  assert.equal(t.currencySymbol, "$");
  assert.equal(t.numberFormat.currencyGBP, currencyFormat("$"));
});

test("write(): a string beginning with '=' becomes a formula cell", async () => {
  const b = new WorkbookBuilder();
  const ws = b.addSheet("S");
  b.write(ws, "A1", 10, { kind: "input" });
  b.write(ws, "A2", 5, { kind: "input" });
  const c = b.write(ws, "A3", "=SUM(A1:A2)");
  assert.equal(c.value.formula, "SUM(A1:A2)");
  assert.equal(ws.getCell("A1").value, 10);
});

test("input cells are unlocked, calc cells are locked (for protectFormulas)", () => {
  const b = new WorkbookBuilder();
  const ws = b.addSheet("S");
  const input = b.write(ws, "A1", null, { kind: "input" });
  const calc = b.write(ws, "B1", "=A1*2", { kind: "calc" });
  assert.equal(input.protection.locked, false);
  assert.equal(calc.protection.locked, true);
});

test("currency KIND cells carry a currency-looking number format", () => {
  const b = new WorkbookBuilder({ theme: { currency: "GBP" } });
  const ws = b.addSheet("S");
  const c = b.write(ws, "A1", 12.5, { kind: "input", numFmt: b.theme.numberFormat.currencyGBP });
  assert.match(c.numFmt, /£/);
});

test("dropdown(): array source is inlined; range source is passed through", () => {
  const b = new WorkbookBuilder();
  const ws = b.addSheet("S");
  b.dropdown(ws, "A1:A3", ["x", "y", "z"]);
  assert.equal(ws.getCell("A2").dataValidation.type, "list");
  assert.deepEqual(ws.getCell("A2").dataValidation.formulae, ['"x,y,z"']);
  b.dropdown(ws, "B1", "=Categories");
  assert.deepEqual(ws.getCell("B1").dataValidation.formulae, ["Categories"]);
});

test("freeze / printArea / defineName / conditional are recorded on the model", () => {
  const b = new WorkbookBuilder();
  const ws = b.addSheet("S");
  b.freeze(ws, { ySplit: 3 });
  b.printArea(ws, "A1:G20");
  b.defineName("Total", "S!$G$20");
  b.conditional(ws, "A1:A9", { type: "cellIs", operator: "lessThan", formulae: ["0"], style: {} });
  assert.equal(ws.views[0].state, "frozen");
  assert.equal(ws.views[0].ySplit, 3);
  assert.equal(ws.pageSetup.printArea, "A1:G20");
  assert.ok((b.wb.definedNames.model ?? []).some((d) => d.name === "Total"));
});

test("hidden helper sheet is written as veryHidden", async () => {
  const b = new WorkbookBuilder();
  b.addSheet("Lists", { hidden: true });
  b.addSheet("Main");
  const buf = await b.toBuffer();
  const { loadWorkbook } = await import("../src/qc/index.mjs");
  const { writeFile, mkdtemp, rm } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const dir = await mkdtemp(join(tmpdir(), "wb-"));
  const p = join(dir, "w.xlsx");
  await writeFile(p, Buffer.from(buf));
  const wb = await loadWorkbook(p);
  assert.equal(wb.getWorksheet("Lists").state, "veryHidden");
  await rm(dir, { recursive: true, force: true });
});

test("forEachCell visits every cell in a rectangular range", () => {
  const b = new WorkbookBuilder();
  const ws = b.addSheet("S");
  const seen = [];
  forEachCell(ws, "A1:B2", (cell) => seen.push(cell.address));
  assert.deepEqual(seen.sort(), ["A1", "A2", "B1", "B2"]);
});
