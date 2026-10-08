/**
 * Product #006 — WORKBOOK stages only (build + QC + faithful preview).
 * TEST/REVIEW build — does not touch Etsy or any other product.
 *
 *   node cli.mjs                 (from this directory)
 *   npm run all
 */

import { buildProduct006Workbook } from "./build.mjs";
import { runProduct006Qc } from "./qc.mjs";
import { renderProduct006Preview } from "./preview.mjs";
import { runPreviewChecks } from "@dpf/spreadsheet";

function line(label, ok, extra = "") {
  return `${label.padEnd(18)} ${ok ? "PASS" : "FAIL"}${extra ? `  ${extra}` : ""}`;
}

async function main() {
  const started = Date.now();

  const { xlsxPath, report } = await buildProduct006Workbook();
  const qc = await runProduct006Qc();
  const qcOk = qc.summary.fail === 0;
  const preview = await renderProduct006Preview();
  // No fixed expectPages: Budget now spans as many pages as it naturally
  // needs at a legible scale (v4 — see preview.mjs), so page count varies.
  const previewQc = await runPreviewChecks(preview.pages);
  const previewOk = previewQc.summary.fail === 0;

  const formulaChecks = qc.results.filter(
    (r) => /formula|total|references|scenario|recalc|=/.test(r.check.toLowerCase()) || r.sheet === "scenario",
  );
  const printChecks = qc.results.filter((r) => /print|orientation|scaling|area/.test(r.check.toLowerCase()));
  const allPass = qcOk && previewOk;

  console.log(`\nPRODUCT #006 — TEST / REVIEW VERSION`);
  console.log(`Minimalist Budget & Goals Planner\n`);
  console.log(`Primary export: XLSX (LumiumX house register x reference-workbook functionality)`);
  console.log(`Currency: ${report.currency}\n`);
  console.log(line("Functional XLSX", qcOk, `${qc.summary.pass}/${qc.summary.total} workbook checks`));
  console.log(line("Workbook preview", previewOk, `${previewQc.summary.pass}/${previewQc.summary.total} checks, ${preview.pages.length} sheets`));
  console.log(line("Formula checks", formulaChecks.every((r) => r.pass), `${formulaChecks.filter((r) => r.pass).length}/${formulaChecks.length}`));
  console.log(line("Print checks", printChecks.every((r) => r.pass), `${printChecks.filter((r) => r.pass).length}/${printChecks.length}`));
  console.log(`\nArtifacts:`);
  console.log(`  ${rel(xlsxPath)}`);
  console.log(`  storage/products/006/workbook-preview/sheet-01..${String(preview.pages.length).padStart(2, "0")}.png  (+ primary.png)`);
  console.log(`  storage/products/006/xlsx-{build,qc,preview}-report.json`);
  console.log(`\nThis is a TEST/REVIEW build. No Etsy listing, no draft, no live product touched.`);
  console.log(`\n${allPass ? "OK" : "FAILED"} in ${((Date.now() - started) / 1000).toFixed(1)}s`);

  if (!allPass) {
    console.log("\nFailures:");
    for (const r of [...qc.results, ...previewQc.results].filter((r) => !r.pass)) {
      console.log(`  [${r.sheet ?? "-"}] ${r.check}  ${r.detail ?? ""}`);
    }
    process.exit(1);
  }
}

function rel(p) {
  const i = p.indexOf("/storage/");
  return i >= 0 ? p.slice(i + 1) : p;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
