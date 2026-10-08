/**
 * Etsy Spreadsheet Design System v1 — public surface.
 *
 *   tokens      typography, colour, spacing, borders, number formats, print
 *   components  titleBlock, sectionHeading, table, kpiCard, callout,
 *               progressBar, checkboxColumn, statusColumn
 *
 * A product Design Spec overrides the defaults by passing `theme` overrides to
 * `resolveTheme` / `new WorkbookBuilder({ theme })`.
 */
export {
  DEFAULT_THEME,
  resolveTheme,
  currencyFormat,
  currencySymbol,
} from "./tokens.mjs";

export {
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
} from "./components.mjs";
