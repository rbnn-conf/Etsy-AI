import { test } from "node:test";
import assert from "node:assert/strict";

import {
  validateSpreadsheetSpec,
  assertValidSpreadsheetSpec,
  SpreadsheetSpecValidationError,
} from "../src/spec/spreadsheet-spec.mjs";

const valid = {
  specVersion: "1.0.0",
  productId: "001",
  primaryExport: { type: "xlsx" },
  exports: ["xlsx", "png", "pdf"],
  theme: { currency: "GBP", color: { accent: "6F8174" } },
  sheets: [
    { name: "Overview", slug: "overview", title: "Monthly Overview", order: 1, sections: { anything: true } },
    { name: "Income", slug: "income", title: "Income Tracker", order: 2 },
  ],
  preview: { dpi: 150, sheets: "all" },
};

test("a well-formed spreadsheet spec passes", () => {
  assert.deepEqual(validateSpreadsheetSpec(valid), []);
  assert.equal(assertValidSpreadsheetSpec(valid), valid);
});

test("primaryExport is required and constrained", () => {
  const issues = validateSpreadsheetSpec({ ...valid, primaryExport: { type: "docx" } });
  assert.ok(issues.some((i) => i.path === "primaryExport.type"));
});

test("sheets must be a non-empty array with unique <=31-char names and titles", () => {
  assert.ok(validateSpreadsheetSpec({ ...valid, sheets: [] }).some((i) => i.path === "sheets"));
  const dup = validateSpreadsheetSpec({
    ...valid,
    sheets: [
      { name: "X", title: "x", order: 1 },
      { name: "X", title: "x2", order: 2 },
    ],
  });
  assert.ok(dup.some((i) => /duplicate sheet name/.test(i.message)));
  const noTitle = validateSpreadsheetSpec({ ...valid, sheets: [{ name: "Y", order: 1 }] });
  assert.ok(noTitle.some((i) => i.path === "sheets[0].title"));
});

test("sheet order values must be contiguous 1..n when all present", () => {
  const issues = validateSpreadsheetSpec({
    ...valid,
    sheets: [
      { name: "A", title: "a", order: 1 },
      { name: "B", title: "b", order: 3 },
    ],
  });
  assert.ok(issues.some((i) => /contiguous/.test(i.message)));
});

test("theme colours must be 6-digit hex without '#'", () => {
  assert.ok(
    validateSpreadsheetSpec({ ...valid, theme: { color: { accent: "#6F8174" } } }).some(
      (i) => i.path === "theme.color.accent",
    ),
  );
});

test("preview.dpi is bounded", () => {
  assert.ok(validateSpreadsheetSpec({ ...valid, preview: { dpi: 20 } }).some((i) => i.path === "preview.dpi"));
});

test("assertValidSpreadsheetSpec throws a typed aggregate error", () => {
  try {
    assertValidSpreadsheetSpec({});
    assert.fail("should have thrown");
  } catch (err) {
    assert.ok(err instanceof SpreadsheetSpecValidationError);
    assert.ok(Array.isArray(err.issues) && err.issues.length > 0);
  }
});

// --- DESIGN_SPEC -> spreadsheet theme adapter (ADR-012 §5) ---
import {
  designSpecToSpreadsheetTheme,
  mergeThemeOverrides,
} from "../src/spec/design-spec-adapter.mjs";

test("designSpecToSpreadsheetTheme maps colour tokens and strips the # prefix", () => {
  const t = designSpecToSpreadsheetTheme({
    colour: {
      primary_ink: "#1F1F1F",
      secondary_ink: "#3A3A3A",
      borders: "#E6E1D9",
      background_alt: "#F2ECE1",
      accent: { hex: "#C4644A", family: "finance" },
      semantic: { positive: "#2F7A3F", warning: "#B23B3B" },
    },
    typography: { display: { family: "Spectral" }, body: { family: "Inter" } },
  });
  assert.equal(t.color.ink, "1F1F1F");
  assert.equal(t.color.accent, "C4644A");
  assert.equal(t.color.rule, "E6E1D9");
  assert.equal(t.color.band, "F2ECE1");
  assert.equal(t.color.negative, "B23B3B");
  // families are recorded for provenance, not applied (xlsx can't embed them)
  assert.deepEqual(t._designSpecFamilies, { display: "Spectral", body: "Inter" });
});

test("designSpecToSpreadsheetTheme is empty for junk input", () => {
  assert.deepEqual(designSpecToSpreadsheetTheme(null), {});
  assert.deepEqual(designSpecToSpreadsheetTheme("x"), {});
  assert.deepEqual(designSpecToSpreadsheetTheme({}), {});
});

test("mergeThemeOverrides: xlsx-design-spec theme wins per-leaf over the adapter", () => {
  const adapter = { color: { ink: "1F1F1F", accent: "C4644A", band: "F2ECE1" } };
  const xlsx = { currency: "GBP", color: { band: "F6F3EC" } };
  const merged = mergeThemeOverrides(adapter, xlsx);
  assert.equal(merged.color.ink, "1F1F1F"); // from adapter
  assert.equal(merged.color.accent, "C4644A"); // from adapter
  assert.equal(merged.color.band, "F6F3EC"); // xlsx override wins
  assert.equal(merged.currency, "GBP");
});
