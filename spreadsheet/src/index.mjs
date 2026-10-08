/**
 * @dpf/spreadsheet — reusable XLSX generation engine, "Etsy Spreadsheet Design
 * System v1", headless PNG preview and workbook QC.
 *
 * Product-agnostic. Per-product build logic lives in products/<id>/xlsx/.
 * See docs/XLSX_PIPELINE.md and docs/adr/ADR-010-xlsx-spreadsheet-products.md.
 */

export { WorkbookBuilder, forEachCell, colLetter, colNumber, ExcelJS, injectNativeCharts, countChartParts, withPreviewPaperSize } from "./engine/index.mjs";

export {
  DEFAULT_THEME,
  resolveTheme,
  currencyFormat,
  currencySymbol,
  components,
  titleBlock,
  sectionHeading,
  divider,
  table,
  kpiCard,
  callout,
  progressBar,
  checkboxColumn,
  statusColumn,
} from "./design-system/index.mjs";

export {
  renderXlsxPreview,
  recalcToCsv,
  recalcWorkbook,
  previewToolsAvailable,
  findRenderers,
  pngSize,
} from "./preview/render-preview.mjs";

export { loadWorkbook, runWorkbookChecks, runPreviewChecks, formulaLooksValid } from "./qc/index.mjs";

export {
  validateSpreadsheetSpec,
  assertValidSpreadsheetSpec,
  SpreadsheetSpecValidationError,
} from "./spec/spreadsheet-spec.mjs";

export {
  designSpecToSpreadsheetTheme,
  mergeThemeOverrides,
} from "./spec/design-spec-adapter.mjs";
