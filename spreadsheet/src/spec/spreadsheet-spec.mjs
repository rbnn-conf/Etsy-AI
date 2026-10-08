/**
 * SpreadsheetDesignSpec — the machine-readable description of a *spreadsheet*
 * product's design, the XLSX analogue of a print DESIGN_SPEC.
 *
 * It lets Claude describe a workbook (theme, sheet structure, tables, formulas,
 * input vs calculated cells, dropdowns, conditional formatting, print + preview
 * settings) as data, so the product build script interprets a spec rather than
 * embedding all design logic in one script.
 *
 * A product references it from `products/<id>/xlsx-design-spec.json`. On the
 * ProductSpec it rides in the opaque `spreadsheet` field (see
 * services/src/design/product-spec.ts) and in `primaryExport` / `exportFormats`.
 *
 * This module is intentionally permissive about `sheets[].sections` — that tree
 * is interpreted by the product build (products/<id>/xlsx/build.mjs), exactly as
 * the print pipeline treats `pages[].sections` as opaque.
 */

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX6 = /^[0-9a-fA-F]{6}$/;

/** @returns {{path:string,message:string}[]} every issue (does not stop at first). */
export function validateSpreadsheetSpec(input) {
  const issues = [];
  const add = (path, message) => issues.push({ path, message });

  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return [{ path: "$", message: "must be an object" }];
  }
  const s = input;

  if (typeof s.specVersion !== "string" || !/^\d+\.\d+\.\d+$/.test(s.specVersion)) {
    add("specVersion", "must be a semver string");
  }
  if (typeof s.productId !== "string" || s.productId.trim() === "") {
    add("productId", "is required");
  }

  // primary export declaration (also mirrored on the ProductSpec)
  const pe = s.primaryExport;
  if (pe === undefined) {
    add("primaryExport", "is required (\"xlsx\" | \"pdf\" | \"hybrid\")");
  } else if (typeof pe !== "object" || pe === null || !["xlsx", "pdf", "hybrid"].includes(pe.type)) {
    add("primaryExport.type", 'must be one of "xlsx", "pdf", "hybrid"');
  }

  if (s.exports !== undefined) {
    if (!Array.isArray(s.exports) || s.exports.some((e) => typeof e !== "string")) {
      add("exports", "must be an array of strings when present");
    }
  }

  // theme overrides — optional, but if present, sanity-check colours/typography
  if (s.theme !== undefined) {
    if (typeof s.theme !== "object" || s.theme === null || Array.isArray(s.theme)) {
      add("theme", "must be an object when present");
    } else {
      const c = s.theme.color;
      if (c !== undefined) {
        if (typeof c !== "object" || c === null) add("theme.color", "must be an object");
        else {
          for (const [k, v] of Object.entries(c)) {
            if (typeof v !== "string" || !HEX6.test(v)) {
              add(`theme.color.${k}`, `"${v}" must be a 6-digit hex (no #), e.g. "6F8174"`);
            }
          }
        }
      }
      if (s.theme.currency !== undefined && !/^[A-Za-z]{3}$/.test(s.theme.currency)) {
        add("theme.currency", "must be a 3-letter currency code");
      }
      if (s.theme.font !== undefined && (typeof s.theme.font !== "object" || s.theme.font === null)) {
        add("theme.font", "must be an object when present");
      }
    }
  }

  // sheets — the workbook structure
  if (!Array.isArray(s.sheets) || s.sheets.length === 0) {
    add("sheets", "must be a non-empty array");
  } else {
    const names = new Set();
    s.sheets.forEach((sh, i) => {
      const p = `sheets[${i}]`;
      if (typeof sh !== "object" || sh === null) {
        add(p, "must be an object");
        return;
      }
      if (typeof sh.name !== "string" || sh.name.trim() === "") add(`${p}.name`, "is required");
      else if (sh.name.length > 31) add(`${p}.name`, "Excel sheet names must be <= 31 chars");
      else if (names.has(sh.name)) add(`${p}.name`, `duplicate sheet name "${sh.name}"`);
      else names.add(sh.name);

      if (sh.slug !== undefined && !SLUG.test(sh.slug)) add(`${p}.slug`, "must be kebab-case");
      if (typeof sh.title !== "string" || sh.title.trim() === "") add(`${p}.title`, "is required");
      if (sh.hidden !== undefined && typeof sh.hidden !== "boolean") add(`${p}.hidden`, "must be boolean");
      if (sh.order !== undefined && (!Number.isInteger(sh.order) || sh.order < 1)) {
        add(`${p}.order`, "must be a positive integer");
      }
      if (sh.print !== undefined && (typeof sh.print !== "object" || sh.print === null)) {
        add(`${p}.print`, "must be an object when present");
      }
      // sh.sections is opaque on purpose — interpreted by the product build.
    });

    // when every sheet declares `order`, it must be a contiguous 1..n
    const orders = s.sheets.map((x) => x.order).filter((o) => Number.isInteger(o));
    if (orders.length === s.sheets.length) {
      const sorted = [...orders].sort((a, b) => a - b);
      const contiguous = sorted.every((o, i) => o === i + 1);
      if (!contiguous) add("sheets", "`order` values must be a contiguous 1..n");
    }
  }

  // preview requirements
  if (s.preview !== undefined) {
    if (typeof s.preview !== "object" || s.preview === null) {
      add("preview", "must be an object when present");
    } else {
      if (s.preview.dpi !== undefined && (!Number.isFinite(s.preview.dpi) || s.preview.dpi < 72 || s.preview.dpi > 600)) {
        add("preview.dpi", "must be a number in [72, 600]");
      }
      if (
        s.preview.sheets !== undefined &&
        !(s.preview.sheets === "all" || s.preview.sheets === "primary" || Array.isArray(s.preview.sheets))
      ) {
        add("preview.sheets", '"all" | "primary" | number[]');
      }
    }
  }

  return issues;
}

export class SpreadsheetSpecValidationError extends Error {
  constructor(issues) {
    super(`Invalid SpreadsheetDesignSpec: ${issues.map((i) => `${i.path} ${i.message}`).join("; ")}`);
    this.name = "SpreadsheetSpecValidationError";
    this.issues = issues;
  }
}

export function assertValidSpreadsheetSpec(input) {
  const issues = validateSpreadsheetSpec(input);
  if (issues.length) throw new SpreadsheetSpecValidationError(issues);
  return input;
}
