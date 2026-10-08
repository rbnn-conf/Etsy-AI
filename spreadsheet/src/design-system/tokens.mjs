/**
 * Etsy Spreadsheet Design System v1 — design tokens.
 *
 * A restrained, professional palette and a small type scale, plus reusable
 * number formats, border definitions, spacing (row-height / column-width)
 * defaults and print settings. Every product gets these defaults; a product
 * Design Spec may override any leaf via {@link resolveTheme}.
 *
 * Nothing here is Excel-implementation detail leaking upward — these are the
 * spreadsheet analogue of the print `designSystem` block in a ProductSpec:
 * colours, type, spacing, borders. The engine (`../engine/`) turns them into
 * ExcelJS style objects; the components (`./components.mjs`) compose them.
 */

/** @typedef {{ argb: string }} FillColor */

/**
 * The v1 default theme — LumiumX editorial-finance register
 * (`docs/LUMIUMX_ETSY_DESIGN_SYSTEM.md`, `docs/design/SPREADSHEET_UX.md`).
 *
 * Ink does the work, not paper: the sheet stays white, warmth comes from a warm
 * charcoal ink and an editorial serif for display. ONE accent — terracotta for
 * Finance/Planning — used ~once per sheet, never as a fill. Structure from
 * hairline rules and whitespace, not boxes or coloured bars. Input cells carry a
 * barely-there warm tint so "type here" reads; calc cells get NO fill so "no
 * yellow = don't type here" is the whole convention.
 *
 * Faces are Georgia (display) + Calibri (body): both ship on Windows, macOS and
 * LibreOffice, so the workbook renders correctly for LibreOffice previews AND in
 * the customer's Excel — Spectral/Inter (the marketing faces) are not embeddable
 * in .xlsx.
 */
export const DEFAULT_THEME = Object.freeze({
  name: "etsy-spreadsheet-v1",

  color: {
    ink: "1F1F1F", // primary text — LumiumX Ink, warm charcoal (never #000)
    subtleInk: "6E6A63", // secondary text / footnotes / muted labels
    inverseInk: "FFFFFF",
    paper: "FFFFFF", // the sheet stays white
    band: "F6F3EC", // table-header band — warm ivory, very light
    altRow: "FBF9F4", // optional alt-row — barely there
    rule: "E6E1D9", // LumiumX Stone — every hairline
    ruleStrong: "D8D2C6", // header underline, section divider, total-row rule
    accent: "C4644A", // LumiumX Terracotta — Finance/Planning family accent
    accentSoft: "F2E6E1", // one faint emphasis wash (Leftover only)
    inputFill: "FFFDF4", // faint warm — user-input cells
    inputRule: "E7DCC2", // input-cell hairline — a whisper, warm
    positive: "3B7A4B",
    negative: "B4402F",
    warning: "B5852F",
  },

  font: {
    family: "Calibri", // body / labels / numbers — present on Excel + LibreOffice
    display: "Georgia", // sheet titles + the one emphasised figure (editorial serif)
    fallback: "Arial",
    size: {
      title: 22,
      subtitle: 10.5,
      kicker: 8, // tracked-caps eyebrow / brand mark
      sectionHeading: 9.5, // tracked UPPERCASE, ink — NO fill
      tableHeading: 9.5,
      body: 10,
      input: 10,
      calc: 10,
      kpiLabel: 8,
      kpiValue: 17,
      kpiLeftover: 27, // the dominant dashboard figure (Georgia)
      footnote: 8,
    },
  },

  /** Excel number-format strings. `currency` is a template — see {@link currencyFormat}. */
  numberFormat: {
    currencyGBP: '£#,##0.00',
    currencyGBPSigned: '£#,##0.00;[Red]-£#,##0.00',
    percent1: "0.0%",
    percent0: "0%",
    integer: "#,##0",
    dateUK: "dd/mm/yyyy",
    dayOfMonth: "0",
    text: "@",
  },

  border: {
    hairline: "thin", // ExcelJS border style names
    divider: "medium",
    emphasis: "thick",
  },

  /** Row heights in points (Excel unit). */
  rowHeight: {
    title: 30,
    subtitle: 15,
    rule: 4, // the short accent rule row
    sectionHeading: 20,
    tableHeading: 20,
    body: 17,
    input: 19,
    ledger: 25, // generous writing rows for Income / Bills / Variable
    compact: 17, // daily-log capture rows
    kpiLabel: 13,
    kpiValue: 30,
    kpiLeftover: 46,
    spacer: 10,
  },

  /** Column widths in Excel "characters" (approx). */
  columnWidth: {
    label: 34,
    text: 24,
    currency: 14,
    percent: 12,
    date: 13,
    check: 10,
    narrow: 6,
  },

  print: {
    orientation: "portrait",
    paperSize: 9, // A4
    fitToWidth: 1,
    fitToHeight: 0,
    marginsInch: { left: 0.4, right: 0.4, top: 0.55, bottom: 0.55, header: 0.3, footer: 0.3 },
    horizontalCentered: true,
  },
});

/** Build a currency number format from a symbol, e.g. "£" -> `£#,##0.00`. */
export function currencyFormat(symbol = "£", { signed = false } = {}) {
  const base = `${symbol}#,##0.00`;
  return signed ? `${base};[Red]-${base}` : base;
}

const CURRENCY_SYMBOLS = { GBP: "£", USD: "$", EUR: "€" };

/** Currency code -> symbol, defaulting to GBP (this project is UK-focused). */
export function currencySymbol(code = "GBP") {
  return CURRENCY_SYMBOLS[String(code || "GBP").toUpperCase()] ?? "";
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/** Deep-merge `overrides` onto `base` (arrays and scalars replace, objects merge). */
function deepMerge(base, overrides) {
  if (!isPlainObject(overrides)) return overrides === undefined ? base : overrides;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(overrides)) {
    out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k], v) : v;
  }
  return out;
}

/**
 * Resolve the effective theme for a product: DEFAULT_THEME with an optional
 * `theme` object from the product Design Spec merged over it. Also normalises a
 * `currency` code into the currency number formats so a product only has to say
 * `{ currency: "GBP" }`.
 *
 * @param {object} [overrides] e.g. `{ currency: "GBP", color: { accent: "B5633F" }, font: { family: "Inter" } }`
 */
export function resolveTheme(overrides = {}) {
  const { currency, ...rest } = overrides ?? {};
  const merged = deepMerge(DEFAULT_THEME, rest);
  if (currency) {
    const sym = currencySymbol(currency);
    merged.numberFormat = {
      ...merged.numberFormat,
      currencyGBP: currencyFormat(sym),
      currencyGBPSigned: currencyFormat(sym, { signed: true }),
    };
    merged.currency = String(currency).toUpperCase();
    merged.currencySymbol = sym;
  } else {
    merged.currency = merged.currency ?? "GBP";
    merged.currencySymbol = merged.currencySymbol ?? "£";
  }
  return Object.freeze(merged);
}
