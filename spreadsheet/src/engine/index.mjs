/**
 * Engine entry point — the reusable XLSX building blocks. No product logic.
 */
export {
  WorkbookBuilder,
  forEachCell,
  colLetter,
  colNumber,
  ExcelJS,
} from "./workbook-builder.mjs";

export { injectNativeCharts, countChartParts, withPreviewPaperSize } from "./native-charts.mjs";
